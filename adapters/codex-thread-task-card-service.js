"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_CODEX_MOBILE_URL = "http://127.0.0.1:8787";
const DEFAULT_APP_WORKSPACE_CWD = "/Users/example/path";
const DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX = "Home AI";
const DEFAULT_HOME_AI_TASK_INTAKE_THREAD_TITLE = "Home AI Task Intake";
const DEFAULT_PLUGIN_AUDIT_THREAD_TITLE = "Plugin Workspace Audit";
const DEFAULT_PLATFORM_AUDIT_THREAD_TITLE = "Home AI Platform Audit";
const DEFAULT_DEPLOY_THREAD_TITLE = "Home AI Deploy";
const DEFAULT_DEPLOY_THREAD_TITLES = Object.freeze([
  DEFAULT_DEPLOY_THREAD_TITLE,
  "Home AI Deploy Lane A",
  "Home AI Deploy Lane B",
  "Home AI Deploy Lane C",
  "Codex Mobile Deploy Lane",
  "Movie Deploy Lane",
]);
const DEFAULT_DEPLOY_LANE_ASSIGNMENTS = Object.freeze({
  "codex-mobile": "Codex Mobile Deploy Lane",
  "codex-mobile-web": "Codex Mobile Deploy Lane",
  movie: "Movie Deploy Lane",
});
const DEPLOY_PLUGIN_INFERENCE_PATTERNS = Object.freeze([
  ["codex-mobile-web", /codex[-_ ]?mobile[-_ ]?web|codex[-_ ]?mobile|plugins\/codex-mobile-web/i],
  ["movie", /(?:^|[^a-z0-9])movie(?:[^a-z0-9]|$)|\/Movie(?:\/|$)|plugins\/movie/i],
]);
const DEFAULT_HOME_AI_IMPLEMENTATION_THREAD_TITLES = Object.freeze([
  "Home AI Worker Lane A",
  "Home AI Worker Lane B",
  "Home AI Worker Lane C",
]);
const DEFAULT_TASK_CARD_REASONING_EFFORT = "medium";
const TASK_CARD_REASONING_EFFORTS = Object.freeze(["low", "medium", "high", "xhigh"]);
const TASK_CARD_REASONING_EFFORT_RANK = Object.freeze(Object.fromEntries(
  TASK_CARD_REASONING_EFFORTS.map((effort, index) => [effort, index]),
));

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function cleanList(value, max = 160) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,]/);
  return [...new Set(raw.map((item) => clean(item, max)).filter(Boolean))];
}

function compactText(value, maxChars = 800) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20)}...[truncated]`;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_CODEX_MOBILE_URL).trim().replace(/\/+$/, "") || DEFAULT_CODEX_MOBILE_URL;
}

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function readText(fsImpl, filePath) {
  if (!filePath) return "";
  try {
    return fsImpl.readFileSync(filePath, "utf8").trim();
  } catch (_) {
    return "";
  }
}

function defaultCodexMobileKeyPath(env = process.env) {
  const home = env.HOME || env.USERPROFILE || "";
  return home ? path.join(home, ".codex-mobile-web", "access_key") : "";
}

function codexMobileKey(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  return String(
    options.key
      || env.HERMES_MOBILE_CODEX_MOBILE_KEY
      || env.HERMES_WEB_CODEX_MOBILE_KEY
      || env.CODEX_MOBILE_KEY
      || readText(fsImpl, options.keyFile || "")
      || readText(fsImpl, env.HERMES_MOBILE_CODEX_MOBILE_KEY_FILE)
      || readText(fsImpl, env.HERMES_WEB_CODEX_MOBILE_KEY_FILE)
      || readText(fsImpl, env.CODEX_MOBILE_KEY_FILE)
      || readText(fsImpl, defaultCodexMobileKeyPath(env)),
  ).trim();
}

function defaultAppWorkspaceCwd(env = process.env, platform = process.platform) {
  const configured = clean(env.HOMEAI_CODEX_SOURCE_WORKSPACE_CWD || env.HERMES_MOBILE_HOME_AI_WORKSPACE_CWD, 2000);
  if (configured) return configured;
  const devRoot = clean(env.HERMES_MOBILE_DEV_ROOT || env.HERMES_WEB_DEV_ROOT, 2000);
  if (devRoot) return path.join(devRoot, "app");
  if (platform === "darwin") return DEFAULT_APP_WORKSPACE_CWD;
  return process.cwd();
}

function threadIdOf(thread) {
  return clean(thread?.id || thread?.threadId || thread?.thread_id, 160);
}

function threadTitleOf(thread) {
  return clean(thread?.title || thread?.name || thread?.threadTitle || thread?.thread_title, 240);
}

function threadCwdOf(thread) {
  return clean(thread?.cwd || thread?.workspace || thread?.workspaceCwd || thread?.workspace_cwd, 2000);
}

function threadStatusOf(thread) {
  const status = thread?.status;
  if (typeof status === "string") return status.toLowerCase();
  if (status && typeof status.type === "string") return status.type.toLowerCase();
  return "";
}

function threadUpdatedAt(thread) {
  const raw = thread?.updatedAt || thread?.updated_at || thread?.lastUpdatedAt || thread?.last_updated_at || 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(raw || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isClosedThread(thread) {
  const status = threadStatusOf(thread);
  return Boolean(thread?.archived || thread?.deleted || ["archived", "deleted"].includes(status));
}

function isCompletedThread(thread) {
  return threadStatusOf(thread) === "completed";
}

function isDeployKind(kind) {
  const text = clean(kind, 80).toLowerCase();
  return text === "deployment" || text === "deploy" || text === "plugin_deployment" || text === "plugin-deployment";
}

function isImplementationKind(kind) {
  const text = clean(kind, 80).toLowerCase();
  return [
    "home_ai_worker",
    "home-ai-worker",
    "home_ai_implementation",
    "home-ai-implementation",
    "implementation",
    "implementation_worker",
    "implementation-worker",
  ].includes(text);
}

function normalizeTaskCardReasoningEffort(value) {
  const effort = clean(value, 40).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TASK_CARD_REASONING_EFFORT_RANK, effort)) {
    return DEFAULT_TASK_CARD_REASONING_EFFORT;
  }
  return TASK_CARD_REASONING_EFFORT_RANK[effort] < TASK_CARD_REASONING_EFFORT_RANK[DEFAULT_TASK_CARD_REASONING_EFFORT]
    ? DEFAULT_TASK_CARD_REASONING_EFFORT
    : effort;
}

function parseDeployLaneAssignments(value) {
  if (!value) return {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [clean(key, 120).toLowerCase(), clean(val, 160)])
        .filter(([key, val]) => key && val),
    );
  }
  try {
    return parseDeployLaneAssignments(JSON.parse(String(value)));
  } catch (_) {
    return {};
  }
}

function inferDeployPluginId(input = {}) {
  const explicit = clean(
    input.pluginId
      || input.plugin
      || input.plugin_id
      || input.deployPluginId
      || input.deploy_plugin_id
      || input.targetPlugin
      || input.target_plugin,
    120,
  ).toLowerCase();
  if (explicit) return explicit;
  const haystack = [
    input.title,
    input.summary,
    input.body,
    input.bodyMarkdown,
    input.sourceWorkspaceCwd,
    input.sourceWorkspace,
    input.targetWorkspaceCwd,
    input.targetWorkspace,
    input.targetWorkspacePath,
  ].map((item) => String(item || "")).join("\n");
  for (const [pluginId, pattern] of DEPLOY_PLUGIN_INFERENCE_PATTERNS) {
    if (pattern.test(haystack)) return pluginId;
  }
  return "";
}

function stableHash(value) {
  const text = clean(value, 240);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function isTerminalReceiptCard(input = {}) {
  const title = clean(input.title, 240);
  const body = String(input.body || input.bodyMarkdown || "");
  if (/^return\s*:/i.test(title)) return true;
  if (/^#\s*return\s*:/im.test(body)) return true;
  if (/return policy:\s*terminal receipt/i.test(body)) return true;
  return false;
}

function activeScore(thread) {
  const status = threadStatusOf(thread);
  if (status === "active" || status === "running") return 4;
  if (status === "pending" || status === "queued") return 3;
  if (status === "idle" || !status) return 2;
  return 1;
}

function implementationLoadScore(thread) {
  const status = threadStatusOf(thread);
  if (status === "idle" || !status) return 0;
  if (status === "pending" || status === "queued") return 1;
  if (status === "active" || status === "running") return 2;
  return 3;
}

function sortedThreads(threads) {
  return [...threads].sort((left, right) => {
    const scoreDiff = activeScore(right) - activeScore(left);
    if (scoreDiff) return scoreDiff;
    return threadUpdatedAt(right) - threadUpdatedAt(left);
  });
}

function parseThreadList(payload) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.threads)
      ? payload.threads
      : [];
  return list.filter((thread) => threadIdOf(thread) && !isClosedThread(thread));
}

function safeThread(thread) {
  if (!thread) return null;
  return {
    id: threadIdOf(thread),
    title: threadTitleOf(thread),
    cwd: threadCwdOf(thread),
    status: threadStatusOf(thread) || "unknown",
    updatedAt: threadUpdatedAt(thread) || undefined,
  };
}

function createError(status, code, message, extra = {}) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  err.safe = Object.assign({ ok: false, status, code, error: message || code }, extra);
  return err;
}

function createCodexThreadTaskCardService(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  const fetchImpl = options.fetch || globalThis.fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl || env.HOMEAI_CODEX_MOBILE_URL || env.HERMES_MOBILE_CODEX_MOBILE_URL || env.HERMES_WEB_CODEX_MOBILE_URL || env.CODEX_MOBILE_BASE_URL || env.CODEX_MOBILE_URL);
  const sourceWorkspaceCwd = normalizePath(options.sourceWorkspaceCwd || defaultAppWorkspaceCwd(env, options.platform || process.platform));
  const sourceThreadTitlePrefix = clean(options.sourceThreadTitlePrefix || env.HOMEAI_CODEX_SOURCE_THREAD_TITLE_PREFIX || DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX, 120) || DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX;
  const defaultPluginAuditThreadTitle = clean(options.pluginAuditThreadTitle || env.HOMEAI_PLUGIN_WORKSPACE_AUDIT_THREAD_TITLE || DEFAULT_PLUGIN_AUDIT_THREAD_TITLE, 160) || DEFAULT_PLUGIN_AUDIT_THREAD_TITLE;
  const defaultPlatformAuditThreadTitle = clean(options.platformAuditThreadTitle || env.HOMEAI_PLATFORM_AUDIT_THREAD_TITLE || DEFAULT_PLATFORM_AUDIT_THREAD_TITLE, 160) || DEFAULT_PLATFORM_AUDIT_THREAD_TITLE;
  const defaultDeployThreadTitle = clean(options.deployThreadTitle || env.HOMEAI_DEPLOY_THREAD_TITLE || DEFAULT_DEPLOY_THREAD_TITLE, 160) || DEFAULT_DEPLOY_THREAD_TITLE;
  const deployThreadTitles = cleanList(
    options.deployThreadTitles || env.HOMEAI_DEPLOY_THREAD_TITLES,
    160,
  );
  const deployLaneTitles = deployThreadTitles.length
    ? deployThreadTitles
    : [defaultDeployThreadTitle, ...DEFAULT_DEPLOY_THREAD_TITLES.filter((title) => title !== defaultDeployThreadTitle)];
  const deployLaneAssignments = Object.assign(
    {},
    DEFAULT_DEPLOY_LANE_ASSIGNMENTS,
    parseDeployLaneAssignments(options.deployLaneAssignments || env.HOMEAI_DEPLOY_LANE_ASSIGNMENTS),
  );
  const implementationThreadTitles = cleanList(
    options.implementationThreadTitles || env.HOMEAI_IMPLEMENTATION_THREAD_TITLES,
    160,
  );
  const implementationLaneTitles = implementationThreadTitles.length
    ? implementationThreadTitles
    : [...DEFAULT_HOME_AI_IMPLEMENTATION_THREAD_TITLES];
  const implementationLaneRequired = /^(1|true|yes)$/i.test(String(
    options.implementationLaneRequired ?? env.HOMEAI_IMPLEMENTATION_LANE_REQUIRED ?? "",
  ));
  const requestTimeoutMs = Math.max(1000, Number(options.timeoutMs || env.HOMEAI_CODEX_TASK_CARD_TIMEOUT_MS || 15000));
  const homeAiReservedTargetTitles = new Set([
    defaultPluginAuditThreadTitle,
    defaultPlatformAuditThreadTitle,
    ...deployLaneTitles,
    ...implementationLaneTitles,
    DEFAULT_HOME_AI_TASK_INTAKE_THREAD_TITLE,
    clean(env.HOMEAI_CODEX_SOURCE_THREAD_TITLE || "", 160),
    sourceThreadTitlePrefix,
  ].filter(Boolean));

  function accessKey() {
    const key = codexMobileKey(Object.assign({}, options, { env, fs: fsImpl }));
    if (!key) throw createError(503, "codex_mobile_key_unconfigured", "Codex Mobile access key is not configured");
    return key;
  }

  async function requestJson(method, route, body = null) {
    if (typeof fetchImpl !== "function") throw createError(503, "fetch_unavailable", "fetch is unavailable");
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), requestTimeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${route}`, {
        method,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Bearer ${accessKey()}`,
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (_) {
      parsed = { ok: false, error: compactText(text || `HTTP ${response.status}`, 600) };
    }
    if (!response.ok || parsed?.ok === false) {
      throw createError(response.status || 500, clean(parsed?.code || parsed?.error || "codex_mobile_request_failed", 160), compactText(parsed?.message || parsed?.error || `Codex Mobile request failed with HTTP ${response.status}`, 800));
    }
    return parsed;
  }

  async function listThreads(input = {}) {
    const params = new URLSearchParams();
    const search = clean(input.search, 240);
    const cwd = clean(input.cwd, 2000);
    params.set("limit", String(Math.max(1, Math.min(200, Number(input.limit || 100)))));
    if (search) params.set("search", search);
    if (cwd) params.set("cwd", cwd);
    const payload = await requestJson("GET", `/api/threads?${params.toString()}`);
    return parseThreadList(payload);
  }

  async function findAuditThread(input = {}) {
    const title = clean(input.title || (input.kind === "platform" ? defaultPlatformAuditThreadTitle : defaultPluginAuditThreadTitle), 160);
    const cwd = normalizePath(input.cwd || sourceWorkspaceCwd);
    const byTitle = await listThreads({ search: title, limit: 100 });
    const matches = byTitle.filter((thread) => {
      if (threadTitleOf(thread) !== title) return false;
      return !cwd || normalizePath(threadCwdOf(thread)) === cwd;
    });
    if (!matches.length) {
      throw createError(503, "audit_thread_not_found", "Central audit thread is not currently discoverable", { auditThreadTitle: title, cwd });
    }
    if (matches.length > 1) {
      throw createError(409, "audit_thread_ambiguous", "Multiple central audit threads match the requested role", { auditThreadTitle: title, cwd, matchCount: matches.length });
    }
    return matches[0];
  }

  async function findDeployThread(input = {}) {
    const cwd = normalizePath(input.cwd || sourceWorkspaceCwd);
    const explicitTitle = clean(input.title, 160);
    const allowedTitles = explicitTitle ? [explicitTitle] : deployLaneTitles;
    const allowedTitleSet = new Set(allowedTitles);
    const pluginKey = inferDeployPluginId(input);
    const byTitle = explicitTitle
      ? await listThreads({ search: explicitTitle, limit: 100 })
      : await listThreads({ cwd, limit: 200 });
    const matches = byTitle.filter((thread) => {
      const title = threadTitleOf(thread);
      if (!allowedTitleSet.has(title)) return false;
      if (isCompletedThread(thread)) return false;
      return !cwd || normalizePath(threadCwdOf(thread)) === cwd;
    });
    if (!matches.length) {
      throw createError(503, "deploy_thread_not_found", "Central Home AI deployment lane is not currently discoverable", { deployThreadTitles: allowedTitles, cwd });
    }
    const duplicates = new Map();
    for (const thread of matches) {
      const title = threadTitleOf(thread);
      duplicates.set(title, (duplicates.get(title) || 0) + 1);
    }
    const duplicateTitle = [...duplicates.entries()].find(([, count]) => count > 1)?.[0] || "";
    if (duplicateTitle) {
      throw createError(409, "deploy_thread_ambiguous", "Multiple central Home AI deployment lanes match the same title", { deployThreadTitle: duplicateTitle, cwd, matchCount: duplicates.get(duplicateTitle) });
    }
    const sorted = [...matches].sort((left, right) => {
      const titleDiff = allowedTitles.indexOf(threadTitleOf(left)) - allowedTitles.indexOf(threadTitleOf(right));
      if (titleDiff) return titleDiff;
      return threadUpdatedAt(right) - threadUpdatedAt(left);
    });
    const assignedTitle = pluginKey ? deployLaneAssignments[pluginKey] : "";
    if (assignedTitle) {
      const assigned = sorted.find((thread) => threadTitleOf(thread) === assignedTitle);
      if (assigned) return assigned;
    }
    if (pluginKey && sorted.length > 1) {
      return sorted[stableHash(pluginKey) % sorted.length];
    }
    return sorted[0];
  }

  async function findImplementationThread(input = {}) {
    const cwd = normalizePath(input.cwd || sourceWorkspaceCwd);
    const allowedTitles = implementationLaneTitles;
    const allowedTitleSet = new Set(allowedTitles);
    const byWorkspace = await listThreads({ cwd, limit: 200 });
    const matches = byWorkspace.filter((thread) => {
      const title = threadTitleOf(thread);
      if (!allowedTitleSet.has(title)) return false;
      if (isCompletedThread(thread)) return false;
      return !cwd || normalizePath(threadCwdOf(thread)) === cwd;
    });
    if (!matches.length) {
      if (implementationLaneRequired) {
        throw createError(503, "home_ai_implementation_lane_not_found", "Home AI implementation worker lane is not currently discoverable", {
          implementationThreadTitles: allowedTitles,
          cwd,
        });
      }
      return null;
    }
    const duplicates = new Map();
    for (const thread of matches) {
      const title = threadTitleOf(thread);
      duplicates.set(title, (duplicates.get(title) || 0) + 1);
    }
    const duplicateTitle = [...duplicates.entries()].find(([, count]) => count > 1)?.[0] || "";
    if (duplicateTitle) {
      throw createError(409, "home_ai_implementation_lane_ambiguous", "Multiple Home AI implementation worker lanes match the same title", {
        implementationThreadTitle: duplicateTitle,
        cwd,
        matchCount: duplicates.get(duplicateTitle),
      });
    }
    const sorted = [...matches].sort((left, right) => {
      const loadDiff = implementationLoadScore(left) - implementationLoadScore(right);
      if (loadDiff) return loadDiff;
      return threadUpdatedAt(left) - threadUpdatedAt(right);
    });
    const bestScore = implementationLoadScore(sorted[0]);
    const best = sorted.filter((thread) => implementationLoadScore(thread) === bestScore);
    const requestKey = clean(input.requestKey || input.requestId || input.request_id || input.title || "", 240);
    if (requestKey && best.length > 1) return best[stableHash(requestKey) % best.length];
    return best[0];
  }

  async function findTargetThread(input = {}) {
    const id = clean(input.id || input.threadId || input.thread_id, 160);
    const title = clean(input.title, 160);
    const titlePrefix = clean(input.titlePrefix || input.title_prefix, 160);
    const cwd = normalizePath(input.cwd || "");
    if (id) {
      return {
        id,
        title: title || titlePrefix,
        cwd,
        status: "configured",
      };
    }
    if (isImplementationKind(input.kind) && !title) {
      const workerThread = await findImplementationThread({
        cwd: cwd || sourceWorkspaceCwd,
        requestKey: input.requestKey || input.requestId || input.request_id || input.title,
      });
      if (workerThread) return workerThread;
    }
    if (isDeployKind(input.kind) && !title && !titlePrefix) {
      return findDeployThread({
        cwd: cwd || sourceWorkspaceCwd,
        pluginId: input.pluginId || input.plugin || input.plugin_id,
        deployPluginId: input.deployPluginId || input.deploy_plugin_id,
        targetPlugin: input.targetPlugin || input.target_plugin,
        title: input.title,
        summary: input.summary,
        body: input.body || input.bodyMarkdown,
        sourceWorkspaceCwd: input.sourceWorkspaceCwd,
        sourceWorkspace: input.sourceWorkspace,
        targetWorkspaceCwd: input.targetWorkspaceCwd,
        targetWorkspace: input.targetWorkspace,
        targetWorkspacePath: input.targetWorkspacePath,
      });
    }
    if (!title && !titlePrefix && !cwd) {
      return findAuditThread({ kind: input.kind || "plugin", cwd: sourceWorkspaceCwd });
    }
    const search = title || titlePrefix || "";
    const candidates = await listThreads(search ? { search, limit: 120 } : { cwd, limit: 120 });
    const prefixOnlyHomeAiTarget = !title
      && [DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX, sourceThreadTitlePrefix].includes(titlePrefix)
      && (!cwd || normalizePath(cwd) === sourceWorkspaceCwd);
    const matches = candidates.filter((thread) => {
      const threadTitle = threadTitleOf(thread);
      const threadCwd = normalizePath(threadCwdOf(thread));
      if (cwd && threadCwd !== cwd) return false;
      if (title && threadTitle === title) return true;
      if (prefixOnlyHomeAiTarget && homeAiReservedTargetTitles.has(threadTitle) && !isDeployKind(input.kind)) return false;
      if (!title && titlePrefix && threadTitle.startsWith(titlePrefix)) return true;
      if (!title && !titlePrefix) return true;
      return false;
    });
    const selected = sortedThreads(matches)[0];
    if (!selected) {
      throw createError(503, "target_thread_not_found", "Target Codex thread is not currently discoverable", {
        targetThreadTitle: title,
        targetThreadTitlePrefix: titlePrefix,
        cwd,
      });
    }
    return selected;
  }

  async function findSourceThread(input = {}) {
    const id = clean(input.id || input.threadId || input.thread_id, 160);
    const cwd = normalizePath(input.cwd || sourceWorkspaceCwd);
    if (id) {
      return {
        id,
        title: clean(input.title, 160) || id,
        cwd,
        status: "configured",
      };
    }
    const explicitTitle = clean(input.title || env.HOMEAI_CODEX_SOURCE_THREAD_TITLE, 160);
    const explicitTitlePrefix = clean(input.titlePrefix || input.title_prefix || input.sourceThreadTitlePrefix || input.source_thread_title_prefix, 160);
    if (explicitTitle) {
      const byTitle = await listThreads({ search: explicitTitle, limit: 100 });
      const matches = byTitle.filter((thread) => threadTitleOf(thread) === explicitTitle && (!cwd || normalizePath(threadCwdOf(thread)) === cwd));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) throw createError(409, "home_ai_source_thread_ambiguous", "Multiple Home AI source threads match the configured title", { sourceThreadTitle: explicitTitle, cwd, matchCount: matches.length });
      if (!explicitTitlePrefix) {
        throw createError(503, "home_ai_source_thread_not_found", "Configured Home AI source thread is not currently discoverable", { sourceThreadTitle: explicitTitle, cwd });
      }
    }
    const effectiveTitlePrefix = explicitTitlePrefix || sourceThreadTitlePrefix;
    const byWorkspace = await listThreads(cwd ? { cwd, limit: 120 } : { search: effectiveTitlePrefix, limit: 120 });
    const homeAiPrefixSourceDiscovery = [DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX, sourceThreadTitlePrefix].includes(effectiveTitlePrefix);
    const reservedTitles = new Set([
      defaultPluginAuditThreadTitle,
      defaultPlatformAuditThreadTitle,
      ...deployLaneTitles,
      ...implementationLaneTitles,
      DEFAULT_HOME_AI_TASK_INTAKE_THREAD_TITLE,
    ]);
    const candidates = byWorkspace.filter((thread) => {
      const title = threadTitleOf(thread);
      if (homeAiPrefixSourceDiscovery && reservedTitles.has(title)) return false;
      if (!title.startsWith(effectiveTitlePrefix)) return false;
      return !cwd || normalizePath(threadCwdOf(thread)) === cwd;
    });
    const selected = sortedThreads(candidates)[0];
    if (!selected) {
      throw createError(503, "home_ai_source_thread_not_found", "Home AI source thread is not currently discoverable", {
        sourceThreadTitle: explicitTitle,
        sourceThreadTitlePrefix: effectiveTitlePrefix,
        cwd,
      });
    }
    return selected;
  }

  async function sendTaskCard(input = {}) {
    const taskKind = input.cardKind || input.card_kind || input.category || input.auditKind || "plugin";
    const sourceThread = await findSourceThread({
      cwd: input.sourceWorkspaceCwd,
      id: input.sourceThreadId || input.sourceThread_id,
      title: input.sourceThreadTitle,
      titlePrefix: input.sourceThreadTitlePrefix || input.source_thread_title_prefix,
    });
    const targetThread = await findTargetThread({
      kind: taskKind,
      id: input.targetThreadId || input.targetThread_id,
      title: input.targetThreadTitle,
      titlePrefix: input.targetThreadTitlePrefix,
      cwd: input.targetWorkspaceCwd,
      pluginId: input.pluginId || input.plugin || input.plugin_id || input.targetPlugin || input.target_plugin,
      deployPluginId: input.deployPluginId || input.deploy_plugin_id,
      targetPlugin: input.targetPlugin || input.target_plugin,
      summary: input.summary,
      body: input.body || input.bodyMarkdown,
      sourceWorkspaceCwd: input.sourceWorkspaceCwd,
      sourceWorkspace: input.sourceWorkspace,
      targetWorkspaceCwd: input.targetWorkspaceCwd,
      targetWorkspace: input.targetWorkspace,
      targetWorkspacePath: input.targetWorkspacePath,
      requestKey: input.requestId || input.request_id || input.title,
    });
    if (threadIdOf(sourceThread) === threadIdOf(targetThread)) {
      throw createError(409, "task_card_source_target_same_thread", "Task-card source thread must be different from target thread", {
        sourceThread: safeThread(sourceThread),
        targetThread: safeThread(targetThread),
      });
    }
    const body = {
      targetThreadIds: [threadIdOf(targetThread)],
      targetWorkspaceIds: { [threadIdOf(targetThread)]: threadCwdOf(targetThread) },
      title: clean(input.title, 200),
      summary: clean(input.summary, 400),
      body: String(input.body || input.bodyMarkdown || "").trim(),
      requestId: clean(input.requestId || input.request_id, 240),
      workflowMode: clean(input.workflowMode || "manual", 40) || "manual",
      direct: true,
      autoApprove: true,
      pending: false,
    };
    body.reasoningEffort = normalizeTaskCardReasoningEffort(input.reasoningEffort || input.reasoning_effort);
    if (!body.title) throw createError(400, "task_card_title_required", "Task-card title is required");
    if (!body.body) throw createError(400, "task_card_body_required", "Task-card body is required");
    if (isDeployKind(taskKind) && isTerminalReceiptCard(body)) {
      throw createError(400, "deployment_card_must_not_be_terminal_receipt", "Deployment task cards must be requests, not terminal return receipts", {
        targetThread: safeThread(targetThread),
      });
    }
    const result = await requestJson("POST", `/api/threads/${encodeURIComponent(threadIdOf(sourceThread))}/task-cards`, body);
    const cards = Array.isArray(result.cards) ? result.cards : result.card ? [result.card] : [];
    return {
      ok: true,
      sourceThread: safeThread(sourceThread),
      targetThread: safeThread(targetThread),
      sourceThreadId: threadIdOf(sourceThread),
      targetThreadId: threadIdOf(targetThread),
      cardIds: cards.map((card) => clean(card?.id, 160)).filter(Boolean),
      direct: Boolean(result.direct),
      autoApprove: Boolean(result.autoApprove),
      workspaceDelegationEnabled: Boolean(result.workspaceDelegationEnabled),
      result: {
        ok: result.ok !== false,
        cardCount: cards.length,
      },
    };
  }

  return Object.freeze({
    findAuditThread,
    findDeployThread,
    findImplementationThread,
    findTargetThread,
    findSourceThread,
    listThreads,
    sendTaskCard,
  });
}

module.exports = {
  DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
  DEFAULT_DEPLOY_THREAD_TITLE,
  DEFAULT_DEPLOY_THREAD_TITLES,
  DEFAULT_DEPLOY_LANE_ASSIGNMENTS,
  DEFAULT_HOME_AI_IMPLEMENTATION_THREAD_TITLES,
  createCodexThreadTaskCardService,
  isTerminalReceiptCard,
  parseThreadList,
};
