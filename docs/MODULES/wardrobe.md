# Wardrobe Plugin

Last updated: 2026-05-29.

This module describes the Hermes Mobile Wardrobe entry. The Wardrobe tab is a
plugin host for the Wardrobe project's embedded app plus model-started
Wardrobe MCP tasks. It is not a second Wardrobe app and it must not call the
Wardrobe Program API or a local MCP dashboard route as an automatic fallback.

## Source Of Truth

- Product behavior and available functions come from the Wardrobe project docs
  and plugin manifest, not from reading or copying Wardrobe implementation code.
- Hermes Mobile treats the Wardrobe project as a mounted plugin plus MCP
  capability.
- The tab UI is owned by the Wardrobe plugin. Hermes Mobile loads the registered
  embedded-app manifest and either shows the plugin iframe or a bounded
  plugin-registration diagnostic.
- When Wardrobe plugin/MCP is unavailable or not authorized, the UI fails closed
  and explains the missing plugin/toolset instead of silently switching to
  direct Program API calls or a local MCP overview.

## Frontend Entry

- Bottom tab id: `bottomWardrobeMode`
- Route aliases: `view=wardrobe`, `view=closet`, `view=outfit`
- Main frontend file: `public/app-wardrobe-ui.js`
- Plugin manifest route: `GET /api/hermes-plugins/wardrobe/manifest`
- Plugin service: `adapters/hermes-plugin-service.js`
- Static shell files: `public/index.html`, `public/service-worker.js`
- Focused tests: `node tests\hermes-plugin-service.test.js`,
  `node tests\hermes-plugin-api-routes.test.js`,
  `node tests\app-wardrobe-ui.test.js`, `node tests\task-list-ui.test.js`,
  `node tests\api-route-inventory.test.js`,
  `node tests\mobile-api-dispatcher.test.js`.

The tab is hidden by default and becomes visible only when the current
workspace/project tree exposes a wardrobe/closet directory route or an
authorized `wardrobe` toolset signal. That signal only controls whether the
app-level tab is relevant; the actual page content must come from the plugin
manifest.

## Plugin Host

Hermes Mobile must not replicate the Wardrobe app UI or business workflows
inside this repository. The durable direction is a generic plugin host:

- the Wardrobe project owns its UI, API, database, and MCP wrapper;
- the Wardrobe project exports a `hermes-plugin/manifest.json` with plugin id,
  title, embedded entry URL, required toolsets, owner/workspace policy, and
  permissions;
- Hermes Mobile loads that manifest, adds a tab, and embeds the Wardrobe page
  in the same window as an `embedded-app` plugin;
- the embedded page receives only a short-lived signed embed token and
  workspace context, never a raw Wardrobe key in the URL;
- navigation, back behavior, and file previews remain inside the Hermes Mobile
  window through an iframe/postMessage contract;
- model-side write/readback tasks continue to use Wardrobe MCP tools, while the
  embedded UI is for human operation.

The old native MCP overview fallback has been removed. If the plugin manifest
is unavailable, mixed-content blocked, or blocked by `frame-ancestors`, Hermes
Mobile shows a compact diagnostic and a retry action. It must not call a local
`/api/wardrobe/overview` route, launch the MCP stdio wrapper from the tab, or
render a partial dashboard.

Current NAS registration:

- Default manifest URL:
  `http://192.168.10.99:8765/api/v1/hermes/plugin/manifest`
- Production HTTPS PWA deployments should override the manifest URL with an
  HTTPS endpoint through environment configuration. An HTTPS Hermes page must
  not iframe an HTTP plugin entry; Chromium blocks that as mixed content and the
  visible symptom is a blank embedded frame.
- Override environment variables:
  `HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL` or
  `HERMES_MOBILE_PLUGIN_WARDROBE_MANIFEST_URL`

`GET /api/hermes-plugins/wardrobe/manifest` fetches and normalizes the live
manifest for the authenticated workspace. The frontend renders this embedded
plugin when available. The normalized response intentionally omits raw
access-key material and exposes only bounded manifest metadata, entry URL,
toolset requirements, and registration paths.

If the manifest declares `program_api.plugin_launch`, Hermes Mobile must launch
the iframe through the server-side short-token exchange:

- locate the current workspace's local `.hermes-wardrobe/access-key.txt`;
- call `POST /api/v1/hermes/plugin/launch` with `Authorization: Bearer <local
  workspace key>` and body `{ "workspace_id": "<current workspace>" }`;
- replace the iframe entry URL with the returned `entry_path`;
- expose only the short launch URL and bounded token status to the browser.

The long-lived workspace Access Key must never be sent to frontend JavaScript,
iframe URLs, docs, handoffs, screenshots, or logs. If launch fails or the local
key file is missing, the tab should show a plugin diagnostic instead of falling
back to username/password login or a local MCP overview.

If the frontend receives an HTTP plugin entry while the Hermes page is HTTPS,
it must not render a blank iframe or open a browser window. It should show a
compact diagnostic notice. Deployment validation for embedded plugins must not
stop at the manifest API. It must include installed-PWA smoke on the target
browser class:

- Android Chrome PWA for general embedded-frame rendering.
- iOS Safari installed PWA for cookie/session behavior, because iOS WebKit can
  block cross-origin iframe session cookies even when the server-side launch
  token and first-party HTTP flow both succeed.

The pass condition is real embedded content or the expected plugin diagnostic,
not a username/password login screen. If the iOS PWA shows a login screen and
valid credentials flash back to login without reducing the retry counter, treat
that as an embedded session persistence failure rather than a password error.
Launch-token URLs are short-lived and may be one-time use. The frontend must
not cache and rebuild an iframe from a consumed launch URL during ordinary view
rerenders; when the Wardrobe tab needs a new frame and the previous token is no
longer fresh, it must fetch a new manifest/launch URL first.

The embedded plugin must preserve its iframe node after the first successful
load. Switching from Wardrobe to another Hermes tab may park the iframe in a
hidden host, but it must not destroy and recreate it unless the entry URL
changes or a fresh launch URL is required. This keeps the Wardrobe SPA route,
scroll position, and plugin session stable across ordinary bottom-tab changes.

The Wardrobe project owns internal navigation and reports it through the
postMessage contract declared by the live manifest:

- Wardrobe sends `wardrobe.plugin.navigation` with `canGoBack` and bounded route
  metadata.
- Hermes Mobile validates the message origin against the plugin entry origin.
- When `canGoBack=true`, Hermes Mobile exposes its normal top-left/back-swipe
  affordance and sends `hermes.plugin.back` to the iframe.
- Wardrobe handles the back action inside the iframe and sends a new
  navigation-state message after the route changes.

Hermes Mobile must not inspect Wardrobe DOM, call Wardrobe route functions
directly, or use browser-window navigation for plugin secondary pages.

The manifest route should also probe the plugin entry response for
`Content-Security-Policy: frame-ancestors`. If the plugin service has not
allowed the current Hermes origin, the route should return a blocked embed
diagnostic so the frontend can show a clear plugin setup error instead of a
Chrome broken-frame icon. The proper long-term fix is to configure the plugin
service to allow the deployed Hermes origin; Hermes Mobile must not hide that
as a successful embedded plugin load.

## Tooling Contract

- Broad aggregate, dashboard, ranking, photo-health, or data-quality questions
  should use `wardrobe.stats_*` MCP tools instead of pulling all items and
  manually summarizing them.
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

The Wardrobe plugin shell and `GET /api/hermes-plugins/wardrobe/manifest`
normalization are listener/static scope and require focused plugin service/API
tests plus frontend shell tests. Gateway registration, MCP profile changes, or
policy/toolset routing changes are not listener-only and must use the
Gateway/toolset harnesses in `docs\TEST_MATRIX.md`.
