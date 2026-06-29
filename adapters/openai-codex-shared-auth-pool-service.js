"use strict";

const crypto = require("node:crypto");

const PROVIDER_ID = "openai-codex";

function cleanString(value) {
  return String(value || "").trim();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function hasToken(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredToken(source, key) {
  const value = source?.tokens?.[key] || source?.[key];
  if (!hasToken(value)) throw new Error(`openai_codex_auth_missing_${key}`);
  return value;
}

function shortHash(value) {
  const text = cleanString(value);
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function nowUnixSeconds(nowMs = Date.now()) {
  return Math.floor(Number(nowMs) / 1000);
}

function normalizePool(doc = {}, provider = PROVIDER_ID) {
  const credentialPool = doc.credential_pool && typeof doc.credential_pool === "object" && !Array.isArray(doc.credential_pool)
    ? doc.credential_pool
    : {};
  return Array.isArray(credentialPool[provider]) ? credentialPool[provider] : [];
}

function ensureProviderDoc(doc = {}, provider = PROVIDER_ID) {
  const next = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  next.version = next.version || 1;
  next.providers = next.providers && typeof next.providers === "object" && !Array.isArray(next.providers) ? next.providers : {};
  next.providers[provider] = next.providers[provider] && typeof next.providers[provider] === "object" && !Array.isArray(next.providers[provider])
    ? next.providers[provider]
    : {};
  next.credential_pool = next.credential_pool && typeof next.credential_pool === "object" && !Array.isArray(next.credential_pool)
    ? next.credential_pool
    : {};
  next.credential_pool[provider] = normalizePool(next, provider);
  return next;
}

function entryId(entry = {}, index = 0) {
  return cleanString(entry.id || entry.profile_id || entry.profileId || entry.label || `entry-${index}`);
}

function entryIsUsable(entry = {}, nowSec = nowUnixSeconds()) {
  if (!hasToken(entry.access_token) || !hasToken(entry.refresh_token)) return false;
  const errorCode = cleanString(entry.last_error_code).toLowerCase();
  const errorReason = cleanString(entry.last_error_reason).toLowerCase();
  const resetAt = Number(entry.last_error_reset_at || 0);
  if ((errorCode === "429" || errorCode === "usage_limit_reached" || errorReason === "usage_limit_reached") && (!resetAt || resetAt > nowSec)) {
    return false;
  }
  return true;
}

function publicEntry(entry = {}, index = 0, nowSec = nowUnixSeconds()) {
  return {
    index,
    id: entryId(entry, index),
    label: cleanString(entry.label),
    source: cleanString(entry.source),
    priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : null,
    active: index === 0,
    usable: entryIsUsable(entry, nowSec),
    last_error_code: entry.last_error_code ?? null,
    last_error_reason: entry.last_error_reason ?? null,
    last_error_reset_at: entry.last_error_reset_at ?? null,
    last_refresh: cleanString(entry.last_refresh),
    account_hash: shortHash(entry.account_id),
    has_access_token: hasToken(entry.access_token),
    has_refresh_token: hasToken(entry.refresh_token),
  };
}

function publicSummary(doc = {}, options = {}) {
  const provider = cleanString(options.provider) || PROVIDER_ID;
  const nowSec = Number(options.nowSec || nowUnixSeconds(options.nowMs || Date.now()));
  const pool = normalizePool(doc, provider);
  return {
    provider,
    pool_size: pool.length,
    active_profile_id: pool.length ? entryId(pool[0], 0) : "",
    usable_count: pool.filter((entry) => entryIsUsable(entry, nowSec)).length,
    entries: pool.map((entry, index) => publicEntry(entry, index, nowSec)),
  };
}

function copyEntryTokensToProvider(doc, entry, provider = PROVIDER_ID, now = new Date().toISOString()) {
  const providerDoc = doc.providers[provider];
  const tokens = Object.assign({}, providerDoc.tokens || {}, {
    access_token: requiredToken(entry, "access_token"),
    refresh_token: requiredToken(entry, "refresh_token"),
  });
  if (hasToken(entry.id_token)) tokens.id_token = entry.id_token;
  if (hasToken(entry.account_id)) tokens.account_id = entry.account_id;
  providerDoc.auth_mode = cleanString(entry.auth_type || entry.auth_mode || providerDoc.auth_mode) || "chatgpt";
  providerDoc.tokens = tokens;
  providerDoc.last_refresh = cleanString(entry.last_refresh) || now;
}

function markEntryUsageLimited(entry = {}, input = {}) {
  const now = cleanString(input.nowIso) || new Date().toISOString();
  const resetAt = Number(input.resetAt || input.reset_at || 0);
  entry.last_error_code = 429;
  entry.last_error_reason = cleanString(input.reason) || "usage_limit_reached";
  entry.last_error_message = "usage_limit_reached";
  entry.last_error_at = now;
  entry.last_error_reset_at = resetAt || null;
  return entry;
}

function rotateAfterUsageLimit(doc, input = {}) {
  const provider = cleanString(input.provider) || PROVIDER_ID;
  const nowMs = Number(input.nowMs || Date.now());
  const nowSec = nowUnixSeconds(nowMs);
  const now = cleanString(input.nowIso) || new Date(nowMs).toISOString();
  const next = ensureProviderDoc(cloneJson(doc), provider);
  const pool = normalizePool(next, provider);
  if (!pool.length) return { changed: false, reason: "openai_codex_credential_pool_empty", doc: next, summary: publicSummary(next, { provider, nowSec }) };
  const currentIndex = pool.findIndex((entry, index) => entryId(entry, index) === cleanString(input.currentProfileId || input.current_profile_id));
  const limitedIndex = currentIndex >= 0 ? currentIndex : 0;
  const previousProfileId = entryId(pool[limitedIndex], limitedIndex);
  markEntryUsageLimited(pool[limitedIndex], { nowIso: now, resetAt: input.resetAt || input.reset_after, reason: "usage_limit_reached" });
  const nextIndex = pool.findIndex((entry, index) => index !== limitedIndex && entryIsUsable(entry, nowSec));
  if (nextIndex < 0) {
    next.updated_at = now;
    return {
      changed: true,
      rotated: false,
      reason: "openai_codex_credential_pool_no_alternate",
      previous_profile_id: previousProfileId,
      doc: next,
      summary: publicSummary(next, { provider, nowSec }),
    };
  }
  const [selected] = pool.splice(nextIndex, 1);
  pool.unshift(selected);
  next.credential_pool[provider] = pool;
  copyEntryTokensToProvider(next, selected, provider, now);
  next.updated_at = now;
  return {
    changed: true,
    rotated: true,
    reason: "usage_limit_reached",
    previous_profile_id: previousProfileId,
    active_profile_id: entryId(selected, 0),
    doc: next,
    summary: publicSummary(next, { provider, nowSec }),
  };
}

function entryFromCodexHomeAuth(sourceAuth, input = {}) {
  const now = cleanString(input.nowIso) || new Date().toISOString();
  const profileId = cleanString(input.profileId || input.profile_id || input.id);
  if (!profileId) throw new Error("openai_codex_homeai_profile_id_required");
  const tokens = Object.assign({}, sourceAuth?.tokens || {});
  const accessToken = requiredToken(sourceAuth, "access_token");
  const refreshToken = requiredToken(sourceAuth, "refresh_token");
  return Object.assign({
    id: profileId,
    label: cleanString(input.label) || profileId,
    auth_type: cleanString(sourceAuth?.auth_mode) || "chatgpt",
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
    source: "homeai-managed-profile",
    imported_from: cleanString(input.importedFrom || input.imported_from || "explicit-codex-home"),
    imported_at: now,
  }, input.preserveExisting && input.existing && typeof input.existing === "object" ? input.existing : {}, {
    id: profileId,
    label: cleanString(input.label) || cleanString(input.existing?.label) || profileId,
    auth_type: cleanString(sourceAuth?.auth_mode) || cleanString(input.existing?.auth_type) || "chatgpt",
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: tokens.id_token,
    account_id: tokens.account_id,
    last_refresh: cleanString(sourceAuth?.last_refresh) || now,
    last_error_code: null,
    last_error_reason: null,
    last_error_message: null,
    last_error_reset_at: null,
  });
}

function importCodexHomeCredential(doc, sourceAuth, input = {}) {
  const provider = cleanString(input.provider) || PROVIDER_ID;
  const nowMs = Number(input.nowMs || Date.now());
  const nowSec = nowUnixSeconds(nowMs);
  const now = cleanString(input.nowIso) || new Date(nowMs).toISOString();
  const next = ensureProviderDoc(cloneJson(doc), provider);
  const pool = normalizePool(next, provider);
  const profileId = cleanString(input.profileId || input.profile_id || input.id);
  const existingIndex = pool.findIndex((entry, index) => entryId(entry, index) === profileId);
  const imported = entryFromCodexHomeAuth(sourceAuth, {
    profileId,
    label: input.label,
    priority: input.priority,
    importedFrom: input.importedFrom || input.imported_from,
    nowIso: now,
    preserveExisting: true,
    existing: existingIndex >= 0 ? pool[existingIndex] : null,
  });
  if (existingIndex >= 0) pool.splice(existingIndex, 1);
  if (input.makeActive || input.make_active) {
    pool.unshift(imported);
    copyEntryTokensToProvider(next, imported, provider, now);
  } else {
    pool.push(imported);
  }
  next.credential_pool[provider] = pool;
  next.updated_at = now;
  return {
    changed: true,
    imported: true,
    active_profile_id: pool.length ? entryId(pool[0], 0) : "",
    imported_profile_id: profileId,
    doc: next,
    summary: publicSummary(next, { provider, nowSec }),
  };
}

module.exports = {
  PROVIDER_ID,
  entryIsUsable,
  importCodexHomeCredential,
  publicSummary,
  rotateAfterUsageLimit,
};
