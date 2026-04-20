import { runScenario } from './playwright-runner.js';

/**
 * Execute a list of test scenarios and persist results.
 *
 * @param {object[]} scenarios  - scenario rows from DB
 * @param {import('../../core/db/repository.js').Repository} db
 * @param {object} config       - app config
 * @returns {Promise<{passed: number, failed: number, results: object[]}>}
 */
export async function execute(scenarios, db, config) {
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const scenario of scenarios) {
    let execResult;
    try {
      execResult = await runScenario(scenario, config);
    } catch (err) {
      execResult = {
        scenarioId: scenario.id,
        status: 'error',
        durationMs: 0,
        screenshotUrl: null,
        errorDetails: { message: err.message },
      };
    }

    // Persist execution log
    try {
      await db.createExecutionLog({
        scenarioId: execResult.scenarioId,
        status: execResult.status,
        screenshotUrl: execResult.screenshotUrl,
        errorDetails: execResult.errorDetails,
        durationMs: execResult.durationMs,
      });
    } catch (err) {
      console.warn(`[executor] Failed to persist execution log: ${err.message}`);
    }

    // Update scenario stats
    if (execResult.status !== 'passed') {
      try {
        await db.updateScenario(scenario.id, {
          lastRun: new Date().toISOString(),
          failureCount: (scenario.failureCount ?? 0) + 1,
        });
      } catch { /* non-critical */ }
      failed++;
    } else {
      try {
        await db.updateScenario(scenario.id, { lastRun: new Date().toISOString() });
      } catch { /* non-critical */ }
      passed++;
    }

    results.push(execResult);
  }

  return { passed, failed, results };
}
