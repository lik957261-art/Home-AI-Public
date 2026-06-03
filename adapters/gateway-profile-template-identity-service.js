"use strict";

const fs = require("node:fs");

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
      return {
        templateKey: templateKeyForWorker(worker, capabilities),
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
