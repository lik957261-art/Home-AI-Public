# Runtime Architecture Optimization Priorities

Last updated: 2026-06-08.

## Purpose

This note fixes the priority model for the next architecture optimization
goal. The next goal should not continue splitting every large file or every
stable module. It should focus on runtime areas that are frequently changed,
hard for a model or operator to reason about, and expensive to diagnose in
production.

The goal is not line-count reduction by itself. The goal is smaller change
context, explicit ownership, stable failure classification, and harness-backed
production closure.

## Priority Heuristics

Use these criteria when selecting the next architecture optimization target:

- recent edit frequency;
- production blast radius when the path fails;
- frequency of user-reported regressions;
- model/tool ambiguity created by the code path;
- operational complexity across Windows, Mac, Gateway, profiles, Skills, MCP,
  Access Keys, launchd, or scheduled tasks;
- whether the current harness can locate the failure without manual reasoning.

A physically large file is not automatically high priority. A smaller file can
be high priority if it owns a high-frequency runtime or production boundary.

## High-Priority Areas

### Gateway Run Lifecycle

This is the highest-value runtime target.

The main `gateway-run-start-service.js`, `gateway-run-stream-service.js`, and
`gateway-run-event-service.js` files are already much smaller after the 2026-06-08
service-first split. The next work should not keep extracting tiny helpers just
to reduce line count. Instead, it should make the lifecycle contract explicit:

- run preparation;
- target/profile selection;
- required Skill gates;
- model-first permission/toolset preflight;
- plugin capability probe;
- stream handoff;
- streaming evidence collection;
- terminal state projection;
- retry and escalation;
- terminal notification and queued follow-up.

Acceptance should be event and harness based. Each phase should have stable
events, bounded error reasons, and tests that prove fail-closed behavior.

### Gateway, MCP, Skill, And Schema Upgrade Closure

This area remains high priority because repeated incidents have come from
runtime/schema drift:

- MCP tools exist in a plugin service but are missing from the selected Gateway
  profile;
- a tool exists but its parameters differ from the plugin contract;
- a required Skill is present on disk but not loaded or not readable by the
  right production principal;
- model toolset selection omits authorized companion tools;
- Access Key or auth-header probes use the wrong transport contract.

Future work should strengthen `scripts/mcp-tool-upgrade-closure-smoke.js` and
selected-profile schema smokes. The harness must prove the actual callable tool
schema seen by the selected Gateway profile, not only plugin service metadata.

### Runtime Config And Worker Policy

Runtime config is relatively small but operationally important.

The next goal should treat warm-worker floors, worker maximums, cooldown/idle
TTL, model defaults, reasoning defaults, Gateway startup timeouts, and UI
projection as one deployable contract:

- environment defaults;
- persisted runtime override;
- public/Owner-visible projection;
- settings UI values;
- launcher environment actually used by Windows and Mac production;
- post-save restart/reload expectations.

Acceptance must prove that values shown in the UI are prefilled from effective
runtime config and that the next Gateway/profile initialization receives the
same values.

### Plugin Topic And Capability Entry Glue

This remains high priority because it is user-visible and frequently changed.
The capability hub, plugin button menu, quick capability usage ordering,
workspace-scoped persistence, plugin topic routing, directory-bound topic
projection, and plugin return paths should be treated as one product surface.

Future work should split behavior by ownership instead of adding more closure
logic to broad frontend modules:

- quick capability usage persistence and sorting;
- plugin menu open/close and gesture dismissal;
- plugin topic open/return routing;
- directory-bound topic projection;
- workspace-scoped local/server caches;
- plugin authorization and unavailable-plugin user feedback.

Acceptance should include DOM/projection tests plus mobile visual harness
evidence for bottom navigation, dock/menu bounds, and workspace isolation.

### Production Profile, Access, And Deployment Closure

Mac and Windows deployment/profile checks are a runtime architecture concern,
not only operations documentation.

Future work should keep improving bounded, reusable production probes for:

- Mac launchd label state;
- worker/profile/Skill/Memory ownership;
- plugin authorization and required Skill readability;
- Access Key rotation and plugin rebinding;
- worker filesystem ACLs;
- Windows native runtime ownership after WSL downline;
- deployment proof that source, production app, and served runtime are the same
  commit/version.

`scripts/macos-production-profile-audit.js`,
`scripts/macos-production-closure-validation.js`, and the Windows native
deployment checks should continue to move toward named probe modules with
stable issue codes.

## Lower-Priority Or Deferred Areas

### Web Push Delivery

Web Push delivery should be considered stable after the 2026-06-08 splits:

- delivery normalization;
- send execution;
- VAPID lifecycle;
- Automation projection.

Although `adapters/web-push-delivery-service.js` is still not tiny, it is no
longer the best next target. Do not continue splitting it unless a new Web Push
product bug or delivery incident appears.

### Growth And Learning Large Files

Growth and Learning files remain large, but they should not be prioritized
unless the product cycle returns to Growth work. Keep existing harness coverage
and avoid broad refactors while the current high-frequency issues are in
Gateway, MCP, runtime config, production closure, and plugin topics.

### Kanban And Study Providers

Kanban and study providers should remain deferred unless Todo, Automation, or
study-card workflows become active again. Do not refactor them solely because
of size.

### CSS And Broad Static Styling

`public/styles.css` is large, but CSS decomposition belongs to a visual-system
or UI stability goal. Do not mix broad styling decomposition into the runtime
architecture goal unless a specific UI bug requires it.

## Acceptance Pattern For The Future Goal

When the user creates the next architecture goal, use this acceptance model:

1. Rank candidate work by runtime frequency, production blast radius, and
   harness gap, not line count.
2. For each selected runtime boundary, identify the owning service/provider,
   route module, UI module, and harness entry before editing.
3. Add or strengthen focused tests before declaring a split complete.
4. Add or strengthen workflow harnesses for H1 paths, especially Gateway run,
   MCP/schema upgrade, Skill preload, runtime config save/apply, and production
   deployment closure.
5. Keep stable low-frequency modules out of scope unless they are needed by the
   selected high-priority path.
6. Validate Windows and Mac production parity when runtime, deployment, profile,
   Gateway, or MCP behavior changes.
7. Update `docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md`,
   `docs/TEST_MATRIX.md`, and the relevant module/runbook docs in the same
   change.

## Suggested Future Goal Card

Suggested title:

```text
High-Frequency Runtime Architecture And Production Closure
```

Suggested objective:

```text
Optimize Home AI architecture only where it reduces repeated runtime and
production failures: Gateway run lifecycle, MCP/Skill/schema upgrade closure,
runtime config and worker policy, plugin topic/capability entry glue, and
Mac/Windows profile/deployment validation. Stable low-frequency modules such as
Web Push delivery are kept out of scope unless a new incident makes them
relevant.
```

Suggested acceptance criteria:

- Gateway run lifecycle phases have explicit events, bounded error reasons, and
  focused tests.
- MCP/Skill/schema upgrade closure proves selected Gateway profile callable
  tools and parameter schemas.
- Runtime config worker-policy values are prefilled, persisted, projected, and
  applied to the next production worker/profile initialization.
- Plugin topic/capability entry behavior is workspace-scoped and covered by
  UI/projection plus mobile visual harness evidence.
- Mac/Windows production deployment checks prove source commit, production app
  files, served version, auth-header contract, and listener state.
- Architecture progress is measured by reduced change context, ownership
  clarity, and harness coverage, not by physical line count alone.

When this future goal is started, read this document first, then
`docs/IMPLEMENTATION_NOTES/service-first-refactor-backlog.md`,
`docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`, and
`docs/TEST_MATRIX.md`.
