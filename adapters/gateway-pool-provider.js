"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createGatewayElasticWorkerScheduler,
  normalizeElasticSchedulerConfig,
} = require("./gateway-elastic-worker-scheduler");
const {
  createGatewayProfileTemplateIdentityService,
} = require("./gateway-profile-template-identity-service");
const {
  normalizeGatewayWorkerReplica,
} = require("./gateway-profile-replica-model");

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envEnabled(value) {
  const text = String(value || "").trim();
  if (!text) return "auto";
  if (/^(1|true|yes|on|auto)$/i.test(text)) return text.toLowerCase() === "auto" ? "auto" : "on";
  if (/^(0|false|no|off)$/i.test(text)) return "off";
  return "auto";
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function dedupeList(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function cleanProvider(value) {
  return String(value || "").trim();
}

function normalizeSecurityLevel(value) {
  const text = String(value || "").trim().toLowerCase().replaceAll("_", "-");
  if (["user", "restricted", "low", "low-privilege"].includes(text)) return "user";
  if (["owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"].includes(text)) return "owner-maintenance";
  return "unspecified";
}

function gatewayWorkerUnavailableError(message, code, details = {}) {
  const err = new Error(message);
  err.status = 503;
  err.code = code;
  err.details = details;
  return err;
}

function normalizePoolStartMode(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "hybrid" || text === "elastic" || text === "on-demand" || text === "ondemand") return "hybrid";
  if (text === "eager" || text === "worker-pool" || text === "fixed") return "eager";
  return "";
}

function normalizeWorkspaceIds(value) {
  const all = cleanList(value);
  if (all.some((item) => item === "*" || item.toLowerCase() === "all")) return ["*"];
  return all;
}

function profileConfigPathForWorker(raw = {}, profile = "") {
  const direct = String(raw.configPath || raw.config_path || raw.profileConfigPath || raw.profile_config_path || "").trim();
  if (direct) return direct;
  const candidates = [
    raw.telemetryStateDbPath,
    raw.telemetry_state_db_path,
    raw.stateDbPath,
    raw.state_db_path,
    raw.telemetryResponseStoreDbPath,
    raw.telemetry_response_store_db_path,
    raw.responseStoreDbPath,
    raw.response_store_db_path,
  ].map((item) => String(item || "").trim()).filter(Boolean);
  for (const candidate of candidates) {
    const configPath = path.join(path.dirname(candidate), "config.yaml");
    if (fs.existsSync(configPath)) return configPath;
  }
  const root = String(raw.telemetryRoot || raw.telemetry_root || raw.gatewayWorkerRoot || raw.gateway_worker_root || "").trim();
  if (root && profile) {
    const configPath = path.join(root, "telemetry", "profiles", profile, "config.yaml");
    if (fs.existsSync(configPath)) return configPath;
  }
  return "";
}

function readProfileToolsets(configPath = "") {
  const resolved = String(configPath || "").trim();
  if (!resolved || !fs.existsSync(resolved)) return [];
  try {
    const lines = fs.readFileSync(resolved, "utf8").split(/\r?\n/);
    const out = [];
    let inToolsets = false;
    for (const line of lines) {
      if (/^toolsets:\s*$/.test(line)) {
        inToolsets = true;
        continue;
      }
      if (!inToolsets) continue;
      if (/^\S.*:\s*$/.test(line)) break;
      const match = line.match(/^\s*-\s*([A-Za-z0-9_.:-]+)\s*$/);
      if (match) out.push(match[1]);
    }
    return dedupeList(out);
  } catch {
    return [];
  }
}

function normalizeWorkerToolsets(raw = {}, profile = "") {
  const manifestToolsets = [
    ...cleanList(raw.toolsets),
    ...cleanList(raw.enabledToolsets || raw.enabled_toolsets),
    ...cleanList(raw.requiredToolsets || raw.required_toolsets),
  ];
  const configToolsets = readProfileToolsets(profileConfigPathForWorker(raw, profile));
  return dedupeList([...manifestToolsets, ...configToolsets]);
}

function normalizeWorker(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.enabled === false) return null;
  const url = stripTrailingSlash(raw.url || raw.gatewayUrl || raw.gateway_url || raw.apiBase || raw.api_base || "");
  const host = String(raw.host || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(raw.port || 0);
  const apiBase = url || (port ? `http://${host}:${port}` : "");
  if (!apiBase) return null;
  const profile = String(raw.profile || "").trim();
  const name = String(raw.name || profile || `worker${index + 1}`).trim();
  return {
    id: String(raw.id || name || profile || apiBase).trim(),
    name,
    profile,
    apiBase: stripTrailingSlash(apiBase),
    apiKey: String(raw.api_key || raw.apiKey || "").trim(),
    provider: String(raw.provider || "").trim(),
    tags: cleanList(raw.tags),
    toolsets: normalizeWorkerToolsets(raw, profile),
    securityLevel: normalizeSecurityLevel(raw.securityLevel || raw.security_level || raw.level),
    allowedWorkspaceIds: normalizeWorkspaceIds(raw.allowedWorkspaceIds || raw.allowed_workspace_ids || raw.workspaceIds || raw.workspace_ids),
    allowMaintenance: Boolean(raw.allowMaintenance || raw.allow_maintenance),
    skillProfile: String(raw.skillProfile || raw.skill_profile || raw.skillSet || raw.skill_set || "").trim(),
    skillWorkspaceIds: normalizeWorkspaceIds(
      raw.skillWorkspaceIds
      || raw.skill_workspace_ids
      || raw.skillWorkspaces
      || raw.skill_workspaces
      || raw.skillWorkspaceId
      || raw.skill_workspace_id,
    ),
    telemetryProfile: String(raw.telemetryProfile || raw.telemetry_profile || raw.telemetryStateProfile || raw.telemetry_state_profile || profile).trim(),
    telemetryStateDbPath: String(raw.telemetryStateDbPath || raw.telemetry_state_db_path || raw.stateDbPath || raw.state_db_path || "").trim(),
    telemetryResponseStoreDbPath: String(
      raw.telemetryResponseStoreDbPath
      || raw.telemetry_response_store_db_path
      || raw.responseStoreDbPath
      || raw.response_store_db_path
      || "",
    ).trim(),
  };
}

function readManifestFile(paths) {
  for (const manifestPath of paths) {
    const resolved = String(manifestPath || "").trim();
    if (!resolved) continue;
    try {
      if (!fs.existsSync(resolved)) continue;
      const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
      return { manifest: parsed, path: resolved };
    } catch (err) {
      return { manifest: null, path: resolved, error: err };
    }
  }
  return { manifest: null, path: "", error: null };
}

function publicWorker(worker, health = null) {
  const replica = normalizeGatewayWorkerReplica(worker);
  return {
    id: worker.id,
    name: worker.name,
    profile: worker.profile,
    replicaId: replica.replicaId,
    profileAlias: replica.profileAlias,
    poolKey: replica.poolKey,
    profileTemplateKey: replica.profileTemplateKey,
    apiBase: worker.apiBase,
    provider: worker.provider,
    tags: worker.tags,
    toolsets: worker.toolsets || [],
    securityLevel: worker.securityLevel,
    allowedWorkspaceIds: worker.allowedWorkspaceIds,
    allowMaintenance: Boolean(worker.allowMaintenance),
    skillProfile: worker.skillProfile || "",
    skillWorkspaceIds: worker.skillWorkspaceIds || [],
    templateKey: worker.templateKey || "",
    capabilityHash: worker.capabilityHash || "",
    capabilityStatus: worker.capabilityStatus || "",
    toolSchemaEpoch: worker.toolSchemaEpoch || "",
    healthy: health == null ? null : Boolean(health),
  };
}

function requiredToolsetsForHints(hints = {}) {
  return dedupeList([
    ...cleanList(hints.requiredToolsets || hints.required_toolsets),
    ...cleanList(hints.pluginToolsets || hints.plugin_toolsets),
  ]);
}

function preferredToolsetsForHints(hints = {}) {
  return dedupeList(cleanList(hints.preferredToolsets || hints.preferred_toolsets));
}

function matchesExact(worker, hints = {}) {
  const profiles = new Set([...cleanList(hints.worker_profile), ...cleanList(hints.worker_profiles)]);
  const names = new Set([...cleanList(hints.worker_name), ...cleanList(hints.worker_names)]);
  if (profiles.size && !profiles.has(worker.profile)) return false;
  if (names.size && !names.has(worker.name)) return false;
  return Boolean(profiles.size || names.size);
}

function satisfiesFilter(worker, hints = {}) {
  const provider = cleanProvider(hints.provider);
  if (provider && worker.provider !== provider) return false;
  if (!provider && worker.provider && worker.provider !== "openai-codex" && !matchesExact(worker, hints)) return false;
  const requiredSecurityLevel = normalizeSecurityLevel(hints.securityLevel || hints.security_level || "user");
  if (requiredSecurityLevel !== "unspecified" && worker.securityLevel !== requiredSecurityLevel) return false;
  const workspaceId = String(hints.workspaceId || hints.workspace_id || "").trim();
  if (workspaceId && Array.isArray(worker.allowedWorkspaceIds) && worker.allowedWorkspaceIds.length) {
    if (!worker.allowedWorkspaceIds.includes("*") && !worker.allowedWorkspaceIds.includes(workspaceId)) return false;
  }
  const skillProfile = String(hints.skillProfile || hints.skill_profile || "").trim();
  const requireSkillProfile = Boolean(hints.requireSkillProfile || hints.require_skill_profile);
  if (skillProfile && worker.skillProfile !== skillProfile) return false;
  const skillWorkspaceId = String(hints.skillWorkspaceId || hints.skill_workspace_id || "").trim();
  if (skillWorkspaceId) {
    if (!Array.isArray(worker.skillWorkspaceIds) || !worker.skillWorkspaceIds.length) {
      if (requireSkillProfile) return false;
    } else if (!worker.skillWorkspaceIds.includes("*") && !worker.skillWorkspaceIds.includes(skillWorkspaceId)) {
      return false;
    }
  }
  const maintenance = Boolean(hints.maintenance || hints.allowMaintenance || hints.allow_maintenance);
  if (maintenance && !worker.allowMaintenance && worker.securityLevel !== "owner-maintenance") return false;
  if (!maintenance && worker.securityLevel === "owner-maintenance") return false;
  const requiredTags = cleanList(hints.worker_tags);
  if (requiredTags.length) {
    const tags = new Set(worker.tags || []);
    if (!requiredTags.every((tag) => tags.has(tag))) return false;
  }
  const requiredToolsets = requiredToolsetsForHints(hints);
  if (requiredToolsets.length) {
    const toolsets = new Set(worker.toolsets || []);
    if (!requiredToolsets.every((toolset) => toolsets.has(toolset))) return false;
  }
  return true;
}

function orderedWorkers(workers, nextIndex, hints = {}) {
  const exact = workers.filter((worker) => matchesExact(worker, hints));
  if (exact.length) return exact.filter((worker) => satisfiesFilter(worker, hints));

  const preferred = [];
  const seen = new Set();
  for (const profile of cleanList(hints.preferred_worker_profiles)) {
    for (const worker of workers.filter((item) => item.profile === profile)) {
      if (!seen.has(worker.id) && satisfiesFilter(worker, hints)) {
        seen.add(worker.id);
        preferred.push(worker);
      }
    }
  }
  for (const name of cleanList(hints.preferred_worker_names)) {
    for (const worker of workers.filter((item) => item.name === name)) {
      if (!seen.has(worker.id) && satisfiesFilter(worker, hints)) {
        seen.add(worker.id);
        preferred.push(worker);
      }
    }
  }

  const ordered = [...preferred];
  const preferredToolsets = preferredToolsetsForHints(hints);
  if (preferredToolsets.length) {
    const remaining = [];
    for (let offset = 0; offset < workers.length; offset += 1) {
      const worker = workers[(nextIndex + offset) % workers.length];
      if (!seen.has(worker.id) && satisfiesFilter(worker, hints)) remaining.push(worker);
    }
    remaining.sort((left, right) => {
      const leftToolsets = new Set(left.toolsets || []);
      const rightToolsets = new Set(right.toolsets || []);
      const leftScore = preferredToolsets.filter((toolset) => leftToolsets.has(toolset)).length;
      const rightScore = preferredToolsets.filter((toolset) => rightToolsets.has(toolset)).length;
      return rightScore - leftScore;
    });
    for (const worker of remaining) {
      seen.add(worker.id);
      ordered.push(worker);
    }
    return ordered;
  }
  for (let offset = 0; offset < workers.length; offset += 1) {
    const worker = workers[(nextIndex + offset) % workers.length];
    if (!seen.has(worker.id) && satisfiesFilter(worker, hints)) {
      seen.add(worker.id);
      ordered.push(worker);
    }
  }
  return ordered;
}

function createGatewayPoolProvider(options = {}) {
  const createGatewayRunner = options.createGatewayRunner;
  if (typeof createGatewayRunner !== "function") throw new Error("GatewayPoolProvider requires createGatewayRunner");
  let nextIndex = 0;
  let lastLoaded = { manifestPath: "", workers: [], error: null, enabled: false };
  const templateIdentityService = options.templateIdentityService || createGatewayProfileTemplateIdentityService({
    profilesRoot: options.profilesRoot || options.gatewayProfilesRoot,
    toolSchemaEpoch: options.toolSchemaEpoch,
  });
  const elasticScheduler = createGatewayElasticWorkerScheduler({
    config: normalizeElasticSchedulerConfig(options.elastic || options.elasticConfig || {}),
    nowMs: options.nowMs,
    startWorker: typeof options.startWorkerProfile === "function"
      ? (worker, context) => options.startWorkerProfile(worker, context)
      : undefined,
    stopWorker: typeof options.stopWorkerProfile === "function"
      ? (worker, context) => options.stopWorkerProfile(worker, context)
      : undefined,
    isHealthy,
  });

  function withTemplateIdentity(worker) {
    if (!worker || !templateIdentityService || typeof templateIdentityService.identityForWorker !== "function") return worker;
    const identity = templateIdentityService.identityForWorker(worker);
    return Object.assign(worker, {
      templateKey: identity.templateKey || "",
      capabilityHash: identity.capabilityHash || "",
      capabilityStatus: identity.capabilityStatus || "",
      toolSchemaEpoch: identity.toolSchemaEpoch || "",
    });
  }

  function manifestPaths() {
    const value = typeof options.manifestPaths === "function" ? options.manifestPaths() : options.manifestPaths;
    return Array.isArray(value) ? value : [value].filter(Boolean);
  }

  function fallbackTarget() {
    return {
      apiBase: stripTrailingSlash(typeof options.fallbackApiBase === "function" ? options.fallbackApiBase() : options.fallbackApiBase),
      apiKey: String(typeof options.fallbackApiKey === "function" ? options.fallbackApiKey() : options.fallbackApiKey || "").trim(),
      name: "default",
      profile: "",
      pooled: false,
      source: "fallback",
    };
  }

  function mode() {
    return envEnabled(typeof options.enabled === "function" ? options.enabled() : options.enabled);
  }

  function startMode() {
    const explicit = typeof options.startMode === "function" ? options.startMode() : options.startMode;
    return normalizePoolStartMode(explicit) || "eager";
  }

  function load() {
    const currentMode = mode();
    if (currentMode === "off") {
      lastLoaded = { manifestPath: "", workers: [], error: null, enabled: false };
      return lastLoaded;
    }
    const read = readManifestFile(manifestPaths());
    if (!read.manifest) {
      lastLoaded = { manifestPath: read.path || "", workers: [], error: read.error || null, enabled: false };
      return lastLoaded;
    }
    const manifestEnabled = read.manifest.enabled !== false;
    const workers = manifestEnabled
      ? (read.manifest.workers || []).map((raw, index) => withTemplateIdentity(normalizeWorker(raw, index))).filter(Boolean)
      : [];
    lastLoaded = {
      manifestPath: read.path,
      workers,
      error: null,
      enabled: manifestEnabled && workers.length > 0,
      version: read.manifest.version || null,
    };
    return lastLoaded;
  }

  function runnerFor(target) {
    return createGatewayRunner({
      apiBase: target.apiBase,
      apiKey: target.apiKey,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
  }

  async function isHealthy(target) {
    try {
      const health = await runnerFor(target).request("/health", { timeoutMs: options.healthTimeoutMs || 5000 });
      return health?.status === "ok" || health?.ok === true || health?.health === "ok";
    } catch (_) {
      return false;
    }
  }

  function effectiveRoutingHints(loaded, hints = {}) {
    const skillRoutingRequested = Boolean(
      hints.skillProfile
      || hints.skill_profile
      || hints.skillWorkspaceId
      || hints.skill_workspace_id,
    );
    const skillRoutingConfigured = loaded.workers.some((worker) => (
      worker.skillProfile
      || (Array.isArray(worker.skillWorkspaceIds) && worker.skillWorkspaceIds.length)
    ));
    const effectiveHints = Object.assign({}, hints);
    if (skillRoutingRequested && !skillRoutingConfigured && !hints.requireSkillProfile && !hints.require_skill_profile) {
      delete effectiveHints.skillProfile;
      delete effectiveHints.skill_profile;
      delete effectiveHints.skillWorkspaceId;
      delete effectiveHints.skill_workspace_id;
    } else if (skillRoutingRequested && skillRoutingConfigured) {
      effectiveHints.requireSkillProfile = true;
    }
    return effectiveHints;
  }

  async function chooseTarget(hints = {}, context = {}) {
    const loaded = load();
    const requestedSecurityLevel = normalizeSecurityLevel(hints.securityLevel || hints.security_level || "user");
    const requestedProvider = cleanProvider(hints.provider);
    const effectiveHints = effectiveRoutingHints(loaded, hints);
    if (!loaded.enabled) {
      const reason = loaded.error ? `manifest_error:${loaded.error.message || loaded.error}` : "pool_unavailable";
      if (requestedSecurityLevel === "user" || requestedProvider) {
        throw gatewayWorkerUnavailableError(
          requestedProvider
            ? `No Hermes Gateway worker pool is available for provider ${requestedProvider}`
            : "No user-level Hermes Gateway worker pool is available",
          requestedProvider ? "gateway_provider_pool_unavailable" : "gateway_user_pool_unavailable",
          { reason, provider: requestedProvider, securityLevel: requestedSecurityLevel },
        );
      }
      return Object.assign(fallbackTarget(), {
        reason,
      });
    }
    const candidates = orderedWorkers(loaded.workers, nextIndex, effectiveHints);
    if (!candidates.length) {
      if (requestedSecurityLevel === "user" || requestedProvider) {
        throw gatewayWorkerUnavailableError(
          requestedProvider
            ? `No matching Hermes Gateway worker is available for provider ${requestedProvider}`
            : "No matching user-level Hermes Gateway worker is available",
          requestedProvider ? "gateway_provider_worker_unavailable" : "gateway_user_worker_unavailable",
          { reason: "no_matching_worker", provider: requestedProvider, securityLevel: requestedSecurityLevel },
        );
      }
      return Object.assign(fallbackTarget(), { reason: "no_matching_worker" });
    }
    if (startMode() === "hybrid") {
      const target = await elasticScheduler.chooseTarget({
        allWorkers: loaded.workers,
        candidates,
        hints: effectiveHints,
        runId: context.runId || hints.runId || hints.run_id || "",
        onEvent: context.onEvent,
      });
      const idx = loaded.workers.findIndex((item) => item.id === target.id);
      nextIndex = idx >= 0 ? (idx + 1) % loaded.workers.length : (nextIndex + 1) % loaded.workers.length;
      return Object.assign({}, target, {
        manifestPath: loaded.manifestPath,
      });
    }
    for (const worker of candidates) {
      if (await isHealthy(worker)) {
        const idx = loaded.workers.findIndex((item) => item.id === worker.id);
        nextIndex = idx >= 0 ? (idx + 1) % loaded.workers.length : (nextIndex + 1) % loaded.workers.length;
        return Object.assign({}, worker, {
          pooled: true,
          source: "worker_pool",
          manifestPath: loaded.manifestPath,
        });
      }
    }
    if (requestedSecurityLevel === "user" || requestedProvider) {
      throw gatewayWorkerUnavailableError(
        requestedProvider
          ? `No healthy Hermes Gateway worker is available for provider ${requestedProvider}`
          : "No healthy user-level Hermes Gateway worker is available",
        requestedProvider ? "gateway_provider_worker_unhealthy" : "gateway_user_worker_unhealthy",
        { reason: "no_healthy_worker", provider: requestedProvider, securityLevel: requestedSecurityLevel },
      );
    }
    return Object.assign(fallbackTarget(), { reason: "no_healthy_worker" });
  }

  function targetForGatewayUrl(gatewayUrl) {
    const apiBase = stripTrailingSlash(gatewayUrl);
    if (!apiBase) return fallbackTarget();
    const loaded = load();
    const worker = loaded.workers.find((item) => item.apiBase === apiBase);
    if (worker) {
      return Object.assign({}, worker, {
        pooled: true,
        source: "worker_pool",
        manifestPath: loaded.manifestPath,
      });
    }
    const fallback = fallbackTarget();
    if (fallback.apiBase === apiBase) return fallback;
    return Object.assign(fallback, { apiBase });
  }

  async function status() {
    const loaded = load();
    const fallback = fallbackTarget();
    if (loaded.enabled && startMode() === "hybrid") {
      for (const worker of loaded.workers) {
        if (await isHealthy(worker)) {
          elasticScheduler.markWorkerWarm(worker);
        } else {
          elasticScheduler.markWorkerUnavailable(worker);
        }
      }
      const schedulerStatus = elasticScheduler.status(loaded.workers);
      return Object.assign({}, schedulerStatus, {
        enabled: loaded.enabled,
        mode: "hybrid",
        manifestPath: loaded.manifestPath,
        workerCount: loaded.workers.length,
        fallbackApiBase: fallback.apiBase,
        error: loaded.error ? loaded.error.message || String(loaded.error) : null,
      });
    }
    const workers = [];
    for (const worker of loaded.workers) {
      workers.push(publicWorker(worker, await isHealthy(worker)));
    }
    return {
      enabled: loaded.enabled,
      mode: mode(),
      manifestPath: loaded.manifestPath,
      workerCount: loaded.workers.length,
      fallbackApiBase: fallback.apiBase,
      error: loaded.error ? loaded.error.message || String(loaded.error) : null,
      workers,
    };
  }

  return {
    chooseTarget,
    fallbackTarget,
    load,
    planHybridStartup: (workers) => elasticScheduler.planHybridStartup(workers || load().workers || []),
    releaseRun: (...args) => elasticScheduler.releaseRun(...args),
    replaceRun: (...args) => elasticScheduler.replaceRun(...args),
    runnerFor,
    status,
    targetForGatewayUrl,
  };
}

module.exports = {
  createGatewayPoolProvider,
  normalizePoolStartMode,
  normalizeSecurityLevel,
  normalizeWorker,
  orderedWorkers,
};
