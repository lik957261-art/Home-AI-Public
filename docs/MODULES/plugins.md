# Embedded App Plugins

Last updated: 2026-05-29.

This module describes the Hermes Mobile embedded-app plugin contract. A plugin
is an external product surface mounted inside Hermes Mobile. Hermes owns the
host shell, auth boundary, manifest normalization, same-window navigation, and
model toolset routing. The plugin project owns its UI, API, database, business
logic, and MCP wrapper.

Wardrobe is the first production plugin. Codex Mobile Web is the second plugin
path and is integrated from the local Codex Git repo's Hermes plugin manifest.
These rules are generic and apply to future embedded apps such as watches,
health, finance, or other private workspace tools.

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

Registration is not complete until a smoke check proves:

- the manifest queried with the real Hermes HTTPS origin returns an HTTPS
  `entry.url` or a Hermes same-origin proxy URL;
- `program_api.base_url` is HTTPS for direct external entries, or remains only a
  server-side local/LAN upstream when Hermes returns a same-origin proxy URL;
- `frame-ancestors` includes the same Hermes HTTPS origin;
- a launch call returns a short-lived relative entry path and no long-lived
  secret;
- the installed PWA opens the iframe without browser mixed-content errors,
  browser chrome, or a fallback login page.

Production PWA validation must start from the installed home-screen Hermes
Mobile icon. Opening the Hermes URL in the browser address bar is a different
mode and intentionally shows the browser-shell guard page. That browser mode
must not be used as evidence that an embedded plugin works or fails in the
standalone PWA.

If a plugin cannot provide either a secure browser-facing entry or a Hermes
same-origin proxy entry for an HTTPS Hermes deployment, Hermes Mobile should
show a bounded setup diagnostic instead of trying to embed it.

## Auth And Launch

Installed plugins are Owner-visible by default. A non-Owner workspace must not
see or launch an installed plugin until Owner has explicitly authorized that
workspace for the plugin.

Hermes Mobile treats these as authorization evidence:

- Owner auth, including Owner viewing another workspace.
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
pages keep the bottom navigation as the app-level escape hatch; plugin
secondary pages hide the bottom navigation through the same `main-back-visible`
contract used by native Hermes secondary pages. Plugin-owned headers and route
controls stay inside the iframe.

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
- `HERMES_MOBILE_PLUGIN_CODEX_MOBILE_WORKSPACES` for explicitly authorized
  non-Owner workspace ids

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
