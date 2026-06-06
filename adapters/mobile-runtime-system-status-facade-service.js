"use strict";

function createMobileRuntimeSystemStatusFacadeService(options = {}) {
  const createSystemRuntimeStatusService = options.createSystemRuntimeStatusService;
  if (typeof createSystemRuntimeStatusService !== "function") {
    throw new Error("MobileRuntimeSystemStatusFacadeService requires createSystemRuntimeStatusService");
  }

  const allowWslReasoningConfigLookup = Boolean(options.allowWslReasoningConfigLookup);
  const compactText = typeof options.compactText === "function" ? options.compactText : (value) => String(value || "");
  const dedupe = typeof options.dedupe === "function"
    ? options.dedupe
    : (values = []) => [...new Set((values || []).filter(Boolean))];
  const env = options.env || process.env;
  const explicitHermesConfigPaths = options.explicitHermesConfigPaths || new Set();
  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
  const fs = options.fs;
  const gatewayPool = typeof options.gatewayPool === "function" ? options.gatewayPool : () => null;
  const gatewayUsageTelemetryProfileRoots = Array.isArray(options.gatewayUsageTelemetryProfileRoots)
    ? options.gatewayUsageTelemetryProfileRoots
    : [];
  const hermesConfigPaths = Array.isArray(options.hermesConfigPaths) ? options.hermesConfigPaths : [];
  const isUncPath = typeof options.isUncPath === "function" ? options.isUncPath : () => false;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const path = options.path;
  const processRef = options.process || process;
  const runProcessText = options.runProcessText;
  const updateCheckTimeoutMs = Number(options.updateCheckTimeoutMs || 8000);
  let systemRuntimeStatusService = null;

  function configPathReadableForRuntimeInfo(configPath) {
    const text = String(configPath || "").trim();
    return Boolean(text && (
      !isUncPath(text)
      || explicitHermesConfigPaths.has(text)
      || allowWslReasoningConfigLookup
    ));
  }

  function gatewayPoolConfigPathCandidates() {
    const candidates = [];
    try {
      const loaded = gatewayPool()?.load?.() || {};
      for (const worker of loaded.workers || []) {
        for (const dbPath of [worker.telemetryStateDbPath, worker.telemetryResponseStoreDbPath]) {
          if (dbPath) candidates.push(path.join(path.dirname(dbPath), "config.yaml"));
        }
        for (const root of gatewayUsageTelemetryProfileRoots) {
          if (worker.profile) candidates.push(path.join(root, worker.profile, "config.yaml"));
          if (worker.telemetryProfile && worker.telemetryProfile !== worker.profile) {
            candidates.push(path.join(root, worker.telemetryProfile, "config.yaml"));
          }
        }
      }
    } catch (_) {}
    return candidates;
  }

  function runtimeConfigPathCandidates() {
    const base = hermesConfigPaths.filter(configPathReadableForRuntimeInfo);
    return dedupe([...gatewayPoolConfigPathCandidates(), ...base]).filter(configPathReadableForRuntimeInfo);
  }

  async function fetchTextWithTimeout(url, timeoutMs = updateCheckTimeoutMs) {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || updateCheckTimeoutMs)),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  }

  function getSystemRuntimeStatusService() {
    if (!systemRuntimeStatusService) {
      systemRuntimeStatusService = createSystemRuntimeStatusService({
        compactText,
        env,
        fetchText: fetchTextWithTimeout,
        fs,
        indexHtmlPath: options.indexHtmlPath,
        nowIso,
        path,
        process: processRef,
        repoRoot: options.repoRoot,
        runProcessText,
        runtimeConfigPathCandidates,
        updateBranch: options.updateBranch,
        updateCheckTimeoutMs,
        updateRemoteName: options.updateRemoteName,
        updateVersionUrl: options.updateVersionUrl,
      });
    }
    return systemRuntimeStatusService;
  }

  function runtimeModelConfigInfo() {
    return getSystemRuntimeStatusService().runtimeModelConfigInfo();
  }

  function defaultReasoningInfo() {
    return runtimeModelConfigInfo();
  }

  function readClientVersion() {
    return getSystemRuntimeStatusService().readClientVersion();
  }

  function clientVersionInfo(clientVersion = "") {
    return getSystemRuntimeStatusService().clientVersionInfo(clientVersion);
  }

  async function appUpdateStatus() {
    return getSystemRuntimeStatusService().appUpdateStatus();
  }

  async function applyAppUpdate() {
    return getSystemRuntimeStatusService().applyAppUpdate();
  }

  return Object.freeze({
    appUpdateStatus,
    applyAppUpdate,
    clientVersionInfo,
    configPathReadableForRuntimeInfo,
    defaultReasoningInfo,
    gatewayPoolConfigPathCandidates,
    getSystemRuntimeStatusService,
    readClientVersion,
    runtimeConfigPathCandidates,
    runtimeModelConfigInfo,
  });
}

module.exports = {
  createMobileRuntimeSystemStatusFacadeService,
};
