# TestPilot AI — Autonomous QA Agent

Initial scaffold for the **Autonomous QA Agent Blueprint (v1.0, April 09, 2026)**.

## What is included in this first commit

- Node.js + Express orchestrator skeleton.
- Adapter and Tester agent module boundaries.
- Sense → Decide → Act → Learn orchestration pipeline (stubbed implementations).
- PostgreSQL schema with `pgvector` support and indexes.
- Basic health and pipeline endpoints.

## Quick start

```bash
npm install
npm run dev
```

## API

- `GET /health` — health check
- `POST /orchestrator/run` — run one autonomous QA cycle

Example:

```bash
curl -X POST http://localhost:3000/orchestrator/run \
  -H 'content-type: application/json' \
  -d '{
    "trigger": {"source": "merge", "reference": "main"}
  }'
```

## Next implementation slices

1. Wire Feature Detector to Git provider + Jira/OpenAPI adapters.
2. Implement real world model crawling + extraction.
3. Connect LLM-backed test generation and pgvector retrieval.
4. Integrate Playwright execution engine and self-healing locator strategy.
5. Add bug-fix replay flow and CI webhooks.
