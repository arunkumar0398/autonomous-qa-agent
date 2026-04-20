# TestPilot AI Revamp — Spec for Startup-Friendly Autonomous QA

## Overview

Revamp TestPilot AI from a stubbed orchestrator scaffold into a **fully autonomous QA agent** purpose-built for small dev teams (2–5 developers) at startups who have **no dedicated QA person**. The tool should eliminate the need for a QA hire by automatically discovering what to test, generating and running E2E browser tests, self-healing broken tests, and surfacing bugs — all with minimal setup and zero ongoing maintenance.

**Distribution model:** Hybrid — open-source core engine (free, self-hosted) + optional hosted SaaS tier with dashboard, analytics, and premium features.

---

## Target Audience

- **Primary persona:** Small development team (2–5 devs) at a seed-to-Series-A startup with no dedicated QA engineer.
- These teams share QA responsibility informally but nobody owns it full-time.
- Budget is tight — they need tools that are free or very cheap to start and scale with growth.
- They move fast (daily deploys), so testing must be automated and non-blocking.

---

## Core Requirements

### 1. Framework-Agnostic Test Discovery (Multi-Layer)

The tool must support **three layered discovery strategies** that work with any web application regardless of framework or language:

- **Git diff analysis (PR/commit-based):** Detect code changes from pull requests or commits, infer which areas of the app are affected, and prioritize test generation for those areas.
- **Live app crawling:** Spider a running application to discover pages, forms, interactive elements, and user flows automatically. Build a "world model" of the app.
- **OpenAPI/Swagger + route file parsing:** Parse API specs and route declarations to generate API-level test coverage maps. (Secondary priority — E2E first.)

All three strategies should feed into a unified test coverage model.

### 2. E2E Browser Test Generation & Execution (Playwright)

- **Primary test type:** End-to-end browser tests using **Playwright** as the execution engine.
- AI generates Playwright test scripts from discovered flows, user stories, or code changes.
- Tests should be human-readable and well-structured (describe blocks, meaningful assertions).
- **Secondary (later):** API integration tests via HTTP assertions. Not in MVP scope.

### 3. Self-Healing Tests (Critical Differentiator)

- When a test fails due to a **selector change** (e.g., a button class or ID changed), the tool should automatically detect the cause and attempt to repair the selector.
- Use multiple selector strategies: data-testid, aria labels, text content, CSS selectors, XPath — ranked by resilience.
- If self-healing succeeds, update the test file and log the change.
- If self-healing fails, quarantine the test and alert the team.
- This is a **v1 must-have**, not a future feature.

### 4. Pluggable LLM Backend

- Support **multiple LLM providers** via a pluggable adapter interface:
  - OpenAI (GPT-4o, GPT-4o-mini)
  - Anthropic (Claude)
  - Local models via Ollama or similar
- Users provide their own API key in configuration.
- The LLM is used for: test scenario generation, selector healing suggestions, bug root-cause analysis, and natural-language test descriptions.
- Architecture should allow swapping providers without changing core logic.

### 5. Dual Data Layer (SQLite Local / PostgreSQL Hosted)

- **Local / self-hosted mode:** SQLite database for zero-config setup. No external dependencies.
- **Hosted SaaS mode:** PostgreSQL with pgvector for embeddings-based test deduplication and intelligent retrieval.
- Abstract the data layer behind a repository interface so the storage backend is swappable.
- Migrate the current `001_initial_schema.sql` concepts (test_scenarios, world_model, execution_logs) to work with both backends.

### 6. Test Artifact Management

- **User-configurable per project** via config (`persist: true/false`):
  - **Persisted mode:** Generated tests are written to a dedicated `__testpilot__/` directory in the repo. They can be reviewed, edited, and committed. Never written to the team's existing test directory — complete separation.
  - **Ephemeral mode:** Tests are generated, executed, and discarded. Results are stored in the database/dashboard but no test files clutter the repo.

### 7. Flaky Test Handling

- **Detection:** Track test pass/fail history. Flag tests as flaky when they show inconsistent results across runs.
- **Response:** Flag and report flaky tests to the team. Do **not** auto-fix or auto-quarantine — let the developer decide.
- Surface flaky test data in the dashboard and notifications with context (failure frequency, last N results, possible causes).

---

## User Experience

### Onboarding Flow

- **Primary onboarding:** Web dashboard with **GitHub OAuth** connection.
  1. User signs in via GitHub.
  2. Selects a repository to connect.
  3. Tool scans the repo: detects framework, routes, existing tests, CI setup.
  4. Runs initial discovery (git history + crawl if a live URL is provided).
  5. Generates first batch of tests and presents results in the dashboard.
- **First "wow moment":** Within 5 minutes, the user should see:
  - A **failing test that catches a real bug** (or a meaningful edge case).
  - A **visual dashboard showing test coverage gaps** — what's tested, what's risky, what's untouched.

### Notifications (Configurable Per Team)

Support all channels, user picks which ones:
- **GitHub PR comments / check annotations** — inline feedback on PRs where issues are found.
- **Slack / Discord integration** — push alerts to team chat.
- **Dashboard alerts + email digest** — centralized view with optional scheduled summaries.

### Authentication Handling for Tested Apps

Support all approaches, configurable per project:
- **Test credentials in config** — email/password in `.testpilot.yml` or env vars.
- **Recorded login flow replay** — capture an auth sequence once, auto-replay before tests.
- **Session/token injection** — skip UI login, inject cookies or auth tokens directly.

---

## Architecture (Complete Redesign)

The current Sense → Decide → Act → Learn pipeline will be **replaced** with a new architecture purpose-built for these requirements.

### Proposed High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web Dashboard (React)                 │
│         GitHub OAuth · Coverage Viz · Reports            │
├─────────────────────────────────────────────────────────┤
│                    API Gateway (Express)                 │
│       REST + WebSocket for real-time test updates        │
├──────────┬──────────┬───────────┬───────────────────────┤
│ Discovery│ Generator│ Executor  │ Healer                │
│ Engine   │ Engine   │ Engine    │ Engine                │
│          │          │           │                       │
│ • Git    │ • LLM    │ • Play-   │ • Selector            │
│   diff   │   prompt │   wright  │   repair              │
│ • Crawler│   chain  │   runner  │ • Multi-strategy      │
│ • API    │ • Test   │ • Result  │   fallback            │
│   spec   │   builder│   capture │ • Quarantine          │
│   parser │          │           │   manager             │
├──────────┴──────────┴───────────┴───────────────────────┤
│              Core Services Layer                         │
│  • LLM Adapter (pluggable)  • Notification Router       │
│  • Data Repository (SQLite/PG)  • Auth Manager          │
│  • Coverage Tracker  • Flaky Test Detector               │
├─────────────────────────────────────────────────────────┤
│              Storage Layer                               │
│  Local: SQLite + filesystem                              │
│  Hosted: PostgreSQL + pgvector + S3 (screenshots)        │
└─────────────────────────────────────────────────────────┘
```

### Key Modules

| Module | Responsibility |
|---|---|
| **Discovery Engine** | Analyzes git diffs, crawls live apps, parses API specs. Outputs a list of testable features/flows with priority scores. |
| **Generator Engine** | Takes discovered features, queries the LLM to produce Playwright test scripts. Deduplicates against existing tests. |
| **Executor Engine** | Runs Playwright tests in headless browsers. Captures screenshots, HAR files, console logs. Reports results. |
| **Healer Engine** | When a test fails due to selector issues, attempts multi-strategy repair (data-testid → aria → text → CSS → XPath). Updates test files if successful. |
| **LLM Adapter** | Pluggable interface for OpenAI, Anthropic, Ollama. Handles prompt construction, token management, rate limiting. |
| **Data Repository** | Abstract interface over SQLite (local) and PostgreSQL (hosted). Manages test scenarios, world model, execution logs, coverage data. |
| **Coverage Tracker** | Maps discovered app surface area against executed tests. Identifies coverage gaps and risk zones. |
| **Notification Router** | Dispatches alerts via GitHub API, Slack webhooks, Discord webhooks, email, or dashboard push. Configurable per team. |
| **Auth Manager** | Handles test-app authentication: credential injection, flow replay, or token/cookie injection depending on project config. |
| **Flaky Test Detector** | Tracks pass/fail history per test. Flags inconsistent tests. Surfaces data without auto-remediating. |

---

## Pricing Model

- **Open-source core (free forever):**
  - Discovery engine, test generation, Playwright execution, self-healing, CLI tooling.
  - Self-hosted with SQLite. User provides their own LLM API key.
- **Hosted tier (paid):**
  - Web dashboard with GitHub OAuth.
  - Coverage visualization and analytics.
  - Notification integrations (Slack, Discord, email).
  - Managed PostgreSQL + pgvector backend.
  - Team management and collaboration features.
  - Screenshot/artifact storage.
- **Pricing philosophy:** Open-source core is free; charge for the dashboard, analytics, and managed infrastructure.

---

## Timeline & Milestones (3+ Months)

### Phase 1 — Foundation (Weeks 1–4)
- Complete architecture redesign: new module structure, data layer abstraction.
- Pluggable LLM adapter with OpenAI support.
- SQLite-based local storage.
- Basic git diff discovery engine.
- Playwright test generation from discovered changes.
- Test execution and result capture.

### Phase 2 — Self-Healing & Crawling (Weeks 5–8)
- Self-healing engine with multi-strategy selector repair.
- Live app crawler for automatic flow discovery.
- World model persistence and diffing.
- Auth manager (credentials + token injection).
- Flaky test detection and reporting.

### Phase 3 — Dashboard & Integrations (Weeks 9–12)
- Web dashboard (React) with GitHub OAuth.
- Coverage visualization and gap analysis.
- GitHub PR integration (comments, check annotations).
- Slack / Discord / email notification routing.
- PostgreSQL backend for hosted mode.

### Phase 4 — Polish & Launch (Weeks 13+)
- OpenAPI/Swagger spec parsing.
- Anthropic + Ollama LLM adapters.
- Recorded login flow replay.
- Test artifact persistence configuration (commit vs ephemeral).
- Documentation, onboarding guides, marketing site.
- API integration tests (secondary test type).

---

## Relevant Existing Files

| File | Status |
|---|---|
| `src/server.js` | **Replace** — new Express API gateway with WebSocket support |
| `src/services/orchestrator.service.js` | **Replace** — new pipeline with Discovery → Generate → Execute → Heal |
| `src/agents/adapter.agent.js` | **Replace** — split into Discovery Engine + Auth Manager |
| `src/agents/tester.agent.js` | **Replace** — split into Generator Engine + Executor Engine |
| `src/routes/orchestrator.routes.js` | **Replace** — new route structure for dashboard API |
| `db/migrations/001_initial_schema.sql` | **Adapt** — keep schema concepts, add SQLite variant + migration tooling |
| `package.json` | **Update** — add Playwright, SQLite driver, LLM SDKs, dashboard dependencies |

---

## Notes & Constraints

- **No vendor lock-in:** The pluggable LLM and dual-DB approach are intentional to keep costs low for startups.
- **Tests must never touch the team's existing test directory.** All AI-generated tests go in `__testpilot__/` to avoid conflicts.
- **Self-healing is table-stakes for v1.** Without it, startups will not adopt — they don't have time to maintain tests.
- **The open-source core must be genuinely useful standalone.** The paid tier adds convenience and visibility, not core functionality.
- **Framework-agnostic from day one.** No MERN-specific assumptions in the core engine. Framework detection is used only to improve test quality, not as a hard requirement.
- **Privacy-conscious:** In self-hosted mode, no data leaves the user's machine. LLM calls go to the user's chosen provider with their own key.
