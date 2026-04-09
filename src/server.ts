import express from 'express';
import { orchestratorRouter } from './routes/orchestrator.routes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
  res.status(200).json({
    status: 'ok',
    service: 'project-chimera-orchestrator',
    timestamp: new Date().toISOString()
  });
});

app.use('/chimera', orchestratorRouter);

app.listen(port, () => {
  console.log(`Project Chimera orchestrator running on port ${port}`);
});
