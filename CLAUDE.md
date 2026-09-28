# CLAUDE.md — Full-Stack Platformer Project

This file defines the multi-agent orchestration setup for this project. It follows the same pattern as the `educational-alphabet-game` workflow, extended with backend, database, and DevOps roles.

## Project overview

A browser-based 2D platformer game, built as a learning vehicle for full-stack development (frontend + Node.js backend + PostgreSQL + Docker).

**Stack:**
- Frontend: Next.js, TypeScript, Zustand
- Backend: Node.js, Express (or Fastify)
- Database: PostgreSQL
- Infra: Docker, Docker Compose
- Shared types: `packages/types` (mirrors the `@casino/` monorepo pattern from work)

## Repo layout

```
apps/
  game/           # Next.js frontend
  api/            # Node.js backend
packages/
  types/          # shared TS types/contracts between game and api
infra/
  docker-compose.yml
  Dockerfile.game
  Dockerfile.api
```

## Orchestration rules

1. The **orchestrator** (this file, read by the top-level agent) breaks any incoming task into subtasks and routes each to the owning subagent below. It does not write feature code itself.
2. Each subagent owns specific paths. An agent must not edit files outside its ownership without explicit handoff (see "Handoff protocol").
3. `qa-test-expert` is a gate: no subagent's work is considered done until qa-test-expert has reviewed or added tests for it.
4. When an API contract changes, `backend-architect` updates `packages/types` first, then hands off to `nextjs-frontend-engineer` — never the other way around.

## Subagents

### `backend-architect`
- **Owns:** `apps/api/src/routes/`, `apps/api/src/controllers/`, API contract design, auth strategy
- **Responsibilities:** design REST endpoints, request/response shapes, JWT auth flow (reuse the httpOnly-cookie + silent-refresh pattern from the existing Next.js auth SKILL.md), error handling conventions
- **Triggers on:** any new feature requiring a new endpoint, or a change to an existing one
- **Hands off to:** `database-engineer` (schema needs), `nextjs-frontend-engineer` (contract ready)

### `database-engineer`
- **Owns:** `apps/api/src/db/`, migrations, `infra/docker-compose.yml` (db service + volume only)
- **Responsibilities:** schema design, migrations, indexes, seed data, connection pooling config
- **Triggers on:** any schema change requested by `backend-architect`
- **Hands off to:** `backend-architect` (schema ready, with generated types/queries)

### `nextjs-frontend-engineer`
- **Owns:** `apps/game/` (except `apps/game/src/game/input/`, owned by `gamepad-input-engineer`)
- **Responsibilities:** game UI, state management (Zustand), calling the API via a typed client, rendering game canvas/logic
- **Triggers on:** new UI feature, or a ready API contract from `backend-architect`
- **Hands off to:** `qa-test-expert`

### `2d-game-designer`
- **Owns:** level design docs, game mechanics decisions, asset specs (reused from `educational-alphabet-game`)
- **Responsibilities:** platformer mechanics, level structure, difficulty curve
- **Triggers on:** new level or mechanic requests
- **Hands off to:** `nextjs-frontend-engineer` (implementation)

### `gamepad-input-engineer`
- **Owns:** `apps/game/src/game/input/`
- **Responsibilities:** Web Gamepad API integration (per-frame polling, connect/disconnect handling), logical action map decoupled from physical buttons, controller mapping profiles (Xbox/PlayStation/generic with standard-mapping fallback), radial dead zones and response curves, keyboard fallback, input rebinding, and input-feel techniques (coyote time, input buffering, variable jump height)
- **Triggers on:** any input/control work, or reports that controls feel laggy, unresponsive, or wrong on a specific controller
- **Hands off to:** `nextjs-frontend-engineer` (integration into scenes and UI), `qa-test-expert` (verification)

### `devops-engineer`
- **Owns:** `infra/` (except db volume config, shared with `database-engineer`), CI config
- **Responsibilities:** `docker-compose.yml`, per-service `Dockerfile`s, environment variable management, local dev scripts
- **Triggers on:** new service added, deployment/env changes
- **Hands off to:** whichever agent owns the service being containerized, for verification

### `qa-test-expert`
- **Owns:** `apps/*/tests/`, `apps/*/e2e/`
- **Responsibilities:** unit tests, API integration tests (e.g. supertest), e2e tests (Playwright)
- **Triggers on:** any subagent marking work as feature-complete
- **Gate rule:** work is not "done" until this agent has run or written tests for it

### `belarusian-language-expert`
- **Owns:** localization strings, `apps/game/locales/`
- **Responsibilities:** Belarusian UI text, tone/register consistency
- **Triggers on:** any new user-facing string

## Handoff protocol

When Agent A hands off to Agent B, it must state explicitly:
1. What was completed (file paths touched)
2. What contract/interface Agent B should consume (e.g. "new endpoint `POST /api/scores`, see `packages/types/scores.ts`")
3. Any open questions Agent B needs to resolve

## Notes

- Keep each agent's context scoped — don't let `nextjs-frontend-engineer` modify `apps/api/src/db/schema.sql`.
- Use a pre-commit hook (via Husky, already used at work) to run type-checking and lint before any agent commits, simulating a real CI gate.
- Start minimal: one endpoint (`POST /api/scores`, `GET /api/leaderboard`) before adding auth or a level editor.
