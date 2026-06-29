"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const http2 = require("node:http2");

const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
const APNS_PRODUCTION_ORIGIN = "https://api.push.apple.com";
const FCM_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

function clean(value, max = 500) {
  const text = String(value || "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function defaultNowIso() {
  return new Date().toISOString();
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function publicDevice(device = {}) {
  const platform = device.platform || "";
  const pushProvider = device.pushProvider || "";
  return {
    id: device.id || "",
    workspaceId: device.workspaceId || "",
    principalId: device.principalId || "",
    platform,
    pushProvider,
    channel: nativeChannelFor(platform, pushProvider),
    tokenHash: device.tokenHash || "",
    appBundleId: device.appBundleId || "",
    appVersion: device.appVersion || "",
    buildNumber: device.buildNumber || "",
    environment: device.environment || "",
    enabled: Boolean(device.enabled),
    lastSeenAt: device.lastSeenAt || "",
    createdAt: device.createdAt || "",
    updatedAt: device.updatedAt || "",
  };
}

function defaultPushProviderForPlatform(platform) {
  return platform === "android" ? "fcm" : "apns";
}

function normalizeEnvironment(value, platform = "ios") {
  const text = clean(value, 40).toLowerCase();
  if (!text && platform === "android") return "production";
  return text === "production" ? "production" : "sandbox";
}

function normalizeRegisterInput(input = {}) {
  const platform = clean(input.platform || "ios", 40).toLowerCase();
  const pushProvider = clean(input.pushProvider || input.push_provider || defaultPushProviderForPlatform(platform), 40).toLowerCase();
  const deviceToken = clean(input.deviceToken || input.device_token, 4096).replace(/\s+/g, "");
  return {
    workspaceId: clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner",
    principalId: clean(input.principalId || input.principal_id || "", 120),
    platform,
    pushProvider,
    deviceToken,
    appBundleId: clean(input.appBundleId || input.app_bundle_id, 200),
    appVersion: clean(input.appVersion || input.app_version, 80),
    buildNumber: clean(input.buildNumber || input.build_number, 80),
    environment: normalizeEnvironment(input.environment, platform),
    source: clean(input.source || "home_ai_native", 80),
  };
}

function nativeChannelFor(platform, pushProvider) {
  const normalizedPlatform = clean(platform, 40).toLowerCase();
  const normalizedProvider = clean(pushProvider, 40).toLowerCase();
  if (normalizedPlatform === "ios" && normalizedProvider === "apns") return "native_ios_apns";
  if (normalizedPlatform === "android" && normalizedProvider === "fcm") return "native_android_fcm";
  return "";
}

function supportedNativeRegistration(platform, pushProvider) {
  return Boolean(nativeChannelFor(platform, pushProvider));
}

function normalizeNativeNotificationChannel(value, defaultChannel = "native") {
  const text = clean(value, 80).toLowerCase();
  if (!text) return defaultChannel;
  if (["native_ios_apns", "native-ios-apns", "ios", "apns"].includes(text)) return "native_ios_apns";
  if (["native_android_fcm", "native-android-fcm", "android", "fcm"].includes(text)) return "native_android_fcm";
  if (["native", "both", "all"].includes(text)) return "native";
  return defaultChannel;
}

function deviceQueryForChannel(workspaceId, channel) {
  if (channel === "native_ios_apns") return [{ workspaceId, platform: "ios", pushProvider: "apns", enabledOnly: true, limit: 200 }];
  if (channel === "native_android_fcm") return [{ workspaceId, platform: "android", pushProvider: "fcm", enabledOnly: true, limit: 200 }];
  return [
    { workspaceId, platform: "ios", pushProvider: "apns", enabledOnly: true, limit: 200 },
    { workspaceId, platform: "android", pushProvider: "fcm", enabledOnly: true, limit: 200 },
  ];
}

function defaultNativeDeepLink(input = {}, nativeShell = "ios") {
  const query = new URLSearchParams({ source: "pwa", nativeShell });
  const workspaceId = clean(input.workspaceId || input.data?.workspaceId, 120);
  if (workspaceId) query.set("workspaceId", workspaceId);
  return `/?${query.toString()}`;
}

function tokenEncryptionKey(options = {}) {
  const explicit = clean(options.tokenEncryptionKey || options.env?.HERMES_NATIVE_DEVICE_TOKEN_ENCRYPTION_KEY, 5000);
  if (!explicit) return null;
  if (/^[A-Fa-f0-9]{64}$/.test(explicit)) return Buffer.from(explicit, "hex");
  return crypto.createHash("sha256").update(explicit).digest();
}

function encryptDeviceToken(token, options = {}) {
  const key = tokenEncryptionKey(options);
  if (!key) {
    return {
      tokenCiphertext: Buffer.from(String(token || ""), "utf8").toString("base64"),
      tokenCiphertextEncoding: "base64-plain-local",
    };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(token || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    tokenCiphertext: Buffer.concat([iv, tag, ciphertext]).toString("base64"),
    tokenCiphertextEncoding: "aes-256-gcm",
  };
}

function decryptDeviceToken(device = {}, options = {}) {
  const encoding = clean(device.tokenCiphertextEncoding || device.token_ciphertext_encoding, 80);
  const ciphertext = clean(device.tokenCiphertext || device.token_ciphertext, 10000);
  if (!ciphertext) return "";
  if (encoding === "base64-plain-local") return Buffer.from(ciphertext, "base64").toString("utf8");
  if (encoding !== "aes-256-gcm") return "";
  const key = tokenEncryptionKey(options);
  if (!key) return "";
  const raw = Buffer.from(ciphertext, "base64");
  if (raw.length <= 28) return "";
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

function apnsOriginForEnvironment(environment) {
  return normalizeEnvironment(environment) === "production" ? APNS_PRODUCTION_ORIGIN : APNS_SANDBOX_ORIGIN;
}

function readApnsKey(options = {}) {
  const direct = clean(options.apnsPrivateKey || options.env?.HERMES_NATIVE_APNS_PRIVATE_KEY, 10000);
  if (direct) return direct.replace(/\\n/g, "\n");
  const file = clean(options.apnsPrivateKeyPath || options.env?.HERMES_NATIVE_APNS_PRIVATE_KEY_PATH, 1000);
  if (!file) return "";
  return fs.readFileSync(file, "utf8");
}

function createApnsAuthorization(options = {}) {
  const teamId = clean(options.apnsTeamId || options.env?.HERMES_NATIVE_APNS_TEAM_ID, 80);
  const keyId = clean(options.apnsKeyId || options.env?.HERMES_NATIVE_APNS_KEY_ID, 80);
  const privateKey = readApnsKey(options);
  if (!teamId || !keyId || !privateKey) return "";
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const body = base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `bearer ${header}.${body}.${signature}`;
}

function createDefaultApnsClient(options = {}) {
  return {
    async send(device, payload, sendOptions = {}) {
      const token = decryptDeviceToken(device, options);
      if (!token) return { ok: false, status: 503, reason: "native_device_token_unavailable" };
      const topic = clean(sendOptions.topic || device.appBundleId || options.apnsTopic || options.env?.HERMES_NATIVE_APNS_TOPIC, 200);
      const authorization = createApnsAuthorization(options);
      if (!topic || !authorization) return { ok: false, status: 503, reason: "apns_not_configured" };
      const origin = apnsOriginForEnvironment(device.environment);
      const client = http2.connect(origin);
      try {
        const result = await new Promise((resolve, reject) => {
          const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${token}`,
            authorization,
            "apns-topic": topic,
            "apns-push-type": "alert",
            "content-type": "application/json",
          });
          let status = 0;
          let body = "";
          req.setEncoding("utf8");
          req.on("response", (headers) => {
            status = Number(headers[":status"] || 0);
          });
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            let parsed = {};
            try { parsed = body ? JSON.parse(body) : {}; } catch (_) { parsed = {}; }
            resolve({ ok: status >= 200 && status < 300, status, reason: parsed.reason || "", apnsId: parsed.apnsId || "" });
          });
          req.on("error", reject);
          req.end(JSON.stringify(payload || {}));
        });
        return Object.assign({ environment: normalizeEnvironment(device.environment), endpoint: origin }, result);
      } finally {
        client.close();
      }
    },
  };
}

function requestJson(urlString, requestOptions = {}, body = "") {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request({
      method: requestOptions.method || "POST",
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: requestOptions.headers || {},
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = {}; }
        resolve({ status: Number(res.statusCode || 0), body: parsed });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function readFcmServiceAccount(options = {}) {
  const direct = clean(options.fcmServiceAccountJson || options.env?.HERMES_NATIVE_FCM_SERVICE_ACCOUNT_JSON, 20000);
  if (direct) {
    try { return JSON.parse(direct); } catch (_) { return null; }
  }
  const file = clean(options.fcmServiceAccountJsonPath || options.env?.HERMES_NATIVE_FCM_SERVICE_ACCOUNT_JSON_PATH, 1000);
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return null; }
}

function fcmProjectId(options = {}, serviceAccount = {}) {
  return clean(options.fcmProjectId || options.env?.HERMES_NATIVE_FCM_PROJECT_ID || serviceAccount.project_id, 200);
}

async function createFcmAccessToken(options = {}, serviceAccount = {}) {
  const clientEmail = clean(serviceAccount.client_email, 300);
  const privateKey = clean(serviceAccount.private_key, 5000).replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return "";
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: FCM_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claim}`), privateKey).toString("base64url");
  const assertion = `${header}.${claim}.${signature}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();
  const response = await requestJson(FCM_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": Buffer.byteLength(body),
    },
  }, body);
  return clean(response.body?.access_token, 5000);
}

function fcmDataFromPayload(payload = {}) {
  const data = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (key === "aps") continue;
    if (value === undefined || value === null || typeof value === "object") continue;
    const text = clean(value, 1000);
    if (text) data[key] = text;
  }
  return data;
}

function fcmReasonFromBody(body = {}) {
  const status = clean(body.error?.status || body.status, 120);
  const message = clean(body.error?.message || body.message, 160);
  const details = Array.isArray(body.error?.details) ? body.error.details : [];
  const fcmError = details.map((item) => clean(item?.errorCode, 120)).find(Boolean);
  return fcmError || status || message || "";
}

function createDefaultFcmClient(options = {}) {
  let cachedToken = "";
  return {
    async send(device, payload) {
      const token = decryptDeviceToken(device, options);
      if (!token) return { ok: false, status: 503, reason: "native_device_token_unavailable" };
      const serviceAccount = readFcmServiceAccount(options);
      const projectId = fcmProjectId(options, serviceAccount || {});
      if (!serviceAccount || !projectId) return { ok: false, status: 503, reason: "fcm_not_configured" };
      if (!cachedToken) cachedToken = await createFcmAccessToken(options, serviceAccount);
      if (!cachedToken) return { ok: false, status: 503, reason: "fcm_not_configured" };
      const body = JSON.stringify({
        message: {
          token,
          notification: {
            title: clean(payload?.aps?.alert?.title || payload.title || "Home AI", 120) || "Home AI",
            body: clean(payload?.aps?.alert?.body || payload.body || "", 220),
          },
          android: {
            notification: {
              channel_id: clean(options.fcmAndroidChannelId || options.env?.HERMES_NATIVE_FCM_ANDROID_CHANNEL_ID || "home_ai_native", 120),
            },
          },
          data: fcmDataFromPayload(payload),
        },
      });
      const response = await requestJson(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${cachedToken}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      }, body);
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        reason: fcmReasonFromBody(response.body),
        fcmName: clean(response.body?.name, 300),
      };
    },
  };
}

function createNativeNotificationService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const hashValue = typeof options.hashValue === "function" ? options.hashValue : sha256;
  const storeProvider = typeof options.store === "function" ? options.store : (() => options.store);
  const apnsClient = options.apnsClient || createDefaultApnsClient(options);
  const fcmClient = options.fcmClient || createDefaultFcmClient(options);
  const logger = options.logger || {};

  function store() {
    const value = storeProvider();
    if (!value) throw new Error("native notification service requires mobile sqlite store");
    return value;
  }

  function registerDevice(input = {}) {
    const normalized = normalizeRegisterInput(input);
    const channel = nativeChannelFor(normalized.platform, normalized.pushProvider);
    if (!supportedNativeRegistration(normalized.platform, normalized.pushProvider)) return { ok: false, status: 400, error: "native_push_provider_unsupported" };
    if (!normalized.deviceToken) return { ok: false, status: 400, error: "native_device_token_required" };
    const timestamp = nowIso();
    const encrypted = encryptDeviceToken(normalized.deviceToken, options);
    const device = store().upsertNativeDevice({
      workspaceId: normalized.workspaceId,
      principalId: normalized.principalId,
      platform: normalized.platform,
      pushProvider: normalized.pushProvider,
      tokenHash: hashValue(normalized.deviceToken),
      tokenCiphertext: encrypted.tokenCiphertext,
      tokenCiphertextEncoding: encrypted.tokenCiphertextEncoding,
      appBundleId: normalized.appBundleId,
      appVersion: normalized.appVersion,
      buildNumber: normalized.buildNumber,
      environment: normalized.environment,
      enabled: true,
      disabledAt: "",
      lastSeenAt: timestamp,
      rawJson: { source: normalized.source },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { ok: true, status: 201, channel, device: publicDevice(device) };
  }

  function unregisterDevice(input = {}) {
    const normalized = normalizeRegisterInput(input);
    const tokenHash = normalized.deviceToken ? hashValue(normalized.deviceToken) : clean(input.tokenHash || input.token_hash, 256);
    const disabled = store().disableNativeDevice({
      deviceId: input.deviceId || input.id,
      workspaceId: normalized.workspaceId,
      platform: normalized.platform,
      pushProvider: normalized.pushProvider,
      tokenHash,
      disabledAt: nowIso(),
    });
    if (!disabled) return { ok: false, status: 404, error: "native_device_not_found" };
    return { ok: true, status: 200, device: publicDevice(disabled) };
  }

  function listDevices(input = {}) {
    return store().listNativeDevices(input).map(publicDevice);
  }

  function payloadFor(input = {}, payloadOptions = {}) {
    const channel = normalizeNativeNotificationChannel(payloadOptions.channel || input.channel || input.notificationChannel || input.data?.channel || input.data?.notificationChannel, "native_ios_apns");
    const nativeShell = channel === "native_android_fcm" ? "android" : "ios";
    const title = clean(input.title || "Home AI", 120) || "Home AI";
    const body = clean(input.body || input.summary || "Home AI 有新的通知。", 220);
    const deepLink = clean(input.deepLink || input.url || input.data?.url || defaultNativeDeepLink(input, nativeShell), 600);
    return {
      aps: {
        alert: { title, body },
        sound: input.sound === false ? undefined : "default",
        badge: Number.isFinite(Number(input.badge)) ? Number(input.badge) : 1,
      },
      deepLink,
      workspaceId: clean(input.workspaceId || input.data?.workspaceId, 120),
      threadId: clean(input.threadId || input.data?.threadId, 160),
      messageId: clean(input.messageId || input.data?.messageId, 160),
      actionInboxId: clean(input.actionInboxId || input.data?.inboxItemId || input.data?.sourceInboxItemId, 160),
      automationId: clean(input.automationId || input.data?.automationId, 160),
      pluginId: clean(input.pluginId || input.data?.pluginId, 160),
      channel,
    };
  }

  function shouldDisableDevice(device = {}, result = {}) {
    const reason = clean(result.reason || result.error, 120);
    if (device.platform === "android" || device.pushProvider === "fcm") {
      return [404, 410].includes(Number(result.status || 0)) || ["UNREGISTERED", "INVALID_ARGUMENT", "registration-token-not-registered"].includes(reason);
    }
    return result.status === 410 || ["BadDeviceToken", "Unregistered"].includes(reason);
  }

  async function sendToDevice(device, input) {
    const channel = nativeChannelFor(device.platform, device.pushProvider);
    const payload = payloadFor(Object.assign({}, input, { workspaceId: input.workspaceId }), { channel });
    const client = channel === "native_android_fcm" ? fcmClient : apnsClient;
    const result = await client.send(device, payload, {
      environment: device.environment,
      topic: device.appBundleId || input.appBundleId,
    });
    if (shouldDisableDevice(device, result)) {
      store().disableNativeDevice({ deviceId: device.id, disabledAt: nowIso() });
    }
    return {
      deviceId: device.id,
      tokenHash: device.tokenHash,
      ok: Boolean(result?.ok),
      status: Number(result?.status || 0),
      reason: clean(result?.reason || result?.error, 120),
      environment: device.environment,
      platform: device.platform,
      pushProvider: device.pushProvider,
      channel,
    };
  }

  async function sendToWorkspace(input = {}) {
    const workspaceId = clean(input.workspaceId || input.data?.workspaceId || "owner", 120) || "owner";
    const requestedChannel = normalizeNativeNotificationChannel(input.notificationChannel || input.channel || input.data?.notificationChannel || input.data?.channel, "native");
    const devices = [];
    for (const query of deviceQueryForChannel(workspaceId, requestedChannel)) {
      devices.push(...store().listNativeDevices(query));
    }
    const deliveries = [];
    for (const device of devices) {
      try {
        deliveries.push(await sendToDevice(device, Object.assign({}, input, { workspaceId })));
      } catch (err) {
        const channel = nativeChannelFor(device.platform, device.pushProvider);
        logger.warn?.(`Native notification send failed: ${clean(err?.message || err, 240)}`);
        deliveries.push({ deviceId: device.id, tokenHash: device.tokenHash, ok: false, status: 0, reason: `${channel || "native"}_send_failed`, environment: device.environment, platform: device.platform, pushProvider: device.pushProvider, channel });
      }
    }
    return {
      ok: deliveries.every((item) => item.ok),
      channel: requestedChannel,
      attempted: deliveries.length,
      sent: deliveries.filter((item) => item.ok).length,
      failed: deliveries.filter((item) => !item.ok).length,
      deliveries,
    };
  }

  return {
    channel: "native",
    listDevices,
    payloadFor,
    registerDevice,
    sendToWorkspace,
    unregisterDevice,
  };
}

module.exports = {
  APNS_PRODUCTION_ORIGIN,
  APNS_SANDBOX_ORIGIN,
  createDefaultApnsClient,
  createDefaultFcmClient,
  createNativeNotificationService,
  decryptDeviceToken,
  encryptDeviceToken,
  nativeChannelFor,
  normalizeEnvironment,
  normalizeNativeNotificationChannel,
  publicDevice,
};
