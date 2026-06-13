"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const VOICE_INPUT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "voice-input-status",
    method: "GET",
    path: "/api/voice-input/status",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "status",
    summary: "Read Home AI host voice input availability, backend, limits, and correction count.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["voice-input", "config"],
    tags: ["voice-input", "composer"],
  },
  {
    id: "voice-input-transcribe",
    method: "POST",
    path: "/api/voice-input/transcribe",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "transcribe",
    summary: "Transcribe a short Home AI host voice recording through the configured ASR backend.",
    riskLevel: "high",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["voice-input", "audio", "composer"],
    tags: ["voice-input", "asr", "composer"],
  },
  {
    id: "voice-input-commit",
    method: "POST",
    path: "/api/voice-input/commit",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "commit",
    summary: "Commit the final submitted text for a voice input session and record bounded correction evidence.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["voice-input", "correction", "composer"],
    tags: ["voice-input", "correction", "composer"],
  },
  {
    id: "voice-input-learn-sent-text",
    method: "POST",
    path: "/api/voice-input/learn-sent-text",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "learnSentText",
    summary: "Extract bounded phrasebook candidates from successfully sent composer text.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["voice-input", "phrasebook", "composer"],
    tags: ["voice-input", "phrasebook", "composer"],
  },
  {
    id: "voice-input-corrections-list",
    method: "GET",
    path: "/api/voice-input/corrections",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "listCorrections",
    summary: "List workspace-scoped personal voice correction entries.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["voice-input", "correction"],
    tags: ["voice-input", "correction"],
  },
  {
    id: "voice-input-corrections-update",
    method: "PATCH",
    path: "/api/voice-input/corrections",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "updateCorrection",
    summary: "Enable, suggest-only, or disable a personal voice correction entry.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["voice-input", "correction"],
    tags: ["voice-input", "correction"],
  },
  {
    id: "voice-input-settings-update",
    method: "PATCH",
    path: "/api/voice-input/settings",
    group: "voice-input",
    moduleKey: "voice-input",
    handlerKey: "settings",
    summary: "Update Owner-global Home AI voice input settings.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: false,
    resourceTypes: ["voice-input", "config"],
    tags: ["voice-input", "settings"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`voice input api routes require ${name}`);
  }
}

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeErrorPayload(err, fallback = "voice_input_error") {
  return {
    ok: false,
    error: cleanString(err?.message || fallback, 180).replace(/\s+/g, " "),
    code: cleanString(err?.code || fallback, 80) || fallback,
  };
}

function workspaceFromRequest(url, body, auth) {
  return cleanString(
    body?.workspaceId
    || body?.workspace_id
    || url?.searchParams?.get("workspaceId")
    || auth?.workspaceId
    || "owner",
    120,
  ) || "owner";
}

function actorIdFromAuth(auth) {
  return cleanString(auth?.principalId || auth?.workspaceId || auth?.keyId || "anonymous", 120) || "anonymous";
}

function scopeFromRequest(url, body, auth, workspaceId) {
  return {
    actorId: actorIdFromAuth(auth),
    workspaceId,
    surfaceType: cleanString(body?.surfaceType || body?.surface_type || url?.searchParams?.get("surfaceType") || "chat", 80) || "chat",
    pluginId: cleanString(body?.pluginId || body?.plugin_id || url?.searchParams?.get("pluginId"), 120),
    threadId: cleanString(body?.threadId || body?.thread_id || url?.searchParams?.get("threadId"), 160),
    language: cleanString(body?.language || body?.locale || url?.searchParams?.get("language"), 40),
  };
}

function createVoiceInputApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.voiceInputService || typeof deps.voiceInputService.status !== "function") {
    throw new Error("voice input api routes require voiceInputService.status");
  }
  const registry = createApiRouteRegistry(VOICE_INPUT_API_ROUTE_SPECS);
  const maxBodyBytes = Math.max(256 * 1024, Number(deps.maxBodyBytes || 24 * 1024 * 1024) || 24 * 1024 * 1024);

  async function readJsonBody(req, limit = 128 * 1024) {
    try {
      return await deps.readBody(req, limit);
    } catch (err) {
      err.status = err?.status || 400;
      err.code = err?.code || "voice_input_invalid_body";
      throw err;
    }
  }

  function sendServiceError(res, err) {
    deps.sendJson(res, err?.status || 500, safeErrorPayload(err));
  }

  function requireWorkspace(req, res, url, body, context) {
    return deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
  }

  function handleStatus(req, res, url, context = {}) {
    const body = {};
    const workspaceId = requireWorkspace(req, res, url, body, context);
    if (!workspaceId) return;
    deps.sendJson(res, 200, deps.voiceInputService.status(scopeFromRequest(url, body, context.auth, workspaceId)));
  }

  async function handleTranscribe(req, res, url, context = {}) {
    let body;
    try {
      body = await readJsonBody(req, maxBodyBytes);
      const workspaceId = requireWorkspace(req, res, url, body, context);
      if (!workspaceId) return;
      const result = await deps.voiceInputService.transcribe(Object.assign({}, body, scopeFromRequest(url, body, context.auth, workspaceId)));
      deps.sendJson(res, 200, result);
    } catch (err) {
      sendServiceError(res, err);
    }
  }

  async function handleCommit(req, res, url, context = {}) {
    let body;
    try {
      body = await readJsonBody(req);
      const workspaceId = requireWorkspace(req, res, url, body, context);
      if (!workspaceId) return;
      const result = deps.voiceInputService.commitSession(Object.assign({}, body, scopeFromRequest(url, body, context.auth, workspaceId)));
      deps.sendJson(res, 200, result);
    } catch (err) {
      sendServiceError(res, err);
    }
  }

  async function handleLearnSentText(req, res, url, context = {}) {
    let body;
    try {
      body = await readJsonBody(req);
      const workspaceId = requireWorkspace(req, res, url, body, context);
      if (!workspaceId) return;
      const result = deps.voiceInputService.learnSentText(Object.assign({}, body, scopeFromRequest(url, body, context.auth, workspaceId)));
      const response = {
        ok: Boolean(result?.ok),
        recordedCount: Array.isArray(result?.recorded) ? result.recorded.length : 0,
      };
      if (body?.receiptMode === "phrasebook") {
        response.recorded = Array.isArray(result?.recorded) ? result.recorded.slice(0, 40) : [];
        response.thresholds = result?.thresholds || {};
      }
      deps.sendJson(res, 200, response);
    } catch (err) {
      sendServiceError(res, err);
    }
  }

  function handleListCorrections(req, res, url, context = {}) {
    const body = {};
    const workspaceId = requireWorkspace(req, res, url, body, context);
    if (!workspaceId) return;
    deps.sendJson(res, 200, deps.voiceInputService.listCorrections(scopeFromRequest(url, body, context.auth, workspaceId)));
  }

  async function handleUpdateCorrection(req, res, url, context = {}) {
    let body;
    try {
      body = await readJsonBody(req);
      const workspaceId = requireWorkspace(req, res, url, body, context);
      if (!workspaceId) return;
      deps.sendJson(res, 200, deps.voiceInputService.updateCorrection(Object.assign({}, body, scopeFromRequest(url, body, context.auth, workspaceId))));
    } catch (err) {
      sendServiceError(res, err);
    }
  }

  async function handleUpdateSettings(req, res, url, context = {}) {
    let body;
    try {
      body = await readJsonBody(req);
      const workspaceId = deps.requireWorkspaceAccess(req, res, "owner");
      if (!workspaceId) return;
      if (!deps.voiceInputService || typeof deps.voiceInputService.updateSettings !== "function") {
        throw Object.assign(new Error("voice input settings are unavailable"), {
          status: 503,
          code: "voice_input_settings_unavailable",
        });
      }
      deps.sendJson(res, 200, deps.voiceInputService.updateSettings(Object.assign({}, body, scopeFromRequest(url, body, context.auth, "owner"))));
    } catch (err) {
      sendServiceError(res, err);
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "voice-input-status") {
      handleStatus(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "voice-input-transcribe") {
      await handleTranscribe(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "voice-input-commit") {
      await handleCommit(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "voice-input-learn-sent-text") {
      await handleLearnSentText(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "voice-input-corrections-list") {
      handleListCorrections(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "voice-input-corrections-update") {
      await handleUpdateCorrection(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "voice-input-settings-update") {
      await handleUpdateSettings(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    return { handled: false };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  VOICE_INPUT_API_ROUTE_SPECS,
  createVoiceInputApiRoutes,
};
