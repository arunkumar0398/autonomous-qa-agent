# Project Chimera — Autonomous QA Agent (TypeScript)

The stack has been migrated to **TypeScript-first development** for type safety and industry-standard maintainability.

## What changed

- All source modules moved from `.js` to `.ts`.
- Domain contracts centralized in `src/types/domain.ts`.
- Type-checked build pipeline via `tsconfig.json` and `tsc --noEmit` checks.
- Express orchestrator, detectors, agents, services, and tests rewritten in TypeScript.

## API

- `GET /health`
- `POST /chimera/run`
- `POST /chimera/run/sample`

## Development

```bash
npm install
npm run check
npm run build
npm run start
```

## Project structure

- `src/server.ts`
- `src/routes/orchestrator.routes.ts`
- `src/services/orchestrator.service.ts`
- `src/agents/*.ts`
- `src/lib/*.ts`
- `src/types/domain.ts`
- `test/*.test.ts`

## Notes

- `db/migrations/001_initial_schema.sql` remains the PostgreSQL + pgvector foundation.
