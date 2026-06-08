# Embedded Surface Bottom Layout Standard

Last updated: 2026-06-03.

This is the shared Hermes Mobile layout standard for bottom controls on surfaces
that live under Hermes Mobile navigation. It separates two different cases:

- Hermes-owned chat surfaces, including plugin-bound topic chats and
  directory-bound topic chats;
- plugin-owned iframe app surfaces, where the plugin lays out its own bottom
  tabs inside its own iframe.

The 2026-06-03 incident was in the Hermes-owned plugin-bound topic chat, not in
the plugin iframe apps. Plugin apps only need the plugin-owned bottom-tab rule in
this document.

## Problem This Standard Prevents

Hermes Mobile has several bottom-owned layers:

- the normal five-entry mobile app navigation;
- the three-entry plugin-context navigation;
- the ordinary chat composer;
- plugin-owned local bottom navs inside iframes;
- iOS safe-area and browser/PWA viewport chrome.

If a Hermes-owned page handles these layers by adding broad `app` or `main` bottom padding,
the result is unstable: one device may look correct, another shows a blank band,
and auto-scroll can land the newest content underneath the composer. The correct
solution is to identify the owner of each bottom layer and reserve space only in
the scroll container that can be covered by that owner.

## Non-Negotiable Rules

- Reuse the standard Hermes chat composer behavior for all Hermes-owned chat
  topics. A plugin-bound topic chat is still a chat topic; the only bottom-nav
  difference is that the normal five-entry nav is replaced by the three-entry
  plugin-context nav.
- Do not make plugin-bound topic chat layout a separate visual language.
- Do not add visible bottom padding to `.app`, `.main`, or another outer shell
  as the primary fix for a Hermes composer/footer overlap.
- Do not stack multiple bottom spacers for the same footer.
- Do not rely on `100vh` or `100dvh` for embedded roots where an iframe or PWA
  shell already owns the viewport.
- Fixed or sticky bottom controls must have an explicit matching reservation in
  the scrollable content they cover.
- The reservation belongs in the scroll container, not in the outer page shell.
- The reservation must include iOS safe-area behavior when the control can sit
  above the device bottom edge.
- A successful fix is not complete until old clients are proven to receive a
  refresh marker for the new static version.

## Hermes-Owned Chat Topic Pattern

For ordinary chat topics and plugin-bound topic chats:

- `.conversation` is the scroll container whose newest messages can be covered.
- `.composer` is the Hermes-owned message input/action bar.
- The mobile app bottom nav or plugin-context bottom nav sits below the composer
  when that surface needs both a composer and bottom navigation.
- Any extra space needed to prevent auto-scroll clipping must be added to the
  conversation reserve, not to the page shell.

The plugin-bound topic detail pattern is:

```css
.app.main-back-visible.plugin-context-nav-mode.plugin-topic-detail-mode .main {
  position: relative;
  min-height: 0;
}

.app.main-back-visible.plugin-context-nav-mode.plugin-topic-detail-mode .conversation {
  padding-bottom: var(--plugin-topic-composer-reserved-height);
}

.app.main-back-visible.plugin-context-nav-mode.plugin-topic-detail-mode .composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--plugin-topic-composer-bottom-offset);
  z-index: 39;
  padding-bottom: 6px;
}
```

This mirrors the working Finance embedded-page mental model:

- the bottom control is fixed at the bottom owner boundary;
- the plugin-topic composer offset includes the bottom nav bottom inset, bottom
  nav height, bottom tab visual lift, and a minimum composer/nav gap;
- the scroll container reserves the space that the fixed control covers;
- the outer shell does not create a visible blank band.

## Plugin-Owned Iframe Bottom-Tab Pattern

This is the only part plugin projects need for their own bottom labels/tabs.
Hermes host owns only the iframe viewport and the outer plugin-context footer.
The plugin owns everything inside the iframe.

Required plugin behavior:

- plugin root fills the iframe, not the browser window;
- plugin content scrolls inside the plugin shell;
- plugin-owned bottom nav is inside the iframe at `bottom: 0`;
- plugin-owned content reserves only the plugin-owned footer height;
- Hermes footer space is not duplicated inside the plugin.

Recommended plugin shell:

```css
.plugin-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.plugin-content {
  min-height: 0;
  overflow: auto;
}

.plugin-bottom-tabs {
  position: sticky;
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
```

See `docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md` for the iframe
contract. This document adds the common bottom-layout rule shared with
Hermes-owned plugin topic chats.

## Implementation Checklist

Before changing a bottom-layout bug:

1. Identify the surface:
   - ordinary Hermes chat;
   - plugin-bound Hermes topic chat;
   - plugin-owned iframe app;
   - directory/file preview;
   - another secondary page.
2. Identify the bottom owners:
   - five-entry app nav;
   - three-entry plugin-context nav;
   - Hermes composer;
   - plugin-owned iframe bottom nav;
   - full-screen preview overlay.
3. Identify the scroll container that can be covered.
4. Put fixed/sticky controls at their owner boundary.
5. Put the matching reserve only on the covered scroll container.
6. Avoid outer-shell padding unless the shell itself is the scroll container.
7. Bump the static version when any cached public asset changes.
8. Prove refresh behavior with `/api/client-version` for the previous client
   version.
9. Validate on a real mobile viewport. If the user reports an iOS-only issue
   and only Android is available locally, report the limitation explicitly.

## Regression Signals

Treat these as failing states:

- input bar floats over messages without a scroll reserve;
- visible blank band appears between composer and bottom navigation;
- auto-scroll lands the newest message partly under the composer;
- old client does not show a refresh action or version mismatch after deploy;
- plugin topic chat differs visually from ordinary chat except for the
  three-entry plugin-context bottom nav;
- iframe plugin content reserves both plugin footer and Hermes footer space;
- full-screen previews still show Hermes headers or footers.

## Harness Expectations

Focused tests should assert the actual layout contract, not only that a class
exists:

- the relevant static client version is present in `index.html`,
  `service-worker.js`, `directory-viewer.html`, and UI tests;
- plugin-bound topic detail has fixed composer above
  `--plugin-topic-composer-bottom-offset`;
- the conversation reserve is present and large enough for the fixed composer,
  the composer context/status strip, bottom navigation, and tab visual lift;
- failed outer-shell padding strategies are not reintroduced;
- refresh notice or badge behavior is forced when the server reports
  `refreshRequired=1`.

Visual/device validation should capture:

- composer bottom and plugin-context footer top;
- last visible message bottom vs composer top after auto-scroll;
- absence of horizontal page overflow;
- expected refresh prompt/state after static deploy.
