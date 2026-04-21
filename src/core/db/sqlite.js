import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import initSqlJs from 'sql.js';
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

/**
 * SQLite repository backed by sql.js (pure WASM, no native build required).
 *
 * For in-memory databases pass ':memory:' as the dbPath.
 * For file-backed databases pass an absolute or relative path — the file is
 * read on initialize() and written on every mutating operation.
 */
export class SqliteRepository extends Repository {
  /** @param {string} dbPath  ':memory:' or a file path */
  constructor(dbPath) {
    super();
    this._dbPath = dbPath === ':memory:' ? null : resolve(dbPath);
    this._db = null;
    this._SQL = null;
  }

  async initialize() {
    this._SQL = await initSqlJs();

    if (this._dbPath) {
      mkdirSync(dirname(this._dbPath), { recursive: true });
      if (existsSync(this._dbPath)) {
        const buf = readFileSync(this._dbPath);
        this._db = new this._SQL.Database(buf);
      } else {
        this._db = new this._SQL.Database();
      }
    } else {
      // In-memory
      this._db = new this._SQL.Database();
    }

    this._db.run(MIGRATIONS);
  }

  async close() {
    if (this._db) {
      this._persist();
      this._db.close();
      this._db = null;
    }
  }

  /** Persist DB to file (no-op for in-memory). */
  _persist() {
    if (this._dbPath && this._db) {
      const data = this._db.export();
      writeFileSync(this._dbPath, Buffer.from(data));
    }
  }

  /* ---- helpers ---- */

  /**
   * Execute a SELECT and return all rows as plain objects.
   * @param {string} sql
   * @param {object|Array} [params]
   * @returns {object[]}
   */
  _all(sql, params = {}) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Execute a SELECT and return first row, or null.
   * @param {string} sql
   * @param {object|Array} [params]
   * @returns {object|null}
   */
  _get(sql, params = {}) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const has = stmt.step();
    const row = has ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  /**
   * Execute a mutating statement (INSERT/UPDATE/DELETE).
   * @param {string} sql
   * @param {object|Array} [params]
   * @returns {number} lastInsertRowid
   */
  _run(sql, params = {}) {
    this._db.run(sql, params);
    const [{ last_insert_rowid }] = this._db.exec('SELECT last_insert_rowid() as last_insert_rowid')[0]?.values?.map(
      (v) => ({ last_insert_rowid: v[0] }),
    ) ?? [{ last_insert_rowid: 0 }];
    this._persist();
    return last_insert_rowid;
  }

  _getScenarioById(id) {
    const row = this._get('SELECT * FROM test_scenarios WHERE id = ?', [id]);
    return row ? deserializeScenario(row) : null;
  }

  _getPipelineRunByRunId(runId) {
    const row = this._get('SELECT * FROM pipeline_runs WHERE run_id = ?', [runId]);
    return row ? deserializePipelineRun(row) : null;
  }

  /* ---- test_scenarios ---- */

  async createScenario(scenario) {
    const id = this._run(
      `INSERT INTO test_scenarios (feature_id, scenario_name, description, priority, type, steps, status, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scenario.featureId,
        scenario.scenarioName,
        scenario.description ?? null,
        scenario.priority ?? 'medium',
        scenario.type ?? 'happy_path',
        JSON.stringify(scenario.steps),
        scenario.status ?? 'active',
        scenario.tags ? JSON.stringify(scenario.tags) : null,
      ],
    );
    return this._getScenarioById(id);
  }

  async getScenariosByFeature(featureId) {
    const rows = this._all(
      "SELECT * FROM test_scenarios WHERE feature_id = ? AND status = 'active'",
      [featureId],
    );
    return rows.map(deserializeScenario);
  }

  async updateScenario(id, updates) {
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
    const values = [];
    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (updates[jsKey] !== undefined) {
        let val = updates[jsKey];
        if (dbCol === 'steps' || dbCol === 'tags') val = JSON.stringify(val);
        sets.push(`${dbCol} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return this._getScenarioById(id);

    sets.push("updated_at = datetime('now')");
    values.push(id);
    this._run(`UPDATE test_scenarios SET ${sets.join(', ')} WHERE id = ?`, values);
    return this._getScenarioById(id);
  }

  async getAllScenarios() {
    const rows = this._all("SELECT * FROM test_scenarios WHERE status = 'active'");
    return rows.map(deserializeScenario);
  }

  /* ---- execution_logs ---- */

  async createExecutionLog(log) {
    const id = this._run(
      `INSERT INTO execution_logs (scenario_id, status, screenshot_url, error_details, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [
        log.scenarioId,
        log.status,
        log.screenshotUrl ?? null,
        log.errorDetails ? JSON.stringify(log.errorDetails) : null,
        log.durationMs ?? null,
      ],
    );
    return this._get('SELECT * FROM execution_logs WHERE id = ?', [id]);
  }

  async getExecutionLogs(scenarioId, limit = 20) {
    return this._all(
      'SELECT * FROM execution_logs WHERE scenario_id = ? ORDER BY run_at DESC LIMIT ?',
      [scenarioId, limit],
    );
  }

  /* ---- world_model ---- */

  async upsertWorldModel(page) {
    this._run(
      `INSERT INTO world_model (page_url, elements, flows, last_updated)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(page_url) DO UPDATE SET
         elements = excluded.elements,
         flows = excluded.flows,
         last_updated = datetime('now')`,
      [
        page.pageUrl,
        page.elements ? JSON.stringify(page.elements) : null,
        page.flows ? JSON.stringify(page.flows) : null,
      ],
    );
    const row = this._get('SELECT * FROM world_model WHERE page_url = ?', [page.pageUrl]);
    return {
      ...row,
      elements: row.elements ? JSON.parse(row.elements) : null,
      flows: row.flows ? JSON.parse(row.flows) : null,
    };
  }

  async getWorldModel() {
    const rows = this._all('SELECT * FROM world_model');
    return rows.map((r) => ({
      ...r,
      elements: r.elements ? JSON.parse(r.elements) : null,
      flows: r.flows ? JSON.parse(r.flows) : null,
    }));
  }

  /* ---- pipeline_runs ---- */

  async createPipelineRun(run) {
    this._run(
      `INSERT INTO pipeline_runs (run_id, trigger, status, options)
       VALUES (?, ?, ?, ?)`,
      [
        run.runId,
        run.trigger ?? 'api',
        run.status ?? 'pending',
        run.options ? JSON.stringify(run.options) : null,
      ],
    );
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
    const values = [];
    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (updates[jsKey] !== undefined) {
        let val = updates[jsKey];
        if (dbCol === 'error_details' && val && typeof val === 'object') val = JSON.stringify(val);
        sets.push(`${dbCol} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return this._getPipelineRunByRunId(runId);

    values.push(runId);
    this._run(`UPDATE pipeline_runs SET ${sets.join(', ')} WHERE run_id = ?`, values);
    return this._getPipelineRunByRunId(runId);
  }

  async getPipelineRun(runId) {
    return this._getPipelineRunByRunId(runId);
  }

  async listPipelineRuns(limit = 20) {
    return this._all(
      'SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?',
      [limit],
    ).map(deserializePipelineRun);
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
