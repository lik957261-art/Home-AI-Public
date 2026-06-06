# Wardrobe Plugin

Last updated: 2026-06-04.

This module describes the Hermes Mobile Wardrobe entry. The generic embedded
plugin host contract is defined in `docs/MODULES/plugins.md`; this file records
Wardrobe-specific manifest, toolset, and deployment details. The Wardrobe tab is
a plugin host for the Wardrobe project's embedded app plus model-started
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
  `node tests\app-wardrobe-ui.test.js`,
  `node tests\wardrobe-plugin-navigation-ui.test.js`,
  `node tests\task-list-ui.test.js`,
  `node tests\api-route-inventory.test.js`,
  `node tests\mobile-api-dispatcher.test.js`.

The tab is hidden by default and becomes visible from the same workspace plugin
list projection used by manifest and launch. Owner sees Wardrobe by default only
while the effective workspace is `owner`; when an Owner-authenticated browser
switches to a non-Owner workspace, the bottom tab must appear only after
`GET /api/hermes-plugins?workspaceId=<workspace>` includes `wardrobe`. Directory
or toolset signals may still help model-side Wardrobe routing, but they must not
make an unauthorized non-Owner plugin tab visible. The actual page content must
come from the plugin manifest.

Wardrobe model/tool routing is broader than the tab-visibility rule. If a
thread/project/plugin context or recent same-topic messages clearly indicate a
wardrobe/closet/outfit task, Hermes Mobile should suggest authorized
`wardrobe`, `vision`, `file`, and `skills` even when the latest message is
short and there is no active directory binding on that turn. When model-first
toolset selection is disabled, that suggestion is telemetry only and execution
continues with the full authorized route/access toolset set.
For outfit recommendation turns such as "配一套衣服", "穿什么", or "穿搭建议",
the route should also suggest authorized `weather` so the model can check the
current forecast before recommending a set. General `web`/`search` remains an
explicit-intent suggestion; with the selector disabled, ordinary authorized
`web`/`search` can still be available to execution through the full authorized
policy.

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

Current registration and production upstream rules:

- Historical/default fallback manifest URL:
  `http://127.0.0.1:8765/api/v1/hermes/plugin/manifest`
- Mac production must not rely on that fallback. The Mac listener launchd
  environment must explicitly set
  `HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL` and
  `HERMES_MOBILE_PLUGIN_WARDROBE_MANIFEST_URL` to
  `http://127.0.0.1:8765/api/v1/hermes/plugin/manifest`, because the Mac
  plugin service runs as `com.hermesmobile.plugin.wardrobe` on loopback.
- Mac workspace-local `.hermes-wardrobe/config.json` files must also use
  `api_base_url: "http://127.0.0.1:8765"`. The access key must be a Wardrobe
  Program API key accepted by the Mac Wardrobe SQLite `api_tokens` table; a
  key that works against the old NAS/Windows service is not valid Mac evidence.
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
  workspace key>` and body containing the Wardrobe workspace id from
  `.hermes-wardrobe/config.json`, for example
  `{ "workspace_id": "wardrobe:<hermes_workspace_id>",
  "hermes_workspace_id": "<current workspace>" }`;
- replace the iframe entry URL with the returned `entry_path`;
- expose only the short launch URL and bounded token status to the browser.

The long-lived workspace Access Key must never be sent to frontend JavaScript,
iframe URLs, docs, handoffs, screenshots, or logs. If launch fails or the local
key file is missing, the tab should show a plugin diagnostic instead of falling
back to username/password login or a local MCP overview.

Mac production has a focused smoke for this exact binding class:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-wardrobe-binding-production-smoke.js \
  --root /Users/hermes-host/HermesMobile \
  --base http://127.0.0.1:8797 \
  --json
```

Passing output must show no live drive `.hermes-wardrobe/config.json` with the
legacy `127.0.0.1:8765` origin, Home manifest
`programApi.origin="http://127.0.0.1:8765"`, `tokenStatus="launch_token_issued"`,
a nonblank proxied entry response, and a positive bounded bootstrap
`item_count` for the launched workspace. This smoke prints only metadata; it
must not print raw keys, launch tokens, or item details.

The same binding class can recur in local Windows production after a one-time
Mac/NAS/Windows data migration. Use the same checked smoke with Windows paths:

```powershell
node scripts\macos-wardrobe-binding-production-smoke.js `
  --root C:/ProgramData/HermesMobile `
  --base http://127.0.0.1:8797 `
  --access-key-file <owner-web-key-file> `
  --workspace owner `
  --workspace weixin_wuping `
  --json
```

A passing local result must also show no `127.0.0.1:8765` legacy origin in
workspace-local `.hermes-wardrobe/config.json` files, a loopback
`programApi.origin`, a launch token status, nonblank proxied plugin HTML, and
positive bootstrap counts for the relevant workspaces. If only the nested
binding files are stale while the manifest/proxy smoke is healthy, repair the
local config origin only and preserve existing workspace ids and key material.

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

## Workspace Provisioning

Opening Wardrobe for a non-Owner workspace is not a manual copy operation.
Hermes Mobile owns the provisioner behind the plugin-manager action
`Enable Wardrobe for user`:

- create a stable Wardrobe workspace id such as
  `wardrobe:<hermes_workspace_id>` instead of reusing XuXin/WuPing bindings;
- generate a workspace-local raw Access Key and write it only to
  `<HERMES_DATA_DIR>\drive\users\<workspaceId>\.hermes-wardrobe\access-key.txt`;
  the generated key must use the Wardrobe Program API token prefix, currently
  `wd_live_`, not a Hermes-only placeholder prefix;
- write non-secret
  `<HERMES_DATA_DIR>\drive\users\<workspaceId>\.hermes-wardrobe\config.json`
  with `api_base_url`, `workspace_id`, `hermes_workspace_id`, owner/display
  metadata, cache directories, and scopes;
- call Wardrobe `POST /api/v1/hermes/plugin/workspaces` with owner,
  `workspace_id`, the one-time workspace `access_key`, key hash metadata, and scopes
  `items:read`, `items:write`, `history:write`, `sync:read`;
- authenticate that registration call with a server-side Wardrobe credential
  carrying `owners:write` or `admin:*`. Hermes Mobile reads this credential
  from `HERMES_MOBILE_WARDROBE_REGISTRATION_ACCESS_KEY_PATH`, then from
  `<HERMES_DATA_DIR>\plugin-secrets\wardrobe-registration-access-key.txt`, and
  only falls back to an Owner Wardrobe key when that key actually has the
  registration scope;
- install the complete keyless `productivity/wardrobe-style-operations` Skill
  bundle into that workspace's own Skill Store. The bundle must include the
  full `SKILL.md`, `references/wardrobe-program-api.md`, at least one other
  reference Markdown file, and `scripts/render_wardrobe_phone_pdf.py`. A short
  minimal template is not a valid Wardrobe onboarding result;
- refresh the workspace Gateway profile binding. Existing Gateway processes may
  need a selected-profile restart before they expose the new Wardrobe MCP
  schema; listener-only restart is not enough for already-running workers.

The provisioner must mark the plugin authorization record `active` only after
key/config creation, Wardrobe registration, Skill install, Gateway profile
binding, and local verification pass. Any failure remains visible as
`provisioning_failed`; the tab must not pretend the plugin is usable and then
fall through to `plugin_launch_key_missing`.

The provisioner must not copy an existing XuXin or WuPing `.hermes-wardrobe`
directory. Wardrobe data remains in the Wardrobe SQLite store and is isolated by
owner plus workspace/access-key binding, not by creating a separate database per
Hermes user.

The provisioner may copy only the non-secret Skill bundle content. It must not
copy any user's `.hermes-wardrobe` directory, `access-key.txt`,
`workspace-key.txt`, cache directories, or generated Python cache files into the
target Skill Store. If the available Skill source lacks `references/` or the
required script, or if it contains a concrete Wardrobe workspace key, plugin
launch token, or `Authorization: Bearer ...` credential, provisioning must fail
as `provisioning_failed` instead of installing a fallback short template.

The target workspace Access Key may appear only inside the server-to-server
Wardrobe registration request and the target workspace's local
`.hermes-wardrobe/access-key.txt`. It must not be returned from the grant API,
stored in `plugin-workspace-authorizations.json`, embedded in iframe URLs,
postMessage payloads, docs, handoffs, screenshots, or model-visible receipts.

The embedded plugin must preserve its iframe node after the first successful
load. Switching from Wardrobe to another Hermes tab must hide a persistent host
rather than moving the iframe between containers. Moving the iframe can cause
iOS WebKit installed PWAs to reload the iframe from its original `src`, which is
unsafe when that `src` contains a one-time launch URL. Hermes should destroy and
recreate the iframe only when the entry URL changes or a fresh launch URL is
required. This keeps the Wardrobe SPA route, scroll position, and plugin session
stable across ordinary bottom-tab changes.
The Wardrobe tab must also avoid intermediate Hermes-owned loading pages during
normal plugin startup. While the manifest or fresh launch URL is loading, Hermes
shows the clean plugin host surface without text, cards, or preflight prompts;
only real plugin diagnostics should render explanatory UI. The clean host
surface must inherit the current Hermes theme from `data-theme`: light/system
light uses the normal light page background, and dark/system dark uses the dark
page background. The Wardrobe iframe remains visually hidden behind that
theme-colored shell until the iframe `load` event so browser `about:blank` does
not flash white during dark-mode plugin startup.
Because the iframe element's `src` can still contain a one-time `launch` URL,
Hermes Mobile treats a launch iframe as healthy only after the embedded app
sends `wardrobe.plugin.navigation`. If a launch iframe loads and no navigation
state arrives shortly after, Hermes discards that iframe and requests a fresh
manifest/launch URL instead of leaving the user on an `invalid_launch_token`
page.

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
  `wardrobe`, `vision`, and `file` in the suggested set when those toolsets are
  already authorized by policy.
- Fixed Wardrobe topic runs (`plugin:wardrobe`) are stronger than a suggestion:
  execution must require `wardrobe`, `vision`, `file`, and `skills`, and the
  instruction context must include a server-side preload of exact Skill path
  `productivity/wardrobe-style-operations`. This preload reads the selected
  workspace Skill Store before model execution, so Wardrobe topic quality does
  not depend on the model voluntarily calling `skill_view` first.
- Wardrobe topic delivery directories are output/receipt locations only. They
  must not be treated as the Wardrobe database and must not trigger the ordinary
  directory-topic `productivity/directory-context-cleaning` workflow for routine
  outfit, item lookup, or styling tasks.
- For concrete item facts, materials, colors, ownership state, outfit history,
  and image-backed checks, the model must use Wardrobe MCP callables and the
  Wardrobe Skill rules first. If the required Skill or `mcp_wardrobe_*`
  callables are absent despite required routing, the correct result is a
  schema/profile mismatch diagnostic, not a guessed fashion answer.
- Markdown/file receipts require `file` to remain available for the execution
  round when the workspace policy authorizes it.
- The selector may narrow callable tools only when explicitly enabled. If it is
  enabled, it must not split an authorized Wardrobe companion set in a way that
  forces an avoidable toolset-escalation retry. If it is disabled, execution
  uses the full authorized route/access toolset set and the Wardrobe companion
  set remains a suggestion only.
- The execution-round Gateway conversation key must vary with the final enabled
  toolset signature. A Wardrobe run must not reuse a worker-side conversation
  that was created for a narrower file-only schema, because that can leave the
  model without `mcp_wardrobe_*` callables even while Mobile correctly reports
  `Enabled toolsets: wardrobe, vision, file`.

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
