import express from 'express';
import { orchestratorRouter } from './routes/orchestrator.routes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'testpilot-ai-orchestrator',
    timestamp: new Date().toISOString()
  });
});

app.use('/orchestrator', orchestratorRouter);

app.listen(port, () => {
  console.log(`TestPilot AI orchestrator running on port ${port}`);
});
