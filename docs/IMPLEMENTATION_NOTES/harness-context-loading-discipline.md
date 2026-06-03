# Harness And Context Loading Discipline

This document defines the Hermes Mobile context-loading rule for Codex threads.
It exists because stable harness, skill, handoff, and workspace-context text can
become a large repeated cached-input load. The goal is not to weaken harnesses;
the goal is to load the right evidence at the right layer.

## Name

HANES: Harness And Normalized Evidence Scope.

Use HANES when deciding how much context, skill text, documentation, and harness
evidence a Hermes Mobile thread should load before acting.

## Problem

Long Hermes Mobile threads can repeatedly carry:

- system and developer rules
- `AGENTS.md`
- `.agent-context/PROJECT_CONTEXT.md`
- `.agent-context/HANDOFF.md`
- source-thread handoff excerpts
- skill bodies
- docs preflight sections
- harness matrix rules
- prior tool results

This often appears as high cached input with modest uncached input and modest
output. Cached input still consumes context window and may still count against
quota. The repeated cost becomes large when several discipline layers are
loaded for every small task.

## Principle

Permanent rules should be short. Detailed rules should be file-addressable and
loaded only when the current task crosses the matching risk boundary.

Do not treat "read all durable context" as the same thing as "load all durable
context into the current turn." Prefer bounded slices, search hits, and exact
sections.

## Loading Tiers

### Tier 0: Always Resident

Keep this as short as possible:

- workspace identity
- privacy constraints
- no push unless asked
- no NAS deploy unless asked
- read compact project context and current handoff before substantive work
- load detailed docs/skills only by trigger

### Tier 1: Startup Snapshot

At the beginning of a substantive Hermes Mobile thread:

- read the first 80-120 lines of `.agent-context/PROJECT_CONTEXT.md`
- read the tail of `.agent-context/HANDOFF.md`
- run `git status -sb --untracked-files=all` when code changes are likely
- use `docs/DOCS_INDEX.md` as the map, not as permission to read every doc

Do not open archived handoffs, old rollout summaries, or full project context
unless the user asks about history, rollback, provenance, or an old regression.

### Tier 2: Task-Specific Context

Load only the smallest matching module or implementation doc:

- UI or PWA change: relevant `public/` files, focused UI tests, and the matching
  module doc
- service/route change: CodeGraph context, relevant service/route files, and
  architecture boundary docs
- deployment: deployment docs and current production status
- plugin iframe behavior: plugin module doc and embedded-plugin contract
- file preview: directory/files module doc and preview harness

The selected docs should be read by heading or bounded slices where possible.

### Tier 3: Skill Body

A skill body is not always-resident context. Read a skill only when its trigger
is actually met.

When several skills appear relevant, load the minimum set. If a task is a
small static hotfix, do not automatically expand into every discipline layer.

Examples:

- PDF preview render bug: file preview module plus focused harness is enough.
  UI discipline may be summarized if layout is unchanged.
- Server auth or route ACL: service-first and CodeGraph discipline are required.
- Production outage: hotfix discipline is required, but broad productization
  gates are not required before the immediate function is restored.

### Tier 4: Harness Matrix

The full harness matrix is a reference, not a default preflight blob.

Use it when:

- changing H1/H2 flows
- adding or changing a harness requirement
- deciding whether a risky flow lacks coverage
- user explicitly asks for harness policy

For normal focused fixes, prefer the module doc's validation section and the
nearest existing test.

## Stop Rules

Stop loading more context when:

- the likely failing file/function is already identified
- the current task is static-only and the matching module doc/test is loaded
- the next context source would be historical or cross-module and the bug is
  local
- the user has corrected scope to a narrower target

If additional context would materially change the fix, state the missing fact
and load only that source.

## Handoff Rules

`.agent-context/HANDOFF.md` should record current rollout state, not become a
full release archive.

For each completed item, record:

- user-facing issue
- root cause summary
- changed files
- validation commands
- deployment status
- next known risk

Avoid:

- long logs
- repeated historical timelines
- full command output
- duplicating entire docs
- storing secrets, private content, or raw prompts

When a handoff grows too large, move old entries to an archive file and leave a
short index pointer.

## Thread Instruction For Future Agents

Future Hermes Mobile threads should follow this sequence:

1. Load Tier 1 only.
2. Identify the task class.
3. Load the smallest Tier 2 source.
4. Load Tier 3/4 only when the risk boundary requires it.
5. Before final, update only the current handoff facts.

If a thread starts from a large continuation prompt, do not re-open the same
large content unless exact prior state is needed.

## Done Criteria

A Hermes Mobile fix is complete when:

- the narrow user issue is fixed or blocked with evidence
- focused validation for the touched layer passed
- deployment status is explicit
- docs/handoff are updated only to the smallest durable scope
- no unnecessary skill or historical context was loaded after the root cause was
  identified
