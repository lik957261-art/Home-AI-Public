"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createStatusError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function createWebPushVapidService(options = {}) {
  const env = options.env || process.env;
  const webpush = options.webpush;
  const logger = options.logger || console;
  const webPushEnabled = options.webPushEnabled !== undefined ? Boolean(options.webPushEnabled) : true;
  const webPushSubject = options.webPushSubject || "mailto:hermes-mobile@example.invalid";
  const loadRuntimeConfig = typeof options.loadRuntimeConfig === "function" ? options.loadRuntimeConfig : (() => ({}));
  const effectiveWebPushVapidPath = typeof options.effectiveWebPushVapidPath === "function"
    ? options.effectiveWebPushVapidPath
    : (() => options.webPushVapidPath || "");
  const effectiveWebPushSubject = typeof options.effectiveWebPushSubject === "function"
    ? options.effectiveWebPushSubject
    : (() => webPushSubject);
  let webPushConfig = null;

  function envPublicKey() {
    return env.WEB_PUSH_VAPID_PUBLIC_KEY || env.HERMES_WEB_VAPID_PUBLIC_KEY || "";
  }

  function envPrivateKey() {
    return env.WEB_PUSH_VAPID_PRIVATE_KEY || env.HERMES_WEB_VAPID_PRIVATE_KEY || "";
  }

  function envSubject() {
    return env.WEB_PUSH_SUBJECT || env.HERMES_WEB_PUSH_SUBJECT || "";
  }

  function loadVapidConfig() {
    if (envPublicKey() && envPrivateKey()) {
      return { publicKey: envPublicKey(), privateKey: envPrivateKey(), subject: envSubject() || webPushSubject, source: "env" };
    }
    const runtime = loadRuntimeConfig();
    const vapidPath = effectiveWebPushVapidPath(runtime);
    const subject = effectiveWebPushSubject(runtime);
    try {
      if (fs.existsSync(vapidPath)) {
        const parsed = JSON.parse(fs.readFileSync(vapidPath, "utf8"));
        if (parsed.publicKey && parsed.privateKey) {
          return {
            publicKey: String(parsed.publicKey),
            privateKey: String(parsed.privateKey),
            subject: String(parsed.subject || subject),
            source: vapidPath,
          };
        }
      }
    } catch (_) {}
    if (!webPushEnabled || !webpush?.generateVAPIDKeys) return null;
    const keys = webpush.generateVAPIDKeys();
    const generated = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject };
    try {
      fs.mkdirSync(path.dirname(vapidPath), { recursive: true });
      fs.writeFileSync(vapidPath, JSON.stringify(generated, null, 2), { encoding: "utf8", mode: 0o600 });
    } catch (_) {
      // Keep the generated pair in memory for this process if persistence fails.
    }
    return Object.assign({ source: fs.existsSync(vapidPath) ? vapidPath : "memory" }, generated);
  }

  function initializeWebPush() {
    if (!webPushEnabled) {
      webPushConfig = null;
      return null;
    }
    const config = loadVapidConfig();
    if (!config?.publicKey || !config?.privateKey || !webpush?.setVapidDetails) {
      webPushConfig = null;
      return null;
    }
    try {
      webpush.setVapidDetails(config.subject || webPushSubject, config.publicKey, config.privateKey);
      webPushConfig = config;
      return config;
    } catch (err) {
      logger.error?.(`Home AI Push disabled: ${err.message || String(err)}`);
      webPushConfig = null;
      return null;
    }
  }

  function generateWebPushVapidConfig(input = {}) {
    if (!webPushEnabled) throw createStatusError("Web Push is disabled", 409);
    if (envPublicKey() || envPrivateKey()) {
      throw createStatusError("Web Push VAPID keys are configured by environment variables", 409);
    }
    if (!webpush?.generateVAPIDKeys) throw createStatusError("Web Push VAPID generator is unavailable", 500);
    const runtime = loadRuntimeConfig();
    const vapidPath = effectiveWebPushVapidPath(runtime);
    if (fs.existsSync(vapidPath) && !input.overwrite) throw createStatusError("VAPID key file already exists", 409);
    const keys = webpush.generateVAPIDKeys();
    const generated = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: effectiveWebPushSubject(runtime),
    };
    fs.mkdirSync(path.dirname(vapidPath), { recursive: true });
    fs.writeFileSync(vapidPath, JSON.stringify(generated, null, 2), { encoding: "utf8", mode: 0o600 });
    initializeWebPush();
    return { source: vapidPath, publicKey: generated.publicKey, subject: generated.subject };
  }

  function getWebPushConfig() {
    return webPushConfig;
  }

  return {
    generateWebPushVapidConfig,
    getWebPushConfig,
    initializeWebPush,
    loadVapidConfig,
  };
}

module.exports = {
  createWebPushVapidService,
};
