"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  canonicalGrowthWorkspaceId,
  growthWorkspaceConfigPath,
  growthWorkspaceKeyPath,
} = require("./growth-plugin-provisioning-service");

const DEFAULT_TIMEOUT_MS = 30000;

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value, fallback = "growth_plugin_submission_failed") {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 180) || fallback;
}

function serviceError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw serviceError("growth_plugin_config_invalid", `Growth plugin workspace config is invalid: ${boundedError(err?.message)}`, 500);
  }
}

function growthAccessKeyFile(configPath, config = {}, dataDir = "", env = process.env, workspaceId = "") {
  const configured = stringValue(config.access_key_file);
  if (configured) return path.isAbsolute(configured) ? configured : path.join(path.dirname(configPath), configured);
  return growthWorkspaceKeyPath({ dataDir, env, workspaceId });
}

function loadGrowthWorkspaceBinding(input = {}) {
  const { dataDir, env = process.env, workspaceId } = input;
  const configPath = growthWorkspaceConfigPath({ dataDir, env, workspaceId });
  if (!configPath || !fs.existsSync(configPath)) {
    throw serviceError("growth_plugin_workspace_not_configured", "Growth plugin workspace is not configured", 409);
  }
  const config = readJsonFile(configPath);
  const apiBaseUrl = stringValue(config.api_base_url || config.apiBaseUrl);
  if (!apiBaseUrl) {
    throw serviceError("growth_plugin_api_base_missing", "Growth plugin API base URL is missing", 409);
  }
  const accessKeyPath = growthAccessKeyFile(configPath, config, dataDir, env, workspaceId);
  let accessKey = "";
  try {
    accessKey = fs.readFileSync(accessKeyPath, "utf8").trim();
  } catch (_) {
    throw serviceError("growth_plugin_workspace_key_missing", "Growth plugin workspace access key is missing", 409);
  }
  if (!accessKey) {
    throw serviceError("growth_plugin_workspace_key_empty", "Growth plugin workspace access key is empty", 409);
  }
  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/g, ""),
    workspaceId: stringValue(config.workspace_id || config.workspaceId) || canonicalGrowthWorkspaceId(workspaceId),
    accessKey,
  };
}

async function parseJsonResponse(response) {
  if (typeof response?.json === "function") {
    try {
      return await response.json();
    } catch (_) {
      return {};
    }
  }
  if (typeof response?.text === "function") {
    try {
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function publicProxyResult(payload = {}, cardId = "") {
  const submission = payload.submission || {};
  return {
    ok: true,
    cardId,
    status: submission.status || "submitted",
    evaluation: payload.evaluation || null,
    reward: payload.reward || null,
    result: {
      ok: true,
      id: cardId,
      completed: Boolean(payload.result?.completed),
      submissionId: submission.submissionId || submission.id || "",
      taskCardId: payload.task_card_id || submission.taskCardId || "",
      evaluationJobStatus: payload.evaluation_job?.status || "",
      source: payload.source || "growth-plugin",
    },
  };
}

function publicReflectionProxyResult(payload = {}, cardId = "") {
  const reflection = payload.reflection || {};
  return {
    ok: true,
    cardId,
    status: reflection.status || "reflection_submitted",
    reflection,
    evaluation: payload.evaluation || null,
    reward: payload.reward || null,
    result: {
      ok: true,
      id: cardId,
      completed: Boolean(payload.result?.completed),
      reflectionId: reflection.reflectionId || reflection.id || "",
      taskCardId: payload.task_card_id || reflection.taskCardId || "",
      source: payload.source || "growth-plugin",
    },
  };
}

function createGrowthPluginSubmissionProxyService(options = {}) {
  const dataDir = options.dataDir;
  const env = options.env || process.env;
  const fetchImpl = options.fetch || global.fetch;
  const timeoutMs = Math.max(1, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  async function submitTask(input = {}) {
    const workspaceId = stringValue(input.workspaceId) || "owner";
    const cardId = stringValue(input.cardId || input.taskCardId);
    if (!cardId) return { ok: false, status: 400, error: "growth_card_id_required" };
    if (typeof fetchImpl !== "function") return { ok: false, status: 500, error: "growth_plugin_fetch_unavailable" };
    let binding;
    try {
      binding = loadGrowthWorkspaceBinding({ dataDir, env, workspaceId });
    } catch (err) {
      return { ok: false, status: err.status || 409, error: err.code || "growth_plugin_workspace_not_configured", fallbackAllowed: true };
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetchImpl(`${binding.apiBaseUrl}/api/v1/growth/cards/${encodeURIComponent(cardId)}/submissions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${binding.accessKey}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          workspace_id: binding.workspaceId,
          text: stringValue(input.text || input.submission || input.comment),
          author: stringValue(input.author),
          submittedAt: input.submittedAt,
          filename: input.filename || input.name || "",
          mime: input.mime || input.type || "",
          dataBase64: input.dataBase64 || input.audioDataBase64 || input.data_base64 || "",
          durationMs: input.durationMs || input.duration_ms || 0,
        }),
        signal: controller?.signal,
      });
      const payload = await parseJsonResponse(response);
      if (!response?.ok || payload?.ok === false) {
        return {
          ok: false,
          status: response?.status || payload?.status || 502,
          error: boundedError(payload?.error || payload?.message || response?.statusText, "growth_plugin_remote_failed"),
        };
      }
      return publicProxyResult(payload, cardId);
    } catch (err) {
      if (err?.name === "AbortError") return { ok: false, status: 504, error: "growth_plugin_submission_timeout" };
      return { ok: false, status: 502, error: boundedError(err?.message, "growth_plugin_submission_failed") };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function submitReflection(input = {}) {
    const workspaceId = stringValue(input.workspaceId) || "owner";
    const cardId = stringValue(input.cardId || input.taskCardId);
    if (!cardId) return { ok: false, status: 400, error: "growth_card_id_required" };
    if (typeof fetchImpl !== "function") return { ok: false, status: 500, error: "growth_plugin_fetch_unavailable" };
    let binding;
    try {
      binding = loadGrowthWorkspaceBinding({ dataDir, env, workspaceId });
    } catch (err) {
      return { ok: false, status: err.status || 409, error: err.code || "growth_plugin_workspace_not_configured", fallbackAllowed: true };
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetchImpl(`${binding.apiBaseUrl}/api/v1/growth/cards/${encodeURIComponent(cardId)}/reflections`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${binding.accessKey}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          workspace_id: binding.workspaceId,
          text: stringValue(input.text || input.transcript || input.reflectionText || input.comment),
          author: stringValue(input.author),
          submittedAt: input.submittedAt,
          filename: input.filename || input.name || "",
          mime: input.mime || input.type || "",
          dataBase64: input.dataBase64 || input.audioDataBase64 || input.data_base64 || "",
          durationMs: input.durationMs || input.duration_ms || 0,
        }),
        signal: controller?.signal,
      });
      const payload = await parseJsonResponse(response);
      if (!response?.ok || payload?.ok === false) {
        return {
          ok: false,
          status: response?.status || payload?.status || 502,
          error: boundedError(payload?.error || payload?.message || response?.statusText, "growth_plugin_remote_failed"),
        };
      }
      return publicReflectionProxyResult(payload, cardId);
    } catch (err) {
      if (err?.name === "AbortError") return { ok: false, status: 504, error: "growth_plugin_reflection_timeout" };
      return { ok: false, status: 502, error: boundedError(err?.message, "growth_plugin_reflection_failed") };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    loadGrowthWorkspaceBinding,
    submitReflection,
    submitTask,
  };
}

module.exports = {
  createGrowthPluginSubmissionProxyService,
  loadGrowthWorkspaceBinding,
};
