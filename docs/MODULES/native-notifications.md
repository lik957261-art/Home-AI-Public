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
  - The requested `workspaceId` is passed through the authenticated workspace
    access check before storage. A workspace-scoped key cannot register a device
    for another workspace.
- `POST /api/native/devices/unregister`
  - Disables the current device by device id or device token hash lookup.
- `POST /api/native/devices/test-notification`
  - Sends a bounded test notification to enabled APNs devices for the
    authenticated workspace.

The native app must not send plugin keys or plugin tokens to these routes.

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

Payloads are navigation hints. Sensitive content must still be fetched through
authenticated Home AI APIs after the app opens.

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

