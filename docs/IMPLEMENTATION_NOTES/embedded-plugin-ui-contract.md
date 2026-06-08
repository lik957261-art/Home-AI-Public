# Embedded Plugin UI Contract

Last updated: 2026-06-08.

This document is the UI/layout contract for Hermes Mobile embedded app plugins.
It applies to Wardrobe, Finance, Email, Health, Note, and future iframe plugins.

## Goal

An embedded plugin should feel like a native mobile app inside Hermes Mobile.
The plugin may have its own bottom navigation, floating buttons, sheets, and
secondary pages, but Hermes owns the outer browser shell and the three-entry
plugin-context footer.

The visible result should match a direct mobile browser view as closely as
possible: plugin content reaches the bottom of its iframe viewport, and Hermes
navigation sits outside that viewport.

## Host Responsibilities

Hermes Mobile owns these behaviors:

- create the iframe through the normalized plugin manifest;
- keep the iframe in the same window;
- hide the normal Hermes topbar/header while an embedded plugin iframe is open;
- keep the three-entry plugin-context footer outside the iframe viewport;
- let the iframe start at the top of the available host viewport;
- ensure the iframe bottom edge stops at the Hermes footer top edge;
- derive the iframe bottom reservation from the measured host footer height and
  the layout viewport (`window.innerHeight` / `documentElement.clientHeight`),
  not from a shortened iOS PWA `visualViewport.height`;
- hide the plugin-context footer and reserve zero bottom space while the plugin
  reports a full-screen image/file preview state;
- recompute the iframe viewport when mobile browser chrome, PWA viewport,
  orientation, keyboard, or bottom navigation metrics change;
- reset Home AI's own page scroll back to the viewport origin while an embedded
  plugin iframe is active, because native input focus inside an iframe can pan
  the host page before plugin-side layout code runs;
- treat host window `scroll` as a viewport-settle signal in addition to
  `visualViewport` resize/scroll, because some mobile shells pan the host page
  without delivering a plugin-visible keyboard geometry update on the first
  iframe input focus;
- send only bounded theme/visibility/back/navigation/viewport postMessage
  events;
- never pass raw keys, launch tokens, cookies, or private plugin data to the
  iframe as layout metadata.

Hermes must not use host-owned bottom padding as the only separation between the
iframe and the plugin-context footer. Padding can leave the iframe under the
Hermes footer, while the plugin app also reserves its own bottom bar, producing a
visible blank band.

## Plugin Responsibilities

Each plugin owns the layout inside its iframe:

- render any plugin-specific header, title, or app bar inside the iframe if the
  plugin needs one;
- set its embedded app root to fill the iframe viewport, not the browser window:
  `html`, `body`, and the app root should use `height: 100%` or equivalent
  iframe-relative sizing;
- avoid standalone `100vh` / `100dvh` assumptions for the root shell when
  `embed=hermes`, because mobile browser and WebAPK viewport units may include
  browser chrome differently from iframe geometry;
- if the plugin has a native bottom nav, make it a plugin-owned fixed or sticky
  footer at `bottom: 0` inside the iframe;
- the main plugin content should reserve only the plugin's own footer height,
  not Hermes Mobile's footer height;
- the plugin footer must not create an extra spacer below itself;
- plugin secondary pages should use plugin-owned back/navigation first and
  report `canGoBack` through the postMessage navigation contract when possible.
- plugin full-screen image/file previews should report the temporary preview
  state through `previewFullscreen`, `fullscreenPreview`,
  `imagePreviewFullscreen`, `hermes.plugin.preview`, or
  `hermes.plugin.fullscreen`, then clear it when the preview closes.
- when `embed=hermes`, listen for the host `hermes.plugin.viewport`
  postMessage event for iframe bounds, Home AI footer geometry, host-bottom
  reservation, and diagnostics. Plugins may use their own viewport model for
  native system keyboard positioning, but they must not add Home AI footer
  height to plugin-owned scroll padding when the host iframe already stops at
  the footer.

This contract does not make plugin projects responsible for Hermes-owned topic
chat composer layout. A plugin-bound topic chat is a Hermes Mobile chat surface;
the plugin only changes which plugin context is active. Plugin projects are
responsible for their own iframe bottom labels/tabs: keep them at the bottom of
the iframe and reserve only plugin-owned footer space inside plugin-owned
scroll containers.

## Host Viewport Bridge

Hermes Mobile sends a bounded `postMessage` to the active embedded plugin iframe
whenever the host iframe is attached, rendered, loaded, made visible, or the
host keyboard/viewport/plugin-context footer metrics change. Host
`visualViewport` resize, scroll, and orientation changes must also schedule a
short settled broadcast sequence, because mobile iframe focus can open the
native keyboard without going through the Home AI composer focus path:

```js
{
  type: "hermes.plugin.viewport",
  version: 1,
  pluginId: "finance",
  workspaceId: "owner",
  reason: "plugin_context_viewport",
  viewport: {
    width: 390,
    height: 624,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
    layoutWidth: 390,
    layoutHeight: 844
  },
  keyboard: {
    visible: true,
    bottomInset: 274,
    offsetTop: 0,
    height: 274
  },
  iframe: { top: 0, right: 390, bottom: 570, left: 0, width: 390, height: 570 },
  host: { top: 0, right: 390, bottom: 570, left: 0, width: 390, height: 570 },
  footer: {
    visible: true,
    rect: { top: 570, right: 390, bottom: 624, left: 0, width: 390, height: 54 },
    bottom: 12,
    offsetHeight: 58,
    reservedHeight: 80,
    stackHeight: 80,
    pluginContextBottom: 54,
    measuredStackHeight: 80
  }
}
```

The payload is layout metadata only. It must not contain raw keys, launch
tokens, cookies, plugin private data, route URLs, or user content. The host sends
it to the iframe entry origin recorded in the normalized manifest. Repeated
settled broadcasts may send the same bounded payload shape several times during
keyboard animation; plugins should treat the latest event as authoritative.

Plugins should treat the latest `hermes.plugin.viewport` payload as
embedded-mode host geometry:

- avoid adding Home AI footer height to plugin scroll padding when the iframe
  already ends at `footer.rect.top`;
- use `iframe.height` / `host.height` to size iframe-root panels when
  `embed=hermes`;
- keep native keyboard positioning owned by either the plugin's local viewport
  model or an explicit plugin-side contract; the host payload is not raw system
  input-method state.

## Floating Buttons And Local Action Bars

Plugin-owned floating buttons and local action bars belong inside the iframe.
They should be positioned relative to the plugin's own footer, not relative to
Hermes Mobile's outer footer.

Required behavior:

- A plugin FAB should sit above the plugin's own bottom nav when that nav exists.
- If there is no plugin bottom nav, a FAB may sit near the iframe bottom safe
  area.
- The FAB/action bar must not be placed in the empty space between the plugin
  iframe and Hermes footer.
- The FAB/action bar must not overlap Hermes' three-entry plugin-context footer.
- Local action bars should be compact and browser-toolbar-like on mobile:
  icon-first, single row, no oversized text buttons, and no stacked framed cards.

Recommended CSS pattern inside a plugin:

```css
.plugin-shell {
  min-height: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.plugin-main {
  min-height: 0;
  overflow: auto;
}

.plugin-bottom-nav {
  position: sticky;
  bottom: 0;
  min-height: 52px;
}

.plugin-fab {
  position: fixed;
  right: 16px;
  bottom: calc(64px + env(safe-area-inset-bottom));
}
```

For plugin iframe pages, prefer a grid/flex shell over a body-level scroll with a
large bottom spacer. Body-level spacers are hard to distinguish from host
viewport bugs and often create the "floating above the footer" effect.

## Visual Harness

For every plugin UI integration or layout change, the validation must include:

- local Hermes Mobile production or dev server serving the expected client
  version;
- Android PWA or WebAPK/CDP smoke when a device is available;
- one open-plugin check per touched plugin;
- measured `iframe.bottom` and Hermes footer `top`, with acceptable gap from
  `-2px` to `2px`;
- measured plugin-owned bottom nav, if present, with its bottom at the iframe
  viewport bottom or within `2px`;
- host `hermes.plugin.viewport` postMessage evidence for iframe attach/load and
  keyboard or visual viewport changes; the payload must include bounded
  viewport, keyboard, iframe, host, and footer fields without secrets;
- screenshot evidence for visual review when the change affects spacing,
  navigation, or fixed/floating controls.

Finance-like pages with their own bottom nav are the baseline example: the
plugin local nav should remain visible and close to the Hermes footer without an
extra blank band. If one plugin differs while others are correct, treat it as a
plugin-side embedded-layout issue unless host geometry proves otherwise.
