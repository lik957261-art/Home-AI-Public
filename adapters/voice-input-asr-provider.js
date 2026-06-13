"use strict";

const fs = require("node:fs");

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function boolEnv(value, fallback = false) {
  const text = cleanString(value, 40).toLowerCase();
  if (!text) return fallback;
  if (/^(1|true|yes|on)$/.test(text)) return true;
  if (/^(0|false|no|off)$/.test(text)) return false;
  return fallback;
}

function normalizeBackend(value) {
  return cleanString(value, 80).toLowerCase() || "disabled";
}

function normalizeProviderResult(value = {}, fallbackBackend = "disabled") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = cleanString(source.text || source.transcript || source.output_text || "", 240000);
  const durationMs = Number.isFinite(Number(source.durationMs || source.duration_ms))
    ? Math.max(0, Number(source.durationMs || source.duration_ms) || 0)
    : Math.max(0, Number(source.duration || 0) * 1000 || 0);
  return {
    text,
    language: cleanString(source.language || source.locale || "", 40),
    confidence: Number.isFinite(Number(source.confidence ?? source.language_probability))
      ? Number(source.confidence ?? source.language_probability)
      : 0,
    segments: Array.isArray(source.segments) ? source.segments.slice(0, 200) : [],
    backend: cleanString(source.backend || fallbackBackend, 80) || fallbackBackend,
    durationMs,
  };
}

function unavailableResult(backend, reason = "asr_backend_unavailable") {
  const error = new Error(reason);
  error.status = 503;
  error.code = "asr_backend_unavailable";
  error.backend = backend;
  throw error;
}

function providerStatusFromConfig(config = {}) {
  const backend = normalizeBackend(config.backend);
  const enabled = Boolean(config.enabled) && backend !== "disabled";
  const url = cleanString(config.url || "", 2000);
  return {
    enabled: enabled && Boolean(url),
    configured: enabled && Boolean(url),
    backend,
    hasUrl: Boolean(url),
  };
}

function providerProtocolFromConfig(config = {}) {
  const explicit = cleanString(config.protocol || "", 80).toLowerCase();
  if (explicit) return explicit;
  const backend = normalizeBackend(config.backend);
  const url = cleanString(config.url || "", 2000);
  if (backend.includes("openai") || backend.includes("multipart")) return "openai-multipart";
  if (/\/v1\/audio\/transcriptions(?:$|[?#])/i.test(url)) return "openai-multipart";
  return "json-base64";
}

function normalizeLanguage(value) {
  let text = cleanString(value || "", 40);
  if (!text || /^(auto|detect|none|null)$/i.test(text)) return "";
  if (/^(zh-CN|zh_CN|cn|chinese)$/i.test(text)) text = "zh";
  if (/^(en-US|en_GB|en-GB|english)$/i.test(text)) text = "en";
  return text;
}

function normalizeTask(value) {
  const text = cleanString(value || "transcribe", 40).toLowerCase();
  return text === "translate" ? "translate" : "transcribe";
}

function boolConfig(value, fallback) {
  const text = cleanString(value, 40).toLowerCase();
  if (!text) return fallback;
  if (/^(1|true|yes|on)$/.test(text)) return true;
  if (/^(0|false|no|off)$/.test(text)) return false;
  return fallback;
}

function contentTypeForMimeType(value) {
  const text = cleanString(value || "", 120);
  return text || "application/octet-stream";
}

function mergedInitialPrompt(input = {}, config = {}) {
  return [config.initialPrompt, input.initialPrompt]
    .map((part) => cleanString(part, 800))
    .filter(Boolean)
    .join("\n");
}

async function buildMultipartBody(input = {}, config = {}) {
  const initialPrompt = mergedInitialPrompt(input, config);
  if (typeof FormData === "function" && typeof Blob === "function") {
    const bytes = input.audioPath
      ? fs.readFileSync(input.audioPath)
      : Buffer.from(input.audioBase64 || "", "base64");
    const form = new FormData();
    form.append("response_format", "json");
    const language = normalizeLanguage(input.localeHint || input.language || config.language || "");
    if (language) form.append("language", language);
    form.append("task", normalizeTask(input.task || config.task));
    if (initialPrompt) form.append("initial_prompt", initialPrompt);
    if (typeof config.conditionOnPreviousText === "boolean") form.append("condition_on_previous_text", String(config.conditionOnPreviousText));
    if (typeof config.vadFilter === "boolean") form.append("vad_filter", String(config.vadFilter));
    form.append("file", new Blob([bytes], { type: contentTypeForMimeType(input.mimeType) }), input.fileName || "voice-input.webm");
    return { body: form, headers: undefined };
  }
  const boundary = `----HomeAiVoiceInput${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const bytes = input.audioPath
    ? fs.readFileSync(input.audioPath)
    : Buffer.from(input.audioBase64 || "", "base64");
  const chunks = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`),
  ];
  const language = normalizeLanguage(input.localeHint || input.language || config.language || "");
  if (language) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="task"\r\n\r\n${normalizeTask(input.task || config.task)}\r\n`));
  if (initialPrompt) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="initial_prompt"\r\n\r\n${initialPrompt}\r\n`));
  }
  if (typeof config.conditionOnPreviousText === "boolean") {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="condition_on_previous_text"\r\n\r\n${config.conditionOnPreviousText}\r\n`));
  }
  if (typeof config.vadFilter === "boolean") {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="vad_filter"\r\n\r\n${config.vadFilter}\r\n`));
  }
  const fileName = cleanString(input.fileName || "voice-input.webm", 120).replace(/"/g, "_");
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentTypeForMimeType(input.mimeType)}\r\n\r\n`));
  chunks.push(bytes);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return {
    body,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
  };
}

function createVoiceInputAsrProvider(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const config = {
    enabled: boolEnv(
      options.enabled ?? env.HERMES_MOBILE_VOICE_INPUT_ENABLED ?? env.HERMES_WEB_VOICE_INPUT_ENABLED,
      true,
    ),
    backend: normalizeBackend(
      options.backend
      || env.HERMES_MOBILE_VOICE_INPUT_ASR_BACKEND
      || env.HERMES_WEB_VOICE_INPUT_ASR_BACKEND
      || (options.url || env.HERMES_MOBILE_VOICE_INPUT_ASR_URL || env.HERMES_WEB_VOICE_INPUT_ASR_URL ? "whisper-local" : "disabled"),
    ),
    protocol: cleanString(
      options.protocol
      || env.HERMES_MOBILE_VOICE_INPUT_ASR_PROTOCOL
      || env.HERMES_WEB_VOICE_INPUT_ASR_PROTOCOL
      || "",
      80,
    ),
    url: cleanString(
      options.url
      || env.HERMES_MOBILE_VOICE_INPUT_ASR_URL
      || env.HERMES_WEB_VOICE_INPUT_ASR_URL
      || "",
      2000,
    ),
    timeoutMs: Math.max(1000, Number(options.timeoutMs || env.HERMES_MOBILE_VOICE_INPUT_ASR_TIMEOUT_MS || 60000) || 60000),
    language: normalizeLanguage(
      options.language
      || env.HERMES_MOBILE_VOICE_INPUT_LANGUAGE
      || env.HERMES_WEB_VOICE_INPUT_LANGUAGE
      || "zh",
    ),
    task: normalizeTask(options.task || env.HERMES_MOBILE_VOICE_INPUT_TASK || env.HERMES_WEB_VOICE_INPUT_TASK || "transcribe"),
    initialPrompt: cleanString(
      options.initialPrompt
      || env.HERMES_MOBILE_VOICE_INPUT_INITIAL_PROMPT
      || env.HERMES_WEB_VOICE_INPUT_INITIAL_PROMPT
      || "",
      800,
    ),
    conditionOnPreviousText: boolConfig(
      options.conditionOnPreviousText
      ?? env.HERMES_MOBILE_VOICE_INPUT_CONDITION_ON_PREVIOUS_TEXT
      ?? env.HERMES_WEB_VOICE_INPUT_CONDITION_ON_PREVIOUS_TEXT,
      true,
    ),
    vadFilter: boolConfig(
      options.vadFilter
      ?? env.HERMES_MOBILE_VOICE_INPUT_VAD_FILTER
      ?? env.HERMES_WEB_VOICE_INPUT_VAD_FILTER,
      false,
    ),
  };

  function status() {
    return providerStatusFromConfig(config);
  }

  async function transcribeAudio(input = {}) {
    const current = status();
    if (!current.configured) unavailableResult(current.backend);
    if (typeof fetchImpl !== "function") unavailableResult(current.backend, "asr_fetch_unavailable");
    const audioBase64 = input.audioBase64
      || (input.audioPath ? fs.readFileSync(input.audioPath).toString("base64") : "");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;
    try {
      const protocol = providerProtocolFromConfig(config);
      const request = protocol === "openai-multipart"
        ? await buildMultipartBody(input, config)
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64,
              mimeType: input.mimeType || "",
              durationMs: input.durationMs || 0,
              localeHint: input.localeHint || input.language || config.language || "",
              task: normalizeTask(input.task || config.task),
              initialPrompt: mergedInitialPrompt(input, config),
              conditionOnPreviousText: config.conditionOnPreviousText,
              vadFilter: config.vadFilter,
              requestId: input.requestId || "",
              backend: config.backend,
            }),
          };
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: controller?.signal,
      });
      if (!response?.ok) {
        const err = new Error(`ASR backend failed: ${response?.status || 0}`);
        err.status = 502;
        err.code = "asr_backend_failed";
        throw err;
      }
      const payload = await response.json();
      return normalizeProviderResult(payload, config.backend);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return Object.freeze({
    status,
    transcribeAudio,
  });
}

module.exports = {
  boolEnv,
  buildMultipartBody,
  mergedInitialPrompt,
  createVoiceInputAsrProvider,
  normalizeProviderResult,
  providerStatusFromConfig,
  providerProtocolFromConfig,
};
