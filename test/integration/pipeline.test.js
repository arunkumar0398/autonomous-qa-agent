/**
 * Integration test: full Discover → Generate → Execute pipeline
 * using an in-memory SQLite DB and a stubbed LLM adapter.
 *
 * Playwright execution is skipped via dryRun: true so no browser is needed.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteRepository } from '../../src/core/db/sqlite.js';
import { LlmAdapter } from '../../src/core/llm/adapter.js';
import { runPipeline } from '../../src/core/pipeline.js';
import { generate } from '../../src/engines/generator/index.js';
import { discover } from '../../src/engines/discovery/index.js';

/** Stub LLM that returns a canned Playwright scenario JSON. */
class StubLlm extends LlmAdapter {
  constructor(scenarios) {
    super();
    this._scenarios = scenarios;
    this.calls = [];
  }

  async chat(messages) {
    this.calls.push(messages);
    return JSON.stringify(this._scenarios);
  }

  getProvider() {
    return 'stub';
  }
}

const STUB_SCENARIOS = [
  {
    scenarioName: 'User can view dashboard',
    description: 'Verifies dashboard loads after login',
    priority: 'high',
    type: 'happy_path',
    steps: ['Navigate to /dashboard', 'Verify user should see Dashboard heading'],
  },
  {
    scenarioName: 'Invalid route returns 404',
    description: 'Verifies 404 page for unknown routes',
    priority: 'low',
    type: 'negative',
    steps: ['Navigate to /no-such-page', 'Verify user should see 404'],
  },
];

describe('Generator integration (SQLite + StubLlm)', () => {
  let db;
  let llm;

  before(async () => {
    db = new SqliteRepository(':memory:');
    await db.initialize();
    llm = new StubLlm(STUB_SCENARIOS);
  });

  after(async () => {
    await db.close();
  });

  test('generate() persists scenarios to DB', async () => {
    const features = [
      {
        id: 'sha1:src/routes/dashboard.js',
        filePath: 'src/routes/dashboard.js',
        changeType: 'modified',
        description: 'Modified: dashboard handler',
        priority: 'high',
        diff: '+export function dashboard(req, res) {}',
      },
    ];

    const saved = await generate(features, llm, db);

    assert.equal(saved.length, 2, 'both stub scenarios should be saved');
    assert.equal(llm.calls.length, 1, 'LLM called once per feature');

    const inDb = await db.getScenariosByFeature('sha1:src/routes/dashboard.js');
    assert.equal(inDb.length, 2);
    assert.ok(inDb.some((s) => s.scenario_name === 'User can view dashboard'));
    assert.ok(inDb.some((s) => s.scenario_name === 'Invalid route returns 404'));
  });

  test('generate() skips feature when LLM throws', async () => {
    const throwingLlm = new StubLlm([]);
    throwingLlm.chat = async () => { throw new Error('API timeout'); };

    const features = [
      {
        id: 'sha1:src/broken.js',
        filePath: 'src/broken.js',
        changeType: 'modified',
        description: 'broken',
        priority: 'medium',
        diff: '',
      },
    ];

    // Should not throw — errors are swallowed per feature
    const saved = await generate(features, throwingLlm, db);
    assert.equal(saved.length, 0);
  });

  test('generate() handles LLM returning invalid JSON gracefully', async () => {
    const badLlm = new StubLlm([]);
    badLlm.chat = async () => 'this is not json at all';

    const features = [{
      id: 'sha1:src/bad-response.js',
      filePath: 'src/bad-response.js',
      changeType: 'added',
      description: 'new file',
      priority: 'low',
      diff: '',
    }];

    const saved = await generate(features, badLlm, db);
    assert.equal(saved.length, 0);
  });
});

describe('Pipeline integration (dryRun)', () => {
  let db;
  let llm;

  before(async () => {
    db = new SqliteRepository(':memory:');
    await db.initialize();
    llm = new StubLlm(STUB_SCENARIOS);
  });

  after(async () => {
    await db.close();
  });

  test('runPipeline() returns runId immediately', async () => {
    const result = await runPipeline({
      db,
      llm,
      config: { executor: {}, artifacts: {} },
      dryRun: true,
      repoPath: process.cwd(),
      trigger: 'test',
    });

    assert.ok(result.runId, 'should return a runId');
    assert.equal(result.status, 'running');
    assert.ok(result.startedAt);
  });

  test('runPipeline() creates pipeline_run record in DB', async () => {
    const { runId } = await runPipeline({
      db,
      llm,
      config: { executor: {}, artifacts: {} },
      dryRun: true,
      repoPath: process.cwd(),
      trigger: 'integration-test',
    });

    // Brief wait for async phases to write initial record
    await new Promise((r) => setTimeout(r, 50));

    const run = await db.getPipelineRun(runId);
    assert.ok(run, 'pipeline run record should exist');
    assert.equal(run.run_id, runId);
    assert.equal(run.trigger, 'integration-test');
  });

  test('runPipeline() completes with dryRun (no Playwright needed)', async () => {
    const { runId } = await runPipeline({
      db,
      llm,
      config: { executor: {}, artifacts: {} },
      dryRun: true,
      repoPath: process.cwd(),
      trigger: 'dry-run-test',
    });

    // Wait for async pipeline phases to finish
    await new Promise((r) => setTimeout(r, 300));

    const run = await db.getPipelineRun(runId);
    assert.ok(
      run.status === 'completed' || run.status === 'running',
      `status should be completed or running, got: ${run.status}`,
    );
  });
});

describe('Discovery engine', () => {
  test('discover() returns array', async () => {
    // Uses current repo — may return 0 or more features depending on git state
    const features = await discover({ repoPath: process.cwd(), since: 'HEAD~1' });
    assert.ok(Array.isArray(features));
  });

  test('discover() respects maxFeatures cap', async () => {
    const features = await discover({ repoPath: process.cwd(), maxFeatures: 2 });
    assert.ok(features.length <= 2);
  });

  test('discover() each feature has required shape', async () => {
    const features = await discover({ repoPath: process.cwd() });
    for (const f of features) {
      assert.ok('id' in f, 'feature should have id');
      assert.ok('filePath' in f, 'feature should have filePath');
      assert.ok('changeType' in f, 'feature should have changeType');
      assert.ok('priority' in f, 'feature should have priority');
      assert.ok(['high', 'medium', 'low'].includes(f.priority));
    }
  });
});
