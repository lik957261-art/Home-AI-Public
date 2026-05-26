# Hermes Mobile Architecture

This document is the durable architecture map for the private Hermes Mobile product. It complements the enforced boundary contract in `docs/ARCHITECTURE_BOUNDARY.md`.

## Runtime Boundaries

- Hermes Mobile listener: Node app on `http://127.0.0.1:8797`, production app path `C:\ProgramData\HermesMobile\app`.
- Production data: `C:\ProgramData\HermesMobile\data`.
- Gateway Pool: official-clean Hermes runtime workers, with low-permission user workers and Owner maintenance workers.
- Bridge Host: local bridge process on `http://127.0.0.1:8798` for scoped product bridges such as ChatGPT Pro.
- Codex Mobile: separate local service used by ChatGPT Pro bridge for browser/ChatGPT page workflows.
- Static PWA client: `public/` files served by the listener and cached through `public/service-worker.js`.

## Product Identity

Hermes Mobile is not a single-user personal Agent session and not a fork of the
official Hermes runtime. It is the product layer for multiple workspaces,
multiple concurrent task surfaces, mobile delivery, and family/workspace
permissions. Official Hermes Gateway workers remain the execution kernel for
model/tool/Skill behavior; Hermes Mobile owns identity, access policy,
resource authorization, task grouping, Action Inbox, Web Push, and worker/profile
routing.

## Source And Deployment

- Active private checkout: the local Hermes Mobile source checkout, for example `C:\Path\To\HermesMobile`.
- Production app copy: `C:\ProgramData\HermesMobile\app`.
- Production data and secrets remain outside the source checkout.
- Default repository rule: local commits only, no GitHub push unless explicitly requested.

## Service-First Rule

Business logic belongs in focused services/providers under `adapters/` and route groups under `server-routes/`.

`server.js` is a thin process entrypoint. `mobile-server-runtime.js` remains a runtime composition root and should not accumulate new domain logic.

Run `node tests\architecture-refactor-boundary.test.js` for non-trivial server/runtime changes.

## Major Domains

- Multi-user/multi-task platform: workspace identities, Access Keys, resource
  authorization, Gateway worker/profile selection, task surfaces, and Inbox
  routing. See `docs/MODULES/multi-user-task-platform.md`.
- Chat context: single-window Chat, group chat, task groups, bounded conversation
  history, topic context compaction, working state, and evidence refs.
- Growth learning: learning programs, task cards, submissions, async evaluation, reflection, rewards, mastery profile, and next-card strategy.
- Gateway Pool: worker lifecycle, routing, health, maintenance watchdog, tool/plugin availability.
- ChatGPT Pro: Owner-maintenance routing, Gateway plugin, bridge-host endpoint, Codex Mobile thread reuse, temporary output directory.
- Skill permissions: product-level write guard for Skill analysis/fix routes and UI affordances.
- Action Inbox: local lightweight user-action queue for manual todos, Automation deliveries, Growth next actions, and review/follow-up items.
- Automation/Cron: background job engine, product API, summary/full loading, official cron dispatcher isolation, and Web Push/deep-link producers.
- Static client: PWA cache versioning, mobile UI, service worker, directory viewer.

## Privacy Boundary

Do not persist raw secrets, Access Keys, OAuth tokens, push endpoints, browser cookies, full learner answers, transcripts, full questions, answer keys, raw prompts, or long logs in docs, tests, handoffs, or UI projections.
