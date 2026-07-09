"use strict";

const MEDIA_ACCOUNT_TYPE = "media";
const MEDIA_OWNER_SPECIAL_PLUGIN_IDS = Object.freeze(["music", "movie"]);

function stringValue(value) {
  return String(value || "").trim();
}

function sourcePolicy(source = {}) {
  return source?.policy && typeof source.policy === "object" && !Array.isArray(source.policy)
    ? source.policy
    : {};
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }
  return String(value || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMediaAccountType(source = {}) {
  const policy = sourcePolicy(source);
  return stringValue(source.accountType || source.account_type || policy.account_type || policy.accountType).toLowerCase();
}

function explicitAllowedOwnerSpecialPlugins(source = {}) {
  const policy = sourcePolicy(source);
  return normalizeStringList(
    source.allowedOwnerSpecialPlugins
      || source.allowed_owner_special_plugins
      || policy.allowed_owner_special_plugins
      || policy.allowedOwnerSpecialPlugins,
  );
}

function isRestrictedMediaAccount(source = {}) {
  return normalizeMediaAccountType(source) === MEDIA_ACCOUNT_TYPE
    || source.restrictedMedia === true
    || explicitAllowedOwnerSpecialPlugins(source).length > 0;
}

function normalizeAllowedOwnerSpecialPlugins(source = {}) {
  const explicit = explicitAllowedOwnerSpecialPlugins(source);
  const allowed = explicit.length > 0 || !isRestrictedMediaAccount(source)
    ? explicit
    : MEDIA_OWNER_SPECIAL_PLUGIN_IDS;
  return [...new Set(allowed)]
    .map((item) => stringValue(item).toLowerCase())
    .filter((item) => MEDIA_OWNER_SPECIAL_PLUGIN_IDS.includes(item));
}

function mediaAccountPublicFields(source = {}) {
  const accountType = normalizeMediaAccountType(source);
  const allowedOwnerSpecialPlugins = normalizeAllowedOwnerSpecialPlugins(source);
  return {
    accountType,
    restrictedMedia: isRestrictedMediaAccount(source),
    allowedOwnerSpecialPlugins,
  };
}

function canAccessOwnerSpecialMediaPlugin(source = {}, pluginId = "") {
  const id = stringValue(pluginId).toLowerCase();
  if (!MEDIA_OWNER_SPECIAL_PLUGIN_IDS.includes(id)) return false;
  return isRestrictedMediaAccount(source) && normalizeAllowedOwnerSpecialPlugins(source).includes(id);
}

function onlyAllowsOwnerSpecialMediaPlugins(source = {}) {
  return isRestrictedMediaAccount(source);
}

module.exports = {
  MEDIA_ACCOUNT_TYPE,
  MEDIA_OWNER_SPECIAL_PLUGIN_IDS,
  canAccessOwnerSpecialMediaPlugin,
  isRestrictedMediaAccount,
  mediaAccountPublicFields,
  normalizeAllowedOwnerSpecialPlugins,
  normalizeMediaAccountType,
  onlyAllowsOwnerSpecialMediaPlugins,
};
