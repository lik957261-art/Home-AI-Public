# Module: Native iOS Shell

## Responsibility

The Home AI native iOS shell is a platform-managed native client target:
`home-ai-native-ios`.

It is not an embedded business plugin, not a Gateway/MCP tool provider, and not
an independent Home AI product fork. The native shell contributes Apple
system-capability bridges while the Home AI Web/PWA app remains the product UI,
workspace, plugin, auth, Gateway/MCP, and server API source of truth.

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

Planned capability:

- Native voice-input overlay, described in the Xcode workspace's
  `docs/native-voice-input-overlay.md`, reusing the Home AI
  `/api/voice-input/*` routes and PWA composer insertion path.

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
