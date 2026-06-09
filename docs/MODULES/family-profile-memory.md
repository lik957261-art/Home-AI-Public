# Module: Family Profile Memory

## Responsibility

Family Profile Memory is the transitional memory layer between isolated
workspace-local Hermes Memory and the future Reference / Memory Graph.

It builds practical, permission-aware profiles for individual family members
and for the household as a whole. Its purpose is to make Home AI understand the
family system across workspaces without immediately implementing full
cross-plugin event graph semantics.

This module does not replace plugin databases, workspace chat history, Growth
records, Health records, Finance ledgers, Note content, or future Reference /
Memory Graph object references.

## Product Position

Reference / Memory Graph remains the long-term architecture for object refs,
backlinks, event grouping, provenance, and graph recall. Family Profile Memory
is the practical V1 that should ship first when the product goal is household
understanding:

- each workspace keeps its own personal profile;
- Owner has a household management view because the deployment runs on Owner's
  personal computer and Owner already has system-level data access;
- ordinary members receive only self or shared household projections;
- profile entries preserve source workspace, domain, sensitivity, and evidence
  pointers so future graph extraction is mechanical.

## Core Concepts

### Personal Profile

A profile for one workspace member.

Examples:

- stable preferences;
- health or learning concerns at summary level;
- recurring plugin usage;
- communication style;
- recurring finance, wardrobe, directory, note, or Growth themes;
- explicit user-stated facts that should survive chat compaction.

Personal profile records are source-of-truth summaries only when the source is
profile-native. When the fact comes from a plugin, the owning plugin remains
canonical.

### Household Profile

A household-level profile managed by Owner.

Examples:

- family member map and relationships;
- household goals;
- care responsibilities;
- shared routines;
- aggregate risk/opportunity summaries;
- cross-member patterns that are useful to Owner but not necessarily visible to
  every member.

### Profile Insight

A generated, auditable conclusion derived from one or more profile/evidence
inputs.

Examples:

- one member's Health follow-up reminders correlate with missed Growth tasks;
- household Finance summaries show a recurring category change;
- two workspaces have separate "Health" directory topics and should remain
  distinct in the UI, but may be compared in Owner-only household summaries;
- one member benefits more from Note/Health while another uses Finance/Growth.

Insights must be bounded and explainable. They should include evidence
summaries, confidence, source workspaces, affected domains, and a sharing
classification.

### Evidence Reference

A bounded pointer to where a profile claim came from.

Evidence references may include:

- `source_workspace_id`;
- `source_domain` such as `note`, `health`, `finance`, `growth`, `wardrobe`,
  `directory`, `chat`, or `owner_manual`;
- source ids or stable plugin refs when available;
- bounded display summary;
- evidence timestamp;
- confidence and freshness.

Evidence references must not store raw secrets, full emails, full health
reports, full ledgers, full note bodies, full learner answers, raw prompts, or
private plugin payload dumps.

## Owner And Permission Reality

Owner is the administrator of the personal computer hosting Home AI. The product
must not pretend that runtime permissions can prevent Owner from reading data
that Owner can access through the operating system, backups, or production
database files.

Therefore:

- Owner is the default household-profile administrator.
- Owner can see complete household profile projections in Owner routes/runs.
- Runtime permissions still matter for non-Owner actors and Gateway runs.
- Product projections must never leak Owner-visible household data into an
  ordinary member's UI, chat context, plugin run, group chat, Web Push payload,
  or low-permission Gateway profile.

The security goal is not to defend against Owner. The security goal is to avoid
accidental cross-workspace leakage, wrong-profile Gateway routing, and
unintended sharing to ordinary members.

## Visibility Model

Every profile record and insight should carry a visibility classification:

```text
owner_only
member_self
household_summary
shared_with_members
```

Definitions:

- `owner_only`: visible to Owner only. This is the default for cross-workspace
  generated insights.
- `member_self`: visible to the source workspace member and Owner.
- `household_summary`: visible as a bounded family-level summary, without
  source-private detail.
- `shared_with_members`: explicitly shareable to selected members or family
  surfaces.

Every record must also carry `source_workspace_id`. Cross-workspace insights
should carry `source_workspace_ids`.

## Runtime Projection Rules

- Owner routes and Owner Gateway runs may read complete household profile
  projections.
- Ordinary workspace routes and runs may read:
  - that workspace's `member_self` profile records;
  - household records explicitly classified as `household_summary` or
    `shared_with_members`;
  - redacted existence markers only when product policy allows them.
- Group chat receives only projections allowed by group membership and the
  sender's effective workspace policy.
- Web Push and Action Inbox records must use summary projections only.
- Gateway context assembly must inject only the profile projection permitted by
  the authenticated actor and effective workspace.

## Source Domains

V1 should support these domains as profile inputs:

```text
owner_manual
chat
note
health
finance
growth
wardrobe
directory
plugin_usage
```

Initial implementation should prefer deterministic, bounded summaries from
existing services and plugin MCP/API surfaces. Free-form model extraction may
propose profile facts, but profile writes should remain auditable and
idempotent.

## Relationship To Reference / Memory Graph

Family Profile Memory is deliberately simpler than Reference / Memory Graph:

- it stores profile claims, summaries, evidence pointers, and insights;
- it does not require full object-ref backlink APIs;
- it does not require `same_event` graph grouping;
- it does not make Note a canonical store for plugin data;
- it does not replace future graph provenance or object references.

However, it should be graph-compatible:

- source workspace and domain are mandatory;
- evidence references should use stable source ids when available;
- records should carry provenance and idempotency keys;
- future Reference / Memory Graph edges can be created from profile evidence
  without rewriting profile semantics.

## Implementation Direction

The first implementation should be service-first:

- `adapters/family-profile-repository.js`
- `adapters/family-profile-service.js`
- `adapters/family-profile-projection-service.js`
- `adapters/family-profile-insight-service.js`
- `server-routes/family-profile-api-routes.js`

`server.js` should only wire routes and runtime dependencies.

Native SQLite storage is preferred for V1 because Home AI already uses SQLite
for mobile runtime state, backup, and migration validation.

## Validation

Focused tests for this module should include:

```text
node tests/family-profile-repository.test.js
node tests/family-profile-service.test.js
node tests/family-profile-projection-service.test.js
node tests/family-profile-insight-service.test.js
node tests/family-profile-api-routes.test.js
node tests/context-assembly-service.test.js
node tests/gateway-run-start-service.test.js
node tests/architecture-refactor-boundary.test.js
```

Required assertions:

- Owner can read complete household profile projections.
- Ordinary members cannot read another member's private profile records.
- Cross-workspace generated insights default to `owner_only`.
- Profile records preserve source workspace, domain, sensitivity, provenance,
  and idempotency metadata.
- Re-running the same profile update does not create duplicates.
- Gateway context assembly receives actor-scoped profile projections, not raw
  household data.
- No tests or fixtures store raw private plugin payloads.
