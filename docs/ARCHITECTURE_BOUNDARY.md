# Hermes Mobile Architecture Boundary

This document is a repository contract for new Hermes Mobile work.

Reusable Codex skill: `$service-first-architecture`.

## Service-First Rule

New product behavior must be implemented as a service or provider before it is wired into `server.js`.

Default locations:

```text
adapters/<domain>-service.js
tests/<domain>-service.test.js
```

`server.js` is the thin process entrypoint. It should do little more than load
the runtime composition module and preserve the deployment command surface.

`mobile-server-runtime.js` is the transitional runtime composition root while
the remaining wiring is split into smaller service and route composition
modules. It may:

- register routes and route modules;
- read authenticated request context;
- validate request shape at the boundary;
- call services/providers;
- stream or return HTTP responses;
- keep short compatibility wrappers while a larger extraction is in progress.

`server.js` and `mobile-server-runtime.js` must not own new business behavior such as:

- workflow state machines;
- natural-language interpretation;
- Kanban/story/study/assessment planning;
- Weixin ingress/outbound queue policy;
- file, Markdown, PDF, DOCX, audio, or image transformation;
- Gateway run lifecycle policy;
- runtime state migration or persistence policy;
- permission, sharing, or cross-workspace authorization policy.

## Service Contract

A service should accept plain input objects and return plain result objects. Side effects such as filesystem writes, SQLite operations, Gateway calls, Weixin delivery, Web Push, and child processes should be passed in through explicit dependencies when practical.

Required baseline for new business services:

- an exported `create<Domain>Service(...)` factory or named pure helpers;
- focused tests in `tests/<domain>-service.test.js`;
- route tests only for HTTP boundary behavior;
- no raw secrets, tokens, push endpoints, child study contents, exam answers, or full user messages in fixtures or logs.

## Server Budget

`server.js` must stay thin, and `mobile-server-runtime.js` must trend downward
during refactors and must not absorb new feature logic.

Current CI guardrails:

- `server.js` must stay at or below 3,000 lines;
- top-level `function` declarations in `server.js` must stay at or below 5;
- `mobile-server-runtime.js` must stay at or below 2,500 lines while it is being split further;
- top-level `function` declarations in `mobile-server-runtime.js` must stay at or below 430;
- if a feature would exceed either budget, extract route modules and services first.

These budgets are intentionally temporary ceilings. Lower them after each successful extraction round.

## Route Modules

New route groups should live in `server-routes/<domain>-api-routes.js` when they involve more than a trivial endpoint. Route modules should receive dependencies from the runtime composition layer and delegate business decisions to adapters/services.

## Review Checklist

Before committing a new feature or non-trivial bug fix:

- identify the owning service/provider;
- add or update the service test;
- keep `server.js` as a thin entrypoint and runtime composition as glue only;
- run `node tests/architecture-refactor-boundary.test.js`;
- run the focused service/route tests touched by the change;
- run `npm.cmd run productization:check` before production or push.
