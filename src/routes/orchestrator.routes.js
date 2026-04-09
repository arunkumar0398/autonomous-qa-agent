import { Router } from 'express';
import { runAutonomousCycle } from '../services/orchestrator.service.js';

export const orchestratorRouter = Router();

orchestratorRouter.post('/run', async (req, res) => {
  const payload = req.body ?? {};

  try {
    const cycleResult = await runAutonomousCycle(payload);
    res.status(200).json(cycleResult);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Autonomous cycle failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
