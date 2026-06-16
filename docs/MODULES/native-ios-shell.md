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
- Local workspace: `/Users/xuxin/Xcode/Home AI`
- Xcode project: `Home AI.xcodeproj`
- Main bundle id: `com.xuxin.homeai.native`
- Share Extension bundle id: `com.xuxin.homeai.native.ShareExtension`
- App Group: `group.com.xuxin.homeai`
- Platform pointer: `/Users/xuxin/Xcode/Home AI/docs/HOME_AI_PLATFORM_CONTRACT.md`
- Native voice overlay design:
  `/Users/xuxin/Xcode/Home AI/docs/native-voice-input-overlay.md`

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
  `POST /api/native/devices/register`.
- `ios_share_extension`: iOS Share Extension uploads inbound files through Home
  AI Directory APIs or a future dedicated native share endpoint.

Near-term priority capabilities:

- `apns_interaction_completion`: complete the APNs loop after registration by
  consuming notification `deepLink` values on tap, routing the `WKWebView` to
  the target workspace/thread/inbox/plugin, supporting bounded badge updates,
  and optionally exposing notification action buttons such as complete, snooze,
  or open. Home AI Server still decides notification content and authorization.

- `native_voice_input_overlay`: native microphone/voice capture and editing
  layer, described in the Xcode workspace's
  `docs/native-voice-input-overlay.md`, reusing the Home AI
  `/api/voice-input/*` routes and PWA composer insertion path. It is not a
  system input method and must not simulate keyboard entry.
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

### Native Voice Input

Native voice input exists to avoid iOS/PWA microphone, keyboard, focus, and
selection instability. The shell may own microphone permission, press-to-talk
recording, native audio capture, short recording indicators, and upload/stream
transport. Home AI owns ASR routing, correction learning, composer insertion,
workspace/thread/plugin scope, and final send behavior.

The native shell must not become a system input method and must not inject text
by simulating keyboard events. Confirmed text must be inserted through the Home
AI host composer API or the active plugin composer protocol.

The target native-shell voice experience is direct Composer composition. The
native shell should not present a second transcript text box as the primary
input surface. Instead, the shell starts native audio capture, streams or uploads
audio to Home AI ASR, and sends provisional/final text updates back to the
existing active Composer through a composition-session bridge. The PWA Composer
continues to own draft rendering, user edits, send behavior, and correction
learning.

The bridge must account for ASR partial latency. If the ASR backend can only
emit useful partial text at a cadence such as hundreds of milliseconds, the
native shell should still keep audio capture and transport low-latency while
Home AI writes bounded provisional text into the Composer and later replaces it
with the final transcript. This improves perceived realtime behavior without
trading away final transcript quality.

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

### WebView Stability

The native shell may provide WebView health support that the PWA cannot provide
itself: crash detection, blank-screen recovery, native network status, safe-area
and keyboard metrics, client refresh/reload controls, and native-shell layout
pulses. These signals should remain bounded diagnostics or bridge messages; the
PWA remains responsible for rendering product UI and applying layout policy.

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
source directory under `/Users/hermes-host/HermesMobile/plugins`.

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
