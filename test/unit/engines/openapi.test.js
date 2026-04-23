/**
 * OpenAPI discovery adapter tests.
 * Uses temp files for local spec loading, mocked fetch for URL specs.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverFromOpenApi } from '../../../src/engines/discovery/openapi.js';

// --- Fixtures ---

const PETSTORE_SPEC = {
  openapi: '3.0.0',
  info: { title: 'Petstore', version: '1.0.0' },
  paths: {
    '/pets': {
      get:  { summary: 'List pets',   operationId: 'listPets',   tags: ['pets'], responses: { 200: { description: 'ok' } } },
      post: { summary: 'Create pet',  operationId: 'createPet',  tags: ['pets'], responses: { 201: { description: 'created' } } },
    },
    '/pets/{id}': {
      get:    { summary: 'Get pet',    operationId: 'getPet',     tags: ['pets'], responses: { 200: { description: 'ok' } } },
      delete: { summary: 'Delete pet', operationId: 'deletePet',  tags: ['pets'], responses: { 204: { description: 'deleted' } } },
    },
    '/auth/login': {
      post: {
        summary: 'Login',
        operationId: 'login',
        tags: ['auth'],
        requestBody: { content: { 'application/json': {} } },
        responses: { 200: { description: 'token' }, 401: { description: 'unauthorized' } },
      },
    },
  },
};

const PETSTORE_YAML = `
openapi: "3.0.0"
info:
  title: Petstore YAML
  version: "1.0.0"
paths:
  /items:
    get:
      summary: List items
      operationId: listItems
      responses:
        "200":
          description: ok
  /admin/config:
    post:
      summary: Update config
      operationId: updateConfig
      responses:
        "200":
          description: ok
`;

// Temp file paths
let jsonSpecPath;
let yamlSpecPath;
let baseSpecPath;

before(() => {
  jsonSpecPath = join(tmpdir(), `testpilot-spec-${Date.now()}.json`);
  yamlSpecPath = join(tmpdir(), `testpilot-spec-${Date.now()}.yaml`);
  baseSpecPath = join(tmpdir(), `testpilot-base-${Date.now()}.json`);

  writeFileSync(jsonSpecPath, JSON.stringify(PETSTORE_SPEC));
  writeFileSync(yamlSpecPath, PETSTORE_YAML);

  // Base spec — only /pets and /pets/{id}
  const baseSpec = {
    ...PETSTORE_SPEC,
    paths: {
      '/pets':      PETSTORE_SPEC.paths['/pets'],
      '/pets/{id}': PETSTORE_SPEC.paths['/pets/{id}'],
    },
  };
  writeFileSync(baseSpecPath, JSON.stringify(baseSpec));
});

after(() => {
  for (const p of [jsonSpecPath, yamlSpecPath, baseSpecPath]) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
});

// --- Tests ---

describe('discoverFromOpenApi', () => {
  test('returns empty array when no spec configured', async () => {
    const result = await discoverFromOpenApi({});
    assert.deepEqual(result, []);
  });

  test('parses JSON spec — returns all operations', async () => {
    const features = await discoverFromOpenApi({ spec: jsonSpecPath });
    // 5 operations: GET /pets, POST /pets, GET /pets/{id}, DELETE /pets/{id}, POST /auth/login
    assert.equal(features.length, 5);
  });

  test('parses YAML spec correctly', async () => {
    const features = await discoverFromOpenApi({ spec: yamlSpecPath });
    assert.equal(features.length, 2);
    assert.ok(features.some((f) => f.metadata.apiPath === '/items'));
    assert.ok(features.some((f) => f.metadata.apiPath === '/admin/config'));
  });

  test('feature shape is correct', async () => {
    const features = await discoverFromOpenApi({ spec: jsonSpecPath });
    const login = features.find((f) => f.metadata.apiPath === '/auth/login');

    assert.ok(login, 'POST /auth/login should be present');
    assert.equal(login.id, 'openapi:post:/auth/login');
    assert.equal(login.changeType, 'added');
    assert.equal(login.source, 'openapi');
    assert.ok(login.description.includes('POST'));
    assert.ok(login.description.includes('/auth/login'));
    assert.ok(login.diff.includes('Login'));
  });

  test('auth path gets high priority', async () => {
    const features = await discoverFromOpenApi({ spec: jsonSpecPath });
    const login = features.find((f) => f.metadata.apiPath === '/auth/login');
    assert.equal(login.priority, 'high');
  });

  test('POST mutation gets medium priority for non-auth paths', async () => {
    const features = await discoverFromOpenApi({ spec: jsonSpecPath });
    const createPet = features.find(
      (f) => f.metadata.apiPath === '/pets' && f.metadata.method === 'post',
    );
    assert.equal(createPet.priority, 'medium');
  });

  test('GET on non-priority path gets low priority', async () => {
    const features = await discoverFromOpenApi({ spec: jsonSpecPath });
    const listPets = features.find(
      (f) => f.metadata.apiPath === '/pets' && f.metadata.method === 'get',
    );
    assert.equal(listPets.priority, 'low');
  });

  test('metadata contains method, apiPath, operationId, tags', async () => {
    const features = await discoverFromOpenApi({ spec: jsonSpecPath });
    const listPets = features.find(
      (f) => f.metadata.apiPath === '/pets' && f.metadata.method === 'get',
    );
    assert.equal(listPets.metadata.method, 'get');
    assert.equal(listPets.metadata.apiPath, '/pets');
    assert.equal(listPets.metadata.operationId, 'listPets');
    assert.deepEqual(listPets.metadata.tags, ['pets']);
  });

  test('diff mode — only returns new operations not in base', async () => {
    // base has /pets + /pets/{id}; current also has /auth/login
    const features = await discoverFromOpenApi({
      spec:     jsonSpecPath,
      baseSpec: baseSpecPath,
    });
    assert.equal(features.length, 1, 'only /auth/login is new');
    assert.equal(features[0].metadata.apiPath, '/auth/login');
    assert.equal(features[0].changeType, 'added');
  });

  test('diff mode — marks changed operation as modified', async () => {
    // Create a base spec where POST /pets has different summary
    const modifiedBase = {
      ...PETSTORE_SPEC,
      paths: {
        ...PETSTORE_SPEC.paths,
        '/pets': {
          ...PETSTORE_SPEC.paths['/pets'],
          post: { ...PETSTORE_SPEC.paths['/pets'].post, summary: 'Old summary' },
        },
      },
    };
    const modBaseFile = join(tmpdir(), `testpilot-modbase-${Date.now()}.json`);
    writeFileSync(modBaseFile, JSON.stringify(modifiedBase));

    try {
      const features = await discoverFromOpenApi({
        spec:     jsonSpecPath,
        baseSpec: modBaseFile,
      });
      const changed = features.find(
        (f) => f.metadata.apiPath === '/pets' && f.metadata.method === 'post',
      );
      assert.ok(changed, 'changed POST /pets should appear');
      assert.equal(changed.changeType, 'modified');
    } finally {
      try { unlinkSync(modBaseFile); } catch { /* ignore */ }
    }
  });

  test('returns empty array when spec file not found — does not throw', async () => {
    const features = await discoverFromOpenApi({ spec: '/no/such/file.json' });
    assert.deepEqual(features, []);
  });

  test('diff mode — falls back to all ops when base spec unreadable', async () => {
    const features = await discoverFromOpenApi({
      spec:     jsonSpecPath,
      baseSpec: '/no/such/base.json',
    });
    // Should return all 5 operations as 'added'
    assert.equal(features.length, 5);
    assert.ok(features.every((f) => f.changeType === 'added'));
  });

  test('diff context includes parameters in diff text', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/users/{id}': {
          get: {
            summary: 'Get user',
            parameters: [{ name: 'id', in: 'path', required: true }],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    };
    const tmpFile = join(tmpdir(), `testpilot-params-${Date.now()}.json`);
    writeFileSync(tmpFile, JSON.stringify(spec));
    try {
      const features = await discoverFromOpenApi({ spec: tmpFile });
      assert.ok(features[0].diff.includes('id'));
      assert.ok(features[0].diff.includes('path'));
    } finally {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });
});
