"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http2 = require("node:http2");

const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
const APNS_PRODUCTION_ORIGIN = "https://api.push.apple.com";

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
  return {
    id: device.id || "",
    workspaceId: device.workspaceId || "",
    principalId: device.principalId || "",
    platform: device.platform || "",
    pushProvider: device.pushProvider || "",
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

function normalizeEnvironment(value) {
  const text = clean(value, 40).toLowerCase();
  return text === "production" ? "production" : "sandbox";
}

function normalizeRegisterInput(input = {}) {
  const platform = clean(input.platform || "ios", 40).toLowerCase();
  const pushProvider = clean(input.pushProvider || input.push_provider || "apns", 40).toLowerCase();
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
    environment: normalizeEnvironment(input.environment),
    source: clean(input.source || "home_ai_native", 80),
  };
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

function createNativeNotificationService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const hashValue = typeof options.hashValue === "function" ? options.hashValue : sha256;
  const storeProvider = typeof options.store === "function" ? options.store : (() => options.store);
  const apnsClient = options.apnsClient || createDefaultApnsClient(options);
  const logger = options.logger || {};

  function store() {
    const value = storeProvider();
    if (!value) throw new Error("native notification service requires mobile sqlite store");
    return value;
  }

  function registerDevice(input = {}) {
    const normalized = normalizeRegisterInput(input);
    if (normalized.platform !== "ios") return { ok: false, status: 400, error: "native_device_platform_unsupported" };
    if (normalized.pushProvider !== "apns") return { ok: false, status: 400, error: "native_push_provider_unsupported" };
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
    return { ok: true, status: 201, device: publicDevice(device) };
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

  function payloadFor(input = {}) {
    const title = clean(input.title || "Home AI", 120) || "Home AI";
    const body = clean(input.body || input.summary || "Home AI 有新的通知。", 220);
    const deepLink = clean(input.deepLink || input.url || input.data?.url || "/?source=pwa&nativeShell=ios", 600);
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
      channel: "native_ios_apns",
    };
  }

  function shouldDisableDevice(result = {}) {
    const reason = clean(result.reason || result.error, 120);
    return result.status === 410 || ["BadDeviceToken", "Unregistered"].includes(reason);
  }

  async function sendToWorkspace(input = {}) {
    const workspaceId = clean(input.workspaceId || input.data?.workspaceId || "owner", 120) || "owner";
    const devices = store().listNativeDevices({ workspaceId, platform: "ios", pushProvider: "apns", enabledOnly: true, limit: 200 });
    const payload = payloadFor(Object.assign({}, input, { workspaceId }));
    const deliveries = [];
    for (const device of devices) {
      try {
        const result = await apnsClient.send(device, payload, {
          environment: device.environment,
          topic: device.appBundleId || input.appBundleId,
        });
        if (shouldDisableDevice(result)) {
          store().disableNativeDevice({ deviceId: device.id, disabledAt: nowIso() });
        }
        deliveries.push({
          deviceId: device.id,
          tokenHash: device.tokenHash,
          ok: Boolean(result?.ok),
          status: Number(result?.status || 0),
          reason: clean(result?.reason || result?.error, 120),
          environment: device.environment,
        });
      } catch (err) {
        logger.warn?.(`Native APNs send failed: ${clean(err?.message || err, 240)}`);
        deliveries.push({ deviceId: device.id, tokenHash: device.tokenHash, ok: false, status: 0, reason: "apns_send_failed", environment: device.environment });
      }
    }
    return {
      ok: deliveries.every((item) => item.ok),
      channel: "native_ios_apns",
      attempted: deliveries.length,
      sent: deliveries.filter((item) => item.ok).length,
      failed: deliveries.filter((item) => !item.ok).length,
      deliveries,
    };
  }

  return {
    channel: "native_ios_apns",
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
  createNativeNotificationService,
  decryptDeviceToken,
  encryptDeviceToken,
  normalizeEnvironment,
  publicDevice,
};
