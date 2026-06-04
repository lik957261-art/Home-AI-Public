"use strict";

const DEFAULT_CONFIG = Object.freeze({
  ownerMinWarm: 1,
  ownerMaxWorkers: 4,
  ownerDeepSeekMaxWorkers: 2,
  ownerMaintenanceMaxWorkers: 2,
  workspaceMinWarm: 0,
  workspaceMaxWorkers: 2,
  workspaceDeepSeekMaxWorkers: 1,
  globalMaxWorkers: 8,
  idleTtlMs: 180 * 60 * 1000,
  startTimeoutMs: 300_000,
  startHealthWaitMs: 30_000,
  startHealthPollMs: 1_000,
  queueWaitTimeoutMs: 10 * 60 * 1000,
});

const STARTED_STATES = new Set(["starting", "warm", "busy", "idle", "idle_stopping"]);

function cleanString(value) {
  return String(value || "").trim();
}

function readInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function readEnvInteger(env, mobileName, webName, fallback) {
  const value = env?.[mobileName] ?? env?.[webName];
  return readInteger(value, fallback);
}

function normalizeElasticSchedulerConfig(input = {}) {
  const env = input.env || input;
  const idleMinutes = readEnvInteger(
    env,
    "HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES",
    "HERMES_WEB_GATEWAY_WORKER_IDLE_TTL_MINUTES",
    Math.floor(DEFAULT_CONFIG.idleTtlMs / 60_000),
  );
  return {
    ownerMinWarm: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM", "HERMES_WEB_GATEWAY_OWNER_MIN_WARM", DEFAULT_CONFIG.ownerMinWarm),
    ownerMaxWorkers: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_OWNER_MAX_WORKERS", "HERMES_WEB_GATEWAY_OWNER_MAX_WORKERS", DEFAULT_CONFIG.ownerMaxWorkers),
    ownerDeepSeekMaxWorkers: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS", "HERMES_WEB_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS", DEFAULT_CONFIG.ownerDeepSeekMaxWorkers),
    ownerMaintenanceMaxWorkers: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS", "HERMES_WEB_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS", DEFAULT_CONFIG.ownerMaintenanceMaxWorkers),
    workspaceMinWarm: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_WORKSPACE_MIN_WARM", "HERMES_WEB_GATEWAY_WORKSPACE_MIN_WARM", DEFAULT_CONFIG.workspaceMinWarm),
    workspaceMaxWorkers: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS", "HERMES_WEB_GATEWAY_WORKSPACE_MAX_WORKERS", DEFAULT_CONFIG.workspaceMaxWorkers),
    workspaceDeepSeekMaxWorkers: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS", "HERMES_WEB_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS", DEFAULT_CONFIG.workspaceDeepSeekMaxWorkers),
    globalMaxWorkers: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS", "HERMES_WEB_GATEWAY_ELASTIC_MAX_WORKERS", DEFAULT_CONFIG.globalMaxWorkers),
    idleTtlMs: Math.max(0, idleMinutes * 60_000),
    startTimeoutMs: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_START_TIMEOUT_MS", "HERMES_WEB_GATEWAY_START_TIMEOUT_MS", DEFAULT_CONFIG.startTimeoutMs),
    startHealthWaitMs: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS", "HERMES_WEB_GATEWAY_START_HEALTH_WAIT_MS", DEFAULT_CONFIG.startHealthWaitMs),
    startHealthPollMs: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_START_HEALTH_POLL_MS", "HERMES_WEB_GATEWAY_START_HEALTH_POLL_MS", DEFAULT_CONFIG.startHealthPollMs),
    queueWaitTimeoutMs: readEnvInteger(env, "HERMES_MOBILE_GATEWAY_QUEUE_WAIT_TIMEOUT_MS", "HERMES_WEB_GATEWAY_QUEUE_WAIT_TIMEOUT_MS", DEFAULT_CONFIG.queueWaitTimeoutMs),
  };
}

function mergeConfig(config = {}) {
  const normalized = normalizeElasticSchedulerConfig(config);
  return Object.assign({}, DEFAULT_CONFIG, normalized, config);
}

function actorWorkspaceId(hints = {}, worker = {}) {
  const allowedWorkspaceIds = Array.isArray(worker.allowedWorkspaceIds)
    ? worker.allowedWorkspaceIds.map((item) => cleanString(item)).filter((item) => item && item !== "*" && item.toLowerCase() !== "all")
    : [];
  const skillWorkspaceIds = Array.isArray(worker.skillWorkspaceIds)
    ? worker.skillWorkspaceIds.map((item) => cleanString(item)).filter((item) => item && item !== "*" && item.toLowerCase() !== "all")
    : [];
  return cleanString(
    hints.workspaceId
    || hints.workspace_id
    || hints.skillWorkspaceId
    || hints.skill_workspace_id
    || (allowedWorkspaceIds.length === 1 ? allowedWorkspaceIds[0] : "")
    || (skillWorkspaceIds.length === 1 ? skillWorkspaceIds[0] : "")
    || "owner",
  ) || "owner";
}

function hasExplicitWorkspaceHint(hints = {}) {
  return Boolean(cleanString(
    hints.workspaceId
    || hints.workspace_id
    || hints.skillWorkspaceId
    || hints.skill_workspace_id,
  ));
}

function workerHasWildcardWorkspace(worker = {}) {
  const values = [
    ...(Array.isArray(worker.allowedWorkspaceIds) ? worker.allowedWorkspaceIds : []),
    ...(Array.isArray(worker.skillWorkspaceIds) ? worker.skillWorkspaceIds : []),
  ].map((item) => cleanString(item).toLowerCase());
  return values.includes("*") || values.includes("all");
}

function actorClassForWorkspace(workspaceId) {
  return cleanString(workspaceId) === "owner" ? "owner" : "workspace";
}

function permissionTier(worker = {}, hints = {}) {
  const level = cleanString(hints.securityLevel || hints.security_level || worker.securityLevel || "user").toLowerCase();
  if (["owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"].includes(level.replaceAll("_", "-"))) {
    return "owner-maintenance";
  }
  return "user";
}

function providerKey(worker = {}, hints = {}) {
  return cleanString(hints.provider || hints.provider_id || worker.provider || "openai-codex") || "openai-codex";
}

function listKey(value) {
  const items = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",") : []);
  return items.map((item) => cleanString(item)).filter(Boolean).sort().join(",");
}

function buildGatewayWorkerCompatibilityKey(worker = {}, hints = {}) {
  const workspaceId = actorWorkspaceId(hints, worker);
  return [
    `workspace=${workspaceId}`,
    `actor=${actorClassForWorkspace(workspaceId)}`,
    `template=${buildGatewayWorkerTemplateKey(worker, hints)}`,
    `profile=${cleanString(worker.profile || hints.worker_profile || hints.profile)}`,
    `provider=${providerKey(worker, hints)}`,
    `tier=${permissionTier(worker, hints)}`,
    `toolsets=${listKey(hints.enabledToolsets || hints.enabled_toolsets || hints.toolsets || [])}`,
    `schema=${cleanString(hints.toolSchemaEpoch || hints.tool_schema_epoch || "")}`,
    `capability=${workerCapabilityHash(worker)}`,
    `skill=${cleanString(hints.skillProfile || hints.skill_profile || worker.skillProfile || "")}`,
    `skillWorkspaces=${listKey(hints.skillWorkspaceId || hints.skill_workspace_id || worker.skillWorkspaceIds || [])}`,
    `api=${cleanString(worker.apiBase)}`,
  ].join("|");
}

function buildGatewayWorkerTemplateKey(worker = {}, hints = {}) {
  return [
    actorWorkspaceId(hints, worker),
    permissionTier(worker, hints),
    providerKey(worker, hints),
  ].join("|");
}

function workerCapabilityHash(worker = {}) {
  return cleanString(worker.capabilityHash || worker.materializedCapabilityHash || "");
}

function workerCapabilityStatus(worker = {}) {
  const status = cleanString(worker.capabilityStatus || "");
  if (status) return status;
  return workerCapabilityHash(worker) ? "ok" : "unknown";
}

function workerToolSchemaEpoch(worker = {}, hints = {}) {
  return cleanString(worker.toolSchemaEpoch || hints.toolSchemaEpoch || hints.tool_schema_epoch || "");
}

function rememberMaterializedIdentity(state, worker = {}, hints = {}, options = {}) {
  if (!state) return;
  const overwrite = Boolean(options.overwrite);
  const templateKey = cleanString(worker.templateKey || worker.materializedTemplateKey || buildGatewayWorkerTemplateKey(worker, hints));
  const capabilityHash = workerCapabilityHash(worker);
  const schemaEpoch = workerToolSchemaEpoch(worker, hints);
  if (overwrite || !state.materializedTemplateKey) state.materializedTemplateKey = templateKey;
  if (overwrite || !state.materializedCapabilityHash) state.materializedCapabilityHash = capabilityHash;
  if (overwrite || !state.capabilityStatus) state.capabilityStatus = workerCapabilityStatus(worker);
  if (overwrite || !state.toolSchemaEpoch) state.toolSchemaEpoch = schemaEpoch;
}

function clearMaterializedIdentity(state) {
  if (!state) return;
  state.materializedTemplateKey = "";
  state.materializedCapabilityHash = "";
  state.capabilityStatus = "";
  state.toolSchemaEpoch = "";
}

function materializedIdentityMatches(worker = {}, state = {}, hints = {}) {
  const expectedTemplateKey = buildGatewayWorkerTemplateKey(worker, hints);
  const configuredTemplateKey = cleanString(worker.templateKey || "");
  if (configuredTemplateKey && configuredTemplateKey !== expectedTemplateKey) return false;
  if (state.materializedTemplateKey && state.materializedTemplateKey !== expectedTemplateKey) return false;
  const expectedHash = workerCapabilityHash(worker);
  if (state.materializedCapabilityHash && expectedHash && state.materializedCapabilityHash !== expectedHash) return false;
  return true;
}

function sanitizeFailureMessage(err) {
  const code = cleanString(err?.code || err?.reason || "start_failed");
  const parts = [];
  const message = cleanString(err?.message || err || "");
  if (message) parts.push(message);
  const stderr = cleanString(err?.details?.stderr);
  const stdout = cleanString(err?.details?.stdout);
  if (stderr) parts.push(`stderr: ${stderr}`);
  if (stdout) parts.push(`stdout: ${stdout}`);
  if (!parts.length) parts.push(code);
  return parts.join(" | ")
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\bkey\s+[^\s;,.]+/gi, "key [redacted]")
    .slice(0, 240);
}

function createTimeout(setTimeoutFn, clearTimeoutFn, ms, onTimeout) {
  if (!ms || ms <= 0 || typeof setTimeoutFn !== "function") return () => {};
  const timer = setTimeoutFn(onTimeout, ms);
  if (timer && typeof timer.unref === "function") timer.unref();
  return () => {
    if (typeof clearTimeoutFn === "function") clearTimeoutFn(timer);
  };
}

function publicState(worker, state = null, nowMs = Date.now()) {
  const lifecycle = state?.state || "configured";
  const expectedRunning = STARTED_STATES.has(lifecycle);
  const healthy = lifecycle === "configured" || lifecycle === "retired"
    ? null
    : (state?.healthy == null ? null : Boolean(state.healthy));
  return {
    id: worker.id,
    name: worker.name,
    profile: worker.profile,
    apiBase: worker.apiBase,
    provider: worker.provider,
    tags: worker.tags || [],
    securityLevel: worker.securityLevel,
    allowedWorkspaceIds: worker.allowedWorkspaceIds || [],
    allowMaintenance: Boolean(worker.allowMaintenance),
    skillProfile: worker.skillProfile || "",
    skillWorkspaceIds: worker.skillWorkspaceIds || [],
    templateKey: worker.templateKey || buildGatewayWorkerTemplateKey(worker),
    capabilityHash: worker.capabilityHash || "",
    capabilityStatus: worker.capabilityStatus || "",
    toolSchemaEpoch: worker.toolSchemaEpoch || state?.toolSchemaEpoch || "",
    materializedTemplateKey: state?.materializedTemplateKey || "",
    materializedCapabilityHash: state?.materializedCapabilityHash || "",
    healthy,
    state: lifecycle,
    lifecycleState: lifecycle,
    expectedRunning,
    activeRunCount: state?.activeRunIds?.size || 0,
    queueDepth: 0,
    idleSince: state?.idleSince || null,
    idleExpiresAt: state?.idleExpiresAt || null,
    lastStartDurationMs: state?.lastStartDurationMs || 0,
    lastFailureCode: state?.lastFailureCode || "",
    lastFailureAt: state?.lastFailureAt || null,
    warmReusableUntil: state?.idleExpiresAt && state.idleExpiresAt > nowMs ? new Date(state.idleExpiresAt).toISOString() : "",
  };
}

function createGatewayElasticWorkerScheduler(options = {}) {
  const config = mergeConfig(options.config || {});
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const setTimeoutFn = options.setTimeout || setTimeout;
  const clearTimeoutFn = options.clearTimeout || clearTimeout;
  const sleep = typeof options.sleep === "function"
    ? options.sleep
    : (ms) => new Promise((resolve) => {
      const timer = setTimeoutFn(resolve, Math.max(0, Number(ms) || 0));
      if (timer && typeof timer.unref === "function") timer.unref();
    });
  const isHealthy = typeof options.isHealthy === "function" ? options.isHealthy : async () => false;
  const startWorker = typeof options.startWorker === "function" ? options.startWorker : async () => ({ ok: false, reason: "start_worker_unavailable" });
  const stopWorker = typeof options.stopWorker === "function" ? options.stopWorker : async () => ({ ok: true });
  const stateByWorkerId = new Map();
  const workerById = new Map();
  const runAssignments = new Map();
  const waiters = [];
  let nextSyntheticRunId = 1;

  function getState(worker) {
    const id = cleanString(worker?.id || worker?.profile || worker?.apiBase);
    if (!id) return null;
    workerById.set(id, worker);
    if (!stateByWorkerId.has(id)) {
      stateByWorkerId.set(id, {
        workerId: id,
        state: "configured",
        activeRunIds: new Set(),
        compatibilityKey: "",
        workspaceId: "",
        actorClass: "",
        provider: cleanString(worker.provider),
        permissionTier: permissionTier(worker),
        healthy: null,
        materializedTemplateKey: "",
        materializedCapabilityHash: "",
        capabilityStatus: "",
        toolSchemaEpoch: "",
        idleSince: null,
        idleExpiresAt: null,
        lastStartDurationMs: 0,
        lastFailureCode: "",
        lastFailureAt: null,
        idleCancel: null,
      });
    }
    return stateByWorkerId.get(id);
  }

  function startedStates() {
    return [...stateByWorkerId.values()].filter((item) => STARTED_STATES.has(item.state));
  }

  function runningCountForWorkspace(workspaceId, tier = "", provider = "") {
    const requestedTier = cleanString(tier);
    const requestedProvider = cleanString(provider);
    return startedStates().filter((item) => (
      item.workspaceId === workspaceId
      && (!requestedTier || item.permissionTier === requestedTier)
      && (!requestedProvider || item.provider === requestedProvider)
    )).length;
  }

  function maxForWorkspace(workspaceId, tier = "", provider = "") {
    if (cleanString(tier) === "owner-maintenance") return config.ownerMaintenanceMaxWorkers;
    const actorClass = actorClassForWorkspace(workspaceId);
    if (cleanString(provider) === "deepseek") {
      return actorClass === "owner" ? config.ownerDeepSeekMaxWorkers : config.workspaceDeepSeekMaxWorkers;
    }
    return actorClass === "owner" ? config.ownerMaxWorkers : config.workspaceMaxWorkers;
  }

  function queueDepthForWorkspace(workspaceId) {
    return waiters.filter((item) => item.workspaceId === workspaceId).length;
  }

  function emit(onEvent, event) {
    if (typeof onEvent !== "function") return;
    onEvent(Object.assign({
      timestampMs: nowMs(),
      tool: "hermes_mobile",
      error: false,
    }, event));
  }

  function schedulerEvent(eventName, worker, state, hints, extra = {}) {
    const workspaceId = actorWorkspaceId(hints, worker);
    return Object.assign({
      event: eventName,
      reason: extra.reason || "",
      workerId: cleanString(worker?.id),
      profileId: cleanString(worker?.profile),
      provider: providerKey(worker, hints),
      workspaceId,
      permissionTier: permissionTier(worker, hints),
      templateKey: buildGatewayWorkerTemplateKey(worker, hints),
      materializedTemplateKey: state?.materializedTemplateKey || "",
      materializedCapabilityHash: state?.materializedCapabilityHash || "",
      state: state?.state || "configured",
      activeRunCount: state?.activeRunIds?.size || 0,
      queueDepth: queueDepthForWorkspace(workspaceId),
      warmUntil: state?.idleExpiresAt ? new Date(state.idleExpiresAt).toISOString() : "",
      idleSince: state?.idleSince ? new Date(state.idleSince).toISOString() : "",
      idleExpiresAt: state?.idleExpiresAt ? new Date(state.idleExpiresAt).toISOString() : "",
      lastStartDurationMs: state?.lastStartDurationMs || 0,
      lastFailureCode: state?.lastFailureCode || "",
      lastFailureAt: state?.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : "",
    }, extra);
  }

  function assignRun(worker, state, runId, hints, reason) {
    const id = cleanString(runId);
    if (id) {
      state.activeRunIds.add(id);
      runAssignments.set(id, state.workerId);
    }
    state.state = state.activeRunIds.size ? "busy" : "warm";
    state.workspaceId = actorWorkspaceId(hints, worker);
    state.actorClass = actorClassForWorkspace(state.workspaceId);
    state.provider = providerKey(worker, hints);
    state.permissionTier = permissionTier(worker, hints);
    state.compatibilityKey = buildGatewayWorkerCompatibilityKey(worker, hints);
    rememberMaterializedIdentity(state, worker, hints);
    state.idleSince = null;
    state.idleExpiresAt = null;
    if (state.idleCancel) {
      state.idleCancel();
      state.idleCancel = null;
    }
    return Object.assign({}, worker, {
      pooled: true,
      source: "worker_pool",
      schedulerRunId: id,
      schedulerEvent: schedulerEvent(
        reason === "worker_reused" ? "run.gateway_worker_reused" : "run.gateway_worker_started",
        worker,
        state,
        hints,
        { reason },
      ),
    });
  }

  async function markExistingHealthy(worker, state, hints) {
    const healthy = await isHealthy(worker);
    state.healthy = healthy;
    if (!healthy) return false;
    if (!STARTED_STATES.has(state.state) || state.state === "configured" || state.state === "failed" || state.state === "retired") {
      state.state = "warm";
      state.workspaceId = actorWorkspaceId(hints, worker);
      state.actorClass = actorClassForWorkspace(state.workspaceId);
      state.provider = providerKey(worker, hints);
      state.permissionTier = permissionTier(worker, hints);
      state.compatibilityKey = buildGatewayWorkerCompatibilityKey(worker, hints);
    }
    rememberMaterializedIdentity(state, worker, hints);
    return true;
  }

  async function waitForStartedHealthy(worker) {
    if (await isHealthy(worker)) return true;
    const waitMs = Math.max(0, Number(config.startHealthWaitMs || 0) || 0);
    if (!waitMs) return false;
    const pollMs = Math.max(100, Number(config.startHealthPollMs || 1000) || 1000);
    const deadline = nowMs() + waitMs;
    while (nowMs() < deadline) {
      await sleep(Math.min(pollMs, Math.max(1, deadline - nowMs())));
      if (await isHealthy(worker)) return true;
    }
    return false;
  }

  function chooseReusable(candidates, hints) {
    const key = (worker) => buildGatewayWorkerCompatibilityKey(worker, hints);
    for (const worker of candidates) {
      const state = getState(worker);
      if (!state || state.state === "failed" || state.state === "retired" || state.state === "starting") continue;
      if (!STARTED_STATES.has(state.state)) continue;
      if (state.activeRunIds.size > 0) continue;
      const expectedKey = key(worker);
      if (!materializedIdentityMatches(worker, state, hints)) continue;
      if (state.compatibilityKey && state.compatibilityKey !== expectedKey) {
        if (!["warm", "idle"].includes(state.state)) continue;
        state.compatibilityKey = expectedKey;
      }
      return { worker, state };
    }
    return null;
  }

  function chooseStartable(candidates) {
    for (const worker of candidates) {
      const state = getState(worker);
      if (!state) continue;
      if (!STARTED_STATES.has(state.state) || state.state === "failed" || state.state === "retired") return { worker, state };
    }
    return null;
  }

  function capacityReason(candidates, hints) {
    const workspaceId = actorWorkspaceId(hints, candidates[0]);
    if (config.globalMaxWorkers && startedStates().length >= config.globalMaxWorkers) return "global_capacity";
    const requestedTier = permissionTier(candidates[0], hints);
    const requestedProvider = providerKey(candidates[0], hints);
    const maxWorkspace = maxForWorkspace(workspaceId, requestedTier, requestedProvider);
    if (maxWorkspace && runningCountForWorkspace(workspaceId, requestedTier, requestedProvider) >= maxWorkspace) return "workspace_capacity";
    return "profile_affinity";
  }

  function drainQueue() {
    const next = waiters.shift();
    if (next) next.resolve();
  }

  async function waitForCapacity(candidates, hints, runId, onEvent, reason) {
    const workspaceId = actorWorkspaceId(hints, candidates[0]);
    emit(onEvent, schedulerEvent("run.gateway_worker_queued", candidates[0] || {}, null, hints, {
      reason,
      runId: cleanString(runId),
    }));
    await new Promise((resolve, reject) => {
      const waiter = { workspaceId, resolve, reject };
      waiter.resolve = () => {
        if (waiter.cancel) waiter.cancel();
        resolve();
      };
      waiter.reject = (err) => {
        if (waiter.cancel) waiter.cancel();
        reject(err);
      };
      waiter.cancel = createTimeout(setTimeoutFn, clearTimeoutFn, config.queueWaitTimeoutMs, () => {
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) waiters.splice(idx, 1);
        const err = new Error(`Gateway worker queue timed out for ${reason}.`);
        err.status = 503;
        err.code = "gateway_elastic_queue_timeout";
        err.details = { reason, workspaceId, queueDepth: queueDepthForWorkspace(workspaceId) };
        waiter.reject(err);
      });
      waiters.push(waiter);
    });
  }

  async function startAndAssign(worker, state, hints, runId, onEvent) {
    const startedAt = nowMs();
    state.state = "starting";
    state.workspaceId = actorWorkspaceId(hints, worker);
    state.actorClass = actorClassForWorkspace(state.workspaceId);
    state.compatibilityKey = buildGatewayWorkerCompatibilityKey(worker, hints);
    state.healthy = null;
    emit(onEvent, schedulerEvent("run.gateway_worker_starting", worker, state, hints, {
      reason: "worker_starting",
      runId: cleanString(runId),
    }));
    try {
      await startWorker(worker, { hints, runId, timeoutMs: config.startTimeoutMs });
      const healthy = await waitForStartedHealthy(worker);
      state.healthy = healthy;
      if (!healthy) {
        const err = new Error("Gateway worker did not become healthy after start.");
        err.code = "health_check_failed";
        throw err;
      }
      state.lastStartDurationMs = Math.max(0, nowMs() - startedAt);
      state.lastFailureCode = "";
      state.lastFailureAt = null;
      rememberMaterializedIdentity(state, worker, hints, { overwrite: true });
      return assignRun(worker, state, runId, hints, "worker_started");
    } catch (err) {
      state.state = "failed";
      state.healthy = false;
      state.lastFailureCode = cleanString(err?.code || "start_failed");
      state.lastFailureAt = nowMs();
      const event = schedulerEvent("run.gateway_worker_start_failed", worker, state, hints, {
        reason: "worker_start_failed",
        runId: cleanString(runId),
        failureCode: state.lastFailureCode,
        diagnostic: sanitizeFailureMessage(err),
      });
      emit(onEvent, event);
      const out = new Error("Gateway worker failed to start.");
      out.status = 503;
      out.code = "gateway_elastic_worker_start_failed";
      out.details = event;
      throw out;
    }
  }

  async function chooseTarget(input = {}) {
    const candidates = Array.isArray(input.candidates) ? input.candidates.filter(Boolean) : [];
    const hints = input.hints || {};
    const runId = cleanString(input.runId || hints.runId || hints.run_id || `gateway_elastic_${nowMs()}_${nextSyntheticRunId++}`);
    const onEvent = input.onEvent;
    if (!candidates.length) {
      const err = new Error("No compatible Gateway worker profile is configured.");
      err.status = 503;
      err.code = "gateway_elastic_no_matching_worker";
      throw err;
    }

    while (true) {
      const reusable = chooseReusable(candidates, hints);
      if (reusable && await markExistingHealthy(reusable.worker, reusable.state, hints)) {
        if (!materializedIdentityMatches(reusable.worker, reusable.state, hints)) continue;
        const target = assignRun(reusable.worker, reusable.state, runId, hints, "worker_reused");
        emit(onEvent, Object.assign({}, target.schedulerEvent, { runId }));
        return target;
      }

      const workspaceId = actorWorkspaceId(hints, candidates[0]);
      const startable = chooseStartable(candidates);
      const requestedTier = permissionTier(startable?.worker || candidates[0], hints);
      const requestedProvider = providerKey(startable?.worker || candidates[0], hints);
      const maxWorkspace = maxForWorkspace(workspaceId, requestedTier, requestedProvider);
      if (startable && await markExistingHealthy(startable.worker, startable.state, hints)) {
        if (!materializedIdentityMatches(startable.worker, startable.state, hints)) continue;
        const target = assignRun(startable.worker, startable.state, runId, hints, "worker_reused");
        emit(onEvent, Object.assign({}, target.schedulerEvent, { runId }));
        return target;
      }
      const canStart = startable
        && (!config.globalMaxWorkers || startedStates().length < config.globalMaxWorkers)
        && (!maxWorkspace || runningCountForWorkspace(workspaceId, requestedTier, requestedProvider) < maxWorkspace);
      if (canStart) {
        const target = await startAndAssign(startable.worker, startable.state, hints, runId, onEvent);
        emit(onEvent, Object.assign({}, target.schedulerEvent, { runId }));
        return target;
      }

      await waitForCapacity(candidates, hints, runId, onEvent, capacityReason(candidates, hints));
    }
  }

  function scheduleIdleStop(worker, state) {
    if (!config.idleTtlMs) return;
    state.idleCancel = createTimeout(setTimeoutFn, clearTimeoutFn, config.idleTtlMs, () => {
      reapIdle([worker]).catch(() => {});
    });
  }

  function releaseRun(runId, idleStatus = "idle") {
    const id = cleanString(runId);
    const workerId = runAssignments.get(id);
    if (!workerId) {
      drainQueue();
      return false;
    }
    const state = stateByWorkerId.get(workerId);
    const worker = workerById.get(workerId);
    runAssignments.delete(id);
    if (!state) {
      drainQueue();
      return false;
    }
    state.activeRunIds.delete(id);
    if (state.activeRunIds.size) {
      state.state = "busy";
      drainQueue();
      return true;
    }
    if (idleStatus === "failed") {
      state.state = "failed";
      state.healthy = false;
    } else if (idleStatus === "retired") {
      state.state = "configured";
      state.healthy = null;
      state.compatibilityKey = "";
      state.workspaceId = "";
      state.actorClass = "";
      clearMaterializedIdentity(state);
    } else {
      state.state = "idle";
      state.idleSince = nowMs();
      state.idleExpiresAt = state.idleSince + config.idleTtlMs;
      if (worker && workerHasWildcardWorkspace(worker)) state.compatibilityKey = "";
      if (worker) scheduleIdleStop(worker, state);
    }
    drainQueue();
    return true;
  }

  function replaceRun(oldRunId, newRunId) {
    const oldId = cleanString(oldRunId);
    const newId = cleanString(newRunId);
    if (!oldId || !newId || oldId === newId) return false;
    const workerId = runAssignments.get(oldId);
    if (!workerId) return false;
    const existingNewWorkerId = runAssignments.get(newId);
    if (existingNewWorkerId && existingNewWorkerId !== workerId) return false;
    const state = stateByWorkerId.get(workerId);
    runAssignments.delete(oldId);
    runAssignments.set(newId, workerId);
    if (state) {
      state.activeRunIds.delete(oldId);
      state.activeRunIds.add(newId);
      state.state = state.activeRunIds.size ? "busy" : "warm";
    }
    return true;
  }

  async function reapIdle(workers = []) {
    const stopped = [];
    const now = nowMs();
    for (const worker of Array.isArray(workers) ? workers : []) {
      const state = getState(worker);
      if (!state || state.state !== "idle" || state.activeRunIds.size) continue;
      if (state.idleExpiresAt && state.idleExpiresAt > now) continue;
      state.state = "idle_stopping";
      try {
        await stopWorker(worker);
        state.state = "configured";
        state.healthy = null;
        state.compatibilityKey = "";
        state.workspaceId = "";
        state.actorClass = "";
        clearMaterializedIdentity(state);
        state.idleSince = null;
        state.idleExpiresAt = null;
        stopped.push(worker.profile || worker.id);
      } catch (err) {
        state.state = "failed";
        state.healthy = false;
        state.lastFailureCode = cleanString(err?.code || "stop_failed");
        state.lastFailureAt = nowMs();
      }
    }
    if (stopped.length) drainQueue();
    return stopped;
  }

  function markWorkerWarm(worker, hints = {}) {
    const state = getState(worker);
    if (state.activeRunIds.size) {
      state.state = "busy";
      state.healthy = true;
      return state;
    }
    state.state = "warm";
    state.healthy = true;
    state.workspaceId = actorWorkspaceId(hints, worker);
    state.actorClass = actorClassForWorkspace(state.workspaceId);
    state.provider = providerKey(worker, hints);
    state.permissionTier = permissionTier(worker, hints);
    state.compatibilityKey = hasExplicitWorkspaceHint(hints)
      ? buildGatewayWorkerCompatibilityKey(worker, hints)
      : (state.compatibilityKey || "");
    rememberMaterializedIdentity(state, worker, hints);
    drainQueue();
    return state;
  }

  function markWorkerUnavailable(worker) {
    const state = getState(worker);
    if (!state) return null;
    state.healthy = false;
    if (!state.activeRunIds.size && state.state !== "starting") {
      state.state = "configured";
      state.compatibilityKey = "";
      state.workspaceId = "";
      state.actorClass = "";
      clearMaterializedIdentity(state);
      state.idleSince = null;
      state.idleExpiresAt = null;
      if (state.idleCancel) {
        state.idleCancel();
        state.idleCancel = null;
      }
    }
    return state;
  }

  function planHybridStartup(workers = []) {
    const candidates = (Array.isArray(workers) ? workers : [])
      .filter((worker) => permissionTier(worker) === "user")
      .filter((worker) => providerKey(worker) === "openai-codex")
      .filter((worker) => {
        const allowed = worker.allowedWorkspaceIds || [];
        const skills = worker.skillWorkspaceIds || [];
        return allowed.includes("owner") || skills.includes("owner") || worker.profile === "lowgw1";
      });
    const ownerWarm = candidates.slice(0, config.ownerMinWarm).map((item) => item.profile || item.id).filter(Boolean);
    return {
      mode: "hybrid",
      ownerWarmProfiles: ownerWarm,
      nonOwnerWarmProfiles: [],
      startProfiles: ownerWarm,
    };
  }

  function status(workers = []) {
    const now = nowMs();
    const publicWorkers = (Array.isArray(workers) ? workers : []).map((worker) => publicState(worker, stateByWorkerId.get(worker.id), now));
    return {
      mode: "hybrid",
      elastic: true,
      config: {
        ownerMinWarm: config.ownerMinWarm,
        ownerMaxWorkers: config.ownerMaxWorkers,
        ownerDeepSeekMaxWorkers: config.ownerDeepSeekMaxWorkers,
        ownerMaintenanceMaxWorkers: config.ownerMaintenanceMaxWorkers,
        workspaceMinWarm: config.workspaceMinWarm,
        workspaceMaxWorkers: config.workspaceMaxWorkers,
        workspaceDeepSeekMaxWorkers: config.workspaceDeepSeekMaxWorkers,
        globalMaxWorkers: config.globalMaxWorkers,
        idleTtlMs: config.idleTtlMs,
      },
      queueDepth: waiters.length,
      runningWorkerCount: publicWorkers.filter((worker) => worker.expectedRunning).length,
      workers: publicWorkers,
    };
  }

  return {
    chooseTarget,
    markWorkerWarm,
    markWorkerUnavailable,
    planHybridStartup,
    reapIdle,
    releaseRun,
    replaceRun,
    status,
  };
}

module.exports = {
  buildGatewayWorkerCompatibilityKey,
  buildGatewayWorkerTemplateKey,
  createGatewayElasticWorkerScheduler,
  normalizeElasticSchedulerConfig,
};
