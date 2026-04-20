# Project knowledge

TestPilot AI — an autonomous QA agent orchestrator for MERN applications. Currently a scaffold with stubbed implementations following a Sense → Decide → Act → Learn pipeline.

## Quickstart
- Setup: `npm install` (requires Node ≥ 20)
- Dev: `npm run dev` (uses `node --watch`)
- Start: `npm start`
- Syntax check: `npm run check`
- No test runner or linter configured yet

## Architecture
- **`src/server.js`** — Express entry point, health endpoint, mounts orchestrator router
- **`src/routes/orchestrator.routes.js`** — `POST /orchestrator/run` triggers one QA cycle
- **`src/services/orchestrator.service.js`** — Orchestrates the Sense → Decide → Act → Learn loop
- **`src/agents/adapter.agent.js`** — Adapter agent: `sense()` (feature detection) and `learn()` (feedback persistence)
- **`src/agents/tester.agent.js`** — Tester agent: `decide()` (scenario generation) and `act()` (test execution)
- **`db/migrations/001_initial_schema.sql`** — PostgreSQL schema with `pgvector`; tables: `test_scenarios`, `world_model`, `execution_logs`

## Conventions
- ES Modules (`"type": "module"` in package.json); use `import`/`export`, not `require`
- Plain JavaScript (no TypeScript)
- Single dependency: `express ^4.19.2`
- Agent modules export a singleton object with async methods
- Agents are split by concern: adapter (external integrations) vs tester (scenario logic & execution)
- All implementations are stubs returning placeholder data; no DB or LLM wiring yet

## API
- `GET /health` — returns `{ status, service, timestamp }`
- `POST /orchestrator/run` — accepts `{ trigger }`, returns full cycle result

## Gotchas
- No database connection configured yet; migration SQL exists but isn't applied by the app
- No `.env` handling; port defaults to 3000 via `process.env.PORT || 3000`
- No tests, no linter, no formatter configured
