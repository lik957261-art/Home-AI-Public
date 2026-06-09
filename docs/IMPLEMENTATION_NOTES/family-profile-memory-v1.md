# Family Profile Memory V1

Last updated: 2026-06-10.

## Purpose

Family Profile Memory V1 is the practical first step before implementing the
full Reference / Memory Graph.

The product problem is that every workspace currently behaves like an isolated
Hermes Memory island. That isolation is correct for permissions, but it makes
Home AI weak at household-level understanding. Owner wants the system to build
more accurate profiles for each family member and then synthesize household
insights from structured and semi-structured data.

V1 should improve real household usefulness without forcing a full graph event
model too early.

## Non-Goals

V1 must not:

- implement full Reference / Memory Graph object backlinks;
- require `same_event` grouping across every plugin;
- introduce Neo4j, Kuzu, Graphiti, Zep, or another always-on graph backend;
- copy full plugin records into the profile store;
- make Note the canonical store for Health, Finance, Wardrobe, Growth, Email,
  or Directory facts;
- pretend product runtime permissions can prevent Owner from reading data on
  Owner's own computer;
- leak Owner-visible household profile data into non-Owner workspaces.

## Product Thesis

The first valuable memory upgrade is not a complete event graph. It is a
household profile system that can answer:

- who each family member is;
- what each person cares about;
- which domains are important for each person;
- which recurring patterns matter across the household;
- what Owner should notice that isolated workspace memory would miss;
- what can safely be shared back to a member versus kept Owner-only.

This is a better near-term fit for a private family deployment than a broad
cross-plugin event graph.

## V1 Scope

### Personal Profile Snapshots

Maintain current and historical profile snapshots per workspace.

Suggested fields:

```text
profile_id
workspace_id
profile_version
summary
traits_json
preferences_json
domain_summary_json
risk_summary_json
source_count_json
created_at
updated_at
snapshot_time
provenance_id
idempotency_key
```

The snapshot is a compact, auditable profile. It should be useful for prompt
context, Owner review, and future profile diffing.

### Household Profile

Maintain household-level profile records.

Suggested fields:

```text
household_profile_id
summary
members_json
relationship_map_json
shared_goals_json
care_responsibilities_json
aggregate_patterns_json
created_at
updated_at
profile_version
```

The household profile is Owner-managed. It may summarize multiple workspaces,
but it must preserve source metadata through linked profile records and
evidence refs.

### Profile Records

Maintain atomic profile claims that can be updated, confirmed, retired, or
projected.

Suggested fields:

```text
record_id
workspace_id
subject_workspace_id
source_workspace_id
domain
record_type
claim
summary
confidence
sensitivity
visibility
status
first_seen_at
last_seen_at
expires_at
provenance_id
idempotency_key
metadata_json
```

`visibility` should be one of:

```text
owner_only
member_self
household_summary
shared_with_members
```

Cross-workspace generated claims should default to `owner_only` until Owner
chooses otherwise.

### Profile Evidence References

Maintain bounded evidence pointers.

Suggested fields:

```text
evidence_id
record_id
source_workspace_id
source_domain
source_kind
source_id
display_title
display_summary
display_time
confidence
freshness
metadata_json
created_at
```

Evidence refs should point to the source plugin or service when possible. They
must not inline full private payloads.

### Profile Insights

Maintain generated household insights.

Suggested fields:

```text
insight_id
title
summary
insight_type
source_workspace_ids_json
domains_json
affected_workspace_ids_json
evidence_ids_json
confidence
visibility
requires_owner_confirmation
status
created_at
updated_at
provenance_id
idempotency_key
metadata_json
```

Insights are not raw model opinions. They are bounded, evidence-backed
projections. The UI should show why the insight exists and whether it is
confirmed, tentative, dismissed, or stale.

## Owner Model

Owner is the household administrator because Home AI runs on Owner's personal
computer. Owner can already access local data through the OS, backup files, and
production databases.

Therefore V1 should not waste complexity on fake Owner isolation.

Instead, V1 should enforce:

- all records carry source workspace metadata;
- all non-Owner projections are permission-trimmed;
- Gateway context for non-Owner actors cannot receive Owner-only household
  profile data;
- every cross-workspace insight defaults to Owner-only;
- Owner can explicitly mark selected summaries as shared.

## Projection Examples

### Owner Projection

Owner asks:

```text
Summarize household health and learning risks this month.
```

Allowed projection:

- all household profile records;
- all member summaries;
- Owner-only insights;
- evidence refs with bounded summaries;
- links to source domains where Owner route policy allows navigation.

### Member Projection

Wu Ping asks:

```text
What does Home AI remember about my health plan?
```

Allowed projection:

- Wu Ping's own `member_self` profile records;
- shared household summaries relevant to Wu Ping;
- no private Stephen records;
- no Owner-only household insight unless it has been explicitly shared.

### Group Chat Projection

A family group chat asks:

```text
What should we coordinate this week?
```

Allowed projection:

- group-visible household summaries;
- non-sensitive shared goals;
- Action Inbox or schedule summaries visible to the group;
- no member-private health, finance, email, or note details.

## Insight Types

V1 should keep insight types small:

```text
member_profile_update
household_pattern
care_followup
cross_domain_signal
data_quality_warning
sharing_suggestion
```

Examples:

- `member_profile_update`: Wu Ping's preferred health follow-up cadence changed.
- `household_pattern`: several workspaces mention the same family travel plan.
- `care_followup`: one member's health record suggests an Owner follow-up.
- `cross_domain_signal`: Growth fatigue and schedule pressure appear together.
- `data_quality_warning`: two Health directories have the same display name but
  different source workspaces.
- `sharing_suggestion`: a summary may be useful to share with the member.

## Source Domain Contracts

V1 should support bounded inputs from:

- `chat`: compacted summaries and explicit user-stated profile facts;
- `note`: note summaries, tags, and user-confirmed profile facts;
- `health`: health profile summaries, risks, follow-up cadence, and red flags;
- `finance`: category summaries, recurring patterns, and anomaly summaries;
- `growth`: learner goals, progress, frustration/fatigue signals, and
  parent-visible summaries;
- `wardrobe`: style preferences, size/fitting notes, wear-log summaries;
- `directory`: directory/project names, ownership, and selected cleaned
  summaries;
- `plugin_usage`: which plugins are active and valuable per workspace;
- `owner_manual`: Owner-confirmed household facts and corrections.

Each source domain should provide summaries through existing service/API/MCP
surfaces. V1 should not read raw plugin databases directly unless the owning
service exposes a controlled projection.

## Refresh Policy

Profile refresh should be explicit and bounded:

- manual Owner refresh for household profile;
- per-workspace refresh after significant terminal chat runs;
- plugin-triggered refresh after relevant source changes;
- scheduled low-frequency refresh for stale profiles;
- no continuous hidden rescanning of all private data.

Every refresh should write provenance and idempotency metadata.

## Service Design

Proposed services:

```text
adapters/family-profile-repository.js
adapters/family-profile-service.js
adapters/family-profile-projection-service.js
adapters/family-profile-insight-service.js
adapters/family-profile-source-collector-service.js
server-routes/family-profile-api-routes.js
```

Responsibilities:

- repository: SQLite schema, migrations, upserts, idempotency, provenance ids;
- service: create/update records, retire stale records, merge snapshots;
- projection service: Owner/member/group/Gateway projection trimming;
- insight service: generate, update, confirm, dismiss, and explain insights;
- source collector: pull bounded summaries from allowed domains;
- routes: Owner/member read APIs and explicit Owner confirmation actions.

`server.js` should remain glue only.

## MCP / Gateway Direction

V1 does not need broad MCP tool exposure on day one.

Suggested phases:

1. API/service only: Owner UI and server-side context projection.
2. Gateway read projection: inject actor-scoped profile context into runs.
3. Bounded MCP tools:
   - `family_profile_get_self`
   - `family_profile_get_household_summary`
   - `family_profile_insights_list`
   - `family_profile_insight_confirm`
4. Future Reference / Memory Graph extraction.

Non-Owner Gateway profiles must receive only actor-scoped projections.

## Harness Requirements

Family Profile Memory is H1 because it crosses workspaces, permissions,
persistence, Gateway context, and source-domain projections.

Initial tests:

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

Required scenarios:

1. Owner sees complete household projection.
2. Member sees own profile and shared household summaries only.
3. Cross-workspace insight defaults to `owner_only`.
4. Owner can mark an insight shared without exposing raw evidence.
5. Repeated refresh with the same idempotency key is a no-op.
6. Gateway context assembly injects actor-scoped profile projections.
7. Health/Finance/Growth fixture evidence remains bounded and private content
   is not stored in profile records or test fixtures.

## Relationship To Future Reference / Memory Graph

Family Profile Memory should feed the graph later, not compete with it.

Future extraction path:

- profile evidence refs become graph object refs where stable source ids exist;
- confirmed insights become graph-native nodes or `context_for` edges;
- household patterns can produce `same_event` groups only when event semantics
  are genuinely useful;
- permission and visibility metadata map into graph permission trimming.

Do not block Family Profile Memory V1 on graph backend selection.

## Implementation Status

Implemented foundation:

- SQLite repository for profile records, bounded evidence refs, personal
  profile snapshots, household profiles, and profile insights.
- Service layer that normalizes visibility, sensitivity, confidence, and
  idempotency.
- Projection service that separates Owner projections from ordinary member
  projections.
- Insight service with Owner-only default visibility and explicit share action.
- Authenticated API routes under `/api/family-profile/*`.
- Mobile API composition and dispatcher wiring without adding business logic to
  `server.js`.

Still pending:

- automatic source collectors from Health, Finance, Growth, Wardrobe, Note,
  Directory, and chat summaries;
- Gateway context assembly injection through actor-scoped profile projection;
- bounded MCP/read tools;
- production UI and production smoke coverage.

## Full V1 Acceptance Criteria

Full V1 is ready when:

- the module doc, implementation note, test matrix, and architecture map all
  point to the Family Profile Memory boundary;
- schema/service/API ownership is agreed;
- Owner/non-Owner projection rules are explicit;
- source-domain input is bounded and does not require raw plugin DB access;
- tests cover projection trimming, idempotency, provenance, and Gateway context
  injection.
