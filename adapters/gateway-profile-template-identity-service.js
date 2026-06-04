"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  capabilityFingerprint,
  configPathForWorker,
  readCapabilities,
  templateKeyForWorker,
} = require("../scripts/verify-gateway-profile-template-sync");

function cleanString(value) {
  return String(value ?? "").trim();
}

function valueFrom(value, fallback = "") {
  if (typeof value === "function") return value() ?? fallback;
  return value ?? fallback;
}

function normalizeWorkspaceId(value) {
  const text = cleanString(value).toLowerCase().replace(/^workspace:/, "");
  if (!text || text === "*" || text === "all") return "";
  return text.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function normalizeSecurityLevel(value) {
  const text = cleanString(value).toLowerCase().replaceAll("_", "-");
  if (["owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"].includes(text)) {
    return "owner-maintenance";
  }
  return text ? "user" : "";
}

function normalizeProvider(value) {
  const text = cleanString(value).toLowerCase();
  if (!text) return "";
  return text.replace(/[^a-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function readMaterializedIdentity(fsImpl, configPath) {
  if (!configPath) return {};
  const identityPath = path.join(path.dirname(configPath), "materialized-identity.json");
  if (!fsImpl.existsSync(identityPath)) return {};
  const parsed = JSON.parse(fsImpl.readFileSync(identityPath, "utf8"));
  if (!parsed || typeof parsed !== "object") return {};
  return {
    workspaceId: normalizeWorkspaceId(parsed.workspaceId || parsed.workspace_id),
    permissionTier: normalizeSecurityLevel(parsed.permissionTier || parsed.permission_tier || parsed.securityLevel || parsed.security_level),
    provider: normalizeProvider(parsed.provider),
  };
}

function workerWithMaterializedIdentity(worker = {}, materialized = {}) {
  const identityWorker = Object.assign({}, worker);
  if (materialized.workspaceId) {
    identityWorker.allowedWorkspaceIds = [materialized.workspaceId];
    identityWorker.allowed_workspace_ids = [materialized.workspaceId];
    identityWorker.skillWorkspaceIds = [materialized.workspaceId];
    identityWorker.skill_workspace_ids = [materialized.workspaceId];
  }
  if (materialized.permissionTier) {
    identityWorker.securityLevel = materialized.permissionTier;
    identityWorker.security_level = materialized.permissionTier;
  }
  if (materialized.provider) identityWorker.provider = materialized.provider;
  return identityWorker;
}

function createGatewayProfileTemplateIdentityService(options = {}) {
  const fsImpl = options.fs || fs;

  function profilesRoot() {
    return cleanString(valueFrom(options.profilesRoot || options.profileRoot, ""));
  }

  function toolSchemaEpoch() {
    return cleanString(valueFrom(options.toolSchemaEpoch || options.schemaEpoch, ""));
  }

  function identityForWorker(worker = {}) {
    const fallbackTemplateKey = templateKeyForWorker(worker, {});
    const schemaEpoch = toolSchemaEpoch();
    const configPath = configPathForWorker(worker, profilesRoot());
    if (!configPath || !fsImpl.existsSync(configPath)) {
      return {
        templateKey: fallbackTemplateKey,
        capabilityHash: "",
        capabilityStatus: "missing_config",
        toolSchemaEpoch: schemaEpoch,
      };
    }
    try {
      const capabilities = readCapabilities(configPath);
      const fingerprint = capabilityFingerprint(capabilities);
      const materialized = readMaterializedIdentity(fsImpl, configPath);
      const identityWorker = workerWithMaterializedIdentity(worker, materialized);
      return {
        templateKey: templateKeyForWorker(identityWorker, capabilities),
        capabilityHash: fingerprint.hash,
        capabilityStatus: "ok",
        toolSchemaEpoch: schemaEpoch,
      };
    } catch (err) {
      return {
        templateKey: fallbackTemplateKey,
        capabilityHash: "",
        capabilityStatus: "unreadable_config",
        capabilityError: cleanString(err?.message || err).slice(0, 160),
        toolSchemaEpoch: schemaEpoch,
      };
    }
  }

  return Object.freeze({
    identityForWorker,
  });
}

module.exports = {
  createGatewayProfileTemplateIdentityService,
};
