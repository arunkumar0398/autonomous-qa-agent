import { Router } from 'express';
import { resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { runPipeline } from '../core/pipeline.js';

const router = Router();

/** Validate `since` is a safe git ref (no leading dash, no shell metacharacters). */
const SAFE_GIT_REF = /^[A-Za-z0-9._\-/~^@{}:]+$/;

/**
 * Resolve and validate repoPath is inside an allowed workspace root.
 * Returns the resolved absolute path or throws.
 */
function validateRepoPath(raw, config) {
  if (!raw) return undefined;

  if (typeof raw !== 'string' || raw.length > 512) {
    throw Object.assign(new Error('Invalid repoPath'), { status: 400 });
  }

  const resolved = resolve(raw);

  // Optionally constrain to a workspace root if configured
  const workspaceRoot = config?.discovery?.workspaceRoot;
  if (workspaceRoot) {
    const root = resolve(workspaceRoot);
    if (!resolved.startsWith(root + sep) && resolved !== root) {
      throw Object.assign(new Error('repoPath is outside allowed workspace root'), { status: 400 });
    }
  }

  // Reject paths without a .git directory
  if (!existsSync(resolve(resolved, '.git'))) {
    throw Object.assign(new Error('repoPath does not contain a git repository'), { status: 400 });
  }

  return resolved;
}

/**
 * POST /pipeline/run
 *
 * Trigger a Discover → Generate → Execute pipeline cycle.
 * Returns immediately with a runId; poll GET /pipeline/status/:runId for progress.
 *
 * Body:
 *   trigger      {string}  - who triggered this (default: 'api')
 *   repoPath     {string}  - absolute path to git repo (default: cwd)
 *   since        {string}  - git ref to diff against (default: HEAD~1)
 *   maxFeatures  {number}  - cap on features to process (default: 20)
 *   dryRun       {boolean} - skip execution, only discover + generate
 */
router.post('/run', async (req, res) => {
  const { db, llm, config } = req.app.locals;

  try {
    // Validate inputs
    const repoPath = validateRepoPath(req.body.repoPath, config);

    const since = req.body.since;
    if (since !== undefined && (typeof since !== 'string' || !SAFE_GIT_REF.test(since))) {
      return res.status(400).json({ error: 'Invalid since ref' });
    }

    const maxFeatures = req.body.maxFeatures !== undefined
      ? Math.max(1, Math.min(Number.parseInt(req.body.maxFeatures, 10) || 20, 200))
      : 20;

    const dryRun = req.body.dryRun === true || req.body.dryRun === 'true';

    const result = await runPipeline({
      trigger: 'api',
      repoPath,
      since,
      maxFeatures,
      dryRun,
      db,
      llm,
      config,
    });

    res.status(202).json(result);
  } catch (err) {
    const status = err.status ?? 500;
    res.status(status).json({ error: status < 500 ? err.message : 'Pipeline request failed' });
  }
});

/**
 * GET /pipeline/status/:runId
 *
 * Return the current state of a pipeline run.
 */
router.get('/status/:runId', async (req, res) => {
  const { db } = req.app.locals;
  const run = await db.getPipelineRun(req.params.runId).catch(() => null);

  if (!run) {
    return res.status(404).json({ error: `Run not found: ${req.params.runId}` });
  }

  res.json({
    runId: run.run_id,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    featuresFound: run.features_found,
    scenariosGenerated: run.scenarios_generated,
    testsPassed: run.tests_passed,
    testsFailed: run.tests_failed,
    errorDetails: run.error_details ?? null,
  });
});

/**
 * GET /pipeline/runs
 *
 * List recent pipeline runs.
 */
router.get('/runs', async (req, res) => {
  const { db } = req.app.locals;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const runs = await db.listPipelineRuns(limit).catch(() => []);
  res.json(runs);
});

export default router;
