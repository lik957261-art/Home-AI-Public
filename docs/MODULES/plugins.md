# Embedded App Plugins

Last updated: 2026-05-30.

This module describes the Hermes Mobile embedded-app plugin contract. A plugin
is an external product surface mounted inside Hermes Mobile. Hermes owns the
host shell, auth boundary, manifest normalization, same-window navigation, and
model toolset routing. The plugin project owns its UI, API, database, business
logic, and MCP wrapper.

Wardrobe is the first production plugin. Codex Mobile Web is the second plugin
path and is integrated from the local Codex Git repo's Hermes plugin manifest.
Finance/记账 is the third embedded-app plugin and uses the same generic host,
launch, proxy, navigation, and refresh contracts. These rules are generic and
apply to future embedded apps such as watches, health, or other private
workspace tools.

## Source Of Truth

- Plugin behavior comes from the plugin project's manifest and docs.
- Hermes Mobile must not copy plugin screens, detail pages, settings,
  import/export flows, or business workflows into this repository.
- Hermes Mobile may add a tab, iframe host, manifest route, launch-token
  exchange, diagnostics, and route/toolset projection.
- Model-side actions should use the plugin's MCP/toolset when the task requires
  model reasoning or write/readback verification. Human UI operation remains in
  the embedded app.

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

For local or LAN plugins such as Codex Mobile Web and Wardrobe, Hermes Mobile
should provide a same-origin proxy entry instead of asking the user to configure
TLS or a reverse proxy. The browser sees an HTTPS Hermes path such as
`/api/hermes-plugins/<plugin-id>/proxy/...`; Hermes server-side code forwards
that request to the plugin's configured HTTP upstream. Registering the Hermes
origin in `frame-ancestors` is still required for direct external plugin
entries, but it is not enough by itself to make an HTTP iframe valid inside an
HTTPS PWA.

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
`/api/v1/items/<code>/photos/...`.
The rewritten browser-facing path must stay under
`/api/hermes-plugins/<plugin-id>/proxy/...`. Binary image responses are then
fetched through that proxy path and streamed back with their original content
type. Without this, HTTPS Hermes Mobile PWAs can load the plugin shell while
plugin-supplied images remain broken because the browser is asked to fetch the
HTTP/LAN upstream directly.

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

Installed plugins are Owner-visible by default. A non-Owner workspace must not
see or launch an installed plugin until Owner has explicitly authorized that
workspace for the plugin.

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

For Finance, a plugin-manager grant is also a provisioning workflow. When Owner
grants `finance` to a non-Owner workspace, Hermes Mobile must create a
workspace-local server-side key at
`<HERMES_DATA_DIR>\drive\users\<workspaceId>\.hermes-finance\access-key.txt`
when one does not already exist, then call the Finance loopback binding
contract `POST /api/v1/hermes/plugin/users/bind` with bounded workspace
identity: `target_workspace_id`, UTF-8 `display_name`, `role=owner`, and
`admin_workspace_id=owner`. The display name should come from the Hermes
workspace label so Finance user and ledger names do not inherit mojibake from
PowerShell or ad-hoc repair scripts. A successful bind updates the authorization
record to `provisioningStatus=active`; a key or bind failure keeps the grant
record but marks `provisioningStatus=provisioning_failed` with a bounded error.
Pending or failed Finance provisioning must block non-Owner list/manifest/launch
access and the plugin manager must show a diagnostic such as
`authorized / provisioning_failed` instead of making the plugin look fully
usable. Hermes must not store or return the raw Finance workspace key in the
authorization record, frontend state, iframe URL, postMessage payload, docs,
handoffs, screenshots, or logs.

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
non-Owner Codex grants. Codex contains code execution, file access, long-lived
thread context, and task-agent surfaces, so it remains Owner-only unless a
separate restricted Codex product mode is designed and reviewed.

The side navigation plugin manager is the canonical admin surface for installed
plugin authorization:

- Owner can list installed plugins, their risk level, provisioning mode, and
  workspace grant state.
- Owner can grant or revoke normal business plugins for a workspace.
- Non-Owner users never see the plugin manager.
- Revoking a grant removes future list/manifest/launch access for that
  workspace; it does not delete plugin-side business data.
- The manager stores only plugin id, workspace id, timestamps, actor id, and
  bounded provisioning status. It must not store plugin access keys, launch
  tokens, cookies, private business payloads, or raw plugin logs.

Hermes Mobile treats these as authorization evidence:

- Owner auth, including Owner viewing another workspace.
- A plugin manager grant stored in `plugin-workspace-authorizations.json`.
- A plugin-specific authorized-workspace list configured by deployment.
- For Wardrobe only, an existing workspace-scoped Wardrobe key file under the
  workspace drive, because that key is created by the Owner-side Wardrobe
  binding flow.

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
- throttle rebuilds so repeated refresh requests from a failed plugin page
  cannot create an iframe relaunch loop. The default host cooldown is one
  rebuild per plugin per minute, and requests during manifest/launch loading are
  suppressed;
- apply the same cooldown to host-side launch-health retries, and preserve an
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
`tests/embedded-plugin-refresh-harness.test.js`. It simulates iframe
`postMessage` events and asserts wrong-origin rejection, active iframe rebuild,
inactive-tab invalidation, and bounded route-hint preservation.

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
manifest/launch URL, then swaps frames once. Refresh requests emitted during the
first few seconds after frame creation are suppressed unless explicitly forced,
because they commonly represent plugin-side boot reconciliation rather than a
real expired session. Entering a plugin tab must clear stale keyboard viewport
metrics so returning to chat does not leave the composer shifted by an old
mobile keyboard offset.

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
- static client-version bump and service-worker cache update;
- installed-PWA smoke for the target browser class when behavior depends on
  mobile WebKit/Chromium iframe/session behavior.

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
