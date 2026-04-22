import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteRepository } from '../../../src/core/db/sqlite.js';

describe('SqliteRepository', () => {
  let db;

  before(async () => {
    db = new SqliteRepository(':memory:');
    await db.initialize();
  });

  after(async () => {
    await db.close();
  });

  describe('test_scenarios', () => {
    test('createScenario — inserts and returns row with id', async () => {
      const row = await db.createScenario({
        featureId: 'abc:src/foo.js',
        scenarioName: 'User can log in',
        steps: [{ action: 'navigate', target: '/login' }],
        priority: 'high',
        type: 'happy_path',
      });

      assert.ok(row.id, 'should have numeric id');
      assert.equal(row.feature_id, 'abc:src/foo.js');
      assert.equal(row.scenario_name, 'User can log in');
      assert.deepEqual(row.steps, [{ action: 'navigate', target: '/login' }]);
      assert.equal(row.priority, 'high');
      assert.equal(row.status, 'active');
    });

    test('getScenariosByFeature — returns only matching active scenarios', async () => {
      await db.createScenario({
        featureId: 'feature-x',
        scenarioName: 'Scenario A',
        steps: [],
      });
      await db.createScenario({
        featureId: 'feature-y',
        scenarioName: 'Scenario B',
        steps: [],
      });

      const rows = await db.getScenariosByFeature('feature-x');
      assert.ok(rows.length >= 1);
      assert.ok(rows.every((r) => r.feature_id === 'feature-x'));
    });

    test('updateScenario — updates allowed fields', async () => {
      const created = await db.createScenario({
        featureId: 'upd:test',
        scenarioName: 'Before update',
        steps: [],
      });

      const updated = await db.updateScenario(created.id, {
        scenarioName: 'After update',
        priority: 'low',
      });

      assert.equal(updated.scenario_name, 'After update');
      assert.equal(updated.priority, 'low');
    });

    test('getAllScenarios — returns active scenarios', async () => {
      const all = await db.getAllScenarios();
      assert.ok(Array.isArray(all));
      assert.ok(all.every((r) => r.status === 'active'));
    });
  });

  describe('execution_logs', () => {
    test('createExecutionLog — inserts log row', async () => {
      const scenario = await db.createScenario({
        featureId: 'log:test',
        scenarioName: 'Log test scenario',
        steps: [],
      });

      const log = await db.createExecutionLog({
        scenarioId: scenario.id,
        status: 'passed',
        durationMs: 1234,
      });

      assert.equal(log.scenario_id, scenario.id);
      assert.equal(log.status, 'passed');
      assert.equal(log.duration_ms, 1234);
    });

    test('getExecutionLogs — returns logs for scenario', async () => {
      const scenario = await db.createScenario({
        featureId: 'log:get',
        scenarioName: 'Get logs test',
        steps: [],
      });

      await db.createExecutionLog({ scenarioId: scenario.id, status: 'failed', durationMs: 500 });
      await db.createExecutionLog({ scenarioId: scenario.id, status: 'passed', durationMs: 800 });

      const logs = await db.getExecutionLogs(scenario.id);
      assert.equal(logs.length, 2);
    });
  });

  describe('pipeline_runs', () => {
    test('createPipelineRun — inserts run row', async () => {
      const run = await db.createPipelineRun({
        runId: 'run-001',
        trigger: 'api',
        status: 'running',
      });

      assert.equal(run.run_id, 'run-001');
      assert.equal(run.status, 'running');
      assert.equal(run.trigger, 'api');
    });

    test('updatePipelineRun — updates status and counts', async () => {
      await db.createPipelineRun({ runId: 'run-002', trigger: 'ci', status: 'running' });

      const updated = await db.updatePipelineRun('run-002', {
        status: 'completed',
        featuresFound: 3,
        scenariosGenerated: 7,
        testsPassed: 6,
        testsFailed: 1,
      });

      assert.equal(updated.status, 'completed');
      assert.equal(updated.features_found, 3);
      assert.equal(updated.scenarios_generated, 7);
      assert.equal(updated.tests_passed, 6);
      assert.equal(updated.tests_failed, 1);
    });

    test('getPipelineRun — returns run by runId', async () => {
      await db.createPipelineRun({ runId: 'run-003', trigger: 'webhook', status: 'pending' });
      const run = await db.getPipelineRun('run-003');
      assert.equal(run.run_id, 'run-003');
      assert.equal(run.trigger, 'webhook');
    });

    test('listPipelineRuns — returns ordered list', async () => {
      const runs = await db.listPipelineRuns(50);
      assert.ok(Array.isArray(runs));
    });
  });

  describe('world_model', () => {
    test('upsertWorldModel — insert then update', async () => {
      await db.upsertWorldModel({
        pageUrl: '/dashboard',
        elements: [{ selector: '#btn', type: 'button' }],
        flows: [],
      });

      await db.upsertWorldModel({
        pageUrl: '/dashboard',
        elements: [{ selector: '#btn', type: 'button' }, { selector: '#nav', type: 'nav' }],
        flows: ['login → dashboard'],
      });

      const model = await db.getWorldModel();
      const page = model.find((m) => m.page_url === '/dashboard');
      assert.ok(page);
      assert.equal(page.elements.length, 2);
    });
  });
});
