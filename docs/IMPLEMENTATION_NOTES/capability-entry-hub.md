# Capability Entry Hub Design

Last updated: 2026-06-05.

## Purpose

The Topics tab should evolve from a mixed topic list plus plugin Dock into a
capability entry hub. The hub should let a user choose the task they want to
perform without first deciding whether the correct path is a topic, an embedded
plugin app, a file directory, or an MCP-backed Home AI action.

The product rule is:

- the plugin icon always opens the plugin app;
- quick actions express concrete user tasks;
- quick actions may route to a topic, plugin route, directory, lightweight
  form, or MCP-backed chat intent;
- different plugins may expose different quick actions, but the plugin icon
  behavior must remain consistent across all plugins.

This avoids the earlier two-button model where every plugin icon had visible
mini actions such as "topic" and "directory". That model was logically
complete but visually noisy and did not scale to real plugin-specific tasks.

## User Problem

Some plugins are usually used as direct applications. Finance is the clearest
case: after a meal, the user often wants to record one transaction, not discuss
accounting.

Other plugins are often used as reasoning context. Wardrobe is the clearest
case: the user may rarely update inventory, but frequently wants to ask what to
wear, compare outfits, or plan packing.

If the Topics tab only exposes app launch icons, topic-first tasks become
unnecessarily indirect. If each plugin has two or three permanent mini buttons,
the page becomes visually cluttered and feels like an internal control panel.

The hub should make concrete tasks directly reachable while keeping a uniform
primary action.

## Information Architecture

The page is organized by capability groups, not by transport type.

Examples:

- Directory
- Finance
- Wardrobe
- Notes
- Email
- Health
- Automation

The root page has two visible layers:

1. A frequent quick-action area for the user's highest-value tasks.
2. A plugin desktop grid for all available plugins and built-in apps.

The quick-action area is task-first. On phone and touch-tablet shells it should
prefer readable two-column action rows over squeezing more columns into the
first viewport. It may show roughly 8-20 entries, but row count is secondary to
keeping mixed Chinese labels and source badges readable. It solves the daily
"do the thing now" path.

The plugin desktop grid is app-first. It uses icon ordering similar to a phone
home screen. It solves browseability, visual identity, plugin launch, manual
ordering, and long-press access to less frequent plugin-specific actions.

Directory remains a built-in capability rather than an iframe plugin, but it
should follow the same entry pattern where possible: the Directory icon opens
Directory, while quick actions expose recent directories, directory-bound
topics, or create/bind actions.

## Interaction Contract

Primary behavior:

- tapping a plugin icon opens the plugin app;
- tapping a built-in Directory icon opens Directory;
- the primary action must not vary per plugin.

Quick action behavior:

- quick actions are task-level entries, not generic transport labels;
- a quick action may start a plugin topic, open a plugin app route, open a file
  directory, invoke an MCP intent through Home AI, open a compact host-owned
  form, or start a chat with prefilled plugin context;
- visible quick actions should be limited to the highest-value actions for the
  current user and viewport;
- lower-frequency actions should move into an overflow menu rather than adding
  extra permanent buttons.
- quick actions may include a small plugin-source badge when the action name
  alone is ambiguous across plugins. The badge is a source hint only; it is not
  a second click target.

Long-press behavior:

- long-pressing or context-clicking a plugin icon opens a compact plugin action
  menu;
- the menu should use task labels such as "Style me", "Record", "Inventory",
  or "Budget" rather than generic transport labels as the primary wording;
- the menu may include "Open app" as the stable primary/fallback action;
- plugin management and destructive actions belong in plugin management
  screens, not in the daily-use long-press menu.

Examples:

- Finance: "Record", "This month", "Dining", "Budget".
- Wardrobe: "Style me", "Today", "Add item", "Inventory".
- Notes: "New note", "Search", "Recent", "Link topic".
- Directory: "Recent", "File topics", "New topic".

The labels above are conceptual. User-facing Chinese copy should be finalized
in the implementation pass.

## Quick Action Types

The host should treat quick actions as typed entries instead of hard-coded UI
buttons:

```text
open_plugin_route
open_topic
open_directory
invoke_mcp_intent
open_quick_form
start_chat_with_context
```

`open_plugin_route` opens the embedded app at a plugin-declared route.

`open_topic` enters a fixed plugin or directory-bound topic.

`open_directory` opens a workspace-local directory or plugin file directory.

`invoke_mcp_intent` starts a server-mediated Home AI action that may call the
plugin MCP/toolset after the normal workspace authorization and capability
activation checks.

`open_quick_form` opens a compact host-owned form when the action is simple
enough to collect structured input without loading the full plugin app.

`start_chat_with_context` opens chat with a bounded plugin/topic context and an
optional starter intent.

Raw access keys, launch tokens, private plugin rows, note bodies, ledger rows,
inventories, and full MCP schema JSON must not be embedded in quick action
metadata.

## Ordering And Personalization

Quick action ordering may be personalized, but it should not create unstable
layout jumps.

Recommended ordering inputs:

- plugin-declared default order;
- workspace-level pinning;
- user-level recent usage;
- action success frequency;
- viewport capacity.

The first implementation can use plugin-declared order plus explicit pinned
actions. Later versions may promote frequently used actions, but the UI should
apply stable ordering within a session and avoid reshuffling while the user is
looking at the page.

## Visual Direction

Use a task-first quick-action grid plus a phone-home-screen-like plugin desktop
grid. Avoid a long list of plugin rows as the default root layout.

Recommended mobile layout:

- section label "Frequent" / "Plugins" in user-facing Chinese copy;
- frequent actions as compact two-column chips or tiles, with labels readable
  before row count is optimized;
- each quick action has an action icon, label, and optional low-noise source
  badge such as a single character or tiny icon;
- plugin desktop uses larger icons and short labels;
- long-press opens a compact context menu near the icon or as a bottom anchored
  sheet on small screens;
- no nested cards;
- no two-button stack below every icon;
- no separate bottom plugin Dock competing with the main bottom navigation.

Recommended touch-tablet layout:

- keep the same row contract;
- allow wider quick action rows, but do not reintroduce cramped three-column
  phone-style rows unless visual smoke evidence proves labels and badges remain
  fully readable;
- keep long-press menus above the bottom navigation even when the quick-action
  area grows vertically.

## Relationship To Existing Plugin Topics

This design supersedes the current topic-page plugin Dock concept as a product
direction, but it does not immediately change runtime behavior.

The existing plugin-context navigation remains valid after a plugin app is
opened: the plugin app can still expose the three-entry context footer for
topic, plugin, and directory while in plugin context.

The hub changes the root Topics tab entry model:

- root Topics tab shows frequent quick actions and a plugin desktop;
- plugin icon opens the plugin app;
- quick actions provide direct task-specific routes;
- plugin topic and directory routes are reachable as quick actions, not as
  generic mini buttons attached to every icon.

The first implementation may map quick actions onto existing reliable host
routes: plugin app launch, plugin topic chat, plugin delivery directory, and
Directory app/topic entry. True host-owned quick forms and direct MCP intent
invocation are a later H1 extension because they introduce write flows,
permission gates, server-side action execution, and readback requirements.

## Validation Expectations

When implemented, the change is H1/H2 mobile UI and navigation work. It needs a
focused navigation harness before it is considered complete.

Minimum validation:

- unit/static UI tests for action projection and primary action consistency;
- unit/static UI tests for the frequent quick-action grid, source badges,
  plugin desktop grid, and long-press/context menu contract;
- mobile visual smoke at `390x844`;
- touch-tablet visual smoke at `1024x768` or equivalent;
- evidence that quick action rows do not squeeze phone layouts into unreadable
  three-column buttons;
- authenticated navigation flow harness covering plugin app launch, quick
  topic entry, quick directory entry, and return behavior;
- evidence that quick action rows do not overlap the bottom navigation,
  composer, or plugin-context footer;
- evidence that action metadata does not expose secrets or raw private plugin
  data.
