"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CODEX_MOBILE_URL = "http://127.0.0.1:8787";
const DEFAULT_THREAD_NAME = "ChatGPT Pro";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_PROMPT_CHARS = 120000;
const MAX_SOURCE_SUMMARY_CHARS = 40000;
const MAX_RESULT_CHARS = 200000;

function compactText(value, maxChars) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  const half = Math.max(1, Math.floor(maxChars / 2));
  return `${text.slice(0, half)}\n\n[truncated ${text.length} chars]\n\n${text.slice(-half)}`;
}

function readText(filePath) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (_) {
    return "";
  }
}

function defaultCodexMobileKeyPath(env = process.env) {
  const home = env.USERPROFILE || env.HOME || "";
  return home ? path.join(home, ".codex-mobile-web", "access_key") : "";
}

function joinConfiguredPath(root, ...segments) {
  const value = String(root || "");
  const pathApi = /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
    ? path.win32
    : value.startsWith("/")
      ? path.posix
      : path;
  return pathApi.join(value, ...segments);
}

function pathApiForConfiguredPath(...values) {
  return values.some((value) => /^[A-Za-z]:[\\/]/.test(String(value || "")) || /^\\\\/.test(String(value || "")))
    ? path.win32
    : path.posix;
}

function isSameOrNestedPath(candidate, root) {
  const rawCandidate = String(candidate || "").trim();
  const rawRoot = String(root || "").trim();
  if (!rawCandidate || !rawRoot) return false;
  const pathApi = pathApiForConfiguredPath(rawCandidate, rawRoot);
  const normalizedCandidate = pathApi.resolve(rawCandidate);
  const normalizedRoot = pathApi.resolve(rawRoot);
  const suffix = normalizedRoot.endsWith(pathApi.sep) ? "" : pathApi.sep;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${suffix}`);
}

function defaultCodexMobileOutputDir(env = process.env) {
  const home = env.HOME || env.USERPROFILE || "";
  return home ? joinConfiguredPath(home, ".codex-mobile-web", "outputs", "chatgpt-pro") : "";
}

function defaultStatePath(env = process.env) {
  const dataDir = env.HERMES_MOBILE_DATA_DIR || env.HERMES_WEB_DATA_DIR || "";
  if (dataDir) return joinConfiguredPath(dataDir, "chatgpt-pro-bridge-state.json");
  if (process.platform === "win32") {
    return "C:\\ProgramData\\HermesMobile\\data\\chatgpt-pro-bridge-state.json";
  }
  return path.join(process.cwd(), "chatgpt-pro-bridge-state.json");
}

function defaultOutputDir(env = process.env) {
  const dataDir = env.HERMES_MOBILE_DATA_DIR || env.HERMES_WEB_DATA_DIR || "";
  if (dataDir) return joinConfiguredPath(dataDir, "tmp", "chatgpt-pro");
  if (process.platform === "win32") {
    return "C:\\ProgramData\\HermesMobile\\data\\tmp\\chatgpt-pro";
  }
  const codexMobileOutputDir = defaultCodexMobileOutputDir(env);
  if (codexMobileOutputDir) return codexMobileOutputDir;
  return path.join("/tmp", "hermes-mobile-chatgpt-pro");
}

function safeOutputDir(configuredOutputDir, env = process.env, workspace = "") {
  const fallback = defaultOutputDir(env);
  const outputDir = String(configuredOutputDir || "").trim();
  if (!outputDir) return fallback;
  if (isSameOrNestedPath(outputDir, workspace)) {
    return defaultCodexMobileOutputDir(env) || fallback;
  }
  return outputDir;
}

function defaultWorkspace(env = process.env, platform = process.platform) {
  const devRoot = env.HERMES_MOBILE_DEV_ROOT || env.HERMES_WEB_DEV_ROOT || "";
  if (devRoot) return devRoot;
  if (platform === "win32") return "C:\\Users\\xuxin\\Documents\\Agent";
  if (platform === "darwin") return "/Users/example/path";
  return process.cwd();
}

function codexMobileKey(env = process.env) {
  return String(
    env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY
      || env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_KEY
      || env.CODEX_MOBILE_KEY
      || readText(env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE)
      || readText(env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE)
      || readText(env.CODEX_MOBILE_KEY_FILE)
      || readText(defaultCodexMobileKeyPath(env)),
  ).trim();
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_CODEX_MOBILE_URL).trim().replace(/\/+$/, "") || DEFAULT_CODEX_MOBILE_URL;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusTypeOf(thread) {
  const status = thread && thread.status;
  if (typeof status === "string") return status.toLowerCase();
  if (status && typeof status.type === "string") return status.type.toLowerCase();
  return "";
}

function isActiveThread(thread) {
  const status = statusTypeOf(thread);
  return !status || ["active", "running", "pending", "queued"].includes(status);
}

function isAssistantNode(value) {
  if (!value || typeof value !== "object") return false;
  const role = String(value.role || value.author || value.speaker || value.name || value.from || "").toLowerCase();
  if (role.includes("assistant") || role.includes("hermes") || role.includes("codex")) return true;
  const type = String(value.type || value.itemType || value.kind || "").toLowerCase();
  const phase = String(value.phase || "").toLowerCase();
  return (
    type.includes("assistant")
    || type.includes("agentmessage")
    || type.includes("agent_message")
    || type.includes("final_answer")
    || phase.includes("final_answer")
  );
}

function collectAssistantText(value, out = [], assistant = false, depth = 0) {
  if (depth > 16 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectAssistantText(item, out, assistant, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  const nextAssistant = assistant || isAssistantNode(value);
  if (nextAssistant) {
    for (const key of ["final", "finalText", "answer", "result_text", "markdown", "text", "content", "message"]) {
      if (typeof value[key] === "string") {
        const text = value[key].trim();
        if (text && !/^\{[\s\S]*\}$/.test(text)) out.push(text);
      }
    }
  }
  for (const child of Object.values(value)) collectAssistantText(child, out, nextAssistant, depth + 1);
  return out;
}

function extractFinalAssistantText(threadReadResult) {
  const candidates = collectAssistantText(threadReadResult)
    .map((text) => text.trim())
    .filter((text) => text.length >= 20);
  return candidates.length ? compactText(candidates[candidates.length - 1], MAX_RESULT_CHARS) : "";
}

function readJsonFile(fsImpl, filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeJsonFile(fsImpl, filePath, value) {
  if (!filePath) return;
  try {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (_) {}
}

function threadNameOf(thread) {
  return String(thread?.name || thread?.title || "").trim();
}

function threadIdOf(value) {
  return String(value?.id || value?.threadId || value?.thread_id || "").trim();
}

function buildCodexPrompt(payload) {
  const title = compactText(payload.title || "ChatGPT Pro generation", 400);
  const prompt = compactText(payload.prompt, MAX_PROMPT_CHARS);
  const sourceSummary = compactText(payload.source_summary, MAX_SOURCE_SUMMARY_CHARS);
  const outputFormat = String(payload.output_format || "markdown").trim().toLowerCase() || "markdown";
  const language = compactText(payload.language || "zh-CN", 40);
  const deliveryMode = String(payload.delivery_mode || "reply").trim().toLowerCase() || "reply";
  const outputDir = compactText(payload.output_dir || payload.outputDir || "", 500);
  return [
    "You are the Hermes Mobile Owner-approved ChatGPT Pro execution thread.",
    "",
    "Execution boundary:",
    "- You must use the Chrome plugin / Chrome skill to access the already logged-in ChatGPT page and let ChatGPT Pro perform the generation.",
    "- Do not impersonate ChatGPT Pro output with your ordinary model response.",
    "- If Chrome or ChatGPT Pro is unavailable, report the failure reason directly. Do not fall back to another model.",
    "- Do not read or expose browser cookies, tokens, passwords, local secret keys, or raw credentials.",
    outputDir ? `- Write all generated local files, including DOCX/PDF/Markdown intermediates, under this temporary output directory only: ${outputDir}` : "",
    "- Do not create generated files under the Hermes Mobile source checkout, repository root, or a repo-level outputs/ directory.",
    "- If the user requests Word/DOCX, create a locally openable .docx file in the temporary output directory and include its absolute path in the final answer.",
    "- The temporary output directory is a handoff staging area; do not treat it as durable source or project state.",
    "",
    `Title: ${title}`,
    `Output language: ${language}`,
    `Output format: ${outputFormat}`,
    `Delivery mode: ${deliveryMode}`,
    "",
    "User request:",
    prompt,
    "",
    sourceSummary ? `Additional bounded context:\n${sourceSummary}\n` : "",
    "Final answer requirements:",
    "- Answer in Chinese for parent-facing analysis unless the requested artifact content itself should be in another language.",
    "- State briefly whether the task was completed.",
    "- If text was generated, provide the summary or complete structured result.",
    "- If a file was generated, list the absolute file path.",
  ].filter(Boolean).join("\n");
}
function createChatGptProCodexBridgeService(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  const fetchImpl = options.fetch || globalThis.fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl || env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL || env.HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_URL || env.CODEX_MOBILE_URL);
  const workspace = options.workspace || env.HERMES_MOBILE_CHATGPT_PRO_WORKSPACE || env.HERMES_WEB_CHATGPT_PRO_WORKSPACE || defaultWorkspace(env);
  const threadName = options.threadName || env.HERMES_MOBILE_CHATGPT_PRO_THREAD_NAME || DEFAULT_THREAD_NAME;
  const statePath = options.statePath || env.HERMES_MOBILE_CHATGPT_PRO_STATE_PATH || env.HERMES_WEB_CHATGPT_PRO_STATE_PATH || defaultStatePath(env);
  const outputDir = safeOutputDir(
    options.outputDir || env.HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR || env.HERMES_WEB_CHATGPT_PRO_OUTPUT_DIR || "",
    env,
    workspace,
  );
  const timeoutMs = Math.max(30000, Number(options.timeoutMs || env.HERMES_MOBILE_CHATGPT_PRO_CODEX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const pollIntervalMs = Math.max(1000, Number(options.pollIntervalMs || env.HERMES_MOBILE_CHATGPT_PRO_CODEX_POLL_MS || DEFAULT_POLL_INTERVAL_MS));
  const model = options.model || env.HERMES_MOBILE_CHATGPT_PRO_CODEX_MODEL || "gpt-5.5";
  const effort = options.effort || env.HERMES_MOBILE_CHATGPT_PRO_CODEX_EFFORT || "medium";
  const permissionMode = options.permissionMode || env.HERMES_MOBILE_CHATGPT_PRO_CODEX_PERMISSION_MODE || "auto";
  const key = options.key || codexMobileKey(env);

  async function requestJson(method, urlPath, body, signal) {
    if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
    if (!key) throw new Error("codex_mobile_key_unconfigured");
    const response = await fetchImpl(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-codex-mobile-key": key,
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (_) {
      parsed = { raw: compactText(text, 4000) };
    }
    if (!response.ok) {
      const error = new Error(parsed.error || `codex_mobile_http_${response.status}`);
      error.status = response.status;
      error.detail = parsed;
      throw error;
    }
    return parsed;
  }

  async function nameThread(threadId, signal) {
    if (!threadId || !threadName) return false;
    try {
      await requestJson("POST", `/api/threads/${encodeURIComponent(threadId)}/name`, { name: threadName }, signal);
      return true;
    } catch (_) {
      try {
        await requestJson("PATCH", `/api/threads/${encodeURIComponent(threadId)}/name`, { name: threadName }, signal);
        return true;
      } catch (__) {
        return false;
      }
    }
  }

  async function readThread(threadId, signal) {
    if (!threadId) return null;
    try {
      return await requestJson("GET", `/api/threads/${encodeURIComponent(threadId)}`, null, signal);
    } catch (_) {
      return null;
    }
  }

  async function listThreads(signal) {
    try {
      const result = await requestJson("GET", "/api/threads", null, signal);
      const candidates = result.threads || result.items || result.data || [];
      return Array.isArray(candidates) ? candidates : [];
    } catch (_) {
      return [];
    }
  }

  async function findNamedThread(signal) {
    const threads = await listThreads(signal);
    const exact = threads.find((thread) => threadNameOf(thread) === threadName);
    return threadIdOf(exact);
  }

  function persistThreadId(threadId) {
    if (!threadId) return;
    writeJsonFile(fsImpl, statePath, {
      schemaVersion: 1,
      threadId,
      threadName,
      updatedAt: new Date().toISOString(),
    });
  }

  async function ensureThread(initialPayload, signal) {
    const state = readJsonFile(fsImpl, statePath);
    const stateThreadId = String(state?.threadId || "").trim();
    if (stateThreadId) {
      const existing = await readThread(stateThreadId, signal);
      if (existing) {
        await nameThread(stateThreadId, signal);
        persistThreadId(stateThreadId);
        return { threadId: stateThreadId, created: false };
      }
    }

    const namedThreadId = await findNamedThread(signal);
    if (namedThreadId) {
      persistThreadId(namedThreadId);
      return { threadId: namedThreadId, created: false };
    }

    const start = await requestJson("POST", "/api/threads/new-message", initialPayload, signal);
    const threadId = start.threadId || start.thread?.id || "";
    if (!threadId) throw new Error("codex_thread_id_missing");
    await nameThread(threadId, signal);
    persistThreadId(threadId);
    return { threadId, created: true };
  }

  async function appendMessage(threadId, payload, signal) {
    return requestJson("POST", `/api/threads/${encodeURIComponent(threadId)}/messages`, payload, signal);
  }

  async function generate(payload = {}) {
    const prompt = compactText(payload.prompt, MAX_PROMPT_CHARS);
    if (!prompt) return { ok: false, error: "prompt_required" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs + 10000);
    const deadline = Date.now() + timeoutMs;
    try {
      if (outputDir) {
        try {
          fsImpl.mkdirSync(outputDir, { recursive: true });
        } catch (_) {}
      }
      const messagePayload = {
        cwd: workspace,
        text: buildCodexPrompt({ ...payload, output_dir: outputDir }),
        model,
        effort,
        permissionMode,
      };
      const { threadId, created } = await ensureThread(messagePayload, controller.signal);
      if (!created) await appendMessage(threadId, messagePayload, controller.signal);
      let latest = null;
      while (Date.now() < deadline) {
        latest = await requestJson("GET", `/api/threads/${encodeURIComponent(threadId)}`, null, controller.signal);
        const thread = latest.thread || latest.data || latest;
        if (!isActiveThread(thread)) {
          const resultText = extractFinalAssistantText(latest);
          return {
            ok: Boolean(resultText),
            source: "codex-mobile-chatgpt-pro",
            threadId,
            threadName,
            result_text: resultText,
            error: resultText ? undefined : "codex_thread_finished_without_result",
          };
        }
        await sleep(pollIntervalMs);
      }
      return {
        ok: false,
        source: "codex-mobile-chatgpt-pro",
        threadId,
        threadName,
        error: "codex_thread_timeout",
        message: "Codex ChatGPT Pro execution did not finish before the bridge timeout.",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { generate };
}

module.exports = {
  buildCodexPrompt,
  codexMobileKey,
  createChatGptProCodexBridgeService,
  defaultOutputDir,
  defaultStatePath,
  defaultWorkspace,
  extractFinalAssistantText,
  isActiveThread,
};
