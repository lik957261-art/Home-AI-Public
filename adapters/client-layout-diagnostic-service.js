"use strict";

const REDACTED = "[redacted]";
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|access.?key|web.?key|api.?key|auth.?key)/i;
const CONTENT_KEY = /(^|[_.-])(message|prompt|completion|transcript|html|markdown|text|value|input)([_.-]|$)/i;

function requireFunction(value, name) {
  if (typeof value !== "function") throw new Error(`ClientLayoutDiagnosticService requires ${name}`);
  return value;
}

function cleanString(value, maxLength = 180) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

function sanitizeValue(value, key = "", depth = 0) {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (CONTENT_KEY.test(key)) return REDACTED;
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return cleanNumber(value);
  if (typeof value === "string") return cleanString(value, key === "userAgent" ? 260 : 180);
  if (depth >= 5) return null;
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => sanitizeValue(item, key, depth + 1));
  if (typeof value !== "object") return cleanString(value);
  const out = {};
  for (const [entryKey, entryValue] of Object.entries(value).slice(0, 90)) {
    const safeKey = cleanString(entryKey, 80);
    if (!safeKey) continue;
    out[safeKey] = sanitizeValue(entryValue, safeKey, depth + 1);
  }
  return out;
}

function createClientLayoutDiagnosticService(options = {}) {
  const fs = options.fs || {};
  const path = options.path || {};
  const logPath = String(options.logPath || "");
  const maxEntries = Math.max(1, Math.min(500, Number(options.maxEntries || 120) || 120));
  const mkdirSync = requireFunction(fs.mkdirSync, "fs.mkdirSync");
  const appendFileSync = requireFunction(fs.appendFileSync, "fs.appendFileSync");
  const readFileSync = requireFunction(fs.readFileSync, "fs.readFileSync");
  const dirname = requireFunction(path.dirname, "path.dirname");
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

  function append(payload = {}, meta = {}) {
    const entry = {
      at: nowIso(),
      source: "client-layout",
      remoteAddress: cleanString(meta.remoteAddress || "", 80),
      userAgent: cleanString(meta.userAgent || "", 260),
      authenticated: Boolean(meta.authenticated),
      payload: sanitizeValue(payload),
    };
    if (!logPath) return entry;
    try {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (_) {}
    return entry;
  }

  function list(limit = maxEntries) {
    if (!logPath) return [];
    try {
      const raw = readFileSync(logPath, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-Math.max(1, Math.min(maxEntries, Number(limit || maxEntries) || maxEntries)))
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  return Object.freeze({
    append,
    list,
    logPath,
  });
}

module.exports = {
  createClientLayoutDiagnosticService,
  sanitizeValue,
};
