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
  return {
    text,
    language: cleanString(source.language || source.locale || "", 40),
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : 0,
    segments: Array.isArray(source.segments) ? source.segments.slice(0, 200) : [],
    backend: cleanString(source.backend || fallbackBackend, 80) || fallbackBackend,
    durationMs: Math.max(0, Number(source.durationMs || source.duration_ms || 0) || 0),
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
    url: cleanString(
      options.url
      || env.HERMES_MOBILE_VOICE_INPUT_ASR_URL
      || env.HERMES_WEB_VOICE_INPUT_ASR_URL
      || "",
      2000,
    ),
    timeoutMs: Math.max(1000, Number(options.timeoutMs || env.HERMES_MOBILE_VOICE_INPUT_ASR_TIMEOUT_MS || 60000) || 60000),
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
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: input.mimeType || "",
          durationMs: input.durationMs || 0,
          localeHint: input.localeHint || "",
          requestId: input.requestId || "",
          backend: config.backend,
        }),
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
  createVoiceInputAsrProvider,
  normalizeProviderResult,
  providerStatusFromConfig,
};
