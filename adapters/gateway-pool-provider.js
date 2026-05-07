"use strict";

const fs = require("node:fs");

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
  return {
    id: worker.id,
    name: worker.name,
    profile: worker.profile,
    apiBase: worker.apiBase,
    provider: worker.provider,
    tags: worker.tags,
    healthy: health == null ? null : Boolean(health),
  };
}

function matchesExact(worker, hints = {}) {
  const profiles = new Set([...cleanList(hints.worker_profile), ...cleanList(hints.worker_profiles)]);
  const names = new Set([...cleanList(hints.worker_name), ...cleanList(hints.worker_names)]);
  if (profiles.size && !profiles.has(worker.profile)) return false;
  if (names.size && !names.has(worker.name)) return false;
  return Boolean(profiles.size || names.size);
}

function satisfiesFilter(worker, hints = {}) {
  const provider = String(hints.provider || "").trim();
  if (provider && worker.provider !== provider) return false;
  const requiredTags = cleanList(hints.worker_tags);
  if (requiredTags.length) {
    const tags = new Set(worker.tags || []);
    if (!requiredTags.every((tag) => tags.has(tag))) return false;
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
      ? (read.manifest.workers || []).map(normalizeWorker).filter(Boolean)
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

  async function chooseTarget(hints = {}) {
    const loaded = load();
    if (!loaded.enabled) {
      return Object.assign(fallbackTarget(), {
        reason: loaded.error ? `manifest_error:${loaded.error.message || loaded.error}` : "pool_unavailable",
      });
    }
    const candidates = orderedWorkers(loaded.workers, nextIndex, hints);
    if (!candidates.length) {
      return Object.assign(fallbackTarget(), { reason: "no_matching_worker" });
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
    runnerFor,
    status,
    targetForGatewayUrl,
  };
}

module.exports = {
  createGatewayPoolProvider,
  normalizeWorker,
  orderedWorkers,
};
