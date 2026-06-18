# Module: Native iOS Shell

## Responsibility

The Home AI native iOS shell is a platform-managed native client target:
`home-ai-native-ios`.

It is not an embedded business plugin, not a Gateway/MCP tool provider, and not
an independent Home AI product fork. The native shell contributes Apple
system-capability bridges while the Home AI Web/PWA app remains the product UI,
workspace, plugin, auth, Gateway/MCP, and server API source of truth.

The long-term role of the native shell is to host capabilities that require
Apple system integration and cannot be implemented reliably in the PWA alone.
The near-term focus is system push, a native voice-input capture layer, system
share/receive flows, and WebView stability bridges. These capabilities must
enter Home AI through explicit server APIs or native-to-Web bridge messages;
they must not turn the shell into a second product UI or a plugin-specific
credential holder.

Standalone PWA compatibility is a hard boundary. The PWA/browser version is the
baseline product surface and must keep its current modes, routes, layout,
menus, composer behavior, plugin surfaces, and permission prompts unless a
change is independently required for PWA users. Native-shell-specific behavior
must be gated by `nativeShell=ios` or an explicit native bridge capability
handshake; absence of that signal means Home AI must behave exactly like the
ordinary PWA.

Apple Watch and Bluetooth/BLE bridges are explicitly deferred. They are valid
future extension points, but they are not part of the current or near-term
native shell roadmap unless a separate product requirement reopens them with a
specific user workflow and validation plan.

## Local Workspace

- Native client id: `home-ai-native-ios`
- Local workspace: `/Users/example/path AI`
- Xcode project: `Home AI.xcodeproj`
- Main bundle id: `com.xuxin.homeai.native`
- Share Extension bundle id: `com.xuxin.homeai.native.ShareExtension`
- App Group: `group.com.xuxin.homeai`
- Platform pointer: `/Users/example/path AI/docs/HOME_AI_PLATFORM_CONTRACT.md`
- Native voice overlay design:
  `/Users/example/path AI/docs/native-voice-input-overlay.md`

The platform checker discovers this workspace through
`HOMEAI_NATIVE_IOS_WORKSPACE`, the current user's `~/Xcode/Home AI`, or the
known local development path above.

## Boundaries

- The native shell loads Home AI through a PWA-first `WKWebView` surface with
  `nativeShell=ios`.
- Native-shell compatibility branches must be opt-in. Do not change standalone
  PWA defaults to prepare for native shell features.
- Native auth uses the Home AI browser/API Access Key transport:
  `X-Hermes-Web-Key`.
- Native capabilities call Home AI HTTPS APIs and let Home AI resolve
  workspace, plugin, and permission policy.
- The native shell must not store plugin long-lived credentials, plugin launch
  tokens, Gateway profile credentials, raw cookies from logs, or production
  secrets.
- The native shell must not access embedded plugin services through LAN/local
  HTTP. Browser-facing plugin traffic goes through the Home AI origin and
  same-origin plugin proxy routes.
- The native shell must not become a Dock plugin, plugin-topic entry, MCP
  provider, or workspace-grantable business plugin unless a future contract
  explicitly changes that boundary.

## Managed Capabilities

Current native capabilities:

- `pwa_webview_shell`: Home AI PWA in `WKWebView`, including native-shell
  layout pulses, dark-mode injection, and WebKit recovery controls.
- `apple_health_sync`: HealthKit reads sent through Home AI's authenticated
  Health plugin proxy. The native app sends Home AI auth; Home AI injects plugin
  authorization server-side.
- `apns_device_registration`: APNs device token registration through
  `POST /api/native/devices/register`. Native clients should omit
  `workspaceId` and let Home AI resolve the authenticated workspace from the
  Access Key; explicit workspace hints remain server-clamped compatibility
  input only.
- `ios_share_extension`: iOS Share Extension uploads inbound files through Home
  AI Directory APIs into the same `系统分享` server-side folder used by Weixin
  file ingress. A future dedicated native share endpoint may wrap this path,
  but it must preserve the same Directory ACL boundary.
- `webview_file_input_picker`: the native shell owns the `WKWebView` file-input
  picker on supported iOS versions so Home AI's ordinary PWA attachment input
  can offer camera photo, camera video, photo library, and file choices without
  depending on WebKit's default action sheet inside the shell.
- `native_voice_input_bridge`: native microphone capture is exposed to the PWA
  only after the shell injects an explicit voice capability marker. The current
  manager uses `AVAudioEngine`, mono PCM16 chunks, and Home AI
  `/api/voice-input/stream/*` APIs with `X-Hermes-Web-Key`; final text still
  enters the active Home AI Composer through the host composer insertion path.
- `native_environment_context`: native location and WeatherKit context is
  exposed to the PWA through `window.HomeAINativeEnvironment.getContext(...)`.
  The Web shell may attach a compact `environmentContext` to model-bound
  Composer sends when the user task needs local weather or location context, and
  in the native shell it also refreshes a compact server-side snapshot before
  sends. Gateway runs read that TTL-bounded snapshot only through the
  `current_environment` tool when the model decides it needs current-device
  facts. Home AI normalizes this payload before persistence/model use and strips
  full forecast arrays. Standalone PWA clients keep the existing server/Gateway
  weather fallback.

Near-term priority capabilities:

- `apns_interaction_completion`: complete the APNs loop after registration by
  consuming notification `deepLink` values on tap, routing the `WKWebView` to
  the target workspace/thread/inbox/plugin, supporting bounded badge updates,
  and optionally exposing notification action buttons such as complete, snooze,
  or open. Home AI Server still decides notification content and authorization.

- `native_voice_input_overlay`: complete the native voice status/feedback loop
  described in the Xcode workspace's `docs/native-voice-input-overlay.md`,
  including bounded status display, partial transcript projection, and later
  provisional Composer replacement. It is not a system input method and must not
  simulate keyboard entry.
- `system_share_receive`: system-level share, open-in, document picker,
  universal-link, or extension receive flows that attach inbound content to
  authorized Home AI workspaces, threads, directories, or plugin contexts.
- `webview_recovery_bridge`: native diagnostics and recovery hooks for WebView
  crash/blank-screen recovery, network status, client-version refresh,
  safe-area/keyboard metrics, and native-shell health pulses.

Deferred capabilities:

- `apple_watch_bridge`: Apple Watch connectivity is not a near-term goal.
  Revisit only after notification, voice input, share/receive, and WebView
  stability work has a stable product path.
- `bluetooth_system_bridge`: Bluetooth/BLE is not a near-term goal. Revisit only
  for a concrete hardware workflow where CoreBluetooth access is required.

## Capability Details

### System Push

System push is the first native-shell system bridge. The server owns
notification content, workspace authorization, channel selection, and privacy
rules. The native shell owns APNs permission, token registration, foreground
presentation, badge projection, and notification-tap delivery back to Home AI.

Near-term completion requires:

- APNs registration and unregister flows through Home AI APIs;
- foreground notification display with bounded alert text;
- notification-tap `deepLink` routing into the `WKWebView`;
- optional action buttons mapped to Home AI API calls after workspace access is
  confirmed;
- no raw APNs token, Access Key, push endpoint, or plugin credential in logs,
  payloads, or documents.

When a notification is tapped and the `WKWebView` is already loaded, the shell
must not reload the Home AI page just to apply the notification route. It should
inject the `deepLink` into the Web app through
`window.HomeAINativeNotifications.open(...)`, which reuses the same
`openNotificationRoute(...)` path as PWA Web Push. Full URL loading is a
fallback for cold start or bridge failure only. Receipt deep links must carry
the terminal assistant `messageId` so the Web app can scroll to the start of
the completed receipt after the message list renders.

Notification deep links that open an Automation detail in the native shell must
return to a freshly loaded Action Inbox list when the user swipes or taps back.
The first Inbox filter is `当前`; `待办` remains the second filter for Todo-only
items.

### Native Voice Input

Native voice input exists to avoid iOS/PWA microphone, keyboard, focus, and
selection instability. The shell may own microphone permission, press-to-talk
recording, native audio capture, short recording indicators, and upload/stream
transport. Home AI owns ASR routing, correction learning, composer insertion,
workspace/thread/plugin scope, and final send behavior.

The native shell must not become a system input method and must not inject text
by simulating keyboard events. Confirmed text must be inserted through the Home
AI host composer API or the active plugin composer protocol.

The PWA must not infer voice support from the generic native `homeAI` message
handler alone. Older shells can expose that handler for settings, Health, APNs,
or debug messages without implementing microphone capture. The voice branch is
enabled only when a native-shell signal is present plus at least one explicit
voice capability marker such as:

- `window.HomeAINativeVoiceInputCapability.voiceCapture === true`;
- `document.documentElement.dataset.nativeVoiceInput === "1"`;
- `localStorage.homeAI.nativeVoiceInput === "1"`.

If the explicit marker is absent, the standalone PWA/browser recording path is
used unchanged.

The target native-shell voice experience is direct Composer composition. The
native shell should not present a second transcript text box as the primary
input surface. Instead, the shell starts native audio capture, streams or uploads
audio to Home AI ASR, and sends provisional/final text updates back to the
existing active Composer through a composition-session bridge. The PWA Composer
continues to own draft rendering, user edits, send behavior, and correction
learning.

The native-shell path may show a Composer-adjacent voice status panel. This
panel is a diagnostic/status surface, not a text input field. It should appear
immediately when the user presses the voice entry, before microphone permission
or native audio setup is complete, and then show the current lifecycle stage:
waiting for long press, checking ASR, requesting microphone permission,
preparing microphone, recording, finalizing, transcribing, inserting, inserted,
cancelled, no-speech, or failed. Active recording/transcribing states remain
visible, but terminal states are short-lived: inserted/cancelled/no-speech
auto-collapse quickly, and failed stays visible only long enough to be read.
The panel may show bounded debug metadata such as provider, session suffix, and
chunk/partial counts only under a debug flag. It must not display full
transcript text, raw audio, Access Keys, plugin credentials, or private payloads.

The bridge must account for ASR partial latency. If the ASR backend can only
emit useful partial text at a cadence such as hundreds of milliseconds, the
native shell should still keep audio capture and transport low-latency while
Home AI writes bounded provisional text into the Composer and later replaces it
with the final transcript. This improves perceived realtime behavior without
trading away final transcript quality.

### Native Environment Context

Native environment context is a host-level capability, not a plugin-owned API.
The native shell may provide approximate current place, timezone, WeatherKit
current conditions, and a target-time forecast selection. Home AI PWA owns when
to request it, how to normalize it, and how to fall back when unavailable.

The Web shell should attach this context directly to a model request only for
tasks that plausibly need current-device local environment facts, such as
wardrobe outfit selection, weather-aware planning, exercise, or travel. In the
native shell, ordinary Composer sends may first refresh a compact server-side
snapshot through `POST /api/native/environment-context`; this is a cache refresh
for model tools, not prompt injection. The request may include `targetAt` so the
native shell can select hourly or daily weather for the actual business time.

The current Xcode shell implementation exposes
`window.HomeAINativeEnvironmentCapability`,
`window.HomeAINativeEnvironment.getContext(options)`, and
`getCurrentLocation`. The native manager keeps an in-memory cache with a
15-minute TTL, honors the native location permission/toggle, rounds approximate
coordinates, and computes selected weather through WeatherKit with an Open-Meteo
fallback. It does not push location continuously to Home AI; the Web shell must
ask for a snapshot.

Home AI Server treats the returned payload as user context, not as a durable
location stream. Before storing it in message run options, writing a snapshot,
or showing it to the model, the server must reduce it to a compact
`environmentContext` containing bounded source, target time, approximate
place/coordinate precision, and selected weather fields. It must not persist
full hourly/daily forecast arrays, raw native payloads, Access Keys, plugin
credentials, or exact coordinates when the native user has not enabled precise
coordinates. The current server snapshot store defaults to
`HERMES_MOBILE_ENVIRONMENT_CONTEXT_SNAPSHOT_PATH`, then
`HERMES_WEB_ENVIRONMENT_CONTEXT_SNAPSHOT_PATH`, then
`<dataDir>/environment-context-snapshots.json`; entries expire after the native
cache TTL, capped at one hour.

Plugins and Skills must not call `window.HomeAINativeEnvironment` directly from
plugin iframes. Gateway profiles expose the `current_environment` toolset for
model-initiated lookup of the latest authorized snapshot via the bridge host
route `POST /bridge/current-environment`. If the user asks about another city,
travel destination, or a target time outside the provided native context, the
model should use the normal weather tool or ask a bounded follow-up instead of
treating device GPS as the requested place.

### System Share And Receive

System share/receive covers iOS Share Extension, Open In, document picker,
universal-link receive, and file/link/image handoff from other apps. The shell
may gather the inbound item and a user-selected Home AI target. Home AI Server
must validate the target workspace, thread, directory, or plugin context before
persisting or linking the content.

Preferred behavior is to attach a server-side file/link reference rather than
forcing a second upload when the item is already in the native shared container.
The shell must not bypass Directory APIs or write directly into plugin-private
storage.

The first iOS Share Extension target is the shared system-share file ingress
folder contract: files are uploaded through `POST /api/directories/create` and
`POST /api/directories/upload` into `系统分享` under the authenticated workspace
default Directory root. The Directory API accepts an empty `threadId` for this
route by constructing an authenticated workspace Directory browser context; it
still resolves the target through the normal Directory boundary and write
policy. Directory listing is sorted newest first by entry `mtime`, so this
folder should stay flat instead of adding date subdirectories.

After upload, the native shell should surface the saved server-file references
inside Home AI so the user can attach them to the current conversation/plugin
composer or leave them saved. The Web/PWA side owns target selection and
Composer attachment; the Share Extension must not duplicate plugin/thread
authorization logic.

The ordinary Home AI PWA attachment button remains a Web/PWA-owned file input.
When Home AI is embedded in the native iOS shell, the shell may intercept
`WKUIDelegate.webView(_:runOpenPanelWith:initiatedByFrame:completionHandler:)`
and present a native source menu for camera photo, camera video, photo library,
and files. The selected media is copied to temporary app-local files and passed
back to WebKit through the standard file-input completion handler, so Home AI's
existing upload path still receives normal `File` objects. This native picker
must be gated to the iOS shell and must not change standalone PWA behavior.
Because the current SDK exposes `WKOpenPanelParameters` only on newer iOS
versions, older supported iOS builds keep the WebKit default picker fallback.

### WebView Stability

The native shell may provide WebView health support that the PWA cannot provide
itself: crash detection, blank-screen recovery, native network status, safe-area
and keyboard metrics, client refresh/reload controls, and native-shell layout
pulses. These signals should remain bounded diagnostics or bridge messages; the
PWA remains responsible for rendering product UI and applying layout policy.

Embedded plugin WebView layout is a host-level responsibility. When Home AI is
running under the native shell and an embedded plugin iframe is active, the host
marks the root with `embedded-plugin-shell-active`. That state is the only place
where the Web status-bar shim is removed, refresh notices are suppressed over
plugin content, and keyboard viewport shrinkage from an iframe input is allowed
to drive the host keyboard layout. The host must not move the whole iframe down
with `--plugin-context-main-top`, because that reintroduces a blank band on
plugin primary pages and can shrink the iframe in a way that lets the native
keyboard cover plugin composers. Instead, the host keeps the iframe at top `0`
and sends the measured top safe area through the `hermes.plugin.viewport`
payload as `viewport.safeAreaTop` / `host.hostTopSafeArea`; plugin-owned
headers may consume that value inside their own iframe. Standalone PWA/browser
behavior must not enter this branch and must keep the ordinary PWA safe-area,
refresh notice, and keyboard behavior.

The native-shell viewport bridge must be stable. Home AI may broadcast the first
viewport payload for iframe attach, render, load, and host-visible lifecycle
events, but it should suppress exact duplicate payloads and payloads that differ
only by small measurement noise. In the native iOS shell, host-level
`visualViewport` resize/scroll events that differ only by about 3px must not
run the full conversation, keyboard, bottom-navigation, and embedded-plugin
layout refresh chain. The measured top safe-area value should also
hold the last positive native-shell value briefly when the probe temporarily
returns `0`, and ignore small top-inset drift. This prevents embedded apps such
as Codex from repeatedly applying iframe-internal safe-area or recovery layout
updates and prevents the native shell from visually nudging the whole page while
the standalone PWA/browser path remains unchanged.

## System Notifications

The APNs bridge is a native client capability, but the protocol source of truth
is Home AI server-side documentation:

- Register route: `POST /api/native/devices/register`
- Auth transport: `X-Hermes-Web-Key`
- Channel: `native_ios_apns`
- Current native settings label: `Native Notifications`
- Current native local state keys:
  `homeAI.notifications.apnsDeviceToken` and
  `homeAI.notifications.registeredAt`

The native shell sends `platform=ios`, `pushProvider=apns`, `deviceToken`,
`workspaceId`, app bundle/version/build metadata, `environment`, and
`source=home_ai_native`. Home AI clamps the requested workspace to the
authenticated Access Key, stores only token hash plus protected token material,
and returns a public device projection without the raw APNs token.

Foreground native notifications are shown with banner, list, sound, and badge
options. Server payloads already include `deepLink`, but the current native
shell does not consume that value on notification tap; tap-to-route remains a
future native bridge task. See `docs/MODULES/native-notifications.md` for the
full request/response contract, privacy rules, APNs environment mapping, and
validation matrix.

## Platform Management

The Home AI platform contract checker includes native clients as managed
targets separately from embedded plugins:

```bash
node scripts/plugin-workspace-platform-contract-check.js --target home-ai-native-ios --json
```

For the full local platform set:

```bash
node scripts/plugin-workspace-platform-contract-check.js --json
```

Native client checks require:

- local `docs/HOME_AI_PLATFORM_CONTRACT.md`;
- platform contract version;
- central contract links;
- structured native facts such as bundle ids, App Group, auth transport, and
  `nativeShell=ios`;
- declared native capabilities;
- `platform_management_status=managed_native_client`;
- AI Operations Control Plane command, required flow, and evidence ledger;
- Xcode build validation command;
- no raw-looking secrets.

The checker skips Mac plugin-service probes for this target because the native
client has no loopback manifest, LaunchDaemon label, or production plugin
source directory under `/Users/example/path`.

## Validation

Home AI platform checks:

```bash
node tests/plugin-workspace-platform-contract-check.test.js
node scripts/plugin-workspace-platform-contract-check.js --target home-ai-native-ios --json
node tests/architecture-code-test-harness-map.test.js
git diff --check
```

Native build check from the Xcode workspace:

```bash
xcodebuild -project 'Home AI.xcodeproj' -scheme 'Home AI' -destination 'generic/platform=iOS Simulator' build
```

Native APNs server-side changes still use the Native Notifications test set in
`docs/MODULES/native-notifications.md`. Native voice-input bridge work must use
the Host Voice Input checks in `docs/TEST_MATRIX.md` plus an Xcode build.
