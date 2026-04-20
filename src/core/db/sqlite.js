import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Repository } from './repository.js';

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS test_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK (priority IN ('high','medium','low')),
  type TEXT CHECK (type IN ('happy_path','edge_case','negative','regression')),
  steps TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  last_run TEXT,
  failure_count INTEGER DEFAULT 0,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS world_model (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_url TEXT UNIQUE,
  elements TEXT,
  flows TEXT,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id INTEGER REFERENCES test_scenarios(id),
  run_at TEXT DEFAULT (datetime('now')),
  status TEXT,
  screenshot_url TEXT,
  error_details TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT UNIQUE NOT NULL,
  trigger TEXT,
  status TEXT DEFAULT 'pending',
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  features_found INTEGER DEFAULT 0,
  scenarios_generated INTEGER DEFAULT 0,
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,
  error_details TEXT,
  options TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_scenarios_feature_id ON test_scenarios(feature_id);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_status ON test_scenarios(status);
CREATE INDEX IF NOT EXISTS idx_execution_logs_scenario_id ON execution_logs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_id ON pipeline_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
`;

export class SqliteRepository extends Repository {
  /** @param {string} dbPath */
  constructor(dbPath) {
    super();
    this._dbPath = dbPath;
    this._db = null;
  }

  async initialize() {
    mkdirSync(dirname(this._dbPath), { recursive: true });
    this._db = new Database(this._dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('busy_timeout = 5000');
    this._db.exec(MIGRATIONS);
  }

  async close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  /* ---- test_scenarios ---- */

  async createScenario(scenario) {
    const stmt = this._db.prepare(`
      INSERT INTO test_scenarios (feature_id, scenario_name, description, priority, type, steps, status, tags)
      VALUES (@featureId, @scenarioName, @description, @priority, @type, @steps, @status, @tags)
    `);
    const info = stmt.run({
      featureId: scenario.featureId,
      scenarioName: scenario.scenarioName,
      description: scenario.description ?? null,
      priority: scenario.priority ?? 'medium',
      type: scenario.type ?? 'happy_path',
      steps: JSON.stringify(scenario.steps),
      status: scenario.status ?? 'active',
      tags: scenario.tags ? JSON.stringify(scenario.tags) : null,
    });
    return this._getScenarioById(info.lastInsertRowid);
  }

  async getScenariosByFeature(featureId) {
    const rows = this._db
      .prepare('SELECT * FROM test_scenarios WHERE feature_id = ? AND status = ?')
      .all(featureId, 'active');
    return rows.map(deserializeScenario);
  }

  async updateScenario(id, updates) {
    const allowed = ['scenario_name', 'description', 'priority', 'type', 'steps', 'status', 'last_run', 'failure_count', 'tags'];
    const mapping = {
      scenarioName: 'scenario_name',
      description: 'description',
      priority: 'priority',
      type: 'type',
      steps: 'steps',
      status: 'status',
      lastRun: 'last_run',
      failureCount: 'failure_count',
      tags: 'tags',
    };

    const sets = [];
    const values = {};
    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (updates[jsKey] !== undefined && allowed.includes(dbCol)) {
        let val = updates[jsKey];
        if (dbCol === 'steps' || dbCol === 'tags') val = JSON.stringify(val);
        sets.push(`${dbCol} = @${dbCol}`);
        values[dbCol] = val;
      }
    }
    if (sets.length === 0) return this._getScenarioById(id);

    sets.push("updated_at = datetime('now')");
    values.id = id;
    this._db.prepare(`UPDATE test_scenarios SET ${sets.join(', ')} WHERE id = @id`).run(values);
    return this._getScenarioById(id);
  }

  async getAllScenarios() {
    const rows = this._db.prepare('SELECT * FROM test_scenarios WHERE status = ?').all('active');
    return rows.map(deserializeScenario);
  }

  /* ---- execution_logs ---- */

  async createExecutionLog(log) {
    const stmt = this._db.prepare(`
      INSERT INTO execution_logs (scenario_id, status, screenshot_url, error_details, duration_ms)
      VALUES (@scenarioId, @status, @screenshotUrl, @errorDetails, @durationMs)
    `);
    const info = stmt.run({
      scenarioId: log.scenarioId,
      status: log.status,
      screenshotUrl: log.screenshotUrl ?? null,
      errorDetails: log.errorDetails ? JSON.stringify(log.errorDetails) : null,
      durationMs: log.durationMs ?? null,
    });
    return this._db.prepare('SELECT * FROM execution_logs WHERE id = ?').get(info.lastInsertRowid);
  }

  async getExecutionLogs(scenarioId, limit = 20) {
    return this._db
      .prepare('SELECT * FROM execution_logs WHERE scenario_id = ? ORDER BY run_at DESC LIMIT ?')
      .all(scenarioId, limit);
  }

  /* ---- world_model ---- */

  async upsertWorldModel(page) {
    this._db.prepare(`
      INSERT INTO world_model (page_url, elements, flows, last_updated)
      VALUES (@pageUrl, @elements, @flows, datetime('now'))
      ON CONFLICT(page_url) DO UPDATE SET
        elements = @elements,
        flows = @flows,
        last_updated = datetime('now')
    `).run({
      pageUrl: page.pageUrl,
      elements: page.elements ? JSON.stringify(page.elements) : null,
      flows: page.flows ? JSON.stringify(page.flows) : null,
    });
    return this._db.prepare('SELECT * FROM world_model WHERE page_url = ?').get(page.pageUrl);
  }

  async getWorldModel() {
    const rows = this._db.prepare('SELECT * FROM world_model').all();
    return rows.map((r) => ({
      ...r,
      elements: r.elements ? JSON.parse(r.elements) : null,
      flows: r.flows ? JSON.parse(r.flows) : null,
    }));
  }

  /* ---- pipeline_runs ---- */

  async createPipelineRun(run) {
    this._db.prepare(`
      INSERT INTO pipeline_runs (run_id, trigger, status, options)
      VALUES (@runId, @trigger, @status, @options)
    `).run({
      runId: run.runId,
      trigger: run.trigger ?? 'api',
      status: run.status ?? 'pending',
      options: run.options ? JSON.stringify(run.options) : null,
    });
    return this._getPipelineRunByRunId(run.runId);
  }

  async updatePipelineRun(runId, updates) {
    const mapping = {
      status: 'status',
      completedAt: 'completed_at',
      featuresFound: 'features_found',
      scenariosGenerated: 'scenarios_generated',
      testsPassed: 'tests_passed',
      testsFailed: 'tests_failed',
      errorDetails: 'error_details',
    };

    const sets = [];
    const values = {};
    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (updates[jsKey] !== undefined) {
        let val = updates[jsKey];
        if (dbCol === 'error_details' && val && typeof val === 'object') val = JSON.stringify(val);
        sets.push(`${dbCol} = @${dbCol}`);
        values[dbCol] = val;
      }
    }
    if (sets.length === 0) return this._getPipelineRunByRunId(runId);

    values.runId = runId;
    this._db.prepare(`UPDATE pipeline_runs SET ${sets.join(', ')} WHERE run_id = @runId`).run(values);
    return this._getPipelineRunByRunId(runId);
  }

  async getPipelineRun(runId) {
    return this._getPipelineRunByRunId(runId);
  }

  async listPipelineRuns(limit = 20) {
    return this._db
      .prepare('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?')
      .all(limit)
      .map(deserializePipelineRun);
  }

  /* ---- helpers ---- */

  _getScenarioById(id) {
    const row = this._db.prepare('SELECT * FROM test_scenarios WHERE id = ?').get(id);
    return row ? deserializeScenario(row) : null;
  }

  _getPipelineRunByRunId(runId) {
    const row = this._db.prepare('SELECT * FROM pipeline_runs WHERE run_id = ?').get(runId);
    return row ? deserializePipelineRun(row) : null;
  }
}

function deserializeScenario(row) {
  return {
    ...row,
    steps: row.steps ? JSON.parse(row.steps) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

function deserializePipelineRun(row) {
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : null,
    errorDetails: row.error_details ? JSON.parse(row.error_details) : null,
  };
}
