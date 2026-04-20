import express from 'express';
import { getConfig } from './config/index.js';
import { getDb } from './core/db/index.js';
import { getLlm } from './core/llm/index.js';
import pipelineRouter from './routes/pipeline.routes.js';
import scenariosRouter from './routes/scenarios.routes.js';

const config = getConfig();
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'testpilot-ai',
    timestamp: new Date().toISOString(),
  });
});

app.use('/pipeline', pipelineRouter);
app.use('/scenarios', scenariosRouter);

async function start() {
  // Initialize database (runs migrations)
  const db = getDb();
  await db.initialize();

  // Initialize LLM adapter (validates config / API key)
  let llm;
  try {
    llm = getLlm();
  } catch (err) {
    console.warn(`[server] LLM not configured: ${err.message}`);
    console.warn('[server] Pipeline /run endpoint will fail until LLM is configured.');
    llm = null;
  }

  // Expose singletons to route handlers via app.locals
  app.locals.db = db;
  app.locals.llm = llm;
  app.locals.config = config;

  const port = config.port ?? 3000;
  const server = app.listen(port, () => {
    console.log(`TestPilot AI running on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received — shutting down`);
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[server] Startup failed:', err.message);
  process.exit(1);
});
