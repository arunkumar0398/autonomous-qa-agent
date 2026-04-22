/**
 * Abstract repository interface.
 *
 * Every concrete backend (SQLite, PostgreSQL) must implement these methods.
 * Consumers import the factory in ./index.js — never this file directly.
 */

export class Repository {
  /* ---- lifecycle ---- */

  /** Run migrations / ensure tables exist. */
  async initialize() {
    throw new Error('Repository.initialize() not implemented');
  }

  /** Gracefully close the connection. */
  async close() {
    throw new Error('Repository.close() not implemented');
  }

  /* ---- test_scenarios ---- */

  /**
   * @param {object} scenario
   * @param {string} scenario.featureId
   * @param {string} scenario.scenarioName
   * @param {string} [scenario.description]
   * @param {'high'|'medium'|'low'} [scenario.priority]
   * @param {'happy_path'|'edge_case'|'negative'|'regression'} [scenario.type]
   * @param {object} scenario.steps - JSON-serialisable test steps
   * @param {string} [scenario.status]
   * @param {string[]} [scenario.tags]
   * @returns {Promise<object>} the inserted row (with id)
   */
  async createScenario(_scenario) {
    throw new Error('Repository.createScenario() not implemented');
  }

  /**
   * @param {string} featureId
   * @returns {Promise<object[]>}
   */
  async getScenariosByFeature(_featureId) {
    throw new Error('Repository.getScenariosByFeature() not implemented');
  }

  /**
   * @param {number} id
   * @param {object} updates - partial fields to update
   * @returns {Promise<object>} updated row
   */
  async updateScenario(_id, _updates) {
    throw new Error('Repository.updateScenario() not implemented');
  }

  /**
   * @returns {Promise<object[]>} all active scenarios
   */
  async getAllScenarios() {
    throw new Error('Repository.getAllScenarios() not implemented');
  }

  /* ---- execution_logs ---- */

  /**
   * @param {object} log
   * @param {number} log.scenarioId
   * @param {string} log.status
   * @param {string} [log.screenshotUrl]
   * @param {object} [log.errorDetails]
   * @param {number} [log.durationMs]
   * @returns {Promise<object>}
   */
  async createExecutionLog(_log) {
    throw new Error('Repository.createExecutionLog() not implemented');
  }

  /**
   * @param {number} scenarioId
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async getExecutionLogs(_scenarioId, _limit) {
    throw new Error('Repository.getExecutionLogs() not implemented');
  }

  /* ---- world_model ---- */

  /**
   * @param {object} page
   * @param {string} page.pageUrl
   * @param {object} [page.elements]
   * @param {object} [page.flows]
   * @returns {Promise<object>}
   */
  async upsertWorldModel(_page) {
    throw new Error('Repository.upsertWorldModel() not implemented');
  }

  /**
   * @returns {Promise<object[]>}
   */
  async getWorldModel() {
    throw new Error('Repository.getWorldModel() not implemented');
  }

  /* ---- pipeline_runs ---- */

  /**
   * @param {object} run
   * @param {string} run.runId
   * @param {string} [run.trigger]
   * @param {object} [run.options]
   * @returns {Promise<object>}
   */
  async createPipelineRun(_run) {
    throw new Error('Repository.createPipelineRun() not implemented');
  }

  /**
   * @param {string} runId
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async updatePipelineRun(_runId, _updates) {
    throw new Error('Repository.updatePipelineRun() not implemented');
  }

  /**
   * @param {string} runId
   * @returns {Promise<object|null>}
   */
  async getPipelineRun(_runId) {
    throw new Error('Repository.getPipelineRun() not implemented');
  }

  /**
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async listPipelineRuns(_limit) {
    throw new Error('Repository.listPipelineRuns() not implemented');
  }
}
