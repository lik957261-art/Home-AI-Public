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

  function hashValue(value) {
    return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
  }

  function makeId(prefix) {
    return `${prefix}_${nowMs().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
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
    hashValue,
    makeId,
    normalizeOwnerElevationDurations,
    normalizeSingleWindowMode,
    nowIso,
    responseTextFromValue,
  });
}

module.exports = {
  createMobileRuntimeBasicHelperService,
};
