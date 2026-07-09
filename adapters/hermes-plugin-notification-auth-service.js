"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function timingSafeEquals(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function headerValue(req, name) {
  const headers = req?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function defaultMovieNotificationKeyPath(dataDir = "") {
  return path.join(dataDir || path.join(process.cwd(), "workspace", "hermes-web"), "plugin-secrets", "movie-notification-key.txt");
}

function createHermesPluginNotificationAuthService(options = {}) {
  const env = options.env || process.env;
  const dataDir = options.dataDir || env.HERMES_WEB_DATA_DIR || env.HERMES_MOBILE_DATA_DIR || "";
  const keyPaths = Object.assign({
    movie: clean(
      options.movieKeyPath
      || env.HOMEAI_MOVIE_NOTIFICATION_KEY_FILE
      || env.MOVIE_HOMEAI_NOTIFICATION_KEY_FILE
      || defaultMovieNotificationKeyPath(dataDir),
      2000,
    ),
  }, options.keyPaths || {});
  const readFile = typeof options.readFile === "function"
    ? options.readFile
    : ((filePath) => fs.readFileSync(filePath, "utf8"));

  function configuredKey(pluginId = "") {
    const filePath = clean(keyPaths[clean(pluginId, 80)] || "", 2000);
    if (!filePath) return "";
    try {
      return clean(readFile(filePath), 2000);
    } catch (_) {
      return "";
    }
  }

  function authorizePluginNotificationRequest(input = {}) {
    const pluginId = clean(input.pluginId, 80);
    const workspaceId = clean(input.workspaceId || "owner", 120) || "owner";
    if (pluginId !== "movie" || workspaceId !== "owner") {
      return { ok: false, reason: "plugin_notification_key_not_applicable" };
    }
    const key = clean(headerValue(input.req, "x-hermes-web-key"), 2000);
    const expected = configuredKey(pluginId);
    if (!key || !expected || !timingSafeEquals(key, expected)) {
      return { ok: false, reason: "plugin_notification_key_denied" };
    }
    return {
      ok: true,
      pluginId,
      workspaceId,
      auth: {
        ok: true,
        role: "plugin_notification",
        workspaceId,
        principalId: "plugin:movie",
        isOwner: false,
        keySource: "plugin_notification",
      },
    };
  }

  return {
    authorizePluginNotificationRequest,
  };
}

module.exports = {
  createHermesPluginNotificationAuthService,
  defaultMovieNotificationKeyPath,
};
