"use strict";

function normalizeAutoMode(value) {
  const text = String(value || "").trim();
  if (!text) return "auto";
  if (/^(1|true|yes|on)$/i.test(text)) return "on";
  if (/^(0|false|no|off)$/i.test(text)) return "off";
  if (/^auto$/i.test(text)) return "auto";
  return "auto";
}

function nonNegativeMilliseconds(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  return fallback;
}

module.exports = {
  nonNegativeInteger,
  nonNegativeMilliseconds,
  normalizeAutoMode,
};
