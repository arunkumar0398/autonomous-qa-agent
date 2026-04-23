/**
 * PostgreSQL repository tests.
 * Skipped automatically when TESTPILOT_POSTGRES_URL is not set.
 * Run with a real Postgres: TESTPILOT_POSTGRES_URL=postgres://... npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresRepository } from '../../../src/core/db/postgres.js';

const PG_URL = process.env.TESTPILOT_POSTGRES_URL;
const skip = !PG_URL;
const SKIP_MSG = 'TESTPILOT_POSTGRES_URL not set — skipping Postgres tests';

describe('PostgresRepository', { skip: skip ? SKIP_MSG : false }, () => {
  let db;
  // Unique prefix isolates this run's rows from concurrent runs
  // Use hyphens, not underscores: '_' is a single-char SQL LIKE wildcard so
  // 'test_…%' could match unrelated rows in a shared database.
  const prefix = `test-${Date.now()}-`;

  before(async () => {
    db = new PostgresRepository(PG_URL);
    await db.initialize();
  });

  after(async () => {
    // Clean up all rows created by this test run to keep the DB tidy
    const client = await db._pool.connect();
    try {
      await client.query(
        `DELETE FROM execution_logs
           WHERE scenario_id IN (
             SELECT id FROM test_scenarios WHERE feature_id LIKE $1
           )`,
        [`${prefix}%`],
      );
      await client.query(
        'DELETE FROM test_scenarios WHERE feature_id LIKE $1',
        [`${prefix}%`],
      );
      await client.query(
        'DELETE FROM pipeline_runs WHERE run_id LIKE $1',
        [`${prefix}%`],
      );
      await client.query(
        'DELETE FROM world_model WHERE page_url LIKE $1',
        [`${prefix}%`],
      );
    } finally {
      client.release();
    }
    await db.close();
  });

  describe('test_scenarios', () => {
    test('createScenario — inserts and returns row with parsed JSONB', async () => {
      const steps = [{ action: 'navigate', target: '/login' }];
      const tags  = ['auth', 'smoke'];
      const row = await db.createScenario({
        featureId: `${prefix}feature-a`,
        scenarioName: 'PG: user can log in',
        steps,
        tags,
        priority: 'high',
        type: 'happy_path',
      });

      assert.ok(row.id, 'should have numeric id');
      assert.equal(row.feature_id, `${prefix}feature-a`);
      assert.equal(row.scenario_name, 'PG: user can log in');
      assert.equal(row.priority, 'high');
      assert.equal(row.status, 'active');
      // pg deserialises JSONB — assert JS array, not string
      assert.ok(Array.isArray(row.steps), 'steps should be JS array');
      assert.deepEqual(row.steps, steps);
      assert.ok(Array.isArray(row.tags), 'tags should be JS array');
      assert.deepEqual(row.tags, tags);
    });

    test('getScenariosByFeature — returns matching active scenarios', async () => {
      await db.createScenario({
        featureId: `${prefix}feature-b`,
        scenarioName: 'PG: scenario B',
        steps: [],
      });

      const rows = await db.getScenariosByFeature(`${prefix}feature-b`);
      assert.ok(rows.length >= 1);
      assert.ok(rows.every((r) => r.feature_id === `${prefix}feature-b`));
      assert.ok(rows.every((r) => Array.isArray(r.steps)), 'steps should be JS arrays');
    });

    test('updateScenario — updates allowed fields', async () => {
      const created = await db.createScenario({
        featureId: `${prefix}upd`,
        scenarioName: 'Before',
        steps: [],
      });

      const updated = await db.updateScenario(created.id, {
        scenarioName: 'After',
        priority: 'low',
        steps: [{ action: 'click', target: '#btn' }],
      });

      assert.equal(updated.scenario_name, 'After');
      assert.equal(updated.priority, 'low');
      assert.ok(Array.isArray(updated.steps), 'updated steps should be JS array');
      assert.deepEqual(updated.steps, [{ action: 'click', target: '#btn' }]);
    });

    test('getAllScenarios — returns active scenarios array', async () => {
      const all = await db.getAllScenarios();
      assert.ok(Array.isArray(all));
    });
  });

  describe('execution_logs', () => {
    test('createExecutionLog — inserts log row', async () => {
      const scenario = await db.createScenario({
        featureId: `${prefix}log`,
        scenarioName: 'PG: log test',
        steps: [],
      });

      const log = await db.createExecutionLog({
        scenarioId: scenario.id,
        status: 'passed',
        durationMs: 999,
        errorDetails: { msg: 'none' },
      });

      assert.equal(Number(log.scenario_id), scenario.id);
      assert.equal(log.status, 'passed');
      assert.equal(log.duration_ms, 999);
      // JSONB error_details returned as object
      assert.deepEqual(log.error_details, { msg: 'none' });
    });

    test('getExecutionLogs — returns logs for scenario ordered desc', async () => {
      const scenario = await db.createScenario({
        featureId: `${prefix}logs2`,
        scenarioName: 'PG: logs2',
        steps: [],
      });

      await db.createExecutionLog({ scenarioId: scenario.id, status: 'failed', durationMs: 100 });
      await db.createExecutionLog({ scenarioId: scenario.id, status: 'passed', durationMs: 200 });

      const logs = await db.getExecutionLogs(scenario.id);
      assert.equal(logs.length, 2);
    });
  });

  describe('pipeline_runs', () => {
    test('createPipelineRun — inserts run row with JSONB options', async () => {
      const runId = `${prefix}run-001`;
      const options = { parallel: true, retries: 2 };
      const run = await db.createPipelineRun({ runId, trigger: 'api', status: 'running', options });

      assert.equal(run.run_id, runId);
      assert.equal(run.status, 'running');
      assert.deepEqual(run.options, options);
    });

    test('updatePipelineRun — updates status and counts', async () => {
      const runId = `${prefix}run-002`;
      await db.createPipelineRun({ runId, trigger: 'ci', status: 'running' });

      const updated = await db.updatePipelineRun(runId, {
        status: 'completed',
        featuresFound: 3,
        scenariosGenerated: 7,
        testsPassed: 6,
        testsFailed: 1,
        errorDetails: { reason: 'timeout' },
      });

      assert.equal(updated.status, 'completed');
      assert.equal(updated.features_found, 3);
      assert.equal(updated.tests_passed, 6);
      // JSONB error_details returned as object
      assert.deepEqual(updated.error_details, { reason: 'timeout' });
    });

    test('getPipelineRun — returns run by runId', async () => {
      const runId = `${prefix}run-003`;
      await db.createPipelineRun({ runId, trigger: 'webhook', status: 'pending' });
      const run = await db.getPipelineRun(runId);
      assert.equal(run.run_id, runId);
      assert.equal(run.trigger, 'webhook');
    });

    test('listPipelineRuns — returns ordered array', async () => {
      const runs = await db.listPipelineRuns(50);
      assert.ok(Array.isArray(runs));
    });
  });

  describe('world_model', () => {
    test('upsertWorldModel — insert then update, returns parsed JSONB', async () => {
      const url = `${prefix}/dashboard`;

      await db.upsertWorldModel({
        pageUrl: url,
        elements: [{ selector: '#btn' }],
        flows: [],
      });

      const row = await db.upsertWorldModel({
        pageUrl: url,
        elements: [{ selector: '#btn' }, { selector: '#nav' }],
        flows: ['login → dash'],
      });

      assert.equal(row.page_url, url);
      assert.ok(Array.isArray(row.elements), 'elements should be JS array');
      assert.equal(row.elements.length, 2);
      assert.ok(Array.isArray(row.flows), 'flows should be JS array');
      assert.deepEqual(row.flows, ['login → dash']);
    });

    test('getWorldModel — returns array', async () => {
      const model = await db.getWorldModel();
      assert.ok(Array.isArray(model));
    });
  });

  describe('pre-init guard', () => {
    test('calling _all before initialize() throws helpful error', async () => {
      const uninit = new PostgresRepository(PG_URL);
      await assert.rejects(
        () => uninit._all('SELECT 1'),
        /not initialised/,
      );
    });
  });
});
