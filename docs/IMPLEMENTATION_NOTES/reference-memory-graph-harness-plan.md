# Reference / Memory Graph Harness Plan

Last updated: 2026-06-06.

## Purpose

Reference / Memory Graph changes are H1. They cross plugin boundaries,
permissions, persistence, idempotency, Gateway/MCP tool exposure, and production
profile selection.

This plan defines the workflow harness evidence required before a Reference /
Memory Graph implementation can be considered complete. Unit tests alone are
not enough because the product risk is in cross-plugin composition and recovery.

Primary design doc:

- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`

## Scope

The harness must prove:

- stable plugin object refs are stored without copying full plugin facts;
- Note links can be created, listed, deleted, and backlinked;
- relation types and event grouping are deterministic;
- permissions trim graph projections and do not leak target details;
- retries and partial failures do not duplicate graph records or plugin facts;
- selected Gateway profiles expose the expected graph and Note link tools;
- production schema probes use the selected profile's real telemetry/profile
  root, not a root/default Hermes home.

## Privacy Rule

Harness fixtures and outputs must not store raw access keys, tokens, launch
tokens, cookies, push endpoints, full emails, full notes, full private chat
transcripts, full learner answers, full prompts, raw model responses, or private
plugin payloads.

Use synthetic or bounded data:

```text
note_id
plugin_id
object_type
object_id
display_title
display_subtitle
relation_type
event_key
provenance_id
idempotency_key
count summaries
permission result summaries
```

## Planned Test Commands

The first implementation slice should add these focused tests:

```text
node tests\reference-graph-repository.test.js
node tests\reference-graph-service.test.js
node tests\reference-graph-permission.test.js
node tests\reference-graph-idempotency.test.js
node tests\reference-graph-mcp-schema-harness.test.js
node tests\note-reference-link-service.test.js
```

When plugin reference contracts are touched, add the relevant plugin-side
contract tests for Finance, Wardrobe, People, Email, Note, Directory, or Growth.

## Scenario RMG-H1-001: Repository Schema And Migration

Purpose:

- prove the native graph schema is migration-safe and auditable.

Setup:

- create an isolated SQLite test database;
- apply graph migrations;
- run `pragma quick_check`;
- inspect expected tables and indexes.

Assertions:

- required tables exist:
  - `reference_nodes`
  - `reference_object_refs`
  - `reference_edges`
  - `reference_events`
  - `reference_provenance`
- unique constraints prevent duplicate object refs for
  `workspace_id + plugin_id + object_type + object_id`;
- unique idempotency constraints prevent duplicate edges for the same
  `idempotency_key` where applicable;
- records can be backed up and restored without losing provenance ids;
- no test fixture stores raw private content.

## Scenario RMG-H1-010: Note To Finance Link And Backlink

Purpose:

- prove the smallest useful cross-plugin memory loop.

Setup:

- create or fixture one Note entry;
- fixture one Finance transaction reference;
- upsert a Finance object ref;
- create a graph edge from the Note to the Finance object ref with relation
  `context_for` or `same_event`.

Assertions:

- `notes_links_list(note_id)` returns the Finance link with bounded display
  fields;
- `reference_graph_backlinks_list("finance", "transaction", object_id)`
  returns the Note backlink;
- the backlink does not include full note body unless the caller has permission
  to read the Note;
- retrying the same operation with the same `idempotency_key` returns the same
  edge or a no-op result;
- no duplicate edge is created.

## Scenario RMG-H1-020: Multi-Plugin Event

Purpose:

- prove one real-world event can connect multiple plugin facts without creating
  N-to-N uncontrolled links.

Setup:

- create a shared `event_key`;
- upsert object refs for:
  - one Note;
  - one Finance transaction;
  - one Wardrobe wear log or item;
  - one People person;
- create `same_event` edges to the event.

Assertions:

- `reference_graph_event_objects_list(event_key)` returns all expected object
  refs;
- relation types are stable and do not require free-form labels;
- each edge has provenance and an idempotency key;
- deleting or redacting one target does not corrupt unrelated event edges;
- event listing remains bounded and does not inline full plugin records.

## Scenario RMG-H1-030: Permission Trimming

Purpose:

- prove the graph cannot become a side channel into private plugin data.

Setup:

- create one higher-permission object ref and one lower-permission caller;
- create a Note link or event edge involving that restricted object;
- call list and backlink APIs as Owner and as the restricted principal.

Assertions:

- Owner can see permitted bounded display fields and can call the owning plugin
  for details;
- restricted principal sees only permitted projections or a redacted marker;
- restricted principal cannot recover full details from `display_*`,
  `metadata_json`, provenance summaries, or backlink lists;
- `reference_get` is always delegated to the owning plugin/service for final
  permission checks;
- logs contain permission result summaries, not private object contents.

## Scenario RMG-H1-040: Partial Failure And Idempotent Recovery

Purpose:

- prove orchestration can recover when object creation and graph linking do not
  complete in one pass.

Setup:

- simulate Note creation success;
- simulate a graph edge write failure after the object ref was upserted;
- retry the same orchestration with the same `idempotency_key`;
- repeat with graph success and Note failure where the Note layer supports a
  recoverable operation.

Assertions:

- retry does not duplicate notes, object refs, events, or edges;
- partial state is inspectable through bounded provenance;
- the user-visible result can report partial completion without claiming the
  full memory link succeeded;
- repair operations are explicit and auditable;
- no raw model prompt or private input is stored in the recovery record.

## Scenario RMG-H1-050: Gateway / MCP Tool Exposure

Purpose:

- prove the selected Gateway profile can actually call the new tools.

Setup:

- use the selected production-like Gateway profile;
- probe tool schema through the same path used by a normal run;
- use the selected worker profile root and telemetry root;
- do not print raw access keys, token contents, or raw key paths.

Assertions:

- schema includes the graph tools required by the current implementation slice;
- schema includes the Note link wrappers if Note owns the user-facing entry;
- a simple run can create and read back a bounded Note link;
- failure reports distinguish:
  - plugin tool not provisioned;
  - profile selected the wrong worker;
  - schema cache stale;
  - permission denied;
  - graph service unavailable;
- production evidence records worker/profile identity in bounded form and never
  logs raw secrets.

## Scenario RMG-H1-060: Plugin Reference Contract

Purpose:

- prove plugin object refs can be resolved without making the graph a fact
  store.

Setup:

- implement the minimal V1 reference contract for at least Finance and
  Wardrobe:
  - `reference_object_types()`
  - `reference_get(object_type, object_id)`
  - `reference_summarize(object_type, object_id, purpose?)`

Assertions:

- `reference_object_types()` lists stable supported object types;
- `reference_get()` enforces plugin permissions;
- `reference_summarize()` returns bounded summaries suitable for graph display
  or Hermes answer composition;
- missing or unauthorized objects return controlled diagnostics;
- the graph service does not store the full returned object as its own fact.

## Production Closure Evidence

Before a production rollout can be closed, record bounded evidence for:

- current app/source commit;
- current graph migration version;
- selected Gateway profile identity;
- selected worker health;
- graph and Note link tool schema presence;
- one create/read backlink smoke;
- no duplicate rows after retry;
- permission-trimmed restricted read;
- backup path if production data is migrated;
- rollback instructions if migration or tool exposure fails.

Do not record raw credentials, raw access-key file contents, private note
bodies, full emails, full transaction details, or long logs.

## Completion Rule

A Reference / Memory Graph change is not complete if any of these are missing:

- repository or migration tests for changed graph tables;
- service tests for object refs, edges, backlinks, and idempotency;
- permission tests for restricted principals;
- plugin reference contract tests for touched plugins;
- Gateway/MCP schema harness when tools are added or renamed;
- production-like smoke for the selected profile when deploying to Mac
  production.
