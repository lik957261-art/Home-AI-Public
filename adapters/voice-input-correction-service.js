"use strict";

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeScope(scope = {}) {
  const source = isPlainObject(scope) ? scope : {};
  return {
    actorId: cleanString(source.actorId || source.actor_id || "anonymous", 120) || "anonymous",
    workspaceId: cleanString(source.workspaceId || source.workspace_id || "owner", 120) || "owner",
    surfaceType: cleanString(source.surfaceType || source.surface_type || "chat", 80) || "chat",
    pluginId: cleanString(source.pluginId || source.plugin_id || "", 120),
    threadId: cleanString(source.threadId || source.thread_id || "", 160),
    language: cleanString(source.language || source.locale || "", 40),
  };
}

function normalizeText(value, maxLength = 240000) {
  return String(value == null ? "" : value).replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function containsStructuredSpan(text) {
  const value = String(text || "");
  return (
    /https?:\/\/|www\./i.test(value)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    || /(?:^|[\s"'`])(?:\/[^\s]+|~\/[^\s]+|\.[/\\][^\s]+|[A-Za-z]:\\[^\s]+)/.test(value)
    || /[¥$€£]\s*\d|\d+(?:\.\d+)?\s*(?:元|块|美元|usd|rmb|人民币|%)/i.test(value)
    || /\d{1,4}[-/.年]\d{1,2}|\d{1,2}[:：]\d{2}|(?:今天|明天|昨天|周[一二三四五六日天]|星期[一二三四五六日天])/.test(value)
    || /[`{}<>]|=>|&&|\|\||\b(?:function|const|let|var|class|import|export|return)\b/.test(value)
    || /(?:^|\n)\s*(?:git|npm|node|curl|ssh|scp|rm|mv|cp|python|pip)\s+\S+/.test(value)
  );
}

function diffSingleReplacement(sourceText, targetText) {
  const source = normalizeText(sourceText);
  const target = normalizeText(targetText);
  if (!source || !target || source === target) return null;

  let prefix = 0;
  const maxPrefix = Math.min(source.length, target.length);
  while (prefix < maxPrefix && source[prefix] === target[prefix]) prefix += 1;

  let sourceSuffix = source.length - 1;
  let targetSuffix = target.length - 1;
  while (sourceSuffix >= prefix && targetSuffix >= prefix && source[sourceSuffix] === target[targetSuffix]) {
    sourceSuffix -= 1;
    targetSuffix -= 1;
  }

  const from = source.slice(prefix, sourceSuffix + 1).trim();
  const to = target.slice(prefix, targetSuffix + 1).trim();
  if (!from || !to || from === to) return null;
  return { from, to };
}

function candidateIsSafe(candidate, options = {}) {
  if (!candidate) return false;
  const minChars = Math.max(1, Number(options.minChars || 2) || 2);
  const maxChars = Math.max(minChars, Number(options.maxChars || 20) || 20);
  if (candidate.from.length < minChars || candidate.to.length < minChars) return false;
  if (candidate.from.length > maxChars || candidate.to.length > maxChars) return false;
  if (containsStructuredSpan(candidate.from) || containsStructuredSpan(candidate.to)) return false;
  return true;
}

function scopeKeyFor(entry) {
  return [
    entry.actorId,
    entry.workspaceId,
    entry.surfaceType,
    entry.pluginId || "",
    entry.threadId || "",
    entry.language || "",
    entry.from,
    entry.to,
  ].join("\u001f");
}

function scopeMatches(entry, scope) {
  if (entry.actorId !== scope.actorId) return false;
  if (entry.workspaceId !== scope.workspaceId) return false;
  if (entry.surfaceType && entry.surfaceType !== scope.surfaceType) return false;
  if (entry.pluginId && entry.pluginId !== scope.pluginId) return false;
  if (entry.threadId && entry.threadId !== scope.threadId) return false;
  if (entry.language && scope.language && entry.language !== scope.language) return false;
  return true;
}

function scopeGuardRequested(input = {}) {
  return Boolean(
    input.actorId || input.actor_id
    || input.workspaceId || input.workspace_id
    || input.surfaceType || input.surface_type
    || input.pluginId || input.plugin_id
    || input.threadId || input.thread_id
  );
}

function ensureVoiceInputState(runtimeState) {
  const root = isPlainObject(runtimeState) ? runtimeState : {};
  if (!isPlainObject(root.voiceInput)) root.voiceInput = {};
  if (!Array.isArray(root.voiceInput.corrections)) root.voiceInput.corrections = [];
  if (!Array.isArray(root.voiceInput.audit)) root.voiceInput.audit = [];
  return root.voiceInput;
}

function publicCorrection(entry) {
  return {
    id: entry.id,
    actorId: entry.actorId,
    workspaceId: entry.workspaceId,
    surfaceType: entry.surfaceType,
    pluginId: entry.pluginId || "",
    threadId: entry.threadId || "",
    language: entry.language || "",
    from: entry.from,
    to: entry.to,
    status: entry.status,
    supportCount: entry.supportCount,
    rejectionCount: entry.rejectionCount || 0,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastSeenAt: entry.lastSeenAt || "",
    lastAppliedAt: entry.lastAppliedAt || "",
  };
}

function createVoiceInputCorrectionService(options = {}) {
  const state = typeof options.state === "function" ? options.state : () => ({});
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const makeId = typeof options.makeId === "function" ? options.makeId : (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const autoApplySupportCount = Math.max(2, Number(options.autoApplySupportCount || 3) || 3);
  const maxCorrections = Math.max(20, Number(options.maxCorrections || 1000) || 1000);

  function voiceStore() {
    return ensureVoiceInputState(state());
  }

  function extractCorrectionCandidates(input = {}) {
    const candidate = diffSingleReplacement(input.sourceText, input.targetText);
    if (!candidateIsSafe(candidate, input)) return [];
    return [candidate];
  }

  function recordCorrectionEvidence(input = {}) {
    const scope = normalizeScope(input);
    const candidates = Array.isArray(input.candidates) && input.candidates.length
      ? input.candidates.filter((candidate) => candidateIsSafe(candidate, input))
      : extractCorrectionCandidates(input);
    if (!candidates.length) return { ok: true, recorded: [] };

    const store = voiceStore();
    const byKey = new Map(store.corrections.map((entry) => [scopeKeyFor(entry), entry]));
    const recorded = [];
    const now = nowIso();
    for (const candidate of candidates.slice(0, 8)) {
      const next = {
        id: "",
        actorId: scope.actorId,
        workspaceId: scope.workspaceId,
        surfaceType: scope.surfaceType,
        pluginId: scope.pluginId,
        threadId: scope.threadId,
        language: scope.language,
        from: candidate.from,
        to: candidate.to,
      };
      const key = scopeKeyFor(next);
      const existing = byKey.get(key);
      if (existing) {
        existing.supportCount = Math.max(1, Number(existing.supportCount || 0) + 1);
        existing.lastSeenAt = now;
        existing.updatedAt = now;
        if (existing.status !== "disabled" && existing.supportCount >= autoApplySupportCount) existing.status = "active";
        recorded.push(publicCorrection(existing));
        continue;
      }
      const entry = Object.assign(next, {
        id: makeId("voice_correction"),
        status: "suggest_only",
        supportCount: 1,
        rejectionCount: 0,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        lastAppliedAt: "",
      });
      store.corrections.unshift(entry);
      recorded.push(publicCorrection(entry));
    }
    store.corrections = store.corrections.slice(0, maxCorrections);
    saveState();
    return { ok: true, recorded };
  }

  function applyCorrections(input = {}) {
    const scope = normalizeScope(input);
    let text = normalizeText(input.text);
    const applied = [];
    const suggestions = [];
    if (!text) return { text, applied, suggestions };
    const store = voiceStore();
    const now = nowIso();
    const scoped = store.corrections
      .filter((entry) => entry && entry.status !== "disabled" && scopeMatches(entry, scope))
      .filter((entry) => entry.from && entry.to && text.includes(entry.from));
    scoped.sort((a, b) => {
      const aSpecificity = Number(Boolean(a.threadId)) + Number(Boolean(a.pluginId)) + Number(Boolean(a.surfaceType));
      const bSpecificity = Number(Boolean(b.threadId)) + Number(Boolean(b.pluginId)) + Number(Boolean(b.surfaceType));
      return (bSpecificity - aSpecificity) || ((b.supportCount || 0) - (a.supportCount || 0));
    });

    for (const entry of scoped.slice(0, 20)) {
      const replacement = publicCorrection(entry);
      if (entry.status === "active" && Number(entry.supportCount || 0) >= autoApplySupportCount) {
        const nextText = text.split(entry.from).join(entry.to);
        if (nextText !== text) {
          text = nextText;
          entry.lastAppliedAt = now;
          applied.push(replacement);
        }
      } else {
        suggestions.push(replacement);
      }
    }
    if (applied.length) saveState();
    return { text, applied, suggestions };
  }

  function listCorrections(scopeInput = {}) {
    const scope = normalizeScope(scopeInput);
    return voiceStore().corrections
      .filter((entry) => scopeMatches(entry, scope))
      .map(publicCorrection);
  }

  function updateCorrectionStatus(input = {}) {
    const id = cleanString(input.id || input.correctionId || input.correction_id, 120);
    const status = cleanString(input.status, 40);
    if (!id) {
      const err = new Error("voice correction id is required");
      err.status = 400;
      err.code = "voice_correction_id_required";
      throw err;
    }
    if (!["active", "suggest_only", "disabled"].includes(status)) {
      const err = new Error("voice correction status is invalid");
      err.status = 400;
      err.code = "voice_correction_status_invalid";
      throw err;
    }
    const store = voiceStore();
    const entry = store.corrections.find((item) => item?.id === id);
    if (!entry) {
      const err = new Error("voice correction not found");
      err.status = 404;
      err.code = "voice_correction_not_found";
      throw err;
    }
    if (scopeGuardRequested(input) && !scopeMatches(entry, normalizeScope(input))) {
      const err = new Error("voice correction not found");
      err.status = 404;
      err.code = "voice_correction_not_found";
      throw err;
    }
    entry.status = status;
    if (status === "disabled") entry.rejectionCount = Math.max(0, Number(entry.rejectionCount || 0) + 1);
    entry.updatedAt = nowIso();
    saveState();
    return publicCorrection(entry);
  }

  return Object.freeze({
    applyCorrections,
    containsStructuredSpan,
    extractCorrectionCandidates,
    listCorrections,
    normalizeScope,
    recordCorrectionEvidence,
    updateCorrectionStatus,
  });
}

module.exports = {
  candidateIsSafe,
  containsStructuredSpan,
  createVoiceInputCorrectionService,
  diffSingleReplacement,
  normalizeScope,
};
