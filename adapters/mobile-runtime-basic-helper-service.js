"use strict";

const defaultCrypto = require("node:crypto");

function defaultNormalizeStringList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function createMobileRuntimeBasicHelperService(options = {}) {
  const crypto = options.crypto || defaultCrypto;
  const normalizeStringList = typeof options.normalizeStringList === "function"
    ? options.normalizeStringList
    : defaultNormalizeStringList;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const nowDate = typeof options.nowDate === "function" ? options.nowDate : () => new Date();

  function dedupe(values) {
    return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function hashValue(value) {
    return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
  }

  function isUncPath(value) {
    return /^\\\\/.test(String(value || ""));
  }

  function makeId(prefix) {
    return `${prefix}_${nowMs().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  }

  function makePublicTaskId(prefix) {
    const d = nowDate();
    const stamp = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
      "_",
      String(d.getHours()).padStart(2, "0"),
      String(d.getMinutes()).padStart(2, "0"),
      String(d.getSeconds()).padStart(2, "0"),
    ].join("");
    return `${prefix}_${stamp}_${crypto.randomBytes(3).toString("hex")}`;
  }

  function nowIso() {
    return nowDate().toISOString();
  }

  function normalizeOwnerElevationDurations(value) {
    const parsed = normalizeStringList(value)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0 && item <= 240)
      .map((item) => Math.round(item));
    const unique = [...new Set(parsed)].sort((a, b) => a - b);
    return unique.length ? unique : [5, 15, 30, 60];
  }

  function normalizeSingleWindowMode(value) {
    return String(value || "").trim().toLowerCase() === "chat" ? "chat" : "task";
  }

  function boolParam(value) {
    return /^(1|true|yes|on)$/i.test(String(value || ""));
  }

  function compactText(value, maxChars) {
    const text = String(value || "");
    if (text.length <= maxChars) return text;
    const head = Math.floor(maxChars * 0.45);
    const tail = maxChars - head;
    return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
  }

  function searchableText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function responseTextFromValue(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(responseTextFromValue).filter(Boolean).join("");
    if (typeof value !== "object") return "";
    if (typeof value.output_text === "string") return value.output_text;
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    return [
      responseTextFromValue(value.output),
      responseTextFromValue(value.content),
      responseTextFromValue(value.message),
      responseTextFromValue(value.response),
    ].filter(Boolean).join("");
  }

  return Object.freeze({
    boolParam,
    compactText,
    dedupe,
    hashValue,
    isUncPath,
    makeId,
    makePublicTaskId,
    normalizeOwnerElevationDurations,
    normalizeSingleWindowMode,
    nowIso,
    responseTextFromValue,
    searchableText,
  });
}

module.exports = {
  createMobileRuntimeBasicHelperService,
};
