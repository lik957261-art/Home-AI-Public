# Memory Graph UI Design

Last updated: 2026-06-10.

## Purpose

The Memory Graph UI is not a database browser and should not start as a
large, decorative node network. Its job is to make family memory explainable,
traceable, and manageable.

The first useful interface must answer:

1. What does Home AI remember?
2. Where did that memory come from?
3. Who can see it, and who must not see it?

Graph visualization is a structure and explanation tool. The primary entry is
a permission-aware household profile workspace built on Family Profile Memory
records, evidence refs, insights, and projections.

## Product Position

Memory Graph UI sits above the Family Profile Memory V1 foundation and below
the future full Reference / Memory Graph product.

V1 should expose the profile layer that already exists:

- personal profile records;
- household profile summaries;
- bounded evidence references;
- generated profile insights;
- visibility and sharing state.

It should not require full graph object refs, `same_event` semantics, external
graph databases, or global cross-plugin graph browsing before the profile UI is
useful.

## Core Information Architecture

The Memory Graph surface should use four primary tabs.

### Profile

Shows the current actor's visible memory records.

Owner sees complete household profile projections. Ordinary members see only
their own profile records and shared household summaries.

Primary use cases:

- scan what the system remembers;
- search by person, domain, source, or topic;
- inspect stale or inferred records;
- confirm, hide, delete, or change visibility when permitted.

### Relationships

Shows local relationship explanations.

This is where graph visualization belongs. It must not render the entire memory
store. The default graph is centered on the currently selected record, insight,
person, plugin, topic, or source.

Primary use cases:

- explain why a memory exists;
- show nearby people, plugins, topics, evidence, and insights;
- expand a bounded neighborhood on demand;
- navigate from a relationship node back to a detail panel.

### Insights

Shows generated household insights.

Insights are evidence-backed interpretations such as household preferences,
shared schedule patterns, recurring finance concerns, or cross-workspace care
signals. Generated cross-workspace insights default to `owner_only`.

Owner can share a bounded insight as a household summary. Ordinary members
only see insights that their projection permits.

### Visibility

Shows memory visibility state as a management surface, not as a generic
administrative ACL screen.

The goal is to make sharing legible:

- which records are Owner-only;
- which records belong to a member;
- which records are family summaries;
- which records were explicitly shared.

Owner UI must state that Owner visibility is not the same as member visibility.
Ordinary member UI must not show hidden existence traces for records that were
trimmed from their projection.

## Landing Layout

The first screen should not be a graph canvas.

### Desktop / Wide Layout

Use a three-region layout:

1. Left navigation rail.
2. Center memory list.
3. Right detail panel.

The top bar should contain:

- current view scope, such as `Family`, `Stephen`, `Wu Ping`, or another
  workspace label;
- a visibility note:
  - Owner: complete household profile;
  - member: only accessible memory;
- search input for people, preferences, topics, plugins, and sources.

The left navigation rail should use compact categories:

- People;
- Preferences;
- Health;
- Finance;
- Wardrobe;
- Schedule;
- Tasks;
- Plugin Memory;
- System Insights.

The center list should show compact memory cards:

- title;
- type, such as `preference`, `profile`, `insight`, or `relationship`;
- source, such as Health MCP, chat, Wardrobe, Finance, or Owner manual;
- visibility badge;
- updated time;
- confidence or state, such as `confirmed`, `inferred`, or `stale`.

The right detail panel should open from a selected memory card and show:

- memory content;
- source workspace;
- bounded source event or source summary;
- explanation for why the system believes the record;
- related memory records and insights;
- visibility;
- allowed actions.

Allowed actions should include, when permitted:

- confirm;
- edit;
- hide;
- delete;
- share;
- downgrade to private.

### Mobile Layout

Mobile should not force a three-column interface.

Use this structure:

1. Default list page.
2. Tap a memory card to open a detail page.
3. Detail page has a `Relationship` action that opens a local graph.
4. Local graph opens full screen.
5. A bottom sheet shows selected node details.
6. Visibility actions stay on the detail page, not on the graph canvas.

This keeps mobile operation list-first and avoids precision dragging on a small
screen.

## Local Graph View

The graph view must be local and bounded.

Example for a selected memory record such as "Stephen prefers low-salt meals":

- Stephen;
- health profile;
- diet preference;
- Health MCP;
- related chat summary;
- related suggestions such as family menu, shopping list, or health reminder.

Default graph size should be limited to roughly 20-30 nodes. The UI should use
explicit `Expand related` controls instead of rendering all relationships at
once.

### Graph Interaction

- Tap node: open detail or update the detail panel.
- Long press node: show a compact action menu when actions are available.
- Drag node: exploration only, not a primary data-editing operation.
- Expand related: load the next bounded relationship neighborhood.
- Reset: return to the selected record's local graph.

### Node Types

Use restrained visual encoding:

- person: circular avatar or initials;
- plugin or MCP: compact square icon;
- memory record: rounded rectangle;
- insight: diamond or subtly emphasized node;
- source event: small dot or timeline node.

Color must be functional, not decorative. The graph must not become a dense
multi-color web. Visibility and sensitivity should be represented with badges
or edge labels, not only color.

## Visibility Model In UI

Every memory record and insight must show a visibility badge.

Canonical backend values:

```text
owner_only
member_self
household_summary
shared_with_members
```

User-facing labels may be localized, but the UI should preserve the backend
classification in debug/test metadata.

Suggested Chinese labels:

- `owner_only`: `仅 Owner`
- `member_self`: `仅本人`
- `household_summary`: `家庭摘要`
- `shared_with_members`: `已共享`

Owner view can display all records, but it must communicate:

```text
You can see this as Owner. Other members may not be able to see it.
```

Ordinary member view must not display records that were trimmed from the
projection. Do not show redacted placeholders such as "3 hidden family
memories" unless an explicit product policy later approves such markers.

## Detail Panel Contract

The detail view is the core trust surface.

It should include:

- record title;
- record type;
- domain;
- summary;
- current status;
- confidence;
- visibility;
- source workspace;
- source domain;
- bounded evidence refs;
- last updated time;
- related records and insights;
- action audit summary when available.

Evidence refs must remain bounded. The UI must not inline raw emails, full
health reports, full ledgers, full note bodies, full learner answers, raw
prompts, secrets, push endpoints, or local filesystem paths.

## Owner Actions

Owner can manage household memory because the deployment runs on Owner's
computer. Runtime UI rules still matter because they prevent accidental
sharing to ordinary members, group chat, Web Push, plugin runs, and Gateway
contexts.

Owner actions:

- confirm an inferred memory;
- edit a memory summary;
- hide or archive a memory;
- delete a memory when deletion is supported by the repository/service;
- change visibility from `owner_only` to `household_summary`;
- explicitly mark a record or insight as `shared_with_members`;
- downgrade shared content back to `owner_only` or `member_self`.

Sharing must show a bounded preview before it is applied. The preview should
show exactly what ordinary members will see, not the Owner-only source detail.

## Member Actions

Ordinary members can manage records visible to them only within the capability
policy of their workspace.

V1 member actions should be conservative:

- view accessible records and shared insights;
- search accessible memories;
- request correction or hide for self-owned records;
- confirm a self-owned inferred record if product policy allows it.

Ordinary members must not change cross-workspace visibility, share household
insights, or inspect Owner-only evidence.

## Filters And Search

V1 filters:

- person / workspace;
- type;
- source plugin or source domain;
- visibility;
- status;
- confidence/state;
- updated time.

Search should match:

- memory title;
- summary;
- person/workspace label;
- source domain;
- bounded source title or source summary.

Search results must use the same projection boundary as the normal list.

## Empty, Loading, And Error States

Empty states should be factual:

- no visible memory records;
- no insights shared with this view;
- no related graph nodes for the selected record.

Error states should distinguish:

- API unavailable;
- permission denied;
- projection returned no visible records;
- stale local client cache.

Permission-denied states must not reveal hidden record titles or counts to
ordinary members.

## V1 Minimum Product Scope

V1 UI should include:

1. Family Profile Memory / Memory Graph entry.
2. Visible memory list.
3. Filters for person, type, source plugin, and visibility.
4. Memory detail page or panel.
5. Local relationship graph centered on one selected item.
6. Owner visibility updates: private, household summary, shared.
7. Hide/delete/confirm actions when supported by service policy.
8. Owner/member projection verification.

## Explicit Non-Goals

Do not build these in V1:

- global infinite graph;
- automatic graph layout editing;
- manual relationship drawing;
- complex timeline time travel;
- multi-person approval workflows;
- external graph database dependency;
- graph canvas as the primary landing page;
- raw plugin object browsing through the memory UI.

## API And Data Dependencies

The UI should consume projection APIs instead of reading raw tables:

- `GET /api/family-profile/self`
- `GET /api/family-profile/household`
- `GET /api/family-profile/records`
- `GET /api/family-profile/insights`
- Owner-only insight creation/share APIs where needed.

Future graph-specific APIs should provide local neighborhoods, not full graph
dumps. A local graph endpoint should accept a selected record/insight/object
reference and return:

- nodes;
- edges;
- selected node id;
- visible detail summaries;
- available actions;
- pagination or expansion cursors.

## Test And Acceptance Criteria

Design and implementation are acceptable only when tests prove:

- Owner profile view can list complete household projections.
- Member profile view cannot see another member's `member_self` records.
- Owner-only records and insights are absent from member search, filters,
  detail views, graph nodes, and graph edge labels.
- Every visible memory card shows source, visibility, state, and updated time.
- Detail view shows bounded evidence refs without raw private payloads.
- Owner can preview and apply visibility changes.
- Shared insight appears in a member projection only after Owner shares it.
- Local graph defaults to a bounded neighborhood and does not render a full
  graph dump.
- Mobile view is list-first, detail-second, graph-on-demand.
- Dark mode and mobile safe-area behavior follow the existing Home AI visual
  contracts.

Recommended future tests:

```text
node tests/family-profile-memory-ui.test.js
node tests/family-profile-visibility-ui.test.js
node tests/family-profile-local-graph-ui.test.js
node tests/family-profile-api-routes.test.js
node tests/mobile-bottom-region-layout.test.js
node tests/ios-pwa-visual-harness.test.js
node tests/architecture-refactor-boundary.test.js
```

When the UI is implemented, add an iOS/PWA visual scenario that exercises:

- Owner profile list;
- member projection list;
- memory detail panel;
- local graph full-screen view;
- visibility/share sheet;
- dark mode.

## Implementation Sequence

Recommended sequence:

1. Add route/state entry for Memory Graph but keep it behind the Family Profile
   projection APIs.
2. Build list and filters first.
3. Add detail page/panel with bounded evidence.
4. Add Owner visibility action preview and apply flow.
5. Add Insights tab.
6. Add Visibility tab.
7. Add local graph view centered on one selected item.
8. Add mobile full-screen graph and bottom-sheet detail.
9. Add visual and projection harness coverage.

Do not start with graph rendering. The graph renderer is useful only after the
list, detail, evidence, and visibility surfaces are trustworthy.
