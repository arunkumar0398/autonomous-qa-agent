import { Router } from 'express';

const router = Router();

/**
 * GET /scenarios
 *
 * Return all active test scenarios.
 */
router.get('/', async (req, res) => {
  const { db } = req.app.locals;
  const scenarios = await db.getAllScenarios().catch(() => []);
  res.json(scenarios);
});

/**
 * GET /scenarios/:id/logs
 *
 * Return execution logs for a specific scenario.
 */
router.get('/:id/logs', async (req, res) => {
  const { db } = req.app.locals;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid scenario id' });
  }
  const logs = await db.getExecutionLogs(id).catch(() => []);
  res.json(logs);
});

export default router;
