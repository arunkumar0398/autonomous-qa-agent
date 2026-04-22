import { randomUUID } from 'node:crypto';
import { discover } from '../engines/discovery/index.js';
import { generate } from '../engines/generator/index.js';
import { execute } from '../engines/executor/index.js';

/**
 * Run the full Discover → Generate → Execute pipeline.
 *
 * Creates a pipeline_run record, runs all phases, and updates the record
 * with final counts and status. Errors in any phase are caught and persisted
 * rather than propagated — the run status is set to 'failed'.
 *
 * @param {object} options
 * @param {string} [options.repoPath]      - path to git repo (defaults to cwd)
 * @param {string} [options.since]         - git ref to diff against (defaults to HEAD~1)
 * @param {number} [options.maxFeatures]   - max features to process
 * @param {boolean} [options.dryRun]       - skip execution phase
 * @param {string} [options.trigger]       - who triggered this run
 * @param {import('./db/repository.js').Repository} options.db
 * @param {import('./llm/adapter.js').LlmAdapter} options.llm
 * @param {object} options.config          - full app config
 * @returns {Promise<{runId: string, status: string, startedAt: string}>}
 */
export async function runPipeline(options) {
  const { db, llm, config } = options;
  const runId = randomUUID();

  // Create the pipeline run record
  await db.createPipelineRun({
    runId,
    trigger: options.trigger ?? 'api',
    status: 'running',
    options: {
      repoPath: options.repoPath,
      since: options.since,
      maxFeatures: options.maxFeatures,
      dryRun: options.dryRun ?? false,
    },
  });

  const startedAt = new Date().toISOString();

  // Run pipeline phases asynchronously — caller gets runId immediately
  _runPhasesAsync({ runId, options, db, llm, config });

  return { runId, status: 'running', startedAt };
}

/**
 * Execute all pipeline phases. Updates DB throughout.
 * All errors are caught so the pipeline_run record is always finalized.
 */
async function _runPhasesAsync({ runId, options, db, llm, config }) {
  try {
    // Phase 1: Discovery
    const features = await discover({
      repoPath: options.repoPath ?? config.discovery?.repoPath,
      since: options.since,
      maxFeatures: options.maxFeatures,
    });

    await db.updatePipelineRun(runId, { featuresFound: features.length });

    if (features.length === 0) {
      await db.updatePipelineRun(runId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // Phase 2: Generation
    const scenarios = await generate(features, llm, db);
    await db.updatePipelineRun(runId, { scenariosGenerated: scenarios.length });

    if (scenarios.length === 0 || options.dryRun) {
      await db.updatePipelineRun(runId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // Phase 3: Execution
    const summary = await execute(scenarios, db, config);
    await db.updatePipelineRun(runId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      testsPassed: summary.passed,
      testsFailed: summary.failed,
    });
  } catch (err) {
    console.error(`[pipeline] Run ${runId} failed: ${err.message}`);
    await db.updatePipelineRun(runId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorDetails: { message: err.message, stack: err.stack },
    }).catch(() => {});
  }
}
