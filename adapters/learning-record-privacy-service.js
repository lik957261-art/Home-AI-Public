"use strict";

const PRIVATE_PAYLOAD_KEYS = new Set([
  "answer",
  "answers",
  "answerText",
  "rawAnswer",
  "rawAnswers",
  "rawResponse",
  "learnerAnswer",
  "learnerAnswers",
  "learnerResponse",
  "childAnswer",
  "childResponse",
  "submissionText",
  "rawTranscript",
  "transcript",
  "fullTranscript",
  "audioTranscript",
  "recordingTranscript",
  "question",
  "questionText",
  "questions",
  "answerKey",
  "solution",
  "solutions",
  "prompt",
  "rawPrompt",
  "apiKey",
  "accessKey",
  "authorization",
  "cookie",
  "pushEndpoint",
  "endpoint",
  "filePath",
  "localPath",
  "mediaPath",
  "recordingPath",
  "attachmentPath",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function compactLearningSummary(value, limit = 600) {
  const text = cleanString(value).replace(/\s+/g, " ");
  const max = Math.max(80, Math.min(1200, Number(limit || 600) || 600));
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function findPrivatePayloadKeys(value, path = "", depth = 0, found = []) {
  if (depth > 8 || !value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findPrivatePayloadKeys(item, `${path}[${index}]`, depth + 1, found));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (PRIVATE_PAYLOAD_KEYS.has(key)) found.push(nextPath);
    findPrivatePayloadKeys(item, nextPath, depth + 1, found);
  }
  return found;
}

function assertNoPrivateLearningPayload(value, label = "learning record") {
  const keys = findPrivatePayloadKeys(value);
  if (!keys.length) return;
  const err = new Error(`${label} must use summary-only fields; private payload keys are not accepted`);
  err.status = 400;
  err.privatePayloadKeys = keys.slice(0, 8);
  throw err;
}

function clampLearningScore(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

function clampLearningConfidence(value, fallback = 0.7) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
}

module.exports = {
  PRIVATE_PAYLOAD_KEYS,
  assertNoPrivateLearningPayload,
  clampLearningConfidence,
  clampLearningScore,
  compactLearningSummary,
  findPrivatePayloadKeys,
};
