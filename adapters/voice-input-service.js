"use strict";

const nodeFs = require("node:fs");
const nodePath = require("node:path");
const nodeOs = require("node:os");
const { normalizeScope } = require("./voice-input-correction-service");

const ALLOWED_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function numberFromEnv(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function errorWithStatus(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function parseAudioBuffer(audioBase64, maxAudioBytes) {
  const value = cleanString(audioBase64, Math.ceil(maxAudioBytes * 1.5) + 1024);
  if (!value) throw errorWithStatus("voice audio is required", 400, "voice_audio_required");
  if (!/^[A-Za-z0-9+/=\s_-]+$/.test(value)) {
    throw errorWithStatus("voice audio must be base64 encoded", 400, "voice_audio_invalid_base64");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) throw errorWithStatus("voice audio is empty", 400, "voice_audio_empty");
  if (buffer.length > maxAudioBytes) throw errorWithStatus("voice audio is too large", 413, "voice_audio_too_large");
  return buffer;
}

function normalizeMimeType(value) {
  const base = cleanString(value, 120).toLowerCase().split(";")[0].trim();
  return base || "audio/webm";
}

function safeTempId(value) {
  return cleanString(value, 160).replace(/[^A-Za-z0-9_.-]+/g, "_") || `voice_${Date.now()}`;
}

function ensureVoiceInputState(runtimeState) {
  const root = runtimeState && typeof runtimeState === "object" && !Array.isArray(runtimeState) ? runtimeState : {};
  if (!root.voiceInput || typeof root.voiceInput !== "object" || Array.isArray(root.voiceInput)) root.voiceInput = {};
  if (!Array.isArray(root.voiceInput.audit)) root.voiceInput.audit = [];
  if (!Array.isArray(root.voiceInput.corrections)) root.voiceInput.corrections = [];
  if (!Array.isArray(root.voiceInput.phrasebook)) root.voiceInput.phrasebook = [];
  return root.voiceInput;
}

function sessionScopeAllowsCommit(sessionScope, callerScope) {
  if (!sessionScope || !callerScope) return false;
  if (sessionScope.actorId !== callerScope.actorId) return false;
  if (sessionScope.workspaceId !== callerScope.workspaceId) return false;
  if (sessionScope.pluginId && sessionScope.pluginId !== callerScope.pluginId) return false;
  if (sessionScope.threadId && callerScope.threadId && sessionScope.threadId !== callerScope.threadId) return false;
  return true;
}

function createVoiceInputService(options = {}) {
  if (!options.asrProvider || typeof options.asrProvider.transcribeAudio !== "function") {
    throw new Error("voice input service requires asrProvider.transcribeAudio");
  }
  if (!options.correctionService || typeof options.correctionService.applyCorrections !== "function") {
    throw new Error("voice input service requires correctionService.applyCorrections");
  }
  const fsImpl = options.fs || nodeFs;
  const fsPromises = fsImpl.promises || nodeFs.promises;
  const pathImpl = options.path || nodePath;
  const osImpl = options.os || nodeOs;
  const state = typeof options.state === "function" ? options.state : () => ({});
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const makeId = typeof options.makeId === "function" ? options.makeId : (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const env = options.env || process.env;
  const dataDir = cleanString(options.dataDir || env.HERMES_MOBILE_DATA_DIR || "", 2000) || osImpl.tmpdir();
  const minDurationMs = Math.max(0, Number(options.minDurationMs ?? numberFromEnv(env.HERMES_MOBILE_VOICE_INPUT_MIN_SECONDS, 0.5) * 1000) || 500);
  const maxDurationMs = Math.max(1000, Number(options.maxDurationMs ?? numberFromEnv(env.HERMES_MOBILE_VOICE_INPUT_MAX_SECONDS, 30) * 1000) || 30000);
  const maxAudioBytes = Math.max(1024, Number(options.maxAudioBytes || env.HERMES_MOBILE_VOICE_INPUT_MAX_BYTES || 16 * 1024 * 1024) || 16 * 1024 * 1024);
  const maxAuditEntries = Math.max(20, Number(options.maxAuditEntries || 200) || 200);
  const activeSessions = new Map();

  function voiceStore() {
    return ensureVoiceInputState(state());
  }

  function providerStatus() {
    return typeof options.asrProvider.status === "function"
      ? options.asrProvider.status()
      : { enabled: true, configured: true, backend: "custom" };
  }

  function status(scopeInput = {}) {
    const scoped = normalizeScope(scopeInput);
    const corrections = typeof options.correctionService.listCorrections === "function"
      ? options.correctionService.listCorrections(scoped)
      : [];
    return {
      ok: true,
      enabled: Boolean(providerStatus().enabled),
      provider: providerStatus(),
      limits: {
        minDurationMs,
        maxDurationMs,
        maxAudioBytes,
      },
      retention: {
        persistRawAudio: false,
        persistFullTranscripts: false,
      },
      correctionCount: corrections.length,
      phrasebookCount: typeof options.correctionService.listPhrases === "function"
        ? options.correctionService.listPhrases(scoped).length
        : 0,
    };
  }

  function appendAudit(event) {
    const store = voiceStore();
    store.audit.unshift(Object.assign({
      id: makeId("voice_audit"),
      createdAt: nowIso(),
    }, event));
    store.audit = store.audit.slice(0, maxAuditEntries);
    saveState();
  }

  async function removeTempFile(filePath) {
    if (!filePath) return;
    try {
      await fsPromises.unlink(filePath);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
  }

  function validateTranscribeInput(input = {}) {
    const mimeType = normalizeMimeType(input.mimeType);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw errorWithStatus("voice audio mime type is not supported", 415, "voice_audio_mime_unsupported");
    }
    const durationMs = Math.max(0, Number(input.durationMs || input.duration_ms || 0) || 0);
    if (durationMs > 0 && durationMs < minDurationMs) {
      throw errorWithStatus("voice audio is too short", 400, "voice_audio_too_short");
    }
    if (durationMs > maxDurationMs) {
      throw errorWithStatus("voice audio is too long", 413, "voice_audio_too_long");
    }
    return { mimeType, durationMs };
  }

  async function transcribe(input = {}) {
    const scope = normalizeScope(input);
    const provider = providerStatus();
    if (!provider.configured) throw errorWithStatus("voice input ASR backend is unavailable", 503, "voice_input_asr_unavailable");
    const { mimeType, durationMs } = validateTranscribeInput(input);
    const sessionId = cleanString(input.voiceSessionId || input.sessionId, 160) || makeId("voice_session");
    const requestId = cleanString(input.requestId, 160) || sessionId;
    const buffer = parseAudioBuffer(input.audioBase64 || input.audio_base64, maxAudioBytes);
    const tempDir = pathImpl.join(dataDir, "tmp", "voice-input");
    const tempPath = pathImpl.join(tempDir, `${safeTempId(sessionId)}.audio`);
    let asrResult = null;
    await fsPromises.mkdir(tempDir, { recursive: true });
    await fsPromises.writeFile(tempPath, buffer);
    try {
      asrResult = await options.asrProvider.transcribeAudio(Object.assign({}, scope, {
        audioPath: tempPath,
        composerId: cleanString(input.composerId || input.composer_id, 160),
        durationMs,
        localeHint: cleanString(input.localeHint || input.locale || "", 40),
        mimeType,
        requestId,
      }));
    } finally {
      await removeTempFile(tempPath);
    }

    const rawText = cleanString(asrResult?.text || "", 240000);
    if (!rawText) throw errorWithStatus("voice ASR returned an empty transcript", 422, "voice_asr_empty_transcript");
    const corrected = options.correctionService.applyCorrections(Object.assign({}, scope, { text: rawText }));
    const createdAt = nowIso();
    activeSessions.set(sessionId, {
      id: sessionId,
      createdAt,
      rawText,
      correctedText: corrected.text,
      scope,
      backend: cleanString(asrResult?.backend || provider.backend || "", 120),
    });
    appendAudit({
      event: "transcribe",
      actorId: scope.actorId,
      workspaceId: scope.workspaceId,
      surfaceType: scope.surfaceType,
      pluginId: scope.pluginId,
      threadId: scope.threadId,
      backend: cleanString(asrResult?.backend || provider.backend || "", 120),
      durationMs,
      rawChars: rawText.length,
      textChars: corrected.text.length,
      appliedCount: corrected.applied.length,
      suggestionCount: corrected.suggestions.length,
    });
    return {
      ok: true,
      voiceSessionId: sessionId,
      text: corrected.text,
      language: cleanString(asrResult?.language || "", 40),
      confidence: Number.isFinite(Number(asrResult?.confidence)) ? Number(asrResult.confidence) : 0,
      backend: cleanString(asrResult?.backend || provider.backend || "", 120),
      corrections: {
        applied: corrected.applied,
        suggestions: corrected.suggestions,
        phrasebookApplied: corrected.phrasebookApplied || [],
      },
    };
  }

  function commitSession(input = {}) {
    const sessionId = cleanString(input.voiceSessionId || input.sessionId || input.voice_session_id, 160);
    if (!sessionId) throw errorWithStatus("voice session id is required", 400, "voice_session_id_required");
    const session = activeSessions.get(sessionId);
    if (!session) throw errorWithStatus("voice session not found", 404, "voice_session_not_found");
    const finalText = cleanString(input.finalText || input.final_text || input.text || "", 240000);
    if (!finalText) throw errorWithStatus("voice final text is required", 400, "voice_final_text_required");
    const callerScope = normalizeScope(input);
    if (!sessionScopeAllowsCommit(session.scope, callerScope)) {
      throw errorWithStatus("voice session not found", 404, "voice_session_not_found");
    }
    const scope = normalizeScope(Object.assign({}, session.scope, input));
    const result = options.correctionService.recordCorrectionEvidence(Object.assign({}, scope, {
      sourceText: session.rawText,
      targetText: finalText,
    }));
    activeSessions.delete(sessionId);
    appendAudit({
      event: "commit",
      actorId: scope.actorId,
      workspaceId: scope.workspaceId,
      surfaceType: scope.surfaceType,
      pluginId: scope.pluginId,
      threadId: scope.threadId,
      backend: session.backend,
      sourceChars: session.rawText.length,
      finalChars: finalText.length,
      recordedCount: result.recorded.length,
    });
    return Object.assign({ ok: true, voiceSessionId: sessionId }, result);
  }

  function learnSentText(input = {}) {
    if (typeof options.correctionService.recordSentTextEvidence !== "function") {
      throw errorWithStatus("voice phrasebook learning is unavailable", 503, "voice_phrasebook_learning_unavailable");
    }
    const scope = normalizeScope(input);
    const finalText = cleanString(input.finalText || input.final_text || input.text || "", 240000);
    if (!finalText) throw errorWithStatus("voice sent text is required", 400, "voice_sent_text_required");
    if (typeof options.correctionService.seedSystemPhrasebook === "function") {
      options.correctionService.seedSystemPhrasebook(scope);
    }
    const result = options.correctionService.recordSentTextEvidence(Object.assign({}, scope, { text: finalText }));
    appendAudit({
      event: "sent_text",
      actorId: scope.actorId,
      workspaceId: scope.workspaceId,
      surfaceType: scope.surfaceType,
      pluginId: scope.pluginId,
      threadId: scope.threadId,
      textChars: finalText.length,
      recordedCount: result.recorded.length,
    });
    return Object.assign({
      ok: true,
      thresholds: typeof options.correctionService.thresholds === "function"
        ? options.correctionService.thresholds()
        : {},
    }, result);
  }

  function listCorrections(scopeInput = {}) {
    return {
      ok: true,
      corrections: typeof options.correctionService.listCorrections === "function"
        ? options.correctionService.listCorrections(normalizeScope(scopeInput))
        : [],
    };
  }

  function updateCorrection(input = {}) {
    if (typeof options.correctionService.updateCorrectionStatus !== "function") {
      throw errorWithStatus("voice correction update is unavailable", 503, "voice_correction_update_unavailable");
    }
    return {
      ok: true,
      correction: options.correctionService.updateCorrectionStatus(input),
    };
  }

  return Object.freeze({
    commitSession,
    learnSentText,
    listCorrections,
    status,
    transcribe,
    updateCorrection,
  });
}

module.exports = {
  ALLOWED_MIME_TYPES,
  createVoiceInputService,
  parseAudioBuffer,
};
