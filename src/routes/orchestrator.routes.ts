import { Router } from 'express';
import { normalizeMvpRunPayload, validateMvpRunPayload } from '../lib/payload-validator.js';
import { runChimeraMvp } from '../services/orchestrator.service.js';

export const orchestratorRouter = Router();

orchestratorRouter.post('/run', async (req: { body?: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
  const payload = req.body ?? {};
  const validation = validateMvpRunPayload(payload);

  if (!validation.valid) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid payload',
      errors: validation.errors
    });
  }

  try {
    const result = await runChimeraMvp(normalizeMvpRunPayload(payload as Record<string, unknown>));
    return res.status(200).json(result);
  } catch (error) {
    console.error('Chimera run failed', { route: '/chimera/run', error });
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

orchestratorRouter.post('/run/sample', async (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
  try {
    const result = await runChimeraMvp({
      repoSnapshot: {
        files: ['src/components/CheckoutButton.jsx', 'src/views/CartView.vue', 'angular.json'],
        dependencies: ['react', 'vue', '@angular/core']
      },
      changeMeta: {
        title: 'fix: cart action race condition',
        branch: 'hotfix/cart-race',
        labels: ['bugfix']
      }
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Chimera sample run failed', { route: '/chimera/run/sample', error });
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});
