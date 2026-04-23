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
  // Unique prefix to isolate test data from concurrent runs
  const prefix = `test_${Date.now()}_`;

  before(async () => {
    db = new PostgresRepository(PG_URL);
    await db.initialize();
  });

  after(async () => {
    await db.close();
  });

  describe('test_scenarios', () => {
    test('createScenario — inserts and returns row with id', async () => {
      const row = await db.createScenario({
        featureId: `${prefix}feature-a`,
        scenarioName: 'PG: user can log in',
        steps: [{ action: 'navigate', target: '/login' }],
        priority: 'high',
        type: 'happy_path',
      });

      assert.ok(row.id, 'should have numeric id');
      assert.equal(row.feature_id, `${prefix}feature-a`);
      assert.equal(row.scenario_name, 'PG: user can log in');
      assert.equal(row.priority, 'high');
      assert.equal(row.status, 'active');
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
      });

      assert.equal(updated.scenario_name, 'After');
      assert.equal(updated.priority, 'low');
    });

    test('getAllScenarios — returns active scenarios', async () => {
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
      });

      assert.equal(Number(log.scenario_id), scenario.id);
      assert.equal(log.status, 'passed');
      assert.equal(log.duration_ms, 999);
    });

    test('getExecutionLogs — returns logs for scenario', async () => {
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
    test('createPipelineRun — inserts run row', async () => {
      const runId = `${prefix}run-001`;
      const run = await db.createPipelineRun({ runId, trigger: 'api', status: 'running' });

      assert.equal(run.run_id, runId);
      assert.equal(run.status, 'running');
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
      });

      assert.equal(updated.status, 'completed');
      assert.equal(updated.features_found, 3);
      assert.equal(updated.tests_passed, 6);
    });

    test('getPipelineRun — returns run by runId', async () => {
      const runId = `${prefix}run-003`;
      await db.createPipelineRun({ runId, trigger: 'webhook', status: 'pending' });
      const run = await db.getPipelineRun(runId);
      assert.equal(run.run_id, runId);
    });

    test('listPipelineRuns — returns array', async () => {
      const runs = await db.listPipelineRuns(50);
      assert.ok(Array.isArray(runs));
    });
  });

  describe('world_model', () => {
    test('upsertWorldModel — insert then update', async () => {
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
    });

    test('getWorldModel — returns array', async () => {
      const model = await db.getWorldModel();
      assert.ok(Array.isArray(model));
    });
  });
});
