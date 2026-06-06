# Capability Entry Hub Design

Last updated: 2026-06-06.

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

The root page has three visible layers:

1. A frequent quick-action area for the user's highest-value tasks.
2. Directory-bound topic collections in the normal page scroll.
3. A fixed bottom capability icon Dock for all available app-level
   capabilities, including built-in Directory and external plugins.

The quick-action area is task-first. On phone and touch-tablet shells it should
prefer readable two-column action rows over squeezing more columns into the
first viewport. The current mobile target is four rows, or eight entries, so
the area remains an entry strip rather than a second app launcher. It solves the
daily "do the thing now" path.

The fixed bottom capability Dock is app-first. It uses the existing topic-page
icon form instead of placing app icons in the middle of the page. It solves
browseability, visual identity, plugin launch, Directory launch, and manual
ordering while keeping Directory-bound topics visible in the page body. The
current layout fits up to six capability icons in one visible row; additional
icons may scroll horizontally.

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

- long-pressing or context-clicking a plugin or built-in Directory icon opens a
  compact capability action menu;
- mobile validation must exercise the real touch long-press path
  (`touchstart` held past the Dock hold threshold, then `touchend`), not only a
  synthetic `contextmenu` event; iOS/PWA can cancel or divert native long-press
  behavior unless the icon disables WebKit touch callout;
- the menu should use task labels such as "Style me", "Record", "Inventory",
  or "Budget" rather than generic transport labels as the primary wording;
- the menu may include "Open app" as the stable primary/fallback action;
- Dock ordering belongs in the same action menu through bounded move controls;
  the daily long-press gesture must not be consumed by drag sorting when a menu
  is available;
- an open capability action menu must be reversible without choosing an action:
  tapping or clicking any non-menu area closes it, `Escape` closes it, and a
  right-swipe gesture closes it on touch surfaces;
- plugin management and destructive actions belong in plugin management
  screens, not in the daily-use long-press menu.

Current iOS Simulator proof, 2026-06-06:

- on Mac production `20260606-plugin-origin-allow-v575`, the Directory Dock
  button receives real `mobile: touchAndHold` input and opens the menu in DOM;
- `elementFromPoint` at the menu center returns the menu's own child nodes, so
  web hit testing believes the menu is topmost;
- Appium and native `simctl` screenshots show no visible menu for the baseline
  `position: fixed` menu inside the fixed Dock, and pixel comparison shows
  `0` changed pixels inside the translated expected menu rectangle;
- a harness-only `dock-absolute` variant makes the same menu visible and
  changes about `98.65%` of the expected menu rectangle pixels.

Design consequence: do not treat this incident as a missing long-press binding
or missing Directory capability. The production fix should avoid an iOS visual
path where a fixed menu lives inside the fixed Dock subtree. Prefer either an
absolute Dock overlay with visible overflow or a body-level menu portal, then
rerun the baseline iOS long-press proof without the variant.

Implemented fix, 2026-06-06:

- `20260606-dock-menu-absolute-v576` uses an absolute Dock overlay for the
  bottom capability menu and marks the open Dock scope with
  `capability-menu-open`;
- Dock, launcher, and strip overflow become visible only while the menu is
  open, preserving normal horizontal Dock scrolling when menus are closed;
- the baseline iOS Simulator proof now shows the Directory menu in Appium and
  native `simctl` screenshots, with about `98.65%` changed pixels in the
  expected menu rectangle.
- `20260606-topic-ui-polish-v579` keeps the same absolute Dock menu and adds
  non-menu pointer/tap dismissal plus right-swipe dismissal. It also removes
  the root "Capability" header from the page body so the first visible heading
  is the frequent action group, not an extra page label.
- `20260606-topic-menu-pointer-v582` adds a pointer-based right-swipe fallback
  for the menu itself so the dismissal path works on iOS/Appium and browser
  touch/pointer harnesses.
- `20260606-topic-label-trim-v583` removes both visible root labels from the
  hub body: no standalone "Capability" title and no standalone frequent-action
  title. The first visible content is the quick-action grid itself.
- `20260606-system-file-icon-v585` changes the built-in Directory Dock icon to
  a system Files-style visual: a white rounded-square app icon with a larger
  blue folder mark. This keeps Directory at the same app-icon visual weight as
  plugin icons instead of rendering it as a standalone small folder glyph.
- `20260606-centered-file-icon-v586` adjusts the Files-style Directory icon
  composition by moving the blue folder mark toward the center of the white
  tile and increasing its fill area. The visual target is a centered system
  Files-like mark with balanced white padding rather than top-heavy whitespace.
- `20260606-directory-dock-consistent-v587` replaces that standalone
  system-style tile with a Dock-consistent plugin app icon: the same rounded
  gradient tile language as Finance/Wardrobe/Email/Health/Note, with a white
  folder glyph for Directory identity. It also applies `projects` view mode
  immediately when the Directory Dock icon is tapped so the topic Dock reserve
  is removed before Directory data finishes loading.

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

Use a task-first quick-action grid plus the existing topic-page fixed bottom
plugin Dock. Avoid a long list of plugin rows or a mid-page plugin icon desktop
as the default root layout.

Recommended mobile layout:

- no visible title is needed above the frequent action strip; the top of the
  page should start directly with the quick actions to save phone viewport
  space;
- frequent actions as compact two-column chips or tiles, with labels readable
  across four rows before row count is optimized;
- each quick action has an action icon, label, and optional low-noise source
  badge such as a single character or tiny icon;
- plugin and Directory icons stay in the fixed bottom Dock above the primary
  bottom navigation, matching the previous topic-page icon form;
- no nested cards;
- no two-button stack below every icon;
- no mid-page plugin icon grid competing with Directory-bound topic content.

Recommended touch-tablet layout:

- keep the same row contract;
- allow wider quick action rows, but do not reintroduce cramped three-column
  phone-style rows unless visual smoke evidence proves labels and badges remain
  fully readable;
- keep long-press menus above the bottom navigation even when the quick-action
  area grows vertically.

## Relationship To Existing Plugin Topics

This design evolves the current topic-page plugin Dock rather than replacing it:
the Dock remains the fixed app-launch layer, while the page body becomes a
capability and Directory-bound topic surface.

The existing plugin-context navigation remains valid after a plugin app is
opened: the plugin app can still expose the three-entry context footer for
topic, plugin, and directory while in plugin context.

The hub changes the root Topics tab entry model:

- root Topics tab shows frequent quick actions followed by Directory-bound
  topic collections;
- root Topics tab keeps plugin and Directory icons in the fixed bottom Dock;
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
- unit/static UI tests for the frequent quick-action grid, source badges, fixed
  bottom plugin Dock, and primary action consistency;
- mobile visual smoke at `390x844`;
- touch-tablet visual smoke at `1024x768` or equivalent;
- evidence that quick action rows do not squeeze phone layouts into unreadable
  three-column buttons;
- authenticated navigation flow harness covering plugin app launch, quick
  topic entry, quick directory entry, and return behavior;
- evidence that quick action rows and Directory-bound topic rows do not overlap
  the fixed plugin Dock, bottom navigation, composer, or plugin-context footer;
- evidence that the bottom Dock includes Directory when available, opens its
  touch long-press/context menu, reports the gesture used by the harness, and
  keeps the menu above both the Dock and primary bottom navigation;
- evidence that action metadata does not expose secrets or raw private plugin
  data.
