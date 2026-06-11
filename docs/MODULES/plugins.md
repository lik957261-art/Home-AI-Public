# Embedded App Plugins

Last updated: 2026-06-09.

This module describes the Hermes Mobile embedded-app plugin contract. A plugin
is an external product surface mounted inside Hermes Mobile. Hermes owns the
host shell, auth boundary, manifest normalization, same-window navigation, and
model toolset routing. The plugin project owns its UI, API, database, business
logic, and MCP wrapper.

Wardrobe is the first production plugin. Codex Mobile Web is the second plugin
path and is integrated from the local Codex Git repo's Hermes plugin manifest.
Finance/记账 is the third embedded-app plugin. Email/邮箱 is the fourth
embedded-app plugin and uses the same generic host, launch, proxy, navigation,
refresh, appearance, and workspace provisioning contracts. Health, Note, and
Growth are standard workspace-private plugins. These rules are generic and
apply to future embedded apps such as watches, health, notes, growth, or other
private workspace tools.

The embedded UI layout contract is tracked separately in
`docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md`. Plugin projects must
follow that contract for iframe-root sizing, plugin-owned bottom navigation,
floating action buttons, local action bars, and device visual harnesses.
The Mac development-to-production deployment contract is tracked in
`docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`. All
embedded plugin projects must use the shared production access and deploy
boundary from that contract: plugin source changes are prepared in the Mac
development tree, production plugin directories are updated only through a
bounded deploy operation with backup, controlled sync, targeted restart, and
plugin-specific production validation, and plugin projects must not request
ordinary write access to `/Users/hermes-host/HermesMobile/plugins/<plugin>`.
Plugin Codex threads must read that central contract before production deploys
and should call the Home AI shared deploy script from
`/Users/hermes-dev/HermesMobileDev/app`, passing plugin-local facts such as
`--plugin`, `--source`, `--restart-label`, `--health-url`, MCP schema checks,
and data readback checks. The shared script also accepts `--plugin all` for a
bounded all-plugin deployment plan over the known service roots. A plugin-local
deployment script may wrap the central script, but must not introduce a separate sudo, rsync, SSH, or production write-access path.

Health/健康 is now an embedded-app plugin in the same workspace-private class as
Wardrobe, Finance, and Email. Hermes Mobile owns its host registration, manifest
normalization, same-origin proxy, plugin Dock entry, topic binding, and
workspace provisioning. The Health project owns the health UI, data model,
reports, API, and MCP wrapper. Health provisioning writes only workspace-local
Hermes files under `.hermes-health`: `access-key.txt` stores the raw key, while
`config.json` stores non-secret metadata such as `base_url` / `api_base_url`,
`workspace_id=health:<hermesWorkspaceId>`, `hermes_workspace_id`, display name,
and scopes. The Health registration request receives only the SHA-256
`access_key_hash`, never the raw key. Hermes sends the bare Hermes workspace id
in `workspace_id`, `target_workspace_id`, and `hermes_workspace_id` during
registration; Health stores and returns the canonical `health:<workspaceId>`
identity, and Hermes writes that canonical id into `.hermes-health/config.json`.
Health workspace registration must be authenticated with a server-side
registration credential. Hermes reads it from
`HERMES_MOBILE_HEALTH_PLUGIN_OWNER_KEY(_PATH)`,
`HERMES_MOBILE_PLUGIN_HEALTH_OWNER_KEY(_PATH)`, or the Health-side
`HEALTHY_REGISTRATION_KEY` / `HEALTHY_REGISTRATION_KEY_PATH` environment
contract. Missing or empty registration credentials must fail closed and block
the grant from becoming active; Hermes must not reuse the Owner web key, plugin
launch key, or workspace raw key for this registration credential. Health is
the standard fresh-install plugin enablement example: its manifest may be
installed and readable while no Hermes workspace, including Owner, is active
yet. Owner must explicitly open/provision Health before normal list, manifest,
launch, global Dock, or MCP projection treats it as usable.
Files generated under the user-facing `插件/健康` directory, including
Markdown summaries or pending JSON import payloads, are delivery-directory
context only. They are not evidence that the Health MCP database accepted a
write, and agents must label them as pending import unless the Health MCP/API
write path has returned a verified success for that workspace.

Note follows the same fresh-install and workspace-local provisioning model as
Health. Hermes Mobile owns manifest normalization, plugin Dock/topic projection,
same-origin launch/proxy, and the workspace provisioner. The Note project owns
the notes UI, bounded notes API, SQLite tables, attachment storage, and MCP
wrapper. Granting or opening Note writes only workspace-local Hermes files under
`.hermes-note`: `access-key.txt` stores the raw key and `config.json` stores
non-secret metadata such as `api_base_url`,
`workspace_id=note:<hermesWorkspaceId>`, `hermes_workspace_id`, display name,
scopes, and the relative key filename. Hermes calls Note's
`/api/v1/hermes/plugin/workspaces` registration endpoint with a server-side
registration credential from `HERMES_MOBILE_NOTE_PLUGIN_OWNER_KEY(_PATH)`,
`HERMES_MOBILE_PLUGIN_NOTE_OWNER_KEY(_PATH)`, or `NOTE_REGISTRATION_KEY(_PATH)`.
The registration body sends `access_key_hash` only; the raw workspace key must
not appear in manifest data, launch URLs, postMessage payloads, docs, logs, or
model context. Note's canonical plugin workspace id is
`note:<hermesWorkspaceId>`, and Hermes writes that canonical id into
`.hermes-note/config.json`.

Hermes Mobile can save an assistant chat receipt into Note through the host
route `POST /api/note/receipts`. The frontend sends only the current
`threadId`, `messageId`, and the message/topic owner Hermes `workspaceId`; the server reads
the authorized message from Hermes runtime state, resolves any message
artifacts through the existing artifact access boundary, and sends Note only a
compact title, body, and bounded base64 attachments via Note's
`POST /api/v1/notes` API. The default target notebook id for Hermes-generated
receipt notes is `hermes`. Receipt tags are derived server-side from the
authorized message context: plugin-bound topic receipts use the plugin's Chinese
category tag, such as `衣橱` for `plugin:wardrobe`, while ordinary non-plugin
chat receipts keep the fallback `hermes-receipt` tag. The chat footer action
keeps a message-level in-flight guard so repeated taps or rerenders do not
submit the same receipt twice while the first save is still running. Hermes must
not pass local file paths, private URLs, launch tokens, or raw access keys to
Note. The receipt target workspace is the authenticated/effective Hermes
workspace requested by the client, after `requireWorkspaceAccess()` clamps or
rejects it; it must not silently fall back to a thread's older workspace id
or the current Owner-selected workspace when the receipt message belongs to
another authorized workspace. Missing Note binding, key, or API-base errors
must be visible in the UI and may offer the Note install-request action instead
of failing silently. Note remains the owner of attachment storage, note rows,
and attachment asset indexing.

Note MCP uses the common single-prefix stdio contract. Gateway profiles may add
`mcp_servers.note`, `toolsets: [note]`, and
`platform_toolsets.api_server: [note]` only when the effective workspace has
both `.hermes-note/config.json` and `.hermes-note/access-key.txt`. The profile
launches the plugin-owned `note_mcp_stdio.py` with the target workspace root,
`--no-workspace-override`, and the deployment-specific Note API base. The Note
wrapper returns local tool names such as `notes_search`; Hermes Agent must
produce final callable names such as `mcp_note_notes_search` and
`mcp_note_notes_create`. A double-prefixed callable, a profile lacking Note
callables while policy says `note` is enabled, or an Owner fallback when viewing
a non-Owner workspace is a failing integration state.

Mac workspace plugin provisioning is generic for `.hermes-*` plugin bindings:
Health, Note, Growth, Wardrobe, Finance, Email, and future plugins must mirror complete
data-drive bindings into the worker-local `HermesWorkspace` before Gateway
profile rendering. Health was the first production symptom, but the rule is not
Health-specific.
For plugin-manager grants, `hermesPluginService.grantWorkspace` must complete
the plugin-side binding and then refresh the affected workspace Gateway
profiles before the grant becomes active. The refresh path must:

- refresh the workspace profile binding in the Gateway manifest;
- mirror complete `.hermes-*` data-drive bindings into the workspace OS user's
  local `HermesWorkspace`;
- render the selected Gateway profile configs and MCP server entries;
- kickstart the affected LaunchDaemon workers so the new schema is live; and
- mark the grant `provisioning_failed` with a bounded non-secret diagnostic if
  the refresh cannot run or fails.

Workspace onboarding may defer per-plugin Gateway refresh because it runs the
same restricted `ensure_launchd_services` step once after all selected plugin
grants. Standalone plugin-manager grants must not rely on a later manual Codex
repair; if Gateway refresh is required by the running platform and unavailable,
the plugin must not be shown as `active`.

For local Windows production, Note MCP calls originate from WSL Gateway workers.
The Note plugin service must listen on a Windows address reachable from WSL,
normally `0.0.0.0:4181`, and low Gateway profile generation should prefer the
WSL host gateway address such as `172.27.192.1` over LAN addresses for the Note
MCP API base URL. A profile can expose Note schemas while still timing out on
create/update if the wrapper points at Windows-only loopback or an unreachable
LAN address.

Finance uses the same workspace-local completeness rule for Hermes Mobile
projection. A `.hermes-finance/access-key.txt` without the sibling
`.hermes-finance/config.json` is a partial provisioning artifact, not an active
workspace binding. Hermes Mobile must not project that key-only state as an
installed/active workspace, and NAS deployment preflight must fail it as
`nas_finance_config_missing:<workspaceId>`. This prevents migrated or repaired
NAS environments from showing Finance as usable while Owner launch later fails
in manifest provisioning.

## Source Of Truth

- Plugin behavior comes from the plugin project's manifest and docs.
- Hermes Mobile must not copy plugin screens, detail pages, settings,
  import/export flows, or business workflows into this repository.
- Hermes Mobile may add a tab, iframe host, manifest route, launch-token
  exchange, diagnostics, and route/toolset projection.
- Model-side actions should use the plugin's MCP/toolset when the task requires
  model reasoning or write/readback verification. Human UI operation remains in
  the embedded app.
- Plugin-side MCP runtime, schema/toolset registration, plugin containers,
  plugin databases, and plugin-specific deploy scripts are owned by the plugin
  project. Hermes Mobile consumes registered toolsets through the selected
  Gateway/Hermes Agent profile; it does not vendor or maintain each plugin's MCP
  server implementation as host code.

## Model Capability Activation

Hermes Mobile distinguishes durable authorization from per-run prompt/schema
activation. The selected workspace profile should retain the full authorized
plugin capability set for that workspace, permission tier, and provider, but a
single model run should inject only the active schema set required for that run.
The authorized plugin toolset projection is workspace-local: Hermes Mobile uses
the effective workspace's `.hermes-*` binding files and plugin completeness
rules before it adds plugin toolsets to `allowed_toolsets`. Owner authentication
does not make Owner plugin bindings available while viewing another workspace,
and a partial key-only binding such as `.hermes-finance/access-key.txt` without
`config.json` is not treated as an active model capability.

The host builds a compact capability catalog for authorized plugins that are
not active in the current run. A catalog entry may name the plugin, the toolset,
the domain it can inspect, required Skill ids, activation hints, and bounded
availability state. It must not include full MCP schema JSON, full Skill bodies,
raw plugin data, access keys, launch tokens, plugin session cookies, private
inventories, ledger rows, note bodies, or local secret paths.

Plugin-bound topics are plugin-first. A run in `plugin:<id>` must eagerly load
that plugin's required MCP/toolset and required Skill rules from the effective
workspace Skill Store, or surface a bounded missing-capability diagnostic. Other
authorized plugins remain catalog-only until the run explicitly needs
cross-plugin access. A Wardrobe topic therefore starts with Wardrobe MCP and
`productivity/wardrobe-style-operations`, while Finance, Note, Health, Email,
Growth, and future plugins are represented by compact catalog hints until
activated.

Ordinary chat is catalog-first. It should include baseline Hermes chat
capabilities plus the effective workspace's compact plugin capability catalog.
It may eagerly activate a small bounded set of plugins when deterministic
signals are strong, such as a concrete plugin link, an active plugin context,
or explicit user wording. It must not load every plugin MCP schema simply
because the workspace is authorized for every plugin.

Cross-plugin access is a server-validated lazy activation, not a model-side
guess. Before adding an optional plugin MCP/Skill bundle to a run, Hermes must
validate workspace authorization, prove workspace-local config/key completeness
without exposing the key, and perform the same health/schema probe that the
Gateway will use. If activation fails for a requested plugin, Hermes must report
a bounded unavailable-plugin diagnostic instead of answering as if plugin data
was inspected. Optional plugin failure must not poison unrelated ordinary chats
or the current plugin's required bundle.

Current run assembly performs a selected-worker availability gate for optional
plugin activation. It prefers a worker that declares the optional plugin toolset
but does not hard-fail ordinary chat when none is available. If the selected
worker does not declare the optional plugin toolset, the plugin catalog entry is
marked `unavailable`, a bounded `plugin_capability_unavailable` event is
recorded, and the model request is sent without that optional MCP schema.

Detailed design:

- `docs/IMPLEMENTATION_NOTES/plugin-capability-activation.md`

## Host Navigation

The mobile bottom navigation should keep only high-frequency app destinations at
the first level. Codex remains a first-level bottom tab because it is a frequent
Owner workflow. Lower-frequency embedded apps such as Wardrobe, Finance, and
Email are collected under the bottom `应用` entry. That entry opens a compact
host-owned app list, but each item must still be shown only when the same
manifest/workspace authorization rules would have made the corresponding plugin
tab available. Moving an app into the drawer must not bypass plugin visibility,
workspace clamping, launch-token freshness, iframe hosting, or proxy rules.

Plugin-bound application topics are a separate launcher/context layer. A plugin
may appear in the `应用` drawer, in the embedded plugin host, and as a pinned
plugin topic card at the same time. All three surfaces must use the same
effective-workspace visibility and provisioning projection. A plugin topic card
may open the app directly or open the bound topic chat, but it must not create a
new authorization path, bypass launch-token freshness, or expose a plugin MCP
without the selected workspace's matching Gateway schema. See
`docs/MODULES/plugin-topics.md` and
`docs/IMPLEMENTATION_NOTES/plugin-topic-binding.md`.

The host-owned plugin Dock is a global bottom-stack surface, not a multi-row
app grid. It opens from a small handle anchored above the ordinary bottom
navigation and expands into a single horizontally scrollable row. Short taps on
Dock icons always open the plugin app/capability itself; long-press opens that
plugin's fixed quick-action menu. Adding new plugins must not increase the
expanded Dock height or wrap icons into a second row; lower-frequency plugins
remain reachable by horizontal swipe. When one to five plugins are visible, the
row should divide the available width evenly across those visible plugins; when
more than five are visible, the five-slot sizing remains and the row scrolls
horizontally. Normal horizontal swipes scroll the Dock. The handle is the only
open/close gesture target: short vertical mistouches and horizontal swipes must
not expand it, upward handle swipes expand it, and downward handle swipes
collapse it. Manual reordering remains a menu action with bounded move controls.
On desktop browser layouts, the same permission-filtered plugin definitions are
rendered in the left sidebar as a compact plugin launcher. This is the desktop
equivalent of the mobile Dock: short click opens the plugin app/capability and
context-click/long-press opens the same quick-action menu. Desktop must not
fall back to scattered per-plugin buttons across the page body.

When a plugin is opened from a plugin-bound topic, Hermes shows a three-entry
plugin context browser-style footer: Topic, the current plugin, and Directory.
This context navigation keeps only three columns and stays outside the embedded
browser viewport. Hermes must hide its normal topbar/header whenever an
embedded plugin iframe is open; the plugin owns its own header or in-app title
inside the iframe. The footer should be visually closer to a mobile browser
toolbar than to the ordinary five-entry app navigation: icon-first, compact,
fixed, with a clear top divider and minimal wasted vertical space. The plugin
iframe must start at the top of the available host viewport and end at the
footer's top edge, not continue behind the Hermes buttons. In plugin context
mode the iframe/shell must also drop any standalone `100dvh` min-height so it
obeys the host viewport slice. The host must subtract the plugin-context footer
height from the embedded app viewport instead of using only `padding-bottom`;
otherwise the iframe can extend behind the Hermes footer while the plugin app
also reserves its own bottom navigation area, creating a visible blank band
between the plugin's native bottom bar and the Hermes footer.
The plugin-context iframe bottom reservation is derived from the measured host
footer height and the same layout-viewport bottom-boundary rule as the primary
mobile bottom stack. `visualViewport.height` is diagnostic and keyboard input,
not the primary boundary for this reservation; iOS standalone PWA can report a
shorter visual viewport and would otherwise shrink the iframe, making plugin
top chrome appear clipped above the screen.

The built-in Directory plugin is different from embedded iframe plugins. When a
user opens a folder and chooses to start a topic, Hermes must keep the directory
context and enter a directory-bound topic draft detail page instead of returning
to the ordinary topic-list root. That draft page shows the composer immediately,
keeps the normal bottom navigation hidden, and uses the top-left/back gesture to
return to the same directory view. The actual topic is created only when the
first message is sent with the pending directory attachment. If the draft is
still empty, back navigation must discard only that pending draft state and
restore the directory route. This route must not be cleared by generic
`loadSelectedView()` view-mode cleanup while the pending directory draft is
active, and discarding the empty draft must also clear the directory topic
filter so the ordinary topic list does not remain in a phantom directory-create
state. Switching to a plugin app must also discard the empty draft before
opening the plugin so the plugin context footer does not lock up.
Embedded plugin-bound topics can also carry a `pendingTaskDirectory` attachment
for model/tool delivery, for example Finance topic messages. That attachment is
not a Directory-plugin draft unless Hermes also has a `directoryReturnRoute`.
Topic-list rendering, send duplicate guards, and right-swipe/back selection must
therefore use the explicit directory-draft predicate instead of treating any
pending directory attachment as a new-topic page.
Inside the plugin-context footer, tapping `Topic` returns from the embedded
plugin surface to that plugin's bound Hermes topic conversation, for example
`plugin:finance`, not to the ordinary topic list. It may defer host view-mode
application until after `loadSingleWindow()` has loaded the bound conversation,
so the user does not see a transient wrong page before the correct topic surface
appears.
The three-entry plugin-context footer must be derived from the active
`plugin:<id>` task group as well as the explicit `pluginContextNavPluginId`.
The task-group fallback is required because a loaded plugin-bound topic
conversation is itself enough evidence that the host is in plugin-context mode;
the footer must not fall back to the ordinary bottom navigation if the explicit
context id is cleared during a re-entry or refresh.
Codex Mobile is the exception to plugin-context bottom navigation. It is an
Owner-critical workbench plugin and should run as a full-screen embedded
surface. When the Codex iframe is active, Hermes must not show the ordinary
bottom navigation or the three-entry plugin-context bar. Hermes still owns the
host bottom comfort inset and must send it through `hermes.plugin.viewport`
`footer.safeAreaBottom` / `footer.hostBottomSafeArea` when the Codex footer is
hidden, so Codex can keep its composer off the physical PWA bottom without
duplicating a visible Home AI footer reservation. Codex-owned navigation remains
inside the Codex iframe; leaving the surface belongs to Hermes back/right-swipe
or the host menu, not to a visible bottom-tab row. When a saved host return
route exists for Codex, Hermes-owned left-edge swipe and top back must restore
that host route before sending another iframe-internal back event; this
prevents a cached/reloaded Codex root from consuming the gesture into a plugin
default page such as create-thread.
Codex is also the only resident embedded iframe in the current host. If the
existing Codex iframe was rendered for the same effective workspace, same host
appearance key, and same browser-facing entry URL, ordinary tab/menu switches
must reattach that iframe even after the short-lived launch manifest has
expired. This keeps active Codex threads resident when the user briefly opens
Chat, Topics, Directory, or another plugin. The host must still discard Codex
on workspace changes, appearance changes, a different entry URL, or an
explicit Codex `refresh_required` event.

Plugin-owned full-screen image or file previews are a temporary chrome-free
state inside the same embedded iframe. When a plugin opens such a preview, it
must notify Hermes through its navigation postMessage payload
(`previewFullscreen`, `fullscreenPreview`, or `imagePreviewFullscreen`) or the
generic `hermes.plugin.preview` / `hermes.plugin.fullscreen` message. While that
state is active Hermes hides its plugin-context footer and reserves zero bottom
space so the iframe can inspect the image to the viewport edge. Closing the
preview, iframe refresh, back fallback, or leaving the plugin must clear the
state. These payloads are state-only signals and must not contain raw keys,
launch tokens, note bodies, attachment content, or private file URLs.

Right-swipe/back inside this context is ordered from inside to outside. If the
embedded plugin has reported `canGoBack=true`, Hermes must first post
`hermes.plugin.back` to the iframe so plugin-owned secondary pages such as a
Finance bill detail can return to the plugin list page. Only when the plugin has
no in-frame back target should Hermes leave the plugin surface and return to the
bound Hermes topic page.

The global plugin Dock must keep a stable order during normal use. Opening
a plugin may record usage for diagnostics, but it must not automatically move
the plugin icon. Users can manually reorder plugin icons through the
long-press/context menu's bounded move controls; the order is stored locally in
`hermesPluginTopicOrder`. Newly
available plugins that are not in the manual order append by the product's
definition order.

## Manifest Contract

The plugin project should publish a bounded manifest endpoint. Hermes Mobile
normalizes the response through a Mobile-owned route such as
`GET /api/hermes-plugins/<plugin-id>/manifest`.

The normalized manifest should expose only non-secret metadata:

- `id`, `title`, `kind=embedded_app`
- entry URL / origin
- required toolsets and permissions
- optional launch endpoint metadata
- embedding diagnostics such as frame-ancestor or mixed-content status
- optional navigation contract metadata

The manifest must never expose raw access keys, bearer tokens, launch-token
secrets as data fields, database paths, local secret paths, push endpoints, or
full private inventories.

## Registration And HTTPS Entry Gate

Plugin registration has two independent gates. Passing one does not imply the
other has passed:

1. **Frame permission gate**: the plugin allows the Hermes Mobile origin in
   `frame-ancestors` / CSP.
2. **Entry scheme gate**: the plugin manifest returns an iframe entry URL that
   the Hermes Mobile page is allowed to embed.

When Hermes Mobile runs as HTTPS, the browser-facing iframe entry returned to
the frontend must be a secure Hermes-reachable URL. A plugin may still run as a
local HTTP service, including `http://127.0.0.1:<port>` or another LAN-only
upstream, but Hermes Mobile must not hand that upstream URL directly to a phone
PWA iframe when it is not client-safe.

For local or LAN plugins such as Codex Mobile Web, Wardrobe, Finance, and Email,
Hermes Mobile
should provide a same-origin proxy entry instead of asking the user to configure
TLS or a reverse proxy. The browser sees an HTTPS Hermes path such as
`/api/hermes-plugins/<plugin-id>/proxy/...`; Hermes server-side code forwards
that request to the plugin's configured HTTP upstream. Registering the Hermes
origin in `frame-ancestors` is still required for direct external plugin
entries, but it is not enough by itself to make an HTTP iframe valid inside an
HTTPS PWA.

For standard same-host plugins, the configured manifest source should remain a
loopback URL such as `http://127.0.0.1:<port>/api/v1/hermes/plugin/manifest`.
Public/NAS/tailnet domains are explicit external deployment overrides, not
default plugin pointers. If a local manifest or launch response contains an
absolute stale domain, Hermes must resolve only its path/search/hash back
against the local manifest source before returning a browser-facing proxy path.
This prevents plugin navigation and iOS right-swipe/back state from depending
on a personal or previous production domain.

When Hermes serves a plugin through the same-origin proxy, the browser is
framing the Hermes proxy URL rather than the upstream plugin origin. Upstream
`frame-ancestors` diagnostics must not make the normalized manifest unavailable
for that proxied entry; direct HTTPS/non-proxied entries still require the
normal frame-ancestor allow check.

The same-origin proxy is still inside the Hermes Mobile access boundary. It
must require Hermes workspace access before forwarding any request to a plugin
upstream, including HTML shells, static assets, JSON APIs, uploads, and binary
resources. The proxy uses the requested `workspaceId`, `x-hermes-plugin-workspace-id`,
or same-origin referrer `workspaceId` as the target workspace hint, then clamps
that hint through `requireWorkspaceAccess`. It must also verify that the plugin
is visible to that effective workspace before fetching from the upstream. Public
unauthenticated requests to `/api/hermes-plugins/<plugin-id>/proxy/...` must
not expose plugin HTML or API data.

The Hermes web client must keep the same-origin `hermes_web_key` cookie in sync
with its local access key before opening embedded plugin iframes. Ordinary API
requests carry `X-Hermes-Web-Key`, but iframe navigations cannot set custom
headers; without the cookie, the authenticated shell can fetch a launch manifest
while the iframe itself receives `403 Workspace access is not allowed`. This
cookie is a same-origin Hermes auth bridge for plugin proxy navigation only and
must not be copied into plugin URLs, postMessage payloads, docs, screenshots, or
logs.

The same-origin proxy must also rewrite plugin-owned resource URLs inside HTML,
JavaScript, CSS, and JSON responses. HTML/CSS/JavaScript may use text rewriting,
but JSON must be parsed and rewritten structurally: rewrite only string values
that are standalone upstream URLs or root-relative plugin paths, not arbitrary
prose in chat/thread/message fields. This includes absolute upstream URLs such
as `http://<plugin-host>/uploads/...` and root-relative image/static paths such
as `/uploads/...`, `/media/...`, `/images/...`, `/assets/...`, and `/static/...`.
It also includes explicit plugin resource APIs such as `/api/uploads/file` and
`/api/files/preview/content`, Finance plugin APIs under `/api/finance/...`, plus
Wardrobe photo APIs such as
`/api/photos/<id>/content`, `/api/outfit-photos/<id>/content`,
`/api/featured-look-photos/<id>/content`, and
`/api/v1/items/<code>/photos/...`. Note attachment asset APIs under
`/api/v1/app/`, including raw attachment streams and text preview routes, are
also plugin-owned resource routes and must be proxied.
The rewritten browser-facing path must stay under
`/api/hermes-plugins/<plugin-id>/proxy/...`. Binary image responses are then
fetched through that proxy path and streamed back with their original content
type. Without this, HTTPS Hermes Mobile PWAs can load the plugin shell while
plugin-supplied images remain broken because the browser is asked to fetch the
HTTP/LAN upstream directly.

Long-lived plugin streams, especially `text/event-stream` APIs such as Codex
Mobile Web `/api/events`, must be streamed through the same-origin proxy rather
than buffered with full-body readers. The proxy should write SSE headers to the
iframe response as soon as the upstream responds, preserve no-buffer semantics,
and forward chunks until either side closes. Otherwise the iframe EventSource
does not receive the initial status or keepalive in time and will repeatedly
enter reconnect recovery even though the upstream plugin is healthy.

For JSON responses, URL-like keys must include camelCase and separator-based
variants such as `url`, `previewUrl`, `thumbnailUrl`, `downloadUrl`, `href`,
`src`, `attachmentUrl`, and `fileUrl`. A root-relative value in these fields
must not leak to the Home AI root namespace. For example, a Note attachment
`previewUrl` of `/api/v1/app/attachments/<id>/preview` must become a proxied
Home AI path; otherwise Markdown and Word preview iframes request
`/api/v1/app/...` from the Home AI server and surface `Not found`, while raw
PDF or image streams may still appear healthy.

CSS `url(...)` rewriting must preserve the original URL quoting and closing
delimiter. For example, `url("/assets/bg.svg")` must become
`url("/api/hermes-plugins/<plugin-id>/proxy/assets/bg.svg?workspaceId=<id>")`,
not a malformed `url("...workspaceId=<id>)`. A malformed CSS URL can make the
browser drop the rest of the stylesheet, which breaks fixed plugin controls such
as Finance's bottom action bar even though the stylesheet request itself
returned HTTP 200.

The browser-facing same-origin proxy entry must preserve the effective
workspace. When Owner authentication is viewing a non-Owner workspace, the proxy
URL must include that target `workspaceId`; the proxy must clamp it through
Hermes workspace access and forward
`x-hermes-plugin-workspace-id=<target workspace>`, not `owner`. Plugin session
cookies are also workspace-scoped by the Hermes proxy: upstream `Set-Cookie`
headers are rewritten to a host-owned cookie name that includes plugin id and
workspace id, with upstream `Domain` stripped and `Path` set to the plugin proxy
prefix. Incoming proxy requests translate only the matching plugin/workspace
cookie back to the upstream cookie name and drop plugin cookies for other
workspaces, including old unscoped plugin cookies. This is a generic embedded
plugin rule: Wardrobe, Finance, Codex Mobile, and future same-origin plugins
must not show Owner content merely because the browser already has an Owner
plugin session.

All proxy-rewritten plugin resource and API URLs should carry the effective
`workspaceId` when the URL is a static string, including URLs rewritten inside
plugin HTML, JavaScript, CSS, and structured JSON. JavaScript template strings
with runtime query fragments such as ``/api/threads${params}`` or
``/api/auth/status?_ts=${Date.now()}`` must have only their static path prefix
rewritten to `/api/hermes-plugins/<plugin-id>/proxy/...`; the proxy must not
inject `workspaceId` inside the template expression or concatenate it without a
delimiter. Those dynamic requests resolve workspace through the same-origin
referrer or the workspace-scoped plugin session cookie. Browser requests that
arrive without a direct workspace hint, without a referrer workspace hint, and
with multiple workspace-scoped cookies for the same plugin must fail closed as
an ambiguous plugin workspace instead of falling back to the Owner workspace.
This protects Owner-account workspace switching when an embedded plugin
frontend suppresses or omits `Referer`.

When the Hermes workspace selector changes, the host must discard all embedded
plugin iframes, cached manifests, launch freshness state, and plugin list state
before loading the selected workspace. Same-origin embedded apps such as Finance
can otherwise keep an old Owner iframe or session alive while the shell shows a
non-Owner workspace. A new workspace must always obtain a fresh manifest and a
fresh launch entry for that effective workspace.

For launch-token plugins, a cached manifest/launch context is intentionally
short-lived. The host may preserve an iframe across ordinary tab switches only
when the current iframe was rendered from the same effective entry URL. Codex
has an additional resident-frame exception described above: an already-mounted
Codex iframe can be reattached after manifest expiry as long as its rendered
workspace, appearance, and entry still match the active host context. If a
fresh manifest or launch returns a different browser-facing entry, including a
different plugin version query such as Finance's `v=...`, the host must discard
the old iframe shell and render the new entry. `preserve_iframe_state`,
navigation timestamps, or refresh cooldowns must not keep a stale iframe alive
after the plugin has advertised a new entry. Plugin `refresh_required`
postMessages may still be accepted from the currently mounted frame origin so a
plugin can ask the host to refresh even when the cached manifest has expired.

Plugin-bound topics also define model-side MCP requirements. The host maps
`plugin:<id>` task groups to the plugin's toolset, for example
`plugin:finance -> finance`, and injects that toolset into the run policy and
Gateway routing as required. The Gateway Pool must then select only a profile
owned by the effective Hermes workspace whose actual profile `config.yaml`
contains that toolset. This is a schema-capability guard, not a generic
fallback mechanism: Owner's Finance topic must not run on an Owner profile that
lacks `finance`, and Owner switching into WuPing/test workspace must not reuse
Owner's plugin MCP binding.

Manifest/launch boundaries must also clear stale plugin sessions. A manifest
response for a workspace-private same-origin plugin should expire known raw
upstream session cookie names and the Hermes-scoped Owner/current-workspace
session names under that plugin proxy path. A proxy request carrying a fresh
short launch token must not forward any existing plugin session cookie to the
upstream; it should first expire stale raw/Owner/current scoped cookies and then
let the upstream's new `Set-Cookie` establish the current workspace session.

For embedded upload controls, the proxy/host must preserve ordinary browser file
upload semantics. Plugin `POST`/`PUT`/`PATCH` requests, including multipart
`FormData`, must forward the original body and `content-type` to the upstream
service. The proxy must not forward the browser-facing Hermes `Origin` /
`Referer` directly to a local/LAN upstream for unsafe methods; it should keep the
real Hermes origin in `X-Hermes-Public-Origin` / `X-Forwarded-Origin` and send
the upstream's own origin in `Origin` so plugin CSRF checks still see a same-origin
server-side proxy request. The host iframe sandbox must allow forms and modals
so upload failure messages are not silently blocked. Wardrobe's historical `.upload-btn input {
display: none; }` pattern is normalized by the Hermes proxy into a transparent
interactive file input because iOS/PWA iframe file pickers can otherwise open
the photo selector but fail to deliver a reliable `change`/`files` event.

The JSON rule is intentionally narrow: do not rewrite arbitrary `/api/...`
strings inside plugin thread/chat/message prose. Only standalone resource API
values are proxied. This prevents the proxy from corrupting Codex thread JSON
while still allowing embedded images and file previews to load through Hermes.

Plugin projects should support a deployment-owned public base URL setting, for
example `<PLUGIN>_HERMES_PLUGIN_BASE_URL` or `<PLUGIN>_PUBLIC_BASE_URL`. The
manifest should use that base URL to build:

- `entry.url`, for example `https://<plugin-origin>/?embed=hermes`;
- `program_api.base_url`, for example `https://<plugin-origin>`;
- short-launch entry URLs by joining the HTTPS base with the relative
  `entry_path` returned by `POST /api/v1/hermes/plugin/launch`.

The launch endpoint should still return only a relative short-lived entry path,
for example `/?embed=hermes&launch=<short-token>`. It must not return a
long-lived key, and it must not require Hermes Mobile to place a long-lived key
in the iframe URL.

## Appearance Sync

Hermes Mobile is the host for embedded-plugin visual context. During manifest
launch, Hermes sends a sanitized `appearance` object in the server-side launch
body:

```json
{
  "appearance": {
    "theme": "system|dark|light",
    "fontSize": "small|default|large|xlarge|xxlarge"
  }
}
```

The value is session-scoped host preference, not a command to overwrite the
plugin app's long-term standalone local settings. Hermes maps its local
`standard` font size to plugin-contract `default`. No Access Key, launch token,
session token, local path, full settings dump, or private content belongs in
appearance metadata.

When a plugin returns a short launch `entry_path`, Hermes keeps the browser
entry appearance-aware by ensuring the safe query parameters
`pluginTheme=<theme>` and `pluginFontSize=<fontSize>` are present before the
iframe is created. The iframe should stay hidden behind the Hermes
theme-colored loading shell until this launch response is available; do not
initialize a plugin iframe from a stale/default entry that would flash the
wrong theme or font size.

The host-side launch manifest cache is keyed by both workspace and sanitized
appearance. A cached plugin manifest or launch entry fetched for
`system/default` must not be reused after the Hermes host changes to `dark`,
`light`, `large`, `xlarge`, or another supported appearance value. Changing
theme or font size should cause the next plugin entry to fetch a fresh launch
token with matching `appearance` metadata instead of replaying the old token.
Hermes sends the current effective host theme to plugins, not merely the stored
theme preference. If the user preference is `system`, the host resolves
`prefers-color-scheme` and sends `dark` or `light` in the launch appearance so
all plugins inherit the visible Hermes appearance consistently.
For production diagnosis, Hermes records a bounded manifest audit line for each
plugin manifest/launch request under `workspace/hermes-web/logs/plugin-manifest-requests.jsonl`
in the configured data directory. The audit line may include plugin id,
workspace id, requested/response appearance, availability, token status, and
same-origin-proxy status. It must not include workspace keys, launch tokens,
cookies, full entry URLs, plugin content, or request bodies.
The render path must apply the same workspace-and-appearance check before it
decides a manifest is current; otherwise a new launch token can be issued but
left unconsumed while the old iframe session remains mounted.
When the current plugin shell does not match the active appearance key, the host
must discard that shell before fetching/rendering the next launch entry. Do not
let `preserve_iframe_state`, navigation state, or warmup/cooldown logic keep a
stale `system/default` Wardrobe iframe visible after the host has switched to
`dark/large`.

Registration is not complete until a smoke check proves:

- the manifest queried with the real Hermes HTTPS origin returns an HTTPS
  `entry.url` or a Hermes same-origin proxy URL;
- `program_api.base_url` is HTTPS for direct external entries, or remains only a
  server-side local/LAN upstream when Hermes returns a same-origin proxy URL;
- `frame-ancestors` includes the same Hermes HTTPS origin;
- a launch call returns a short-lived relative entry path and no long-lived
  secret;
- the launch request includes only sanitized `appearance`, and the iframe entry
  contains matching `pluginTheme` / `pluginFontSize` values;
- the installed PWA opens the iframe without browser mixed-content errors,
  browser chrome, or a fallback login page.

Production PWA validation must start from the installed home-screen Hermes
Mobile icon. Opening the Hermes URL in the browser address bar is a different
mode and intentionally shows the browser-shell guard page. That browser mode
must not be used as evidence that an embedded plugin works or fails in the
standalone PWA.

Plugin release smokes must follow the shared Hermes Mobile PWA harness:

1. Use `adb devices` to name the emulator or target device.
2. Ensure the launcher has a `Hermes` PWA shortcut. If not, use Chrome only to
   run `Install app`, then return to the launcher.
3. Start Hermes by tapping the launcher icon.
4. Capture a screenshot showing standalone PWA chrome, not a browser address
   bar.
5. Open the plugin tab from inside Hermes and verify the expected plugin host:
   no blank preflight page, no browser handoff, same-origin proxy or HTTPS
   iframe as appropriate, no Hermes bottom navigation inside the plugin surface
   even on the plugin home page, and correct return/back behavior.
6. If Android UIAutomator only reports a generic WebView node, attach DevTools
   to the PWA WebView and record bounded state such as URL, ready state, client
   version, and visible text summary. Do not store secrets, cookies, launch
   tokens, push endpoints, or private plugin payloads.

Direct browser URL tests remain useful only for diagnostics such as the
browser-shell guard page or mixed-content comparison. They do not replace the
installed-PWA plugin smoke.

If a plugin cannot provide either a secure browser-facing entry or a Hermes
same-origin proxy entry for an HTTPS Hermes deployment, Hermes Mobile should
show a bounded setup diagnostic instead of trying to embed it.

## Auth And Launch

Embedded plugin surfaces are full-screen app surfaces inside Hermes Mobile.
Once the host activates a plugin iframe, Hermes hides both its top bar and its
bottom navigation, including on the plugin's own home/root page. The plugin owns
the in-frame primary UI while Hermes keeps same-window hosting, safe proxying,
permission checks, and back/return mediation.

Installed plugins are Owner-visible by default only in the effective Owner
workspace. When an Owner-authenticated browser switches to a non-Owner
workspace, the ordinary plugin list, navigation tabs, and manifest routes must
project the target workspace's effective identity instead of the Owner session.
A non-Owner workspace must not see or launch an installed plugin until Owner
has explicitly authorized that workspace for the plugin.

The installed plugin manifest contract has a Hermes-side security envelope:

```json
{
  "id": "finance",
  "title": "记账",
  "type": "embedded-app",
  "toolsets": ["finance"],
  "permissions": ["finance:read", "finance:write"],
  "riskLevel": "workspace-private",
  "defaultVisibility": "owner-only",
  "allowWorkspaceGrant": true,
  "provisioning": { "supported": true, "mode": "workspace_binding" },
  "notifications": { "supported": true, "routeOwner": "hermes" }
}
```

Hermes Mobile owns this security envelope even when a plugin omits optional
fields. Business plugins default to `riskLevel=workspace-private`,
`defaultVisibility=owner-only`, and `allowWorkspaceGrant=true`. Owner may open
the side navigation's plugin manager and grant the plugin to a non-Owner
workspace. That grant is a Hermes authorization record only; plugin-side user
creation or workspace binding must still happen through the plugin's launch or
provisioning contract and must not expose long-lived keys to the browser.

Plugin enablement is a host-side provisioning workflow, not a display toggle.
This applies to Owner's first use as well as grants to non-Owner workspaces.
On a fresh public install with an empty database, it is normal for a plugin's
business data to be empty, but it is not acceptable for Hermes to show the
plugin as fully usable before these workspace-local prerequisites exist:

- a target Hermes workspace identity selected and clamped through workspace
  access policy;
- a server-side plugin workspace key or plugin-owned equivalent created for
  that exact workspace, never copied from Owner unless the target workspace is
  Owner and the plugin intentionally binds to an existing Owner account;
- plugin-side user/space/ledger/mailbox/workspace registration confirmed by the
  plugin's server-to-server bind/register contract;
- required Skill Store bundle and MCP/profile registration completed when the
  plugin exposes model-callable tools;
- target Gateway worker-local binding, profile config, MCP schema, and worker
  restart completed when the platform exposes that plugin through Gateway MCP;
- manifest/launch smoke for that same effective workspace, including Owner
  switching into a non-Owner workspace.

Only after those checks pass may Hermes store or project
`provisioningStatus=active`. If any automatic step fails, the grant remains
diagnosable as `pending` or `provisioning_failed` and list/manifest/launch must
be blocked for that workspace. If a plugin cannot be automatically provisioned
by Hermes, it should use `manual_required` until an external Owner-controlled
binding or plugin-side setup has been verified. Empty plugin content after a
successful first-run provisioning is valid; missing identity, missing key,
missing bind, missing Skill/MCP registration, or Owner-session reuse is not.

Workspace onboarding may batch selected plugin grants through
`workspace-onboarding-service`, but it does not create a second authorization
source. Each selected plugin still flows through
`hermesPluginService.grantWorkspace`, writes the same authorization record, and
must satisfy the same `active` / `provisioning_failed` contract above.
For a fresh public setup, the default selected business-plugin set is
`wardrobe`, `health`, `finance`, `email`, `note`, and `growth`; the Owner UI
must expose those six options together. Codex plugin edition remains special and
is not part of the ordinary family workspace onboarding default.

Public source repositories for Home AI and plugins are declared in
`config/public-plugin-sources.json`. The manifest is installer-facing and must
contain HTTPS public GitHub URLs, not private SSH remotes. The Mac deployment
script consumes local source directories after the installer has cloned them.

On macOS production, the canonical plugin binding is first written under the
Home AI data drive, for example
`data/drive/users/<workspaceId>/.hermes-health`. Gateway workers do not read
that directory directly. Before Gateway profile materialization, the restricted
workspace provisioning executor must mirror each complete plugin binding
directory into the worker-local root
`/Users/<hm-user>/HermesWorkspace/.hermes-<plugin>`, preserving private
ownership and mode. Profile generation must expose a plugin toolset only when
the worker-local mirror contains both `config.json` and `access-key.txt`.
Having only a data-drive binding means the plugin is authorized/provisioned in
Home AI, but its MCP is not yet callable from that worker profile.

The plugin manager projection must combine the same evidence used by launch:
stored authorization records, deployment allowlists, and discovered
workspace-local plugin config/key directories. This includes `owner`. If Owner
has a valid workspace-local binding, the Owner row must display as already
enabled; if Owner has a failed automatic provisioning record, the row must show
a retry/diagnostic state rather than a plain unopened `开通` action. Health is
the reference case: Owner is not implicitly active on fresh install, but once
Owner provisioning succeeds the authorization record and `.hermes-health`
config/key must survive reloads and keep the manager row enabled.

Plugins that expose model-callable MCP tools must use the Wardrobe-style
workspace-local isolation pattern as the default host contract:

- Hermes Mobile creates one plugin workspace identity per effective Hermes
  workspace. The plugin may map that id to its own user, ledger, mailbox,
  health profile, wardrobe workspace, or other domain object, but it must not
  silently reuse Owner's plugin identity for a non-Owner workspace.
- Hermes Mobile writes a plugin-local directory under the target user's drive,
  for example `.hermes-wardrobe`, `.hermes-finance`, `.hermes-email`,
  `.hermes-health`, `.hermes-growth`, or `.hermes-note`.
- `config.json` in that directory contains only non-secret metadata such as
  API base URL, plugin workspace id, Hermes workspace id, display name, cache
  directories, scopes, and the relative key-file name.
- `access-key.txt` in that directory is the only long-lived workspace plugin
  secret Hermes stores for that plugin. It must not be copied into Skill files,
  Gateway manifests, frontend state, iframe URLs, postMessage payloads, docs,
  screenshots, handoffs, logs, or plugin authorization records.
- The plugin MCP wrapper reads its own `.hermes-<plugin>/config.json` and
  `.hermes-<plugin>/access-key.txt`, then attaches the workspace-local key to
  plugin API calls internally. The model must never pass raw keys as tool
  arguments.
- Stdio MCP wrappers must support the transport used by the current Hermes
  Agent MCP SDK. In the maintained runtime this means newline-delimited JSON
  messages from `mcp.client.stdio`; a wrapper that only parses
  `Content-Length` framed test messages can pass plugin-local tests while
  failing to connect in real Gateway profiles.
- Tool names returned by a plugin MCP server in Gateway registration mode
  should be local names such as `list_ledgers`. Hermes Agent prefixes them as
  `mcp_<server>_<tool>` in the model schema. Returning already-prefixed names
  such as `mcp_finance_list_ledgers` from the wrapper creates double-prefixed
  callables like `mcp_finance_mcp_finance_list_ledgers`. Health direct wrapper
  mode may keep the legacy `mcp_health_*` names for standalone callers, but
  Gateway profiles must launch it with `--gateway-tool-names` so it exposes
  local names such as `records_get_summary` and the final callable remains
  `mcp_health_records_get_summary`.
- Growth uses the same single-prefix Gateway pattern through
  `growth-mcp-wrapper.js`: the wrapper exposes local names such as
  `list_cards` and `get_card`, while model-facing callables become
  `mcp_growth_list_cards` and `mcp_growth_get_card`.
- The Gateway profile registers that plugin MCP with `--workspace` or an
  equivalent fixed workspace-root argument pointing to the target Hermes
  workspace. It must also disable runtime workspace override, for example
  `--no-workspace-override`, or enforce the same check in code.
- The selected Gateway profile and exposed callable schema are part of the
  authorization boundary. Owner switching into a non-Owner workspace must select
  a profile bound to that target workspace's plugin directory. If no matching
  profile/schema exists, Hermes must omit the plugin MCP/toolset and show a
  bounded diagnostic instead of falling back to Owner's MCP.
- Plugin Skills installed into a user's Skill Store are keyless usage bundles.
  They may describe how to use the MCP toolset, but they must not contain
  concrete access keys, launch tokens, plugin session cookies, raw private data,
  or local secret paths.

For Finance, a plugin-manager grant is also a provisioning workflow. Owner's
default Finance visibility is not an exception: the Owner workspace must also
have its own `.hermes-finance/config.json` and `access-key.txt` before Finance
is considered model-callable. When Owner grants `finance` to a workspace, or
when the Owner workspace first uses the default-visible Finance plugin, Hermes
Mobile must create a workspace-local server-side key at
`<HERMES_DATA_DIR>\drive\users\<workspaceId>\.hermes-finance\access-key.txt`
when one does not already exist, write a non-secret sibling `config.json` for
the Finance MCP wrapper, then call the Finance loopback binding
contract `POST /api/v1/hermes/plugin/users/bind` with bounded workspace
identity: `target_workspace_id`, UTF-8 `display_name`, `role=owner`, and
`admin_workspace_id=owner`. The display name should come from the Hermes
workspace label so Finance user and ledger names do not inherit mojibake from
PowerShell or ad-hoc repair scripts. Finance must also follow the generic MCP
isolation contract before model-callable Finance tools are considered active.
`config.json` may contain `api_base_url`, `workspace_id`,
`hermes_workspace_id`, `access_key_file`, `display_name`, and `role`; it must
not contain the raw key. Gateway profile generation registers
`mcp_servers.finance` only when the target workspace has both
`.hermes-finance/config.json` and `.hermes-finance/access-key.txt`, exposes the
`finance` toolset in both `toolsets` and `platform_toolsets.api_server`, and
launches the Finance Python stdio wrapper with
`/opt/hermes-gateway-runtime/venv/bin/python`, `finance_mcp_stdio.py`,
`--workspace <target-user-root>`, and `--no-workspace-override`. A successful
bind plus profile/MCP registration updates the authorization record to
`provisioningStatus=active`; a key, bind, config, or MCP/profile failure keeps
the grant record but marks
`provisioningStatus=provisioning_failed` with a bounded error.
On Windows production, low Gateway profiles are generated inside WSL. If the
Finance service runs on Windows, the Finance MCP API base passed to the WSL
profile must be a WSL-reachable address such as the Windows host LAN address,
not `http://127.0.0.1:8791` and not a WSL NAT gateway that Finance rejects as
`finance_mcp_dispatch_loopback_only`. The production launcher owns the
preferred environment value, and `start-low-gateways-child.ps1` must pass it
through to WSL when running `configure-low-gateways.sh`. If the launcher value
is absent, the child script must resolve a Windows LAN API base such as
`http://192.168.10.x:8791` before WSL profile generation. Otherwise Finance UI
may launch while the selected Gateway model schema omits `mcp_finance_*`.
Gateway profile generation must also probe the Finance MCP schema through the
same WSL-reachable API base before registering `mcp_servers.finance`. A
workspace-local `.hermes-finance/config.json` and key are necessary but not
sufficient: if `/api/finance/mcp/schemas` fails, returns no `finance.*` schema,
or is rejected by the Finance service trust boundary, the generated Gateway
profile must omit the `finance` toolset and MCP server for that materialization.
This keeps ordinary chats from repeatedly paying failed Finance MCP connection
retries. After Finance service trust or health is repaired, force a low Gateway
reconfigure/restart so the workspace template can include Finance again.
Pending or failed Finance provisioning must block non-Owner list/manifest/launch
access; failed Owner first-use provisioning must block the Owner manifest with a
bounded diagnostic instead of falling back to the Hermes Owner web key. The
plugin manager must show a diagnostic such as
`authorized / provisioning_failed` instead of making the plugin look fully
usable. Hermes must not store or return the raw Finance workspace key in the
authorization record, frontend state, iframe URL, postMessage payload, docs,
handoffs, screenshots, or logs.

For Wardrobe, a plugin-manager grant is also a Hermes-owned provisioning
workflow. When Owner grants `wardrobe` to a non-Owner workspace, Hermes Mobile
must create the target user's own Wardrobe workspace id such as
`wardrobe:<hermes_workspace_id>`, create
`<HERMES_DATA_DIR>\drive\users\<workspaceId>\.hermes-wardrobe\access-key.txt`,
write non-secret
`<HERMES_DATA_DIR>\drive\users\<workspaceId>\.hermes-wardrobe\config.json`, and
call Wardrobe's server-side registration contract
`POST /api/v1/hermes/plugin/workspaces`. The registration body may include an
access-key hash or one-time registration material, but Hermes Mobile must keep
the raw key only in the workspace-local key file. The generated target key must
use the Wardrobe Program API token prefix, currently `wd_live_`, not a
Hermes-only placeholder prefix. It must also install the
keyless `productivity/wardrobe-style-operations` Skill into that workspace's
own Skill Store and refresh the workspace Gateway profile binding so the next
worker start/restart exposes Wardrobe MCP with `--no-workspace-override`.
Wardrobe's current registration endpoint also requires a server-side bearer
credential with `owners:write` or `admin:*`; Hermes Mobile reads it from
`HERMES_MOBILE_WARDROBE_REGISTRATION_ACCESS_KEY_PATH`, then from
`<HERMES_DATA_DIR>\plugin-secrets\wardrobe-registration-access-key.txt`, and
only falls back to an Owner Wardrobe key if that key has the registration
scope. The target workspace raw key is sent once in that server-to-server
registration body and must not appear in grant results, authorization records,
frontend state, iframe URLs, postMessage payloads, docs, screenshots, or logs.
Successful provisioning updates the authorization record to
`provisioningStatus=active`; any key/config/register/Skill/Gateway failure
keeps the grant but marks `provisioningStatus=provisioning_failed` and blocks
non-Owner list/manifest/launch with a bounded diagnostic.

Provisioning states are generic across plugins:

- `not_supported`: the plugin has no Hermes-side provisioning workflow.
- `manual_required`: Owner has granted visibility, but plugin-side binding is
  created by another owner-controlled flow or an existing workspace key; Hermes
  should not block list/manifest solely because this state is present.
- `pending`: Hermes has started an automatic provisioning workflow and must not
  expose the plugin as usable until the workflow resolves.
- `active`: the grant and required plugin-side binding are usable.
- `provisioning_failed`: the grant record exists, but the plugin-side binding
  failed; non-Owner list/manifest/launch must be blocked with a bounded
  diagnostic.

Only plugins with a registered Hermes-side provisioning service may enter
`pending` from plugin-manager grant. This currently applies to Finance,
Wardrobe, Email, Health, and Note. Manual or externally bound plugins that do not have
a Hermes provisioner use `manual_required` until an effective workspace key is
discovered or the launch path returns its own bounded diagnostic. Codex Mobile
remains Owner-only and is not grantable through this contract.

The plugin manager's open/closed status must reflect the same effective
workspace availability used by the launch path. For workspace-private plugins,
Hermes merges explicit Owner grants, configured workspace allowlists, and
existing server-side plugin workspace key bindings when projecting
`authorizedWorkspaceIds`. This prevents the management UI from showing a plugin
as `未开通` when the workspace can already launch it through a valid
server-side binding such as `.hermes-wardrobe/access-key.txt` or
`.hermes-finance/access-key.txt`. Built-in plugins should also expose stable
host-side display titles (`衣橱`, `记账`, `Codex`) so the management UI does not
fall back to internal ids such as `finance`.

Codex Mobile is the exception. Hermes marks it `riskLevel=owner-critical` and
`allowWorkspaceGrant=false` by default. The plugin manager must not create
non-Owner Codex grants or list non-Owner workspace rows for Codex. Codex
contains code execution, file access, long-lived thread context, and task-agent
surfaces, so it remains Owner-only unless a separate restricted Codex product
mode is designed and reviewed.

The side navigation plugin manager is the canonical admin surface for installed
plugin authorization:

- Owner can list installed plugins, their risk level, provisioning mode, and
  workspace grant state.
- Owner can grant or revoke normal business plugins for a workspace.
- Plugin cards default collapsed; expanding one plugin should reveal only that
  plugin's current workspace grant selector so long installed-plugin lists stay
  navigable on mobile.
- For plugins with Hermes-side provisioning, the plugin manager must show the
  Owner workspace row as well. Owner first use is an explicit enable/provision
  workflow, not an invisible default-active state.
- Non-Owner users never see the plugin manager.
- Revoking a grant removes future list/manifest/launch access for that
  workspace; it does not delete plugin-side business data.
- The manager stores only plugin id, workspace id, timestamps, actor id, and
  bounded provisioning status. It must not store plugin access keys, launch
  tokens, cookies, private business payloads, or raw plugin logs.

User-facing plugin-dependent actions must not fail silently when a workspace is
missing the required plugin binding. The UI should show a concise unavailable
state naming the plugin and, when the user cannot install it directly, offer a
request action. Confirmed requests enter Owner's Action Inbox as summary-only
approval items with a plugin-management deep link. The assistant receipt
"save to Note" path is the reference implementation: 409-class Note binding
errors such as `note_workspace_not_configured` are mapped to a visible
`Note/Notion plugin not installed` prompt; tapping the request action calls
`POST /api/note/install-request`, which validates access to the requester
workspace and upserts a deduped Owner item with
`sourceType=plugin_install_request`, `sourceId=note:<workspaceId>`, and
`itemType=approval`.

Hermes Mobile treats these as authorization evidence:

- Owner auth, including Owner viewing another workspace.
- A plugin manager grant stored in `plugin-workspace-authorizations.json`.
- A plugin-specific authorized-workspace list configured by deployment.
- For Wardrobe only, an existing workspace-scoped Wardrobe key file under the
  workspace drive remains legacy/effective evidence, but new grants must create
  that key through the Hermes Mobile Wardrobe provisioner rather than by manual
  copy.

Generic/global plugin keys, such as the Codex Mobile Access Key, do not
authorize every non-Owner workspace by themselves.

Long-lived plugin workspace keys are server-side credentials. The browser must
only receive a short-lived launch URL or a bounded diagnostic.

When a plugin declares a launch endpoint, Hermes Mobile should:

1. Resolve the current workspace binding and local key path on the server.
2. Call the plugin launch API from the server.
3. Receive a one-time/short-lived `entry_path`.
4. Render the iframe using that short launch URL.
5. Keep raw keys out of frontend JavaScript, iframe URLs, docs, screenshots,
   handoffs, and logs.

If launch fails, Hermes Mobile should show a compact plugin diagnostic. It must
not fall back to a copied local dashboard or expose username/password login as
the normal embedded state.

## Persistent Iframe Host

Embedded apps that use short launch URLs must be hosted in a persistent iframe
container. After the iframe is created, ordinary tab switches should hide/show
the host using CSS visibility or `hidden`, not move the iframe DOM node between
containers.

When an embedded plugin host is active, Hermes Mobile hides its own top page
header and lets the plugin iframe occupy the available content row. Plugin root
and secondary pages both hide the Hermes bottom navigation; exiting the
full-screen plugin belongs to the host back/right-swipe contract and saved
Hermes route restoration, not to a visible bottom-tab escape path inside the
plugin surface. Plugin-owned headers and route controls stay inside the iframe.

Do not use DOM reparenting to preserve an iframe. iOS WebKit installed PWAs can
reload a moved iframe from its original `src`. If that `src` contains a one-time
launch URL, switching away and back can replay an expired token.

Destroy and recreate an iframe only when:

- the plugin entry URL changes;
- the workspace changes;
- the plugin reports a real diagnostic requiring relaunch;
- no navigation health event arrives after a launch iframe load and a fresh
  launch URL is needed.

During manifest loading and fresh-launch exchange, render a clean plugin host
surface. Do not show a Hermes-owned loading card, left-aligned temporary text,
or preflight page. Explanatory UI is reserved for real plugin diagnostics.

## Navigation Contract

Plugin secondary pages are still same-window app navigation. Hermes Mobile owns
the outer back affordance; the plugin owns internal route state.

The plugin should send navigation state to the parent:

```js
window.parent.postMessage({
  type: "<plugin-id>.plugin.navigation",
  version: 1,
  canGoBack: true,
  route: {
    name: "item-detail",
    tab: "items",
    depth: 1
  }
}, "<hermes-origin>");
```

Hermes Mobile should:

- validate the message origin against the plugin entry origin;
- store only bounded route metadata;
- show the normal top-left/back-swipe affordance only when `canGoBack=true`;
- send a plugin back event to the existing iframe, for example
  `hermes.plugin.back`;
- not inspect plugin DOM or call plugin route functions directly.

The plugin should handle the back event inside the iframe and emit a fresh
navigation state after the route changes.

If the plugin exposes `<plugin-id>.plugin.back_result`, Hermes Mobile also
listens for that result event. `handled=true` keeps the current plugin back
state and only refreshes host controls. `handled=false` means the plugin did not
consume the back request; Hermes Mobile clears the plugin `canGoBack` state so
the outer app layer can own the next back action and restore host navigation
tabs.

Before Hermes Mobile enters an embedded plugin tab from a non-plugin surface,
the host must snapshot the current Hermes route. If the plugin is already at
its root page, or if a plugin back result reports `handled=false`, the next
host-level back/right-swipe action restores that saved Hermes route instead of
leaving the user trapped inside the plugin iframe. The snapshot is host state
only: view mode, selected ids, filters, current thread metadata, and scroll
position. It must not store plugin page content, secrets, launch tokens, or
private business data.

When the static client persists a foreground/background route snapshot while an
embedded iframe plugin is open, it must also persist bounded host return-route
metadata for that iframe. Restoring directly into a cached plugin view after a
PWA restart must rehydrate the plugin record's outer `returnRoute`; otherwise
the plugin root page has no in-frame back target and Home AI cannot leave the
iframe through back/right-swipe. For legacy Codex Mobile snapshots that predate
return-route persistence, Home AI must synthesize a safe host fallback such as
the task/topic root rather than trapping the user inside the full-screen Codex
surface. A direct Codex render without an existing return route must also
synthesize the same bounded fallback, and restoring that fallback should reuse
the cached task-list window when available before reloading the host task-list
window.

If Hermes sends `hermes.plugin.back` and the plugin does not emit a fresh
navigation or back-result event within the bounded acknowledgement window, the
host treats the plugin back request as unconsumed and restores the saved Hermes
route when one exists. This is a failure-recovery path for incomplete plugin
navigation contracts, not a replacement for plugin-side `back_result` support.

On mobile PWA, iframe touch events are not a reliable signal for host
navigation. Hermes Mobile must keep a parent-owned left-edge swipe zone above
the iframe and route that gesture through the same plugin back/outer-back
contract. The edge zone must start an actual back-swipe state; it must not only
call `preventDefault()` and swallow the gesture before the host can act.

## Host Refresh Contract

Embedded plugins that use short-lived launch tokens can ask Hermes Mobile to
rebuild their iframe when server code, plugin session state, or plugin auth
state changes.

The plugin posts a message from inside the iframe:

```js
window.parent.postMessage({
  type: "<plugin-id>.plugin.refresh_required",
  version: 1,
  reason: "auth_state_changed",
  route: {
    name: "thread",
    threadId: "<bounded-thread-id>",
    itemId: "<bounded-item-id>"
  }
}, "<hermes-origin>");
```

Hermes Mobile must:

- accept the message only when `event.origin` matches the plugin entry origin;
- accept an explicit plugin `refresh_required` event as a recovery request. It
  may bypass the first-frame warmup so an expired or consumed launch page can
  obtain a fresh manifest, but repeated refreshes must still obey the normal
  cooldown; requests during manifest/launch loading are also suppressed;
- apply cooldown throttling to host-side launch-health retries, and preserve an
  already-mounted iframe during ordinary host re-renders so the host does not
  consume new launch tokens repeatedly;
- treat the message as a host refresh request, not as plugin-controlled host
  navigation;
- discard the stale iframe and stale launch manifest;
- request a fresh Mobile-side manifest/launch URL through the existing
  `GET /api/hermes-plugins/<plugin-id>/manifest` path;
- preserve only bounded route hints such as `pluginRoute`, `pluginThreadId`,
  `pluginTaskId`, or `pluginItemId`;
- return to the same plugin tab when it is already active, or mark the iframe
  stale so the next plugin-tab entry refreshes before display.

The host-side executable harness is
`tests/embedded-plugin-refresh-harness.test.js`; Wardrobe's specialized host is
covered by `tests/wardrobe-plugin-refresh-harness.test.js`. These simulate
iframe `postMessage` events and assert wrong-origin rejection, active iframe
rebuild, inactive-tab invalidation, and bounded route-hint preservation.
Wardrobe's current specialized host should replace the invalid iframe on the
first accepted refresh request, then suppress repeated requests inside the
cooldown window so plugin-side delete/auth failures cannot create a relaunch
loop.

In dark mode, the host must not expose the browser's default white iframe
surface while a fresh plugin frame is being created. Hermes Mobile keeps new
embedded iframes hidden behind a theme-colored shell until the iframe `load`
event, then reveals the frame. Plugin host CSS tests must cover this loading
shell so future plugin tabs do not regress into a white flash.
Plugin-specific hosts such as Wardrobe must follow the same rule even when they
still use their own wrapper class instead of the generic `.embedded-plugin-*`
classes.

Plugin refreshes must also be visually stable. When a mounted iframe asks for a
fresh launch, Hermes keeps the existing iframe visible while fetching the new
manifest/launch URL, then swaps frames once. Passive refresh requests emitted
during the first few seconds after frame creation are suppressed unless
explicitly forced, because they commonly represent plugin-side boot
reconciliation rather than a real expired session. The standard
`<plugin-id>.plugin.refresh_required` postMessage is explicit and may bypass
that boot warmup, but it must not bypass the relaunch cooldown. Entering a
plugin tab must clear stale keyboard viewport metrics so returning to chat does
not leave the composer shifted by an old mobile keyboard offset.

PWA resume is part of the same visual contract. The installed app can be
repainted by the browser before normal JavaScript modules finish running,
especially after switching away to another app and back. Hermes Mobile must keep
the initial head style, `html`/`body` background, manifest `background_color`,
manifest `theme_color`, status-bar meta, plugin host background, and iframe
loading shell aligned to the effective theme. Do not rely only on late module
code or iframe `load` handlers to hide a white surface in dark mode.

Primary navigation out of a plugin must also clear keyboard viewport and
keyboard-context metrics before the next chat/topic surface is laid out. The
path `plugin -> topic list/topic stream -> chat` is a required regression path:
the composer must return to the same vertical position as a fresh chat entry and
must not inherit stale `keyboard-viewport-active`, `keyboard-context-mode`, or
bottom-nav reservation values.

Codex Mobile Web uses:

```text
codex-mobile.plugin.refresh_required
```

Future embedded plugins use the same convention by default:

```text
<plugin-id>.plugin.refresh_required
```

Hermes Mobile treats the Codex-specific value as one instance of the generic
plugin host contract, not as a Codex-only mechanism.

Recommended Codex trigger points:

- server build/version changed while the plugin iframe is mounted;
- plugin session cookie or launch token is known to be invalid;
- Codex account/auth state changed and the existing iframe cannot recover
  in-place;
- plugin-side API receives an unrecoverable `401` or session-expired response
  in `?embed=hermes` mode.

Payload fields are intentionally optional and bounded. Codex should include
only non-secret route metadata and a short reason code. It must not include
access keys, launch tokens, cookies, raw server logs, prompts, task content, or
private file paths.

## Notification Event Contract

Plugins should not register their own browser Web Push subscriptions inside the
iframe. Hermes Mobile owns the installed PWA window, service worker,
subscription list, Action Inbox projection, and click routing. This is especially
important for local/LAN plugins that are embedded through the Hermes same-origin
proxy or do not expose a public HTTPS origin.

A plugin backend that needs to notify the user should post a bounded event to:

```text
POST /api/hermes-plugins/<plugin-id>/notifications
```

The request uses the normal Hermes access-key auth boundary and is scoped to the
target `workspaceId`. The body must include a stable `sourceId` or `eventId` so
Hermes can dedupe repeated plugin callbacks. Minimal body:

```json
{
  "workspaceId": "owner",
  "eventId": "maintenance-watch-20260529",
  "title": "腕表保养提醒",
  "summary": "有一块腕表到保养时间。",
  "itemType": "todo",
  "priority": "high",
  "route": {
    "name": "watch-maintenance",
    "itemId": "watch-1"
  }
}
```

Hermes Mobile then:

- verifies the plugin is registered and the workspace is authorized;
- for durable user work, upserts a summary-only Action Inbox item with
  `sourceType=plugin`;
- accepts optional bounded `detailMessage` for the Action Inbox detail page.
  Web Push still uses only `title` and `summary`; long final receipts must live
  in `sourceRef.detailMessage`, not in the Push body;
- for ephemeral plugin completion messages, supports push-only delivery through
  `inbox=false`, `createInbox=false`, or `inboxMode=push`;
- treats Codex Mobile task-completion notifications as workspace-scoped
  replacement records: each workspace keeps one latest Codex Inbox item, and a
  new Codex completion overwrites that workspace's previous Codex completion
  entry through the stable dedupe key;
- routes Codex Mobile Web Push clicks directly to the Codex plugin tab by
  default, while still carrying the Inbox item id as metadata;
- suppresses Codex Mobile completion Web Push until the event is terminal
  (`status=done` or `status=archived`), includes a bounded final
  `detailMessage.body`, and carries a stable route anchor such as
  `pluginThreadId`, `pluginTaskId`, `pluginItemId`, or `sourceTurnId`;
- stores only bounded route metadata in `sourceRef` when an Inbox item is
  created;
- sends Web Push through the Hermes PWA subscription when `notify` is not
  `false`;
- returns the generated Inbox item id when one exists, plus delivery summary,
  without exposing push endpoints or plugin secrets.

Default click behavior opens the Hermes Inbox item when one is created. A
plugin may set `openMode="plugin"` when the notification should click through to
the plugin tab instead. Push-only events always click to the plugin route
because there is no Inbox item.

For Codex Mobile notifications, Hermes routes Action Inbox clicks to the Codex
tab and carries bounded route hints such as `pluginRoute`, `pluginItemId`,
`pluginThreadId`, `pluginTaskId`, and `sourceTurnId` into the iframe entry URL
and the Web Push payload. The Codex plugin project must consume those hints in
embedded mode and focus the matching thread, task, or final-turn receipt start
when available. Web Push clicks follow the same Codex plugin route by default;
the Inbox item id remains metadata for receipt/context, not the primary click
destination. The service worker must preserve plugin route fields before generic
Inbox routing when `openMode=plugin`, so an Inbox-backed Codex completion still
opens the completed plugin receipt rather than the Inbox detail.

For Finance ledger join approval, Finance posts
`type=finance.ledger_join_request` to the same notification route. Hermes
normalizes the bounded request into an Action Inbox `approval` item for the
target workspace. The Inbox action sheet exposes `approve` and `reject`
decisions instead of the ordinary complete/snooze/delete menu. Hermes calls the
Finance review contract first, using the tool shape
`finance.review_ledger_join_request` with `{ request_id, decision, role,
member_ids }` for approval and `{ request_id, decision }` for rejection. Only
after Finance confirms success may Hermes mark the Inbox item `done` or
`dismissed` and request a Finance plugin refresh. Hermes must not create Finance
ledger memberships directly and must not reintroduce QR-code or invite-link
join flows.

Plugin notification events must not include raw access keys, bearer tokens,
launch tokens, push endpoints, database paths, private inventories, raw model
prompts/responses, reasoning, raw tool payloads, command output, file diffs, or
long logs. `detailMessage.body` is only for bounded final receipts such as
Codex final assistant text and usage summary; cap it before submission and set
`truncated=true` when shortened.

## Plugin-Side Requirements

Each plugin project must implement the embedded contract before Hermes Mobile
can treat it as a production tab. A manifest endpoint alone is not enough.

Required plugin-side behavior:

- Publish a Hermes plugin manifest endpoint, usually
  `GET /api/v1/hermes/plugin/manifest`.
- Support an embedded entry, usually `/?embed=hermes`, where duplicate app
  chrome, login splash pages, and unrelated landing content are hidden.
- Support a server-side launch endpoint, usually
  `POST /api/v1/hermes/plugin/launch`, that accepts a workspace-bound long-lived
  key from Hermes Mobile and returns only a short-lived `entry_path`.
- Never put the long-lived plugin key, bearer token, raw launch token payload,
  database path, local secret path, or user inventory/content dump into the
  manifest, iframe URL, frontend state, logs, screenshots, or docs.
- Provide a registration/config route or admin workflow for allowing the Hermes
  origin in frame embedding. In HTTPS production, this must include the real
  Hermes origin, not a hard-coded personal domain.
- For external plugins, provide a configurable HTTPS public/plugin base URL for
  HTTPS Hermes deployments. For local plugins, integrate through a Hermes
  same-origin proxy so the browser never receives a `127.0.0.1` iframe URL.
- Send bounded route state to the parent with
  `<plugin-id>.plugin.navigation`, including `canGoBack` and a small route
  object. Do not send private page content or raw business data.
- Listen for `hermes.plugin.back` from the parent and perform in-iframe back
  navigation. This must handle detail pages, modal/lightbox/drawer states, and
  edit forms before asking the parent to leave the plugin tab.
- After internal navigation or back handling, emit a fresh navigation state or a
  `<plugin-id>.plugin.back_result` event so Hermes Mobile can update the
  top-left/back-swipe affordance and know when the plugin did not consume the
  back request.
- Preserve session state across ordinary tab switches. Hermes Mobile keeps the
  iframe node alive, but the plugin must not force reload itself on visibility
  changes or convert tab focus into a new login flow.
- Avoid `window.open`, `target=_blank`, browser-shell handoff, or external
  secondary windows for plugin-owned pages.

Recommended manifest additions:

```json
{
  "navigation": {
    "state_event": "<plugin-id>.plugin.navigation",
    "back_event": "hermes.plugin.back",
    "back_result_event": "<plugin-id>.plugin.back_result",
    "preserve_iframe_state": true
  },
  "embedding": {
    "requires_https_for_https_parent": true,
    "frame_ancestor_registration": true
  }
}
```

Hermes Mobile may still embed a plugin that omits these optional metadata
fields, but the plugin must satisfy the behavior through tests before release.

## Plugin-Side Harness

Every plugin project should add its own harness tests, separate from Hermes
Mobile tests. The plugin-side harness should prove:

- Manifest shape: `id`, `kind=embedded_app`, entry URL, launch path, auth
  strategy, and no raw key fields.
- Launch exchange: valid workspace key returns short-lived `entry_path`; invalid
  or unauthorized workspace returns `401`/diagnostic; no long-lived key appears
  in the launch response.
- Frame policy: the configured Hermes origin is allowed by `frame-ancestors`;
  unregistered origins are rejected or reported.
- HTTPS entry gate: when the manifest is queried with an HTTPS Hermes origin,
  the browser-facing `entry.url` is either HTTPS or a Hermes same-origin proxy
  URL. Localhost/LAN HTTP may remain only as a server-side upstream.
- Same-origin proxy: local/LAN plugin proxies must be tested through the real
  dispatcher path `/api/hermes-plugins/<plugin-id>/proxy/...`, not only by
  invoking the plugin route handler directly. The test must cover HTML/JS/CSS
  absolute path rewriting and launch/session cookie or redirect preservation
  without printing short-lived launch tokens. The proxy must request the plugin
  upstream with manual redirect handling so a launch `302` does not get consumed
  by server-side `fetch`. Any upstream `Set-Cookie` returned through the proxy
  must drop upstream `Domain` and rewrite `Path` to the plugin proxy prefix, for
  example `/api/hermes-plugins/<plugin-id>/proxy`, so the installed PWA iframe
  keeps the plugin session instead of falling back to a username/password page.
  JSON resource fields must also be rewritten for plugin-owned image,
  attachment, file, thumbnail, preview, icon, and download endpoints. This must
  be generic for newly installed plugins: if a plugin returns a bounded JSON
  field whose key is clearly URL-like, such as `url`, `imageUrl`, `attachmentUrl`,
  `thumbnailUrl`, `previewContentUrl`, `fileUrl`, `downloadUrl`, `src`, or
  `href`, and the value is a local absolute path, Hermes rewrites it to the
  same plugin proxy prefix. HTML-like JSON fields such as `body` may also have
  `src`/`href`/`url(...)` references rewritten. Ordinary prose fields must not
  be changed. For Note this means `/api/v1/app/attachments/<attachmentId>` image
  URLs in imported-note bodies and attachment metadata load through the Hermes
  same-origin proxy instead of falling back to the Hermes host root.
- Embed mode: `/?embed=hermes` hides standalone app chrome and does not show a
  username/password login after a valid launch.
- Navigation event: entering a secondary page sends
  `<plugin-id>.plugin.navigation` with `canGoBack=true`.
- Back event: receiving `hermes.plugin.back` changes the iframe route instead
  of navigating the parent page; closing modal/lightbox/edit states is covered.
  If the plugin emits `<plugin-id>.plugin.back_result` with `handled=false`, the
  host clears plugin-level back state and lets Hermes own the next outer back
  layer.
- State preservation: switching away from the plugin tab and back does not
  replay an expired launch URL or lose the current plugin route.
- Windowing: plugin-owned links and details stay in the same iframe; no
  `window.open` or `target=_blank` for internal pages.
- Notification mode: durable plugin notifications can create Inbox items, but
  push-only plugin events must not create Inbox clutter. Codex Mobile task
  completion keeps one latest Inbox record per workspace and should route back
  to the Codex tab.
- Mobile PWA smoke: at least one installed-PWA run verifies the plugin opens,
  navigates to a secondary page, handles right-swipe/back, and returns without
  browser chrome.

## Security And Windowing

- Embedded plugins must stay in the Hermes Mobile app window.
- No `window.open`, `target=_blank`, browser-shell handoff, or external preview
  window is allowed for plugin-owned secondary pages.
- HTTPS Hermes pages must not silently render raw HTTP iframe entries. Use a
  Hermes same-origin proxy for local plugins or show a bounded diagnostic.
- A passing frame-ancestor registration is not enough for release. HTTPS
  deployments must also prove the plugin manifest advertises a secure
  browser-facing iframe entry: HTTPS for external entries, or same-origin proxy
  for local HTTP upstreams.
- Frame-ancestor failures should be detected through manifest/entry probing and
  surfaced as setup diagnostics.
- Mobile browser-shell sessions must not be treated as installed-PWA success.

## Harness Requirements

Embedded app plugin changes are H2 static shell/navigation work unless they also
touch auth persistence, toolset routing, Gateway registration, write workflows,
or plugin service routes.

Required coverage for host-only changes:

- manifest-driven tab visibility and route availability;
- no copied plugin dashboard/business UI in Hermes Mobile;
- no `window.open` / `target=_blank` browser handoff;
- no raw secrets or long-lived keys in frontend payloads or docs;
- short launch URL usage;
- HTTPS parent to secure browser-facing plugin entry validation;
- local HTTP plugin proxy coverage when the upstream is `127.0.0.1` or another
  server-only address;
- persistent iframe host with no DOM reparenting;
- clean blank host during manifest/launch loading;
- postMessage navigation/back contract with origin validation;
- optional `<plugin-id>.plugin.back_result` handling where `handled=false`
  clears host plugin back state instead of leaving a stale main-back affordance;
- host outer-back handling from the plugin root, restoring the Hermes page that
  opened the plugin instead of requiring the plugin to become a first-class
  Hermes page;
- bounded no-ack fallback after `hermes.plugin.back`, so an incomplete plugin
  cannot trap the user inside an iframe;
- parent-owned left-edge swipe handling above plugin iframes, covering plugin
  internal back and host outer return without relying on iframe touch bubbling;
- route-aware plugin iframe source rendering, including any plugin-specific host
  wrapper, so manifest-declared actions arrive as `pluginActionId` and
  `pluginRoute` in the plugin app;
- static client-version bump and service-worker cache update;
- installed-PWA smoke for the target browser class when behavior depends on
  mobile WebKit/Chromium iframe/session behavior.

Owner workspace switching is part of the plugin host permission contract. The
normal embedded-plugin shell is an effective-workspace simulation surface, not
an Owner admin console. If Owner switches from `owner` to `weixin_wuping`, a
non-grantable Owner-critical plugin such as `codex-mobile` must be absent from
the bottom navigation, `GET /api/hermes-plugins?workspaceId=weixin_wuping`, and
`GET /api/hermes-plugins/codex-mobile/manifest?workspaceId=weixin_wuping`.
Workspace-private business plugins such as Wardrobe and Finance may remain
visible only when the target workspace has an explicit grant, an active
provisioning record, or a discovered workspace-local key.

For Wardrobe-specific implementation details, see `docs/MODULES/wardrobe.md`.

## Codex Mobile Plugin

Hermes Mobile reads Codex Mobile Web through the same embedded-app plugin
contract, not through its PWA `public/manifest.json`.

The Codex plugin source manifest is implemented in the local Codex Mobile Web
repository:

- repo: local Codex Mobile Web checkout, for example
  `<local-codex-mobile-web-repo>`
- manifest route: `GET /api/v1/hermes/plugin/manifest`
- default Hermes-side manifest URL:
  `http://127.0.0.1:8787/api/v1/hermes/plugin/manifest`
- Hermes normalized route:
  `GET /api/hermes-plugins/codex-mobile/manifest`
- default server-side access key location:
  `%USERPROFILE%\.codex-mobile-web\access_key`

The Codex manifest declares:

- `id=codex-mobile`
- `kind=embedded_app`
- `entry.url=/?embed=hermes` under the Codex Mobile Web base URL
- `program_api.plugin_launch=/api/v1/hermes/plugin/launch`
- `owner_binding.strategy=codex_mobile_access_key`
- `owner_binding.raw_key_returned_by_codex_mobile=false`

Codex Mobile is `owner-critical`, Owner-only, and non-grantable. It is visible
only when the effective plugin workspace is `owner`. Owner's browser session
must not make Codex visible while simulating or viewing a non-Owner workspace.

Hermes Mobile may override the Codex manifest URL with:

- `HERMES_MOBILE_CODEX_PLUGIN_MANIFEST_URL`
- `HERMES_MOBILE_PLUGIN_CODEX_MOBILE_MANIFEST_URL`

Codex is Owner-only by default in Hermes Mobile. It is not grantable through the
plugin manager. Do not use plugin-manager provisioning to create non-Owner Codex
access; a future restricted Codex mode would need a separate contract.

Hermes Mobile may override the server-side key path with:

- `HERMES_MOBILE_CODEX_PLUGIN_ACCESS_KEY_PATH`
- `CODEX_MOBILE_ACCESS_KEY_PATH`

The browser receives only the short launch entry URL returned by Codex Mobile
Web. Raw Codex Mobile Access Keys must not be exposed in frontend state,
iframe URLs, docs, handoffs, logs, screenshots, or test fixtures.

For HTTPS Hermes PWA deployments, Codex Mobile Web is expected to remain a local
HTTP service. Hermes Mobile therefore rewrites the browser-facing Codex entry to
the same-origin proxy path under `/api/hermes-plugins/codex-mobile/proxy/...`.
The local Hermes-side manifest URL and Codex upstream may still point at
`http://127.0.0.1:8787`; that address is server-side only and must not be the
iframe `src` seen by a phone browser. If a deployment chooses to expose Codex
through its own HTTPS reverse proxy, `CODEX_MOBILE_HERMES_PLUGIN_BASE_URL` or
`CODEX_MOBILE_PUBLIC_BASE_URL` can still be used on the Codex side, but that is
not required for the default local plugin setup.

## Email Plugin

Hermes Mobile registers the Email/邮箱 plugin as a standard `embedded-app`
plugin:

- plugin id: `email`
- title: `邮箱`
- default manifest URL:
  `http://127.0.0.1:5175/api/v1/hermes/plugin/manifest`
- default embedded entry from Email:
  `/?embed=hermes`
- toolset/MCP server: `email` / `email-mcp`
- launch events:
  `email.plugin.navigation`, `email.plugin.back_result`, and
  `email.plugin.refresh_required`

Email is Owner-visible by default in the effective Owner workspace. Non-Owner
workspaces remain hidden until Owner grants that workspace through the plugin
manager, a deployment workspace allowlist, or a discovered workspace-local
`.hermes-email/access-key.txt`.

Email workspace provisioning is an H1 plugin authorization workflow. When Owner
grants `email` to a non-Owner workspace, Hermes Mobile calls Email's
server-side registration endpoint:

```text
POST /api/v1/hermes/plugin/workspaces
```

The call is authenticated with a server-side Email Owner key read from
`HERMES_MOBILE_EMAIL_PLUGIN_OWNER_KEY_PATH`,
`HERMES_MOBILE_PLUGIN_EMAIL_OWNER_KEY_PATH`, `EMAIL_HERMES_OWNER_KEY_FILE`, or
`<HERMES_DATA_DIR>\plugin-secrets\email-owner-key.txt`. The registration body
contains bounded workspace identity and the target workspace root; Email owns
writing `.hermes-email/config.json` and `.hermes-email/access-key.txt` under
that workspace. Hermes stores only bounded `active` or
`provisioning_failed` status. Pending or failed Email provisioning must block
non-Owner list/manifest/launch so the tab does not appear usable before the
plugin-side workspace exists.

Email launch uses the generated workspace key as a server-side
`Authorization: Bearer ...` credential to Email's
`POST /api/v1/hermes/plugin/launch`. The browser receives only the short-lived
entry path rewritten through `/api/hermes-plugins/email/proxy/...` when the
plugin is local HTTP. Hermes Mobile must not own Email OAuth tokens, IMAP app
passwords, mailbox sync cursors, local message bodies, attachments, provider
SDKs, or mailbox UI logic.

Email model-side access must also use the generic workspace-local MCP isolation
contract. The Email MCP wrapper should read `.hermes-email/config.json` and
`.hermes-email/access-key.txt`, call Email APIs with the workspace-local key,
and never receive provider OAuth tokens or raw mailbox credentials from Hermes.
Gateway profiles that expose the `email` toolset must bind the MCP to the
effective Hermes workspace directory and reject workspace override. If an Owner
session switches into another workspace and no Email-bound profile exists for
that workspace, Hermes must omit the Email MCP/toolset rather than using
Owner's Email MCP.

Local Windows production Gateway profiles run Email MCP through
`email-mcp/scripts/email-mcp-wrapper.py` under the Gateway worker root. The
wrapper exchanges the workspace-local key for a short-lived Email launch
session through `POST /api/v1/hermes/plugin/launch`, then uses that session for
Email API calls. It exposes Gateway-local tool names such as `list_accounts`,
`search_messages`, `get_digest`, and `get_message`, so the final model callables
are single-prefixed names such as `mcp_email_search_messages`. The generated
profile passes `--workspace <target-user-root>`, `--no-workspace-override`, and
`--api-base-url <Email service URL reachable from the Gateway worker>`. On WSL
local production the API base should use the Windows host gateway on port
`5175`, not WSL loopback. Owner maintenance profiles must include the same Email
MCP binding when the Owner workspace has `.hermes-email/config.json` plus
`access-key.txt`.

Raw Email Owner keys, workspace keys, launch tokens, session cookies, full mail
bodies, attachment content, and provider credentials must not appear in
manifests, iframe URLs, postMessage payloads, frontend state, docs, handoffs,
screenshots, logs, or tests.

## Finance Plugin

Hermes Mobile registers the Finance/记账 plugin as a standard `embedded-app`
plugin:

- plugin id: `finance`
- title: `记账`
- default manifest URL:
  `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`
- default embedded entry from Finance:
  `/finance.html?embed=hermes`
- toolsets: `finance`
- MCP server: `finance`
- declared permissions: `finance:read`, `finance:write`

Finance is Owner-visible by default. Non-Owner workspaces remain hidden and
cannot launch Finance unless Owner explicitly grants the workspace through
the side navigation plugin manager or through
`HERMES_MOBILE_PLUGIN_FINANCE_WORKSPACES`.

The Hermes Mobile bottom-tab entry for Finance must use the same authorization
projection as launch: Owner sees it by default, while Non-Owner workspaces see
it only after `GET /api/hermes-plugins?workspaceId=<workspace>` includes
`finance`. Do not gate Finance navigation on `state.auth.isOwner` alone;
otherwise an authorized workspace can launch through the backend contract but
still miss the visible tab in its own PWA session.

Wardrobe follows the same bottom-tab projection rule even though it still has a
specialized host file for its one-time launch and navigation health checks.
Owner sees Wardrobe by default only in the effective Owner workspace. When Owner
switches to a non-Owner workspace, or when a non-Owner user opens Hermes
directly, the Wardrobe tab must use the ordinary plugin list for that workspace
and appear only when the list includes `wardrobe`. Directory names and
`wardrobe` toolset policy may guide model routing, but they must not bypass the
plugin authorization/list contract for tab visibility.

The Finance manifest may use the compact top-level shape:

```json
{
  "id": "finance",
  "title": "记账",
  "type": "embedded-app",
  "entry": "http://127.0.0.1:8791/finance.html?embed=hermes",
  "launch": "http://127.0.0.1:8791/api/v1/hermes/plugin/launch",
  "toolsets": ["finance"],
  "mcpServer": "finance",
  "permissions": ["finance:read", "finance:write"],
  "embedding": {
    "state_event": "finance.plugin.navigation",
    "back_event": "hermes.plugin.back",
    "back_result_event": "finance.plugin.back_result",
    "refresh_required_event": "finance.plugin.refresh_required",
    "preserve_iframe_state": true
  }
}
```

Hermes Mobile normalizes this compact shape into the same internal contract used
by Wardrobe and Codex. When Hermes Mobile runs as HTTPS, the browser-facing
Finance iframe entry is rewritten to:

```text
/api/hermes-plugins/finance/proxy/...
```

The Finance upstream remains a local HTTP service at `127.0.0.1:8791`; the phone
PWA never receives that local HTTP URL as an iframe `src`.
If Finance returns forwarded HTTPS `entry` / `launch` URLs after seeing
`x-hermes-public-origin`, Hermes Mobile still performs server-side launch
against the configured local manifest upstream and then rewrites the short
launch entry to the same-origin proxy. The forwarded HTTPS values are
browser-facing hints, not the server-side upstream for launch.

Finance launch uses a server-side workspace key file. Hermes Mobile looks for it
in this order:

- explicit option or `HERMES_MOBILE_FINANCE_PLUGIN_ACCESS_KEY_PATH`
- `HERMES_MOBILE_PLUGIN_FINANCE_ACCESS_KEY_PATH`
- `FINANCE_HERMES_PLUGIN_ACCESS_KEY_PATH`
- for Owner only, the configured Hermes Mobile Owner key path
  `HERMES_WEB_AUTH_KEY_PATH`
- `.hermes-finance/access-key.txt` or `.hermes-finance/workspace-key.txt` under
  the current workspace drive root

For Finance only, Hermes Mobile sends the launch body fields `workspace_id`,
`workspace_key`, and `role` to match Finance's workspace launch contract.
Hermes Mobile sends `user_key` only when it has a separate workspace-user key;
it must not reuse the long-lived workspace key as `user_key`. Hermes Mobile
must also not send the Finance workspace key in an `Authorization: Bearer ...`
header during launch, because Finance's independent direct-login token resolver
owns Bearer credentials. No raw key is returned in the normalized manifest,
frontend state, iframe URL, docs, handoffs, screenshots, or logs.

Finance launch diagnostics must separate the stages:

- Hermes Mobile manifest route:
  `GET /api/hermes-plugins/finance/manifest?workspaceId=<workspace>&appOrigin=<origin>`
- Finance upstream manifest:
  `GET http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`
- Finance upstream launch, server-side only:
  `POST http://127.0.0.1:8791/api/v1/hermes/plugin/launch`
- Browser-facing iframe entry:
  `/api/hermes-plugins/finance/proxy/api/v1/hermes/plugin/launch/<redacted>`
- Expected launch redirect shape:
  `/api/hermes-plugins/finance/proxy/finance.html?embed=hermes`
- Expected session cookie name:
  `finance_hermes_session`

If Finance returns `finance_access_token_invalid` during launch, first verify
that Hermes Mobile is not sending `Authorization: Bearer <workspace-key>`. That
error belongs to Finance's independent direct-login access-token resolver, not
to the Hermes workspace-key launch contract. Record only bounded error fields
such as HTTP status, route path, error code, request id, and token status. Do
not record raw workspace keys, Finance access tokens, launch tokens, session
cookie values, private finance rows, or full plugin payloads.

Finance iframe navigation uses:

- `finance.plugin.navigation`
- `hermes.plugin.back`
- `finance.plugin.back_result`
- `finance.plugin.refresh_required`

The host behavior is identical to Codex/Wardrobe: preserve the iframe on tab
switch, process `back_result handled=false` as an outer-return signal, throttle
refresh-required loops, and keep the root plugin page as a same-window bottom-tab
destination.

## Paste-To-Plugin-Project Template

Use this template when asking a plugin project to complete Hermes Mobile
embedded support:

```text
Please complete the Hermes Mobile embedded-plugin contract for this plugin.

Hermes Mobile will load this project through its generic embedded app host, not
by copying your UI into Hermes Mobile. The plugin project must own the embedded
UI, session, route state, and right-swipe/back handling.

Required work:

1. Manifest
   - Expose GET /api/v1/hermes/plugin/manifest.
   - Return id, title, kind=embedded_app, entry.url, program_api.plugin_launch,
     owner_binding strategy, and optional navigation metadata.
   - Do not return raw access keys, bearer tokens, launch-token secrets, local
     secret paths, database paths, or private content dumps.

2. Launch/session
   - Expose POST /api/v1/hermes/plugin/launch.
   - Hermes Mobile will call it server-side with the workspace-bound plugin key.
   - Return only a short-lived entry_path such as /?embed=hermes&launch=...
   - The iframe must not fall back to username/password login after a valid
     launch.

3. HTTPS/frame embedding
   - Provide a generic way to register allowed Hermes origins for
     frame-ancestors / CSP.
   - Do not hard-code one personal domain. Other deployments will use their own
     HTTPS origins.
   - If Hermes is HTTPS, the browser-facing iframe URL must be HTTPS or a
     Hermes same-origin proxy URL. Registering frame-ancestors alone is not
     sufficient.
   - External plugin deployments should provide a deployment-owned
     public/plugin base URL environment variable. Local plugins may remain
     localhost HTTP upstreams when Hermes Mobile owns the same-origin proxy.

4. Embedded mode
   - /?embed=hermes should hide duplicate standalone app chrome and login splash
     UI.
   - The embedded page should fit a mobile PWA iframe and not create left/right
     margins or temporary preflight pages.

5. Navigation/back contract
   - After route changes, post:
     { type: "<plugin-id>.plugin.navigation", version: 1, canGoBack, route }
     to the Hermes parent origin.
   - Listen for { type: "hermes.plugin.back", version: 1 }.
   - Handle iframe-internal back first: close lightbox/drawer/modal/edit state,
     then detail page to list/root.
   - Emit a fresh navigation event after handling back.
   - Do not ask Hermes Mobile to inspect plugin DOM or call plugin route
     functions.

6. Windowing
   - Internal plugin pages must stay in the same iframe.
   - No window.open, target=_blank, browser-shell handoff, or external secondary
     windows for plugin-owned pages.

7. State preservation
   - Hermes Mobile will preserve the iframe DOM node across tab switches.
   - The plugin should not force reload on visibility/focus changes.
   - Switching away and back must not replay an expired one-time launch URL.

8. Tests
   - Add plugin-side tests for manifest, launch, frame-ancestor/origin
     registration, embed mode, navigation postMessage, hermes.plugin.back,
     no window.open/target=_blank, and mobile PWA smoke.

When this is done, Hermes Mobile can add or keep the plugin tab through
GET /api/hermes-plugins/<plugin-id>/manifest and does not need plugin-specific
business UI code.
```
