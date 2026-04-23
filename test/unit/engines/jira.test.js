/**
 * Jira discovery adapter tests.
 * Uses Node's built-in fetch mock via module patching — no network calls.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { discoverFromJira } from '../../../src/engines/discovery/jira.js';

// --- Helpers ---

/** Build a minimal Jira issue fixture. */
function makeIssue(key, fieldOverrides = {}) {
  return {
    key,
    fields: {
      summary: `Fix bug in ${key}`,
      description: {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Description of ${key}` }],
          },
        ],
      },
      priority: { name: 'High' },
      status: { name: 'In Progress' },
      issuetype: { name: 'Bug' },
      labels: ['backend'],
      ...fieldOverrides,
    },
  };
}

// Capture original global fetch and replace with mock
let originalFetch;
let mockFetch;

before(() => {
  originalFetch = globalThis.fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
});

function setFetchResponse(issues, status = 200) {
  mockFetch = async (url, opts) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ issues }),
      text: async () => JSON.stringify({ issues }),
    };
  };
  globalThis.fetch = mockFetch;
}

// --- Tests ---

describe('discoverFromJira', () => {
  const BASE_CONFIG = {
    baseUrl:  'https://test.atlassian.net',
    email:    'test@example.com',
    apiToken: 'token-abc',
    project:  'DEV',
  };

  test('returns empty array when config is missing', async () => {
    // No env vars set, no options
    const result = await discoverFromJira({});
    assert.deepEqual(result, []);
  });

  test('returns empty array when baseUrl missing', async () => {
    const result = await discoverFromJira({ email: 'a@b.com', apiToken: 't', project: 'X' });
    assert.deepEqual(result, []);
  });

  test('maps Jira issues to feature shape', async () => {
    setFetchResponse([
      makeIssue('DEV-1', { priority: { name: 'High' } }),
      makeIssue('DEV-2', { priority: { name: 'Low' } }),
    ]);

    const features = await discoverFromJira(BASE_CONFIG);

    assert.equal(features.length, 2);

    const f = features[0];
    assert.equal(f.id, 'jira:DEV-1');
    assert.equal(f.filePath, 'jira/DEV-1');
    assert.equal(f.changeType, 'added');
    assert.equal(f.source, 'jira');
    assert.equal(f.priority, 'high');
    assert.ok(f.description.includes('DEV-1'));
    assert.ok(f.diff.length > 0);
  });

  test('priority mapping — Highest/High → high', async () => {
    setFetchResponse([
      makeIssue('DEV-10', { priority: { name: 'Highest' } }),
      makeIssue('DEV-11', { priority: { name: 'High' } }),
    ]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.ok(features.every((f) => f.priority === 'high'));
  });

  test('priority mapping — Medium → medium', async () => {
    setFetchResponse([makeIssue('DEV-20', { priority: { name: 'Medium' } })]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.equal(features[0].priority, 'medium');
  });

  test('priority mapping — Low/Lowest → low', async () => {
    setFetchResponse([
      makeIssue('DEV-30', { priority: { name: 'Low' } }),
      makeIssue('DEV-31', { priority: { name: 'Lowest' } }),
    ]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.ok(features.every((f) => f.priority === 'low'));
  });

  test('unknown priority defaults to medium', async () => {
    setFetchResponse([makeIssue('DEV-40', { priority: { name: 'Critical' } })]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.equal(features[0].priority, 'medium');
  });

  test('handles plain string description', async () => {
    const issue = makeIssue('DEV-50');
    issue.fields.description = 'Plain string description';
    setFetchResponse([issue]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.ok(features[0].description.includes('Plain string description'));
  });

  test('handles null description', async () => {
    const issue = makeIssue('DEV-60');
    issue.fields.description = null;
    setFetchResponse([issue]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.equal(features.length, 1);
    assert.ok(!features[0].description.includes('Description:'));
  });

  test('returns empty array on API error — does not throw', async () => {
    setFetchResponse([], 401);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.deepEqual(features, []);
  });

  test('returns empty array when fetch throws — does not throw', async () => {
    globalThis.fetch = async () => { throw new Error('network error'); };
    const features = await discoverFromJira(BASE_CONFIG);
    assert.deepEqual(features, []);
  });

  test('returns empty array when Jira returns no issues', async () => {
    setFetchResponse([]);
    const features = await discoverFromJira(BASE_CONFIG);
    assert.deepEqual(features, []);
  });

  test('metadata contains issueKey, issueType, status, labels', async () => {
    setFetchResponse([makeIssue('DEV-99')]);
    const features = await discoverFromJira(BASE_CONFIG);
    const meta = features[0].metadata;
    assert.equal(meta.issueKey, 'DEV-99');
    assert.equal(meta.issueType, 'Bug');
    assert.equal(meta.status, 'In Progress');
    assert.ok(Array.isArray(meta.labels));
  });

  test('uses Authorization header with Basic auth', async () => {
    let capturedHeaders;
    globalThis.fetch = async (url, opts) => {
      capturedHeaders = opts.headers;
      return { ok: true, json: async () => ({ issues: [] }), text: async () => '{}' };
    };

    await discoverFromJira(BASE_CONFIG);

    assert.ok(capturedHeaders.Authorization.startsWith('Basic '));
    const decoded = Buffer.from(capturedHeaders.Authorization.slice(6), 'base64').toString();
    assert.equal(decoded, 'test@example.com:token-abc');
  });
});
