# Reference And Memory Graph V1

Last updated: 2026-06-06.

## Purpose

Home AI needs a durable cross-plugin memory layer that can connect notes,
transactions, wardrobe items, people, emails, directory files, events, and
conversation evidence without collapsing those domains into one shared data
store.

This document defines the first-step architecture for a Reference / Memory Graph
layer. It should make cross-plugin recall, provenance, and orchestration
testable while preserving each plugin as the source of truth for its own
structured facts.

## Non-Goals

V1 must not:

- make Note the canonical store for Finance, Wardrobe, People, Email, or other
  plugin facts;
- copy full structured plugin objects into Note or the graph;
- bypass plugin-level permission checks through cached display snapshots;
- depend on an external graph vendor at runtime;
- implement a full event/timeline platform before link semantics are proven;
- treat free-form LLM extraction as authoritative without validation,
  provenance, and idempotency.

## Priority And Sequencing

Reference / Memory Graph is a strategic P1. It is not the current execution P0
while Mac production stability, mobile visual stability, and MCP/deployment
harness closure are still active risks.

Current priority order:

```text
P0:
  Mac production stability
  Mobile visual and interaction stability
  MCP/schema/deployment harness closure

P1:
  Reference / Memory Graph V1
  Note links
  Finance and Wardrobe minimal reference contract
  Permission, idempotency, backlink, and Gateway/MCP harnesses

P2:
  People, Email, Directory, and Growth reference contract expansion
  event_key / same_event scenario expansion
  transaction-like Hermes orchestration across plugins

P3:
  Neo4j / Kuzu / FalkorDB / Graphiti / Zep backend evaluation
  automatic entity extraction
  standalone Event / Timeline layer
  large-scale graph UI and analytics
```

The P1 implementation should begin only after the current P0 production and
mobile closure work has an explicit harness-backed baseline. However, the
contract applies immediately as an architecture constraint: new Note, Finance,
Wardrobe, People, Email, Directory, or Growth capabilities should not invent
ad-hoc reference formats that conflict with this document.

The first P1 slice should be narrow:

- Note to Finance backlink;
- Note to Wardrobe object or wear-log backlink;
- one `same_event` grouping across Note, Finance, Wardrobe, and People;
- idempotency for repeated orchestration;
- permission-trimmed projections;
- Gateway/MCP schema harness for the new graph and Note link tools.

## Layering

```text
Hermes Mobile orchestration
        |
        v
Reference / Memory Graph contract
        |
        +--> V1 native SQLite graph tables
        |
        +--> optional future graph backend
             Neo4j / Kuzu / FalkorDB / Graphiti / Zep

Domain plugins remain authoritative:
Finance, Wardrobe, People, Email, Note, Directory, Growth, Automation, ...
```

### Hermes Mobile

Hermes Mobile owns natural-language interpretation, planning, multi-plugin MCP
selection, idempotent orchestration, and final user-visible responses.

It decides when to:

- create or update a structured plugin object;
- create a Note entry;
- create graph links between Note, plugin objects, people, events, and files;
- resolve ambiguous mentions through the relevant plugin;
- recover from partial failures.

### Domain Plugins

Each domain plugin continues to own its structured facts and permissions.

Examples:

- Finance owns transactions, ledgers, attachment metadata, and finance audit
  rules.
- Wardrobe owns clothing items, outfits, wear logs, and wardrobe-specific
  inventory state.
- People owns person identity, aliases, relationships, and contact boundaries.
- Email owns message identity, message metadata, summaries, and mailbox access.
- Directory owns file artifacts, shared roots, and file access policy.

The graph stores stable references to these objects. It does not become their
replacement database.

### Note

Note is the non-structured memory and citation entry layer. It may store:

- free-form text;
- user dictation;
- attachments;
- bounded explanation and context;
- references to plugin objects;
- bounded display snapshots for UI rendering.

Note must not store full plugin fact copies. A Note backlink to a Finance
transaction can show a small title/subtitle snapshot, but transaction details
must be resolved through Finance.

### Reference / Memory Graph

The graph stores cross-object relationships:

- Note to object;
- object to object;
- object to event;
- person to event;
- evidence to object;
- follow-up context to prior context.

V1 may be implemented in native SQLite tables. External graph databases or
agent-memory systems are optional future backends behind the same contract.

## Stable Object Reference

Every plugin object that can participate in the graph must expose a stable
reference:

```json
{
  "workspace_id": "owner",
  "plugin_id": "finance",
  "object_type": "transaction",
  "object_id": "txn_123",
  "display": {
    "title": "Dining 238 CNY",
    "subtitle": "2026-06-04 / Zhang San / Dinner",
    "time": "2026-06-04T12:30:00+08:00",
    "thumbnail_hint": "receipt"
  }
}
```

Rules:

- `plugin_id + object_type + object_id` must be stable across retries,
  summaries, UI reloads, and Gateway runs.
- `display` is a bounded snapshot for navigation and lightweight rendering.
- The graph may cache the bounded snapshot with `snapshot_time`.
- Full details must be read through the owning plugin's MCP/API surface.
- Object references must include workspace/principal context or another
  permission-resolvable scope.

## Minimal Plugin Reference Contract

V1 should start with a small MCP/API contract rather than require every plugin
to implement natural-language resolution immediately.

Required V1 methods:

```text
reference_object_types()
reference_get(object_type, object_id)
reference_summarize(object_type, object_id, purpose?)
```

Recommended V2 methods:

```text
reference_search(query, object_type?, limit?)
reference_resolve(mention, context?)
```

Reasoning:

- `reference_get` and `reference_summarize` are deterministic and permission
  checkable.
- `reference_search` and `reference_resolve` involve ambiguity, aliases,
  contextual disambiguation, and user confirmation. They should be added after
  V1 link creation and backlinks are stable.

## Graph Data Model

V1 native tables should be small and auditable:

```text
reference_nodes
reference_object_refs
reference_edges
reference_events
reference_provenance
```

### `reference_nodes`

Stores graph-native nodes that are not simply plugin object rows.

Examples:

- `event`
- `person_alias`
- `concept`
- `place`
- `note_context`

Minimum fields:

```text
node_id
workspace_id
node_type
title
summary
created_at
updated_at
privacy_class
metadata_json
```

### `reference_object_refs`

Stores stable pointers to plugin-owned objects.

Minimum fields:

```text
ref_id
workspace_id
plugin_id
object_type
object_id
display_title
display_subtitle
display_time
thumbnail_hint
snapshot_time
permission_scope_json
created_at
updated_at
```

### `reference_edges`

Stores directed relationships between references and graph nodes.

Minimum fields:

```text
edge_id
workspace_id
source_kind        -- node | object_ref
source_id
target_kind        -- node | object_ref
target_id
relation_type
event_key
confidence
created_by         -- hermes | user | plugin | repair
created_at
metadata_json
provenance_id
idempotency_key
```

### `reference_events`

V1 can represent events as lightweight records. They are not yet a full Timeline
plugin.

Minimum fields:

```text
event_id
workspace_id
event_key
title
time_start
time_end
place_hint
summary
created_at
updated_at
metadata_json
```

### `reference_provenance`

Stores how a node or edge was created without storing raw prompts, secrets, full
transcripts, or full private content.

Minimum fields:

```text
provenance_id
workspace_id
source_type        -- user_message | mcp_call | note | plugin_event | repair
source_ref
run_id
message_id
tool_call_id
idempotency_key
summary
created_at
metadata_json
```

## Relation Types

V1 relation types should stay few and stable:

```text
mentions
same_event
evidence_for
created_from
context_for
followup_to
```

Definitions:

- `mentions`: source text or object mentions the target.
- `same_event`: source and target belong to the same real-world event.
- `evidence_for`: source is evidence supporting or explaining the target.
- `created_from`: target was created from source input or artifact.
- `context_for`: source adds bounded context to the target.
- `followup_to`: source is a later continuation of prior context or object.

Avoid adding near-duplicates such as `explains` until retrieval evidence proves
they are needed. Prefer a small relation vocabulary that Hermes can choose
reliably.

## Permission Rule

Graph visibility must never exceed the intersection of source and target
permissions.

Rules:

- Creating an edge requires create/read permission on the source and link
  permission on the target.
- Listing backlinks requires permission to see the source object and at least a
  permitted bounded projection of the target.
- `display_*` snapshots must be permission-trimmed.
- `reference_get` must always call the owning plugin or service, which performs
  its own permission checks.
- If the user cannot access the target object, the graph may show a redacted
  existence marker only when product policy allows it.

This prevents Note or the graph from becoming a side channel into private
Finance, Email, Wardrobe, or People records.

## Idempotency And Recovery

Every orchestration that creates structured objects and graph links must carry a
stable `idempotency_key`.

Example user input:

```text
Record that I wore the gray coat to dinner with Zhang San today, spent 238 CNY,
and liked the outfit.
```

Expected plan:

```text
1. Resolve or create person reference for Zhang San.
2. Resolve wardrobe item "gray coat".
3. Create or update wardrobe wear log.
4. Create Finance transaction.
5. Create Note entry with the original free-form text and bounded context.
6. Create an event or event_key.
7. Create graph edges connecting Note, person, transaction, wardrobe item, and
   wear log.
```

Failure handling:

- If a structured object is created but graph link creation fails, retry link
  creation with the same `idempotency_key`.
- If Note creation succeeds but a plugin object fails, store a recoverable
  provenance record and surface a clear partial-completion state.
- If a mention resolves to multiple candidates, do not create ambiguous links
  without user confirmation or a plugin-provided deterministic choice.
- Duplicate runs with the same `idempotency_key` must not create duplicate
  transactions, notes, events, or edges.

## V1 MCP Surface

The first native graph service should expose bounded MCP/API operations:

```text
reference_graph_node_create(...)
reference_graph_object_ref_upsert(...)
reference_graph_edge_create(...)
reference_graph_edges_list(source | target | event_key)
reference_graph_backlinks_list(plugin_id, object_type, object_id)
reference_graph_event_upsert(...)
reference_graph_event_objects_list(event_key | event_id)
```

Note should expose note-specific wrappers:

```text
notes_link_create(...)
notes_links_list(note_id)
notes_backlinks_list(plugin_id, object_type, object_id)
notes_link_delete(link_id)
```

The Note wrappers may internally call the graph service in V1, or they may own a
temporary note-local implementation that matches this contract. The contract
should make later extraction to a standalone graph service mechanical.

## Storage Recommendation

V1 should use native SQLite tables first.

Reasons:

- Windows and Mac production can run the same implementation.
- Backup, migration, and production validation are already built around SQLite.
- Permission and idempotency harnesses are easier to write.
- It avoids introducing a new always-on service before product value is proven.

Future backend candidates:

- Neo4j: mature Cypher ecosystem and strong graph tooling.
- Kuzu: embedded graph database, local-first friendly.
- FalkorDB: graph database with AI/GraphRAG focus.
- Graphiti/Zep: temporal agent-memory graph that can help extraction and recall.
- Cognee/Mem0/Letta/LangMem: useful memory experiments, but should not replace
  Home AI's reference contract.

External systems may be used later behind an adapter. They must not become the
source of truth for plugin facts or permission decisions.

## Growth Graph Reuse

The existing Growth knowledge-graph design should inform this architecture, but
it is not the same layer.

Reusable principles:

- stable node identity;
- explicit edges;
- graph validation;
- source metadata and import provenance;
- native records after external import;
- graph layer informs workflow but does not own workflow state.

Difference:

- Growth graph nodes represent learning concepts, prerequisites, evidence, and
  card planning.
- Reference / Memory Graph nodes represent cross-plugin life/work objects,
  events, notes, provenance, and references.

Growth can later publish selected summary-only evidence into the global graph,
but the Growth learning graph remains authoritative for card planning.

## Harness Requirements

V1 is H1 because it crosses plugins, permissions, persistence, and Gateway/MCP
tool selection.

Detailed harness plan:

- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`

Required harness scenarios before implementation is complete:

1. `note -> finance transaction` link:
   - create a note;
   - upsert a Finance object reference;
   - create `context_for` or `same_event` edge;
   - list note links;
   - list transaction backlinks;
   - verify no duplicate edge on retry.

2. Multi-plugin event:
   - create one event_key;
   - link Note, Finance transaction, Wardrobe wear log, and People person;
   - list all event objects;
   - verify relation types and provenance.

3. Permission trimming:
   - low-permission principal can see only permitted bounded snapshots;
   - restricted object details require the owning plugin's `reference_get`;
   - unauthorized target details are not leaked through backlinks.

4. Partial failure recovery:
   - simulate Note success and graph edge failure;
   - retry with the same idempotency key;
   - verify no duplicate note/object/event/edge records.

5. Gateway/MCP exposure:
   - selected Gateway profile exposes the graph and Note link tools;
   - tool schema smoke proves callable names are present;
   - a simple run can create and read back a link.

Planned tests:

```text
node tests/reference-graph-repository.test.js
node tests/reference-graph-service.test.js
node tests/reference-graph-permission.test.js
node tests/reference-graph-idempotency.test.js
node tests/reference-graph-mcp-schema-harness.test.js
node tests/note-reference-link-service.test.js
```

## V1 Acceptance Criteria

V1 is complete when:

- a native graph repository exists with migration-safe SQLite schema;
- object refs preserve stable `plugin_id + object_type + object_id`;
- Note can create/list/delete links to plugin object refs;
- backlinks work from a plugin object to related notes;
- at least Finance and Wardrobe implement the minimal reference contract;
- graph writes carry provenance and idempotency keys;
- permission-trimmed listing is covered by tests;
- duplicate orchestration retries do not create duplicate notes, events, or
  edges;
- Gateway/MCP schema smoke proves graph and Note link tools are visible to the
  selected production profile;
- docs and the architecture/code/test/harness map point to the implemented
  services and harnesses.

## First Implementation Slice

The recommended first slice is intentionally narrow:

1. Add native SQLite tables and repository for object refs and edges.
2. Add graph service methods for object ref upsert, edge create/list, and
   backlinks.
3. Add Note link wrappers that use the graph service.
4. Add Finance and Wardrobe `reference_get` and `reference_summarize` only.
5. Add the note-to-finance and note-to-wardrobe harness scenarios.
6. Add one Hermes orchestration smoke that creates a Note plus links without
   creating new domain facts.

Do not add natural-language `reference_resolve`, event/timeline UI, external
graph database integration, or broad automatic extraction in this slice.
