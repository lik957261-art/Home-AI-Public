"use strict";

const crypto = require("node:crypto");

function cleanString(value, limit = 4000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

function compactText(value, limit = 800) {
  const text = cleanString(value, limit * 2);
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3)).trim()}...` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultExtractJsonObject(text) {
  const raw = cleanString(text, 20000);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function digestText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function textStats(value) {
  const text = cleanString(value, 20000);
  const words = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    chars: text.replace(/\s+/g, "").length,
    words: words.length,
  };
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function cardList(card = {}, ...keys) {
  for (const key of keys) {
    const value = card[key];
    if (Array.isArray(value) && value.length) return value.map((item) => cleanString(item, 300)).filter(Boolean);
    const text = cleanString(value, 1200);
    if (text) return text.split(/\n|;|\uff1b/).map((item) => cleanString(item, 300)).filter(Boolean);
  }
  return [];
}

function publicAudioEvidence(audio = {}, input = {}) {
  const name = cleanString(audio.name || input.filename || input.name || "growth-reflection-audio", 160);
  const mime = cleanString(audio.mime || audio.type || input.type || input.mime || input.mimeType || "audio/webm", 100);
  const size = Number(audio.size || input.size || 0) || 0;
  const durationMs = Number(input.durationMs || input.duration_ms || audio.durationMs || 0) || 0;
  const digestBasis = [name, mime, size, durationMs, cleanString(audio.path || "", 400)].join("|");
  return {
    kind: "audio",
    name,
    mime,
    size,
    durationMs,
    digest: digestText(digestBasis).slice(0, 24),
  };
}

function reflectionPromptsForCard(card = {}) {
  const prompts = cardList(card, "learningGrowthReflectionPrompts", "learning_growth_reflection_prompts");
  if (prompts.length) return prompts.slice(0, 5);
  return [
    "Name the main mistake you fixed.",
    "Explain why the corrected answer is better.",
    "Say what you will check first next time.",
  ];
}

function reflectionTargetsForCard(card = {}) {
  return [
    ...cardList(card, "learningGrowthFocusAreas", "learning_growth_focus_areas"),
    ...cardList(card, "learningGrowthRevisionRequirements", "learning_growth_revision_requirements"),
    ...cardList(card, "learningGrowthRewriteChecklist", "learning_growth_rewrite_checklist"),
  ].slice(0, 8);
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function targetHitCount(transcript, targets) {
  const text = transcript.toLowerCase();
  return targets.reduce((count, target) => {
    const tokens = cleanString(target, 300)
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/i)
      .filter((item) => item.length >= 3)
      .slice(0, 4);
    return count + (tokens.some((token) => text.includes(token)) ? 1 : 0);
  }, 0);
}

function evaluateTranscript(transcript, card = {}, options = {}) {
  const normalized = cleanString(transcript, Number(options.maxTranscriptChars || 20000));
  const stats = textStats(normalized);
  const targets = reflectionTargetsForCard(card);
  const lower = normalized.toLowerCase();
  const mentionsMistake = containsAny(lower, [
    /\bmistake\b/,
    /\berror\b/,
    /\bwrong\b/,
    /\bproblem\b/,
    /\bissue\b/,
    /\bfix(?:ed)?\b/,
    /\bchanged?\b/,
    /\u9519\u8bef|\u9519\u9898|\u95ee\u9898|\u4fee\u6539|\u7ea0\u6b63|\u539f\u56e0|\u5931\u8bef|\u6539\u6b63/,
  ]);
  const explainsReason = containsAny(lower, [
    /\bbecause\b/,
    /\bso that\b/,
    /\bthe reason\b/,
    /\bmeans\b/,
    /\bshould\b/,
    /\u56e0\u4e3a|\u6240\u4ee5|\u539f\u56e0|\u5e94\u8be5|\u89c4\u5219|\u7406\u89e3|\u610f\u601d|\u4e3a\u4e86|\u5bfc\u81f4/,
  ]);
  const givesPlan = containsAny(lower, [
    /\bnext time\b/,
    /\bI will\b/i,
    /\bpractice\b/,
    /\bcheck\b/,
    /\bimprove\b/,
    /\u4e0b\u6b21|\u4ee5\u540e|\u7ec3\u4e60|\u68c0\u67e5|\u6ce8\u610f|\u6539\u8fdb|\u8ba1\u5212|\u5148\u770b|\u590d\u76d8/,
  ]);
  const hits = targetHitCount(normalized, targets);
  const score = Math.min(100, Math.round(
    Math.min(25, stats.chars / 4)
    + (mentionsMistake ? 20 : 0)
    + (explainsReason ? 20 : 0)
    + (givesPlan ? 20 : 0)
    + Math.min(15, hits * 5),
  ));
  const accepted = score >= positiveNumber(options.acceptScore, 70);
  const missing = [
    mentionsMistake ? "" : "main_mistake",
    explainsReason ? "" : "reason",
    givesPlan ? "" : "next_practice_plan",
    stats.chars >= positiveNumber(options.minTranscriptChars, 60) ? "" : "enough_detail",
  ].filter(Boolean);
  return {
    accepted,
    score,
    maxScore: 100,
    summary: accepted
      ? "Spoken reflection covers the corrected mistake, the reason, and a next-practice plan."
      : "Spoken reflection needs clearer mistake, reason, and next-practice evidence.",
    checks: {
      mentionsMistake,
      explainsReason,
      givesPlan,
      targetHits: hits,
      missing,
    },
    prompts: reflectionPromptsForCard(card),
    stats,
  };
}

function buildReflectionModelPrompt(input = {}) {
  const card = input.card || {};
  const assessed = input.assessed || {};
  const transcript = cleanString(input.transcript, Number(input.maxTranscriptChars || 20000));
  const payload = {
    task: {
      title: compactText(card.content || card.title || card.kanbanCaseCardGoal, 160),
      focusTargets: reflectionTargetsForCard(card).slice(0, 8),
      reflectionPrompts: reflectionPromptsForCard(card).slice(0, 5),
      priorEvaluationSummary: compactText(cardField(card, "learningGrowthFeedbackSummary", "learning_growth_feedback_summary"), 500),
      priorRevisionRequirements: cardList(card, "learningGrowthRevisionRequirements", "learning_growth_revision_requirements").slice(0, 6),
    },
    deterministicSafetySeed: {
      score: Number(assessed.score || 0),
      accepted: Boolean(assessed.accepted),
      checks: assessed.checks || {},
      stats: assessed.stats || {},
    },
    spokenReflectionTranscript: transcript,
  };
  return [
    "Evaluate this spoken Growth reflection as strict JSON only.",
    "The model owns whether the learner understood today's mistake, reason, and next improvement plan. Deterministic checks are safety seeds only.",
    "Do not copy the full transcript. Evidence phrases must be short, at most 12 words each.",
    "Do not include raw prompts, full learner answers, full transcripts, full questions, answer keys, endpoints, local paths, secrets, or full learner history.",
    "Accept only if the learner explains the concrete mistake, why the correction is better, and what they will check/practice next.",
    "Use Chinese for summary and retry requirements.",
    "Return schema: {\"accepted\":true,\"score\":0-100,\"confidence\":0.0-1.0,\"summary\":\"...\",\"checks\":{\"mentionsMistake\":true,\"explainsReason\":true,\"givesPlan\":true,\"targetHits\":1,\"missing\":[\"...\"]},\"retryRequirements\":[\"...\"],\"evidencePhrases\":[\"short phrase\"]}",
    JSON.stringify(payload),
  ].join("\n\n");
}

function normalizeModelReflection(parsed = {}, assessed = {}, options = {}) {
  const raw = parsed && typeof parsed === "object" ? parsed : {};
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score ?? assessed.score ?? 0) || 0)));
  const acceptScore = positiveNumber(options.acceptScore, 70);
  const checks = raw.checks && typeof raw.checks === "object" ? raw.checks : assessed.checks || {};
  const missing = asArray(checks.missing || raw.retryRequirements)
    .map((item) => cleanString(item, 120))
    .filter(Boolean)
    .slice(0, 6);
  const accepted = Boolean(raw.accepted) && score >= acceptScore && !missing.includes("enough_detail");
  return {
    accepted,
    score,
    maxScore: 100,
    summary: compactText(raw.summary || assessed.summary, 500),
    checks: {
      mentionsMistake: Boolean(checks.mentionsMistake),
      explainsReason: Boolean(checks.explainsReason),
      givesPlan: Boolean(checks.givesPlan),
      targetHits: Number(checks.targetHits || 0) || 0,
      missing,
      evidencePhrases: asArray(raw.evidencePhrases).map((item) => compactText(item, 80)).filter(Boolean).slice(0, 4),
      confidence: Math.max(0, Math.min(1, Number(raw.confidence || 0) || 0)),
    },
    prompts: assessed.prompts || [],
    stats: assessed.stats || {},
  };
}

function markReflectionRequired(evaluation = {}, options = {}) {
  const reflectionWeight = positiveNumber(options.reflectionWeight, 0.3);
  const reward = Object.assign({}, evaluation.reward || {}, {
    status: "reflection_required",
    reason: "Spoken reflection is required before final settlement.",
  });
  return Object.assign({}, evaluation, {
    status: "reflection_required",
    nextStep: "spoken_reflection_required",
    reflectionPolicy: {
      required: true,
      mode: "spoken",
      reflectionWeight,
      taskWeight: Math.max(0, 1 - reflectionWeight),
    },
    reward,
  });
}

function compositeScore(taskScore, reflectionScore, options = {}) {
  const reflectionWeight = positiveNumber(options.reflectionWeight, 0.3);
  const taskWeight = Math.max(0, 1 - reflectionWeight);
  return Math.max(0, Math.min(100, Math.round(
    (Number(taskScore || 0) * taskWeight) + (Number(reflectionScore || 0) * reflectionWeight),
  )));
}

function publicReflection(reflection = {}) {
  return {
    status: cleanString(reflection.status || (reflection.accepted ? "accepted" : "rejected"), 60),
    mode: cleanString(reflection.mode || "spoken", 40),
    score: Number(reflection.score || 0) || 0,
    maxScore: Number(reflection.maxScore || 100) || 100,
    summary: cleanString(reflection.summary, 500),
    transcriptDigest: cleanString(reflection.transcriptDigest, 80),
    evidenceRefs: asArray(reflection.evidenceRefs).map((item) => cleanString(item, 160)).filter(Boolean).slice(0, 6),
    evaluationMethod: cleanString(reflection.evaluationMethod || "model_assisted_spoken_reflection", 100),
    audio: reflection.audio && typeof reflection.audio === "object" ? reflection.audio : null,
    submittedAt: cleanString(reflection.submittedAt, 80),
    checks: reflection.checks && typeof reflection.checks === "object" ? reflection.checks : null,
  };
}

function createLearningGrowthReflectionService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const saveAudioUpload = typeof options.saveAudioUpload === "function" ? options.saveAudioUpload : null;
  const transcribeAudio = typeof options.transcribeAudio === "function" ? options.transcribeAudio : null;
  const requireAudio = options.requireAudio !== false;
  const hermesModelText = typeof options.hermesModelText === "function" ? options.hermesModelText : null;
  const extractJsonObject = typeof options.extractJsonObject === "function" ? options.extractJsonObject : defaultExtractJsonObject;
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const model = cleanString(options.model || options.automationCreateModel || "automation-create");
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000) || 120000);
  const requireModel = options.requireModel === true;
  const maxTranscriptChars = Math.max(2000, Number(options.maxTranscriptChars || 20000));
  const minTranscriptChars = positiveNumber(options.minTranscriptChars, 60);

  function requiresReflection({ evaluation = {}, stage = "" } = {}) {
    return String(stage || "").toLowerCase() === "final" && Boolean(evaluation.passed);
  }

  async function submitReflection(input = {}) {
    const card = input.card || {};
    const workspaceId = cleanString(input.workspaceId || cardField(card, "workspaceId", "workspace_id") || "owner");
    const cardId = cleanString(input.cardId || cardField(card, "id", "todo_id", "todoId"));
    let audio = null;
    const dataBase64 = String(input.dataBase64 || input.data_base64 || input.audioDataBase64 || "").trim();
    if (dataBase64 && saveAudioUpload) {
      try {
        audio = saveAudioUpload(workspaceId, cardId, {
          filename: input.filename || "growth-reflection-audio.webm",
          type: input.type || input.mime || input.mimeType || "audio/webm",
          dataBase64,
        }, card);
      } catch (err) {
        return { ok: false, status: Number(err?.status || 400) || 400, error: cleanString(err?.message || err || "Unable to save spoken reflection audio", 300) };
      }
    } else if (input.audio && typeof input.audio === "object") {
      audio = input.audio;
    }
    if (requireAudio && !audio) {
      return { ok: false, status: 400, error: "Spoken reflection audio is required" };
    }
    let transcript = cleanString(input.transcript || input.reflectionText || input.text || "", maxTranscriptChars);
    if (audio?.path && transcribeAudio) {
      try {
        const transcription = await transcribeAudio(audio.path);
        transcript = cleanString(transcription?.text || transcript, maxTranscriptChars);
      } catch (err) {
        return { ok: false, status: Number(err?.status || 502) || 502, error: cleanString(err?.message || err || "Unable to transcribe spoken reflection audio", 300) };
      }
    }
    if (textStats(transcript).chars < minTranscriptChars) {
      return {
        ok: false,
        status: 400,
        error: "Spoken reflection transcript is too short",
      };
    }
    let assessed = evaluateTranscript(transcript, card, {
      acceptScore: options.acceptScore,
      maxTranscriptChars,
      minTranscriptChars,
    });
    if (!hermesModelText && requireModel) {
      return { ok: false, status: 503, error: "Growth spoken reflection requires model assistance" };
    }
    if (hermesModelText) {
      try {
        const output = await hermesModelText({
          input: buildReflectionModelPrompt({ card, transcript, assessed, maxTranscriptChars }),
          stream: false,
          store: false,
          model,
          reasoning_effort: "medium",
          conversation: `learning_growth_reflection_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          instructions: "Return strict JSON Growth spoken reflection evaluation only.",
          access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
        }, timeoutMs);
        const parsed = extractJsonObject(output || "");
        if (!parsed || typeof parsed !== "object") {
          if (requireModel) return { ok: false, status: 502, error: "Growth spoken reflection model returned invalid JSON" };
        } else {
          assessed = normalizeModelReflection(parsed, assessed, { acceptScore: options.acceptScore });
        }
      } catch (err) {
        if (requireModel) {
          return { ok: false, status: Number(err?.status || 502) || 502, error: cleanString(err?.message || err || "Growth spoken reflection model failed", 300) };
        }
      }
    }
    const publicAudio = audio ? publicAudioEvidence(audio, input) : null;
    const reflection = publicReflection({
      status: assessed.accepted ? "accepted" : "rejected",
      mode: "spoken",
      score: assessed.score,
      maxScore: assessed.maxScore,
      summary: assessed.summary,
      transcriptDigest: digestText(transcript),
      evidenceRefs: publicAudio ? [`audio:${publicAudio.digest}`, `transcript:${digestText(transcript).slice(0, 24)}`] : [`transcript:${digestText(transcript).slice(0, 24)}`],
      evaluationMethod: hermesModelText ? "model_assisted_spoken_reflection" : "deterministic_spoken_reflection_guard",
      audio: publicAudio,
      submittedAt: nowIso(),
      checks: assessed.checks,
    });
    return {
      ok: true,
      accepted: assessed.accepted,
      reflection,
    };
  }

  return {
    compositeScore: (taskScore, reflectionScore) => compositeScore(taskScore, reflectionScore, options),
    markReflectionRequired: (evaluation) => markReflectionRequired(evaluation, options),
    publicReflection,
    requiresReflection,
    submitReflection,
  };
}

module.exports = {
  buildReflectionModelPrompt,
  compositeScore,
  createLearningGrowthReflectionService,
  evaluateTranscript,
  markReflectionRequired,
  publicReflection,
};
