"use strict";

const http = require("node:http");

const ALLOWED_ACTIONS = new Set([
  "ensure_mac_user",
  "ensure_workspace_roots",
  "ensure_workspace_acl",
  "repair_workspace_acl",
  "ensure_launchd_services",
  "run_workspace_onboarding_smokes",
]);

function text(value) {
  return String(value || "").trim();
}

function safeSocketPath(value) {
  const out = text(value);
  if (!out || /[\0\r\n]/.test(out) || !out.startsWith("/")) return "";
  return out;
}

function boundedError(value, fallback = "workspace_system_helper_failed") {
  return text(value).replace(/\s+/g, " ").slice(0, 180) || fallback;
}

function createWorkspaceSystemProvisioningHelperClientService(options = {}) {
  const httpModule = options.http || http;
  const socketPath = safeSocketPath(options.socketPath || options.env?.HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET || options.env?.HERMES_WEB_WORKSPACE_SYSTEM_HELPER_SOCKET);
  const timeoutMs = Math.max(1000, Math.min(120000, Number(options.timeoutMs || 60000)));

  function requestJson(payload = {}) {
    return new Promise((resolve) => {
      if (!socketPath) return resolve({ ok: false, error: "workspace_system_helper_socket_missing" });
      const body = JSON.stringify(payload);
      const req = httpModule.request({
        socketPath,
        path: "/run-step",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 256 * 1024) req.destroy(new Error("workspace_system_helper_response_too_large"));
        });
        res.on("end", () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch (_) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed && typeof parsed === "object") return resolve(parsed);
          return resolve({ ok: false, error: boundedError(parsed?.error || `workspace_system_helper_http_${res.statusCode || 0}`) });
        });
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error("workspace_system_helper_timeout")));
      req.on("error", (err) => resolve({ ok: false, error: boundedError(err?.message) }));
      req.write(body);
      req.end();
    });
  }

  async function runStep(action, context = {}) {
    const normalizedAction = text(action);
    if (!ALLOWED_ACTIONS.has(normalizedAction)) return { ok: false, error: `system_action_unavailable:${normalizedAction}` };
    return requestJson({ action: normalizedAction, context });
  }

  return { runStep };
}

module.exports = {
  createWorkspaceSystemProvisioningHelperClientService,
  safeSocketPath,
};
