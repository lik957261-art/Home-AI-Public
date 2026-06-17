# Module: Native Notifications

## Responsibility

Native Notifications lets the Home AI iOS native shell register APNs devices and
receive the same bounded notification events that the PWA receives through Web
Push. Native APNs is an independent channel named `native_ios_apns`; it does not
reuse Web Push subscriptions or plugin credentials.

## Core Files

- `adapters/native-notification-service.js`
- `adapters/web-push-native-channel-service.js`
- `server-routes/native-device-api-routes.js`
- `adapters/mobile-sqlite-store.js`
- `server-routes/mobile-api-platform-composition.js`
- `adapters/web-push-delivery-service.js`

## Routes

- `POST /api/native/devices/register`
  - Authenticated by the normal browser/API Access Key transport:
    `X-Hermes-Web-Key` or the same-origin cookie.
  - Accepts iOS/APNs device registration payloads from the native shell.
  - If `workspaceId` is omitted, Home AI uses the workspace resolved from the
    authenticated Access Key. If a client sends an explicit `workspaceId`, it is
    still passed through the authenticated workspace access check before
    storage. A workspace-scoped key cannot register a device for another
    workspace.
- `POST /api/native/devices/unregister`
  - Disables the current device by device id or device token hash lookup.
- `POST /api/native/devices/test-notification`
  - Sends a bounded test notification to enabled APNs devices for the
    authenticated workspace.

The native app must not send plugin keys or plugin tokens to these routes.

## Native Shell Registration Protocol

The current Home AI native iOS shell exposes this flow from its native settings
surface, labelled `Native Notifications`:

1. The user enters the Home AI origin and Access Key. The workspace is resolved
   by Home AI from the authenticated key.
2. The native shell calls
   `UNUserNotificationCenter.requestAuthorization` with `alert`, `badge`, and
   `sound`.
3. If permission is granted and a cached APNs token already exists, the native
   shell uploads that token immediately.
4. If permission is granted but no cached token exists, the native shell calls
   `UIApplication.registerForRemoteNotifications()` and uploads the token from
   `didRegisterForRemoteNotificationsWithDeviceToken`.
5. A successful Home AI response is the only point where the native shell marks
   the device as registered with Home AI.

The native shell persists only local registration state under these UserDefaults
keys:

```text
homeAI.notifications.apnsDeviceToken
homeAI.notifications.registeredAt
```

The settings UI may display a bounded token preview, for example the first and
last eight characters. It must not display or log the full token.

The register request is:

```http
POST /api/native/devices/register
X-Hermes-Web-Key: <Home AI Access Key>
Content-Type: application/json; charset=utf-8
Accept: application/json
```

Request body:

```json
{
  "platform": "ios",
  "pushProvider": "apns",
  "deviceToken": "<apns token>",
  "appBundleId": "com.xuxin.homeai.native",
  "appVersion": "1.0.0",
  "buildNumber": "100",
  "environment": "sandbox",
  "source": "home_ai_native"
}
```

`environment` is `sandbox` for native DEBUG builds and `production` for
non-DEBUG builds. The current local native entitlement is development APNs; a
TestFlight/App Store build requires a production APNs entitlement/profile and
matching Home AI APNs provider configuration.

Successful response:

```json
{
  "ok": true,
  "channel": "native_ios_apns",
  "device": {
    "id": "ndev_...",
    "workspaceId": "owner",
    "principalId": "owner",
    "platform": "ios",
    "pushProvider": "apns",
    "tokenHash": "...",
    "appBundleId": "com.xuxin.homeai.native",
    "appVersion": "1.0.0",
    "buildNumber": "100",
    "environment": "sandbox",
    "enabled": true,
    "lastSeenAt": "2026-06-16T00:00:00.000Z",
    "createdAt": "2026-06-16T00:00:00.000Z",
    "updatedAt": "2026-06-16T00:00:00.000Z"
  }
}
```

The response must not include `deviceToken`, token ciphertext, Access Key,
plugin credentials, or APNs provider secrets. HTTP `404` means the native shell
is newer than the Home AI Server and should show the existing compatibility
message that the server has not provided the registration endpoint yet. HTTP
`401` or `403` means the Access Key/workspace boundary rejected the request.

Unregister requests may identify the device by raw `deviceToken`, `tokenHash`,
or `deviceId`; the server still clamps the operation to the authenticated
workspace before disabling the device. Test-notification requests accept a
bounded `title`, `body`, and optional `deepLink`.

## Storage

Native devices are stored in SQLite table `native_devices`.

The idempotency key is:

```text
workspace_id + platform + push_provider + token_hash
```

Stored fields include workspace/principal, platform, push provider, token hash,
encrypted or local-safe token ciphertext, app bundle/version/build, APNs
environment, enabled state, timestamps, and bounded source metadata.

Raw APNs device tokens are never returned by API responses and must not be
logged. Production deployments should configure
`HERMES_NATIVE_DEVICE_TOKEN_ENCRYPTION_KEY`; without it the server stores the
token in local base64 form so local development remains runnable, but that is
not the recommended production posture.

## APNs Configuration

Token-based APNs configuration is supported through:

- `HERMES_NATIVE_APNS_PRIVATE_KEY`
- `HERMES_NATIVE_APNS_PRIVATE_KEY_PATH`
- `HERMES_NATIVE_APNS_TEAM_ID`
- `HERMES_NATIVE_APNS_KEY_ID`
- `HERMES_NATIVE_APNS_TOPIC`
- `HERMES_NATIVE_DEVICE_TOKEN_ENCRYPTION_KEY`

The App Store Connect API key used by the TestFlight upload harness is not an
APNs provider key. Production APNs delivery needs a separate Apple Developer
APNs Auth Key with Push Notifications enabled for the Team ID and topic. If the
Home AI listener has no `HERMES_NATIVE_APNS_*` variables, the native test route
returns `apns_not_configured`. If a non-APNs key is supplied, Apple APNs returns
provider-token errors such as `InvalidProviderToken`; do not treat that as a
native device registration failure.

Device records carry `environment=sandbox|production`. Delivery chooses
`https://api.sandbox.push.apple.com` for sandbox devices and
`https://api.push.apple.com` for production devices.

If APNs returns `BadDeviceToken`, `Unregistered`, or HTTP `410`, the device is
disabled so future sends do not keep retrying an invalid token.

## Event Bridge

`web-push-delivery-service` remains the event producer for chat terminal
receipts, Action Inbox, Automation, Growth, plugin notification events, and
other bounded notification surfaces. It delegates APNs fanout to
`web-push-native-channel-service`, which calls `nativeNotificationService`.

This keeps Web Push and native APNs storage separate while allowing the same
bounded event summary to reach both channels.

Delivery channel selection is explicit:

- `notificationChannel=web_push` sends only to browser/PWA Web Push
  subscriptions.
- `notificationChannel=native_ios_apns` sends only to registered iOS APNs
  devices.
- `notificationChannel=both` is reserved for background events that do not have
  a foreground client source, such as scheduled Automation, Todo/reminder, and
  durable review notifications.

Interactive chat/task terminal receipts must preserve the sending client
source. Messages submitted from the PWA set `notificationChannel=web_push`;
messages submitted from the native iOS shell set
`notificationChannel=native_ios_apns`. The terminal notifier reads the stored
assistant message channel and must not fan out those foreground receipts to both
channels just because the same workspace has both a PWA subscription and an APNs
device.

PWA notification settings use `POST /api/push/test` and are Web Push only.
Native settings use `POST /api/native/devices/test-notification` and are APNs
only.

## Payload Rules

APNs payloads use a bounded alert:

```json
{
  "aps": {
    "alert": { "title": "Home AI", "body": "..." },
    "sound": "default",
    "badge": 1
  },
  "deepLink": "/?source=pwa&nativeShell=ios#...",
  "workspaceId": "owner",
  "threadId": "...",
  "actionInboxId": "...",
  "pluginId": "...",
  "channel": "native_ios_apns"
}
```

Notification taps in the native iOS shell must preserve the same routing
semantics as PWA Web Push:

- chat/task terminal receipt payloads must include the terminal assistant
  `messageId` and the target `threadId` or `taskGroupId`;
- if the `WKWebView` is already loaded, the native shell should deliver the
  `deepLink` to `window.HomeAINativeNotifications.open(...)` and let the Web
  app call `openNotificationRoute(...)` / `openHermesInternalRoute(...)`;
- the shell should load the `deepLink` URL only for cold start, missing Web
  app bridge, or route-bridge failure;
- the Web route must keep `messageId` until the message list renders, then
  scroll the receipt start into view.

This avoids the native shell reloading the whole WebKit page on every
notification tap and keeps APNs click behavior aligned with the PWA service
worker `hermes.notification.open` path.

Payloads are navigation hints. Sensitive content must still be fetched through
authenticated Home AI APIs after the app opens.

Notification titles should include a concise source context when the source is
known. Interactive terminal receipts use the current conversation/plugin
context, for example `聊天：任务完成`, `衣橱：任务完成`, or `星盘：任务完成`.
Plugin-originated platform notifications prefix the plugin display label, for
example `衣橱：腕表保养提醒`. The payload data also carries `contextLabel`
when available so native shells can display or debug the same source without
parsing the title. Do not put private message bodies, raw prompts, tokens, or
plugin credentials into that label.

The current native shell presents foreground notifications with banner, list,
sound, and badge options. Notification-tap deep-link routing is not implemented
in the native shell yet: Home AI already includes `deepLink` in the APNs payload,
but the shell currently acknowledges the tap without navigating the `WKWebView`.
Until that native-side bridge is added, APNs tap behavior is delivery-only and
must not be treated as a completed navigation contract.

## Validation

- `node --check adapters/native-notification-service.js`
- `node --check adapters/web-push-native-channel-service.js`
- `node --check server-routes/native-device-api-routes.js`
- `node tests/native-notification-service.test.js`
- `node tests/native-device-api-routes.test.js`
- `node tests/mobile-sqlite-store.test.js`
- `node tests/web-push-delivery-service.test.js`
- `node tests/mobile-api-platform-composition.test.js`
- `node tests/mobile-api-dispatcher.test.js`
- `node tests/api-route-inventory.test.js`
- `node tests/architecture-refactor-boundary.test.js`
