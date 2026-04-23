import pg from 'pg';
import { Repository } from './repository.js';

const { Pool } = pg;

// Each statement in its own string so we can run them inside a transaction
// individually. Multi-statement batches are not atomic in pg.
const MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS test_scenarios (
    id            SERIAL PRIMARY KEY,
    feature_id    TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    description   TEXT,
    priority      TEXT CHECK (priority IN ('high','medium','low')) DEFAULT 'medium',
    type          TEXT CHECK (type IN ('happy_path','edge_case','negative','regression')) DEFAULT 'happy_path',
    steps         JSONB NOT NULL DEFAULT '[]',
    status        TEXT DEFAULT 'active',
    last_run      TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    tags          JSONB DEFAULT '[]',
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS world_model (
    id           SERIAL PRIMARY KEY,
    page_url     TEXT UNIQUE,
    elements     JSONB,
    flows        JSONB,
    last_updated TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS execution_logs (
    id             SERIAL PRIMARY KEY,
    scenario_id    INTEGER REFERENCES test_scenarios(id),
    run_at         TIMESTAMPTZ DEFAULT now(),
    status         TEXT,
    screenshot_url TEXT,
    error_details  JSONB,
    duration_ms    INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                  SERIAL PRIMARY KEY,
    run_id              TEXT UNIQUE NOT NULL,
    trigger             TEXT,
    status              TEXT DEFAULT 'pending',
    started_at          TIMESTAMPTZ DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    features_found      INTEGER DEFAULT 0,
    scenarios_generated INTEGER DEFAULT 0,
    tests_passed        INTEGER DEFAULT 0,
    tests_failed        INTEGER DEFAULT 0,
    error_details       JSONB,
    options             JSONB
  )`,
  `CREATE INDEX IF NOT EXISTS idx_test_scenarios_feature_id  ON test_scenarios(feature_id)`,
  `CREATE INDEX IF NOT EXISTS idx_test_scenarios_status      ON test_scenarios(status)`,
  `CREATE INDEX IF NOT EXISTS idx_execution_logs_scenario_id ON execution_logs(scenario_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_id       ON pipeline_runs(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status       ON pipeline_runs(status)`,
];

/**
 * PostgreSQL repository using node-postgres connection pool.
 *
 * Pass the postgres:// connection string as the first constructor argument.
 * The factory in db/index.js reads TESTPILOT_POSTGRES_URL and passes it here.
 */
export class PostgresRepository extends Repository {
  /**
   * @param {string} connectionString  - postgres:// URL
   * @param {object} [poolOptions]     - extra Pool options (max, idleTimeoutMillis, …)
   */
  constructor(connectionString, poolOptions = {}) {
    super();
    this._connectionString = connectionString;
    this._poolOptions = poolOptions;
    this._pool = null;
  }

  async initialize() {
    // Idempotent: skip if already initialised so callers can call initialize()
    // multiple times without leaking pool connections.
    if (this._pool) return;

    this._pool = new Pool({
      connectionString: this._connectionString,
      max: this._poolOptions.max ?? 10,
      idleTimeoutMillis: this._poolOptions.idleTimeoutMillis ?? 30_000,
      connectionTimeoutMillis: this._poolOptions.connectionTimeoutMillis ?? 5_000,
    });

    // Surface idle-client errors instead of crashing the process with an
    // unhandled 'error' event on the Pool EventEmitter.
    this._pool.on('error', (err) => {
      console.error('[PostgresRepository] idle client error:', err);
    });

    // Run each DDL statement inside a single transaction so the schema is
    // applied atomically. IF NOT EXISTS guards make re-runs safe.
    const client = await this._pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of MIGRATION_STATEMENTS) {
        await client.query(stmt);
      }
      await client.query('COMMIT');
    } catch (migrationErr) {
      // ROLLBACK failure must not mask the original migration error.
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      // Tear down the pool so the instance is not left half-initialised.
      await this._pool.end().catch(() => {});
      this._pool = null;
      throw migrationErr;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }
  }

  /* ---- helpers ---- */

  _assertReady() {
    if (!this._pool) {
      throw new Error('PostgresRepository not initialised — call initialize() first');
    }
  }

  /**
   * Execute a SELECT and return all rows.
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Promise<object[]>}
   */
  async _all(sql, params = []) {
    this._assertReady();
    const { rows } = await this._pool.query(sql, params);
    return rows;
  }

  /**
   * Execute a SELECT and return first row or null.
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Promise<object|null>}
   */
  async _get(sql, params = []) {
    this._assertReady();
    const { rows } = await this._pool.query(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Execute a mutating query (INSERT/UPDATE) with RETURNING *.
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Promise<object|null>} first returned row
   */
  async _run(sql, params = []) {
    this._assertReady();
    const { rows } = await this._pool.query(sql, params);
    return rows[0] ?? null;
  }

  /* ---- test_scenarios ---- */

  async createScenario(scenario) {
    // pg serialises plain objects to JSONB automatically, but binds JS arrays
    // as Postgres array literals ({elem1,elem2}) rather than JSON ([…]).
    // Explicitly JSON.stringify every array-valued JSONB column.
    return this._run(
      `INSERT INTO test_scenarios
         (feature_id, scenario_name, description, priority, type, steps, status, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        scenario.featureId,
        scenario.scenarioName,
        scenario.description ?? null,
        scenario.priority ?? 'medium',
        scenario.type ?? 'happy_path',
        JSON.stringify(scenario.steps ?? []),
        scenario.status ?? 'active',
        JSON.stringify(scenario.tags ?? []),
      ],
    );
  }

  async getScenariosByFeature(featureId) {
    return this._all(
      "SELECT * FROM test_scenarios WHERE feature_id = $1 AND status = 'active'",
      [featureId],
    );
  }

  async updateScenario(id, updates) {
    const mapping = {
      scenarioName:  'scenario_name',
      description:   'description',
      priority:      'priority',
      type:          'type',
      steps:         'steps',
      status:        'status',
      lastRun:       'last_run',
      failureCount:  'failure_count',
      tags:          'tags',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (updates[jsKey] !== undefined) {
        let val = updates[jsKey];
        // steps and tags are JSONB array columns — stringify to avoid pg
        // binding them as Postgres array literals instead of JSON.
        if (dbCol === 'steps' || dbCol === 'tags') val = JSON.stringify(val);
        sets.push(`${dbCol} = $${idx++}`);
        values.push(val);
      }
    }
    if (sets.length === 0) {
      return this._get('SELECT * FROM test_scenarios WHERE id = $1', [id]);
    }

    sets.push('updated_at = now()');
    values.push(id);
    return this._run(
      `UPDATE test_scenarios SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
  }

  async getAllScenarios() {
    return this._all("SELECT * FROM test_scenarios WHERE status = 'active'");
  }

  /* ---- execution_logs ---- */

  async createExecutionLog(log) {
    return this._run(
      `INSERT INTO execution_logs
         (scenario_id, status, screenshot_url, error_details, duration_ms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        log.scenarioId,
        log.status,
        log.screenshotUrl ?? null,
        log.errorDetails ?? null,   // JSONB — pass object directly
        log.durationMs ?? null,
      ],
    );
  }

  async getExecutionLogs(scenarioId, limit = 20) {
    return this._all(
      'SELECT * FROM execution_logs WHERE scenario_id = $1 ORDER BY run_at DESC LIMIT $2',
      [scenarioId, limit],
    );
  }

  /* ---- world_model ---- */

  async upsertWorldModel(page) {
    return this._run(
      `INSERT INTO world_model (page_url, elements, flows, last_updated)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (page_url) DO UPDATE SET
         elements     = EXCLUDED.elements,
         flows        = EXCLUDED.flows,
         last_updated = now()
       RETURNING *`,
      [
        page.pageUrl,
        page.elements ?? null,   // JSONB — pass object directly
        page.flows    ?? null,
      ],
    );
  }

  async getWorldModel() {
    return this._all('SELECT * FROM world_model');
  }

  /* ---- pipeline_runs ---- */

  async createPipelineRun(run) {
    return this._run(
      `INSERT INTO pipeline_runs (run_id, trigger, status, options)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        run.runId,
        run.trigger ?? 'api',
        run.status  ?? 'pending',
        run.options ?? null,   // JSONB — pass object directly
      ],
    );
  }

  async updatePipelineRun(runId, updates) {
    const mapping = {
      status:              'status',
      completedAt:         'completed_at',
      featuresFound:       'features_found',
      scenariosGenerated:  'scenarios_generated',
      testsPassed:         'tests_passed',
      testsFailed:         'tests_failed',
      errorDetails:        'error_details',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (updates[jsKey] !== undefined) {
        // error_details is JSONB — pass object directly.
        sets.push(`${dbCol} = $${idx++}`);
        values.push(updates[jsKey]);
      }
    }
    if (sets.length === 0) {
      return this._get('SELECT * FROM pipeline_runs WHERE run_id = $1', [runId]);
    }

    values.push(runId);
    return this._run(
      `UPDATE pipeline_runs SET ${sets.join(', ')} WHERE run_id = $${idx} RETURNING *`,
      values,
    );
  }

  async getPipelineRun(runId) {
    return this._get('SELECT * FROM pipeline_runs WHERE run_id = $1', [runId]);
  }

  async listPipelineRuns(limit = 20) {
    return this._all(
      'SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT $1',
      [limit],
    );
  }
}
