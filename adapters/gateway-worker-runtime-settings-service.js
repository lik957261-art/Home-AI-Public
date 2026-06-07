"use strict";

const {
  normalizeElasticSchedulerConfig,
} = require("./gateway-elastic-worker-scheduler");

const SETTING_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "ownerMinWarm",
    label: "Owner warm workers",
    mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM",
    webEnv: "HERMES_WEB_GATEWAY_OWNER_MIN_WARM",
    max: 64,
  }),
  Object.freeze({
    key: "ownerMaxWorkers",
    label: "Owner worker cap",
    mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_MAX_WORKERS",
    webEnv: "HERMES_WEB_GATEWAY_OWNER_MAX_WORKERS",
    max: 64,
  }),
  Object.freeze({
    key: "ownerDeepSeekMaxWorkers",
    label: "Owner DeepSeek worker cap",
    mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS",
    webEnv: "HERMES_WEB_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS",
    max: 64,
  }),
  Object.freeze({
    key: "ownerMaintenanceMaxWorkers",
    label: "Owner maintenance worker cap",
    mobileEnv: "HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS",
    webEnv: "HERMES_WEB_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS",
    max: 64,
  }),
  Object.freeze({
    key: "workspaceMinWarm",
    label: "Workspace warm workers",
    mobileEnv: "HERMES_MOBILE_GATEWAY_WORKSPACE_MIN_WARM",
    webEnv: "HERMES_WEB_GATEWAY_WORKSPACE_MIN_WARM",
    max: 64,
  }),
  Object.freeze({
    key: "workspaceMaxWorkers",
    label: "Workspace worker cap",
    mobileEnv: "HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS",
    webEnv: "HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS",
    max: 64,
  }),
  Object.freeze({
    key: "workspaceDeepSeekMaxWorkers",
    label: "Workspace DeepSeek worker cap",
    mobileEnv: "HERMES_MOBILE_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS",
    webEnv: "HERMES_WEB_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS",
    max: 64,
  }),
  Object.freeze({
    key: "globalMaxWorkers",
    label: "Global worker cap",
    mobileEnv: "HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS",
    webEnv: "HERMES_WEB_GATEWAY_ELASTIC_MAX_WORKERS",
    max: 256,
  }),
  Object.freeze({
    key: "idleTtlMinutes",
    label: "Idle cooldown minutes",
    mobileEnv: "HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES",
    webEnv: "HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES",
    max: 1440,
  }),
]);

const SETTING_BY_KEY = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]));

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function runtimeSettingError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function normalizeNumberSetting(value, definition, options = {}) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    if (options.strict) throw runtimeSettingError(`${definition.label} must be a non-negative integer`);
    return null;
  }
  const normalized = Math.floor(number);
  if (normalized > definition.max) {
    if (options.strict) throw runtimeSettingError(`${definition.label} must be ${definition.max} or lower`);
    return null;
  }
  return normalized;
}

function normalizeGatewayWorkerRuntimeSettings(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const out = {};
  for (const definition of SETTING_DEFINITIONS) {
    const snakeKey = definition.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const raw = hasOwn(source, definition.key) ? source[definition.key] : source[snakeKey];
    const normalized = normalizeNumberSetting(raw, definition, options);
    if (normalized !== null) out[definition.key] = normalized;
  }
  return out;
}

function mergeGatewayWorkerRuntimeSettings(previous = {}, input = {}, options = {}) {
  const base = normalizeGatewayWorkerRuntimeSettings(previous);
  const source = input && typeof input === "object" ? input : {};
  const out = Object.assign({}, base);
  for (const definition of SETTING_DEFINITIONS) {
    const snakeKey = definition.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (!hasOwn(source, definition.key) && !hasOwn(source, snakeKey)) continue;
    const raw = hasOwn(source, definition.key) ? source[definition.key] : source[snakeKey];
    const normalized = normalizeNumberSetting(raw, definition, options);
    if (normalized === null) delete out[definition.key];
    else out[definition.key] = normalized;
  }
  return out;
}

function gatewayWorkerSettingsToElasticConfig(settings = {}, base = {}) {
  const normalized = normalizeGatewayWorkerRuntimeSettings(settings);
  const out = Object.assign({}, base && typeof base === "object" ? base : {});
  for (const [key, value] of Object.entries(normalized)) {
    const definition = SETTING_BY_KEY.get(key);
    if (!definition) continue;
    out[definition.mobileEnv] = String(value);
    out[definition.webEnv] = String(value);
  }
  return out;
}

function publicGatewayWorkerRuntimeSettings(settings = {}, base = {}) {
  const overrides = normalizeGatewayWorkerRuntimeSettings(settings);
  const effective = normalizeElasticSchedulerConfig(gatewayWorkerSettingsToElasticConfig(overrides, base));
  return {
    definitions: SETTING_DEFINITIONS.map((item) => ({
      key: item.key,
      label: item.label,
      max: item.max,
    })),
    overrides,
    effective: {
      ownerMinWarm: effective.ownerMinWarm,
      ownerMaxWorkers: effective.ownerMaxWorkers,
      ownerDeepSeekMaxWorkers: effective.ownerDeepSeekMaxWorkers,
      ownerMaintenanceMaxWorkers: effective.ownerMaintenanceMaxWorkers,
      workspaceMinWarm: effective.workspaceMinWarm,
      workspaceMaxWorkers: effective.workspaceMaxWorkers,
      workspaceDeepSeekMaxWorkers: effective.workspaceDeepSeekMaxWorkers,
      globalMaxWorkers: effective.globalMaxWorkers,
      idleTtlMinutes: Math.floor((effective.idleTtlMs || 0) / 60_000),
      idleTtlMs: effective.idleTtlMs,
    },
  };
}

module.exports = {
  SETTING_DEFINITIONS,
  gatewayWorkerSettingsToElasticConfig,
  mergeGatewayWorkerRuntimeSettings,
  normalizeGatewayWorkerRuntimeSettings,
  publicGatewayWorkerRuntimeSettings,
};
