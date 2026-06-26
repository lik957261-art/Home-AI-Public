"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const TTS_PROFILE_BODY_LIMIT = 12 * 1024 * 1024;

const HOME_AI_TTS_API_ROUTE_SPECS = Object.freeze([
  {
    id: "home-ai-tts-profiles-list",
    method: "GET",
    path: "/api/v1/home-ai/tts/profiles",
    group: "home-ai-tts",
    moduleKey: "home-ai-tts",
    handlerKey: "listProfiles",
    summary: "List workspace-scoped Home AI TTS voice profiles.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["tts-profile"],
    tags: ["tts", "voice", "profile"],
  },
  {
    id: "home-ai-tts-profiles-create",
    method: "POST",
    path: "/api/v1/home-ai/tts/profiles",
    group: "home-ai-tts",
    moduleKey: "home-ai-tts",
    handlerKey: "createProfile",
    summary: "Create or replace a workspace-scoped Home AI TTS voice profile from a bounded WAV prompt.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["tts-profile", "audio"],
    tags: ["tts", "voice", "profile", "audio"],
  },
  {
    id: "home-ai-tts-synthesize",
    method: "POST",
    path: "/api/v1/home-ai/tts/synthesize",
    group: "home-ai-tts",
    moduleKey: "home-ai-tts",
    handlerKey: "synthesize",
    summary: "Synthesize and persist a Home AI TTS asset.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["tts-asset"],
    tags: ["tts", "audio", "asset"],
  },
  {
    id: "home-ai-tts-assets-list",
    method: "GET",
    path: "/api/v1/home-ai/tts/assets",
    group: "home-ai-tts",
    moduleKey: "home-ai-tts",
    handlerKey: "listAssets",
    summary: "List Home AI TTS assets by plugin/demo metadata.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["tts-asset"],
    tags: ["tts", "audio", "asset", "list"],
  },
  {
    id: "home-ai-tts-demo-plan-narrations",
    method: "POST",
    path: "/api/v1/home-ai/tts/demo-plans/narrations",
    group: "home-ai-tts",
    moduleKey: "home-ai-tts",
    handlerKey: "synthesizeDemoPlan",
    summary: "Batch synthesize Music demo-plan before-track narration assets.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["tts-asset", "music-demo"],
    tags: ["tts", "audio", "music"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`home ai tts api routes require ${name}`);
  }
}

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeErrorPayload(err) {
  return {
    ok: false,
    code: cleanString(err?.code || "home_ai_tts_error", 100),
    error: cleanString(err?.message || "Home AI TTS error", 240).replace(/\s+/g, " "),
  };
}

function workspaceFromRequest(url, body, auth) {
  return cleanString(body?.workspaceId || body?.workspace_id || url.searchParams.get("workspaceId") || auth?.workspaceId || "owner", 120) || "owner";
}

function assetIdFromPath(pathname, suffix = "") {
  const prefix = "/api/v1/home-ai/tts/assets/";
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length);
  if (suffix && !rest.endsWith(suffix)) return "";
  const raw = suffix ? rest.slice(0, -suffix.length) : rest;
  if (!raw || raw.includes("/")) return "";
  return decodeURIComponent(raw);
}

function profileIdFromPath(pathname, suffix = "") {
  const prefix = "/api/v1/home-ai/tts/profiles/";
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length);
  if (suffix && !rest.endsWith(suffix)) return "";
  const raw = suffix ? rest.slice(0, -suffix.length) : rest;
  if (!raw || raw.includes("/")) return "";
  return decodeURIComponent(raw);
}

function createHomeAiTtsApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.homeAiTtsService || typeof deps.homeAiTtsService.synthesize !== "function") {
    throw new Error("home ai tts api routes require homeAiTtsService.synthesize");
  }
  const registry = createApiRouteRegistry(HOME_AI_TTS_API_ROUTE_SPECS);

  async function withWorkspace(req, res, url, body, context = {}) {
    return deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
  }

  async function handleSynthesize(req, res, url, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = await withWorkspace(req, res, url, body, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const asset = await deps.homeAiTtsService.synthesize(Object.assign({}, body, {
        metadata: Object.assign({}, body.metadata || {}, { workspace_id: workspaceId }),
      }));
      deps.sendJson(res, 200, asset);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleDemoPlan(req, res, url, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = await withWorkspace(req, res, url, body, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const result = await deps.homeAiTtsService.synthesizeDemoPlan(Object.assign({}, body, {
        metadata: Object.assign({}, body.metadata || {}, { workspace_id: workspaceId }),
      }));
      deps.sendJson(res, 200, result);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleList(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || context.auth?.workspaceId || "owner");
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      deps.sendJson(res, 200, {
        ok: true,
        assets: deps.homeAiTtsService.listAssets({
          plugin_id: url.searchParams.get("plugin_id") || url.searchParams.get("pluginId"),
          demo_id: url.searchParams.get("demo_id") || url.searchParams.get("demoId"),
        }),
      });
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleListProfiles(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || context.auth?.workspaceId || "owner");
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      deps.sendJson(res, 200, {
        ok: true,
        workspace_id: workspaceId,
        profiles: deps.homeAiTtsService.listProfiles({ workspace_id: workspaceId }),
      });
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleCreateProfile(req, res, url, context = {}) {
    const body = await deps.readBody(req, TTS_PROFILE_BODY_LIMIT).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, safeErrorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    const workspaceId = await withWorkspace(req, res, url, body, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const profile = await deps.homeAiTtsService.createProfile(Object.assign({}, body, { workspace_id: workspaceId }));
      deps.sendJson(res, 200, { ok: true, profile });
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleSetDefaultProfile(req, res, url, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = await withWorkspace(req, res, url, body, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const profile = deps.homeAiTtsService.setDefaultProfile({
        workspace_id: workspaceId,
        profile_id: profileIdFromPath(url.pathname, "/default"),
      });
      deps.sendJson(res, 200, { ok: true, profile });
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleDeleteProfile(req, res, url, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = await withWorkspace(req, res, url, body, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const result = await deps.homeAiTtsService.deleteProfile({
        workspace_id: workspaceId,
        profile_id: profileIdFromPath(url.pathname, "/delete"),
      });
      deps.sendJson(res, 200, result);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleGetAsset(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || context.auth?.workspaceId || "owner");
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      deps.sendJson(res, 200, deps.homeAiTtsService.getAsset(assetIdFromPath(url.pathname)));
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleFile(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || context.auth?.workspaceId || "owner");
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const asset = deps.homeAiTtsService.fileForAsset(assetIdFromPath(url.pathname, "/file"));
      const stat = fs.statSync(asset.local_path);
      res.writeHead(200, {
        "Content-Type": asset.mime_type,
        "Content-Length": stat.size,
        "Content-Disposition": `inline; filename="${path.basename(asset.local_path).replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      });
      fs.createReadStream(asset.local_path).pipe(res);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleDelete(req, res, url, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = await withWorkspace(req, res, url, body, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const result = await deps.homeAiTtsService.deleteAsset(assetIdFromPath(url.pathname, "/delete"));
      deps.sendJson(res, 200, result);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handle(req, res, url, context = {}) {
    const match = registry.match({ method: req.method, path: url.pathname });
    if (match?.handlerKey === "synthesize") return handleSynthesize(req, res, url, context);
    if (match?.handlerKey === "listProfiles") return handleListProfiles(req, res, url, context);
    if (match?.handlerKey === "createProfile") return handleCreateProfile(req, res, url, context);
    if (match?.handlerKey === "listAssets") return handleList(req, res, url, context);
    if (match?.handlerKey === "synthesizeDemoPlan") return handleDemoPlan(req, res, url, context);
    if (req.method === "POST" && profileIdFromPath(url.pathname, "/default")) return handleSetDefaultProfile(req, res, url, context);
    if (req.method === "POST" && profileIdFromPath(url.pathname, "/delete")) return handleDeleteProfile(req, res, url, context);
    if (req.method === "GET" && assetIdFromPath(url.pathname)) return handleGetAsset(req, res, url, context);
    if (req.method === "GET" && assetIdFromPath(url.pathname, "/file")) return handleFile(req, res, url, context);
    if (req.method === "POST" && assetIdFromPath(url.pathname, "/delete")) return handleDelete(req, res, url, context);
    return { handled: false };
  }

  return { handle, match: (input) => registry.match(input), specs: HOME_AI_TTS_API_ROUTE_SPECS };
}

module.exports = {
  HOME_AI_TTS_API_ROUTE_SPECS,
  createHomeAiTtsApiRoutes,
};
