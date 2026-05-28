# Wardrobe MCP

Last updated: 2026-05-28.

This module describes the Hermes Mobile Wardrobe entry. It is a Mobile shell
surface for deterministic Wardrobe MCP stats plus model-started Wardrobe tasks.
It is not a second Wardrobe app and it must not call the Wardrobe Program API
directly as an automatic fallback.

## Source Of Truth

- Product behavior and available functions come from the Wardrobe project docs,
  not from reading or copying Wardrobe implementation code.
- Hermes Mobile should treat the Wardrobe project as a mounted MCP capability.
- The tab dashboard reads Wardrobe MCP stats tools directly from the backend.
  Hermes Mobile must not read `.hermes-cache` resources itself or return a
  cache-not-found unavailable state; cache refresh belongs to Wardrobe MCP.
- When Wardrobe MCP is unavailable or not authorized, the UI should fail closed
  and explain the missing route/toolset instead of silently switching to direct
  Program API calls.

## Frontend Entry

- Bottom tab id: `bottomWardrobeMode`
- Route aliases: `view=wardrobe`, `view=closet`, `view=outfit`
- Main frontend file: `public/app-wardrobe-ui.js`
- Plugin manifest route: `GET /api/hermes-plugins/wardrobe/manifest`
- Backend route: `GET /api/wardrobe/overview`
- Plugin service: `adapters/hermes-plugin-service.js`
- Backend service: `adapters/wardrobe-projection-service.js`
- Static shell files: `public/index.html`, `public/service-worker.js`
- Focused tests: `node tests\hermes-plugin-service.test.js`,
  `node tests\hermes-plugin-api-routes.test.js`,
  `node tests\wardrobe-projection-service.test.js`,
  `node tests\wardrobe-api-routes.test.js`,
  `node tests\app-wardrobe-ui.test.js`, `node tests\task-list-ui.test.js`

The tab is hidden by default and becomes visible only when the current
workspace/project tree exposes a wardrobe/closet directory route or an
authorized `wardrobe` toolset signal. Binding the deterministic dashboard root
must prefer a directory that contains `.hermes-wardrobe/config.json`. Generic
outfit/delivery folders such as `穿搭建议` or child folders such as `衣橱/交付`
must not become the dashboard `--workspace` just because their full path includes
the parent wardrobe directory name.

## Deterministic Dashboard

The Wardrobe tab homepage is not a model run. It calls
`GET /api/wardrobe/overview`, and the backend launches the installed Wardrobe
MCP stdio wrapper with the selected wardrobe directory as `--workspace`.

The backend calls these bounded stats tools:

- `wardrobe.stats_overview`
- `wardrobe.stats_inventory`
- `wardrobe.stats_watch`
- `wardrobe.stats_wear`
- `wardrobe.stats_featured_looks`
- `wardrobe.stats_history`
- `wardrobe.stats_maintenance`
- `wardrobe.stats_photos`
- `wardrobe.stats_data_quality`
- `wardrobe.search_items`

The route returns one compact entry overview:

- search query and brand filter state;
- count, average price, and total amount for the filtered wardrobe subset;
- brand distribution;
- recent wear history, maintenance, and data-quality summaries;
- a bounded item list from `wardrobe.search_items`.

The page header uses the shared centered Hermes root-page title. The content
area must not repeat `我的衣橱` or show the bound directory as a large hero
element. Root actions belong in the existing top-right three-dot menu, not in
the disabled Stop button or a custom action bar. The menu switches deterministic
sections: overview, watches, maintenance, wear, featured looks, and log. The
log section may include compact data-quality summaries, but photo management
and deeper data-quality repair belong to the Wardrobe app/plugin.

The tab must not show generic model task-launcher cards for recommendation,
search, writeback, or wear-history writeback. Search/list and aggregate
inspection are deterministic MCP projections. Write operations
(`wardrobe.write_item`, `wardrobe.upload_photo`, `wardrobe.set_primary_photo`,
and `wardrobe.write_history`) require explicit user action and must default to
dry-run unless a later product flow deliberately commits the write.

Currency totals are owned by Wardrobe MCP stats. Price parsing must handle
currency-prefixed strings such as `¥4,787`; otherwise totals and average price
are undercounted even when item counts are correct. Hermes Mobile should verify
the returned stats with a bounded aggregate smoke, not by dumping full inventory
rows into logs or docs.

## Plugin Host Direction

Hermes Mobile should not replicate the Wardrobe app UI or business workflows
inside this repository. The durable direction is a generic plugin host:

- the Wardrobe project owns its UI, API, database, and MCP wrapper;
- the Wardrobe project exports a `hermes-plugin/manifest.json` with plugin id,
  title, embedded entry URL, required toolsets, owner/workspace policy, and
  permissions;
- Hermes Mobile loads that manifest, adds a tab, and embeds the Wardrobe page in
  the same window as an `embedded-app` plugin;
- the embedded page receives only a short-lived signed embed token and workspace
  context, never a raw Wardrobe key in the URL;
- navigation, back behavior, and file previews remain inside the Hermes Mobile
  window through an iframe/postMessage contract;
- model-side write/readback tasks continue to use Wardrobe MCP tools, while the
  embedded UI is for human operation.

The current native Wardrobe tab is therefore a bounded fallback/diagnostic
overview. It is useful for proving directory binding, MCP availability,
aggregate stats, and toolset routing, but it is not the place to rebuild
Wardrobe inventory detail pages, photo management, settings, import/export, or
other full Wardrobe app screens.

Current NAS registration:

- Default manifest URL:
  `http://192.168.10.99:8765/api/v1/hermes/plugin/manifest`
- Override environment variables:
  `HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL` or
  `HERMES_MOBILE_PLUGIN_WARDROBE_MANIFEST_URL`

`GET /api/hermes-plugins/wardrobe/manifest` fetches and normalizes the live
manifest for the authenticated workspace. The frontend prefers this embedded
plugin when available and falls back to the native MCP overview only when the
plugin manifest is unavailable. The normalized response intentionally omits raw
access-key material and exposes only bounded manifest metadata, entry URL,
toolset requirements, and registration paths.

## Tooling Contract

- Broad aggregate, dashboard, ranking, photo-health, or data-quality questions
  should use `wardrobe.stats_*` tools instead of pulling all items and manually
  summarizing them.
- Image-backed ingestion or verification should keep the companion set
  `wardrobe`, `vision`, and `file` available when those toolsets are already
  authorized by policy.
- Markdown/file receipts require `file` to remain available for the execution
  round when the workspace policy authorizes it.
- The selector may narrow callable tools, but it must not split an authorized
  Wardrobe companion set in a way that forces an avoidable toolset-escalation
  retry.

## Privacy And Safety

- Do not log raw access keys, MCP credentials, private image paths, or complete
  inventory dumps in docs, handoffs, or test fixtures.
- Do not read or write the Wardrobe SQLite database directly from Hermes Mobile.
- Do not read Wardrobe `.hermes-cache` JSON resources directly from Hermes
  Mobile. Use Wardrobe MCP stats tools so MCP can refresh stale or missing cache
  state through its own contract.
- Do not use direct Program API fallback for ordinary user tasks. Direct API
  access is reserved for explicit diagnostics or repair work and must be called
  out in the user-visible result.

## Deployment

The Wardrobe tab shell alone is static/frontend behavior. Adding or changing the
`/api/wardrobe/overview` backend route or MCP stdio invocation is listener-scope
and requires focused backend tests plus a listener restart on deployment.
Gateway registration, MCP profile changes, or policy/toolset routing changes
are not listener-only and must use the Gateway/toolset harnesses in
`docs\TEST_MATRIX.md`.
