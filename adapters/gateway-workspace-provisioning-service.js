"use strict";

const crypto = require("node:crypto");
const {
  annotateGatewayManifestReplicaMetadata,
  annotateGatewayWorkerReplicaMetadata,
} = require("./gateway-pool-manifest-replica-metadata-service");

function cleanWorkspaceId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function skillStorePathForWorkspace(path, manifestPath, workspaceId, configuredRoot = "") {
  const profilesRoot = String(configuredRoot || "").trim() || path.join(path.dirname(manifestPath), "skill-profiles");
  return path.join(profilesRoot, workspaceId, "skills");
}

function lowGatewayIndex(worker) {
  const text = String(worker?.profile || worker?.name || "");
  const match = text.match(/^lowgw(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function grokGatewayIndex(worker) {
  const text = String(worker?.profile || worker?.name || "");
  const match = text.match(/^grokgw(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function deepseekGatewayIndex(worker) {
  const text = String(worker?.profile || worker?.name || "");
  const match = text.match(/^deepseekgw(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function workerPort(worker) {
  const port = Number(worker?.port || 0);
  return Number.isFinite(port) && port > 0 ? port : 0;
}

function providerName(worker) {
  return String(worker?.provider || "").trim() || "openai-codex";
}

function workspaceIdsForWorker(worker) {
  return cleanList(worker?.allowedWorkspaceIds || worker?.allowed_workspace_ids);
}

function macUserForWorker(worker = {}) {
  const explicit = String(worker.osUser || worker.os_user || "").trim();
  if (explicit) return explicit;
  const label = String(worker.launchdLabel || worker.launchd_label || "").trim();
  const labelMatch = label.match(/^com\.hermesmobile\.gateway\.(hm-[a-z0-9-]+)\./i);
  if (labelMatch) return labelMatch[1];
  const profile = String(worker.profile || worker.name || "").trim();
  const profileMatch = profile.match(/^(hm-[a-z0-9-]+)-/i);
  return profileMatch ? profileMatch[1] : "";
}

function macUserForWorkspace(workspaceId) {
  const suffix = cleanWorkspaceId(workspaceId).replace(/_/g, "-");
  return suffix ? `hm-${suffix}` : "";
}

function gatewayIndexForProvider(worker, provider) {
  return provider === "deepseek" ? deepseekGatewayIndex(worker) : lowGatewayIndex(worker);
}

function profilePrefixForProvider(provider) {
  return provider === "deepseek" ? "deepseekgw" : "lowgw";
}

function keyFamilyForProvider(provider) {
  return provider === "deepseek" ? "deepseek" : "openai";
}

function profileInUse(workers, profile) {
  return workers.some((worker) => String(worker?.profile || worker?.name || "").trim() === profile);
}

function nextGatewayIndexForProvider(workers, provider, preferredIndex = 0) {
  const prefix = profilePrefixForProvider(provider);
  const preferred = Number(preferredIndex || 0);
  if (preferred > 0 && !profileInUse(workers, `${prefix}${preferred}`)) return preferred;
  return Math.max(0, ...workers.map((worker) => gatewayIndexForProvider(worker, provider))) + 1;
}

function tagsForProvider(worker, provider) {
  const tags = cleanList(worker?.tags);
  const base = tags.length ? tags : ["official", "clean", "low-privilege", "user"];
  if (provider === "deepseek" && !base.includes("deepseek")) return [...base, "deepseek"];
  return base;
}

function nextGatewayPort(workers, lowGatewayBasePort, nextIndex) {
  const used = new Set(workers.map(workerPort).filter(Boolean));
  const highestLowOrGrokPort = workers
    .filter((worker) => lowGatewayIndex(worker) > 0 || grokGatewayIndex(worker) > 0 || deepseekGatewayIndex(worker) > 0)
    .map(workerPort)
    .reduce((max, port) => Math.max(max, port), 0);
  let port = Math.max(lowGatewayBasePort + nextIndex, highestLowOrGrokPort + 1);
  while (used.has(port)) port += 1;
  return port;
}

function replaceProfileInPath(value, profile) {
  const text = String(value || "");
  if (!text) return "";
  return text
    .replace(/profiles[\\/][^\\/]+/i, `profiles\\${profile}`)
    .replace(/(lowgw|grokgw|deepseekgw)\d+/gi, profile);
}

function firstExistingManifestPath(fs, paths) {
  for (const manifestPath of paths) {
    const resolved = String(manifestPath || "").trim();
    if (!resolved) continue;
    if (fs.existsSync(resolved)) return resolved;
  }
  return String(paths[0] || "").trim();
}

function readManifest(fs, manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (_) {
    return { enabled: true, workers: [] };
  }
}

function createGatewayWorkspaceProvisioningService(options = {}) {
  const fs = options.fs || require("node:fs");
  const path = options.path || require("node:path");
  const manifestPaths = typeof options.manifestPaths === "function" ? options.manifestPaths : (() => options.manifestPaths || []);
  const skillProfilesRoot = typeof options.skillProfilesRoot === "function" ? options.skillProfilesRoot : (() => options.skillProfilesRoot || "");
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const lowGatewayBasePort = Number(options.lowGatewayBasePort || 18750);
  const workspaceOpenAiWorkerMin = Math.max(1, Math.floor(Number(options.workspaceOpenAiWorkerMin || 2) || 2));
  const workspaceDeepSeekWorkerMin = options.workspaceDeepSeekWorkerMin == null
    ? 1
    : Math.max(0, Math.floor(Number(options.workspaceDeepSeekWorkerMin) || 0));

  function writeManifest(manifestPath, manifest) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  function gatewayWorkerSecretsDir(manifestPath) {
    return path.join(path.dirname(manifestPath), "secrets", "gateway-workers");
  }

  function ensureGatewayWorkerKeyFile(file) {
    if (!file) return "";
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${crypto.randomBytes(48).toString("base64url")}\n`, { mode: 0o600 });
    }
    try { fs.chmodSync(file, 0o600); } catch (_) {}
    return file;
  }

  function expectedWorkerApiKeyFile(manifestPath, workspaceId, worker, provider, ordinal) {
    const macUser = macUserForWorker(worker) || macUserForWorkspace(workspaceId);
    return path.join(gatewayWorkerSecretsDir(manifestPath), `${macUser}-${keyFamilyForProvider(provider)}-${ordinal}.key`);
  }

  function repairWorkspaceWorkerApiKey(manifestPath, workspaceId, worker, provider, ordinal) {
    const expected = expectedWorkerApiKeyFile(manifestPath, workspaceId, worker, provider, ordinal);
    const current = String(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path || "").trim();
    ensureGatewayWorkerKeyFile(expected);
    const changed = current !== expected
      || worker.api_key_file !== undefined
      || worker.apiKeyPath !== undefined
      || worker.api_key_path !== undefined
      || worker.apiKey !== undefined
      || worker.api_key !== undefined;
    worker.apiKeyFile = expected;
    delete worker.api_key_file;
    delete worker.apiKeyPath;
    delete worker.api_key_path;
    delete worker.apiKey;
    delete worker.api_key;
    return changed;
  }

  function repairWorkspaceWorkerReplicaMetadata(workspaceId, worker, provider) {
    const profile = String(worker.profile || worker.name || "").trim();
    if (!profile) return false;
    const templateKey = `${workspaceId}|user|${provider}`;
    const changed = worker.id !== profile
      || worker.replicaId !== profile
      || worker.profileAlias !== profile
      || worker.profileTemplateKey !== templateKey
      || worker.poolKey !== templateKey
      || worker.replica_id !== undefined
      || worker.profile_alias !== undefined
      || worker.profile_template_key !== undefined
      || worker.pool_key !== undefined;
    worker.id = profile;
    worker.replicaId = profile;
    worker.profileAlias = profile;
    worker.profileTemplateKey = templateKey;
    worker.poolKey = templateKey;
    delete worker.replica_id;
    delete worker.profile_alias;
    delete worker.profile_template_key;
    delete worker.pool_key;
    return changed;
  }

  function ensureWorkspaceSkillStore(manifestPath, workspaceId) {
    const skillStorePath = skillStorePathForWorkspace(path, manifestPath, workspaceId, skillProfilesRoot());
    const existed = fs.existsSync(skillStorePath);
    fs.mkdirSync(skillStorePath, { recursive: true });
    return { skillStorePath, skillStoreProvisioned: !existed };
  }

  function ensureWorkspaceGateway(input = {}) {
    const workspaceId = cleanWorkspaceId(input.workspaceId || input.id);
    if (!workspaceId || workspaceId === "owner") return { ok: true, skipped: true, reason: "system_workspace" };
    const inputMacUser = String(input.macUser || input.mac_user || input.osUser || input.os_user || "").trim();
    const paths = manifestPaths();
    const manifestPath = firstExistingManifestPath(fs, Array.isArray(paths) ? paths : [paths]);
    if (!manifestPath) return { ok: false, skipped: true, reason: "manifest_path_missing" };
    let skillStore = null;
    try {
      skillStore = ensureWorkspaceSkillStore(manifestPath, workspaceId);
    } catch (err) {
      return {
        ok: false,
        skipped: true,
        reason: "skill_store_create_failed",
        error: err?.message || String(err),
      };
    }
    const manifest = readManifest(fs, manifestPath);
    const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
    const lowWorkers = workers.filter((worker) => lowGatewayIndex(worker) > 0);
    const template = lowWorkers.find((worker) => cleanList(worker.allowedWorkspaceIds || worker.allowed_workspace_ids).some((id) => id !== "owner")) || lowWorkers[lowWorkers.length - 1] || {};
    const provisionedWorkers = [];
    function workspaceProviderWorkers(provider) {
      return workers.filter((worker) => (
        providerName(worker) === provider
        && workspaceIdsForWorker(worker).includes(workspaceId)
      ));
    }
    function templateForProvider(provider) {
      const providerWorkers = workers.filter((worker) => providerName(worker) === provider);
      if (!providerWorkers.length && provider !== "openai-codex") return null;
      return providerWorkers.find((worker) => workspaceIdsForWorker(worker).some((id) => id !== "owner"))
        || providerWorkers[providerWorkers.length - 1]
        || template;
    }
    function ensureProviderWorkers(provider, minimum, preferredIndex = 0) {
      const existing = workspaceProviderWorkers(provider);
      const providerTemplate = templateForProvider(provider);
      if (!providerTemplate) return existing;
      while (existing.length < minimum) {
        const nextIndex = nextGatewayIndexForProvider(workers, provider, preferredIndex);
        const profile = `${profilePrefixForProvider(provider)}${nextIndex}`;
        const newWorker = annotateGatewayWorkerReplicaMetadata(Object.assign({}, providerTemplate, {
          name: profile,
          profile,
          host: providerTemplate.host || "127.0.0.1",
          port: nextGatewayPort(workers, lowGatewayBasePort, nextIndex),
          provider,
          enabled: providerTemplate.enabled !== false,
          securityLevel: "user",
          allowMaintenance: false,
          allowedWorkspaceIds: [workspaceId],
          skillProfile: `workspace:${workspaceId}`,
          skillWorkspaceIds: [workspaceId],
          osUser: inputMacUser || providerTemplate.osUser || providerTemplate.os_user || "",
          tags: tagsForProvider(providerTemplate, provider),
          telemetryStateDbPath: replaceProfileInPath(providerTemplate.telemetryStateDbPath, profile),
          telemetryResponseStoreDbPath: replaceProfileInPath(providerTemplate.telemetryResponseStoreDbPath, profile),
        }));
        workers.push(newWorker);
        existing.push(newWorker);
        provisionedWorkers.push(newWorker);
      }
      existing.forEach((worker, index) => {
        if (repairWorkspaceWorkerReplicaMetadata(workspaceId, worker, provider)) {
          provisionedWorkers.push(worker);
        }
        if (repairWorkspaceWorkerApiKey(manifestPath, workspaceId, worker, provider, index + 1)) {
          provisionedWorkers.push(worker);
        }
      });
      return existing;
    }
    const openAiWorkers = ensureProviderWorkers("openai-codex", workspaceOpenAiWorkerMin);
    const companionIndex = lowGatewayIndex(openAiWorkers[0]);
    const deepseekWorkers = ensureProviderWorkers("deepseek", workspaceDeepSeekWorkerMin, companionIndex);
    const allWorkspaceWorkers = [...openAiWorkers, ...deepseekWorkers];
    const firstWorker = allWorkspaceWorkers[0];
    const workerOsUsers = [...new Set(allWorkspaceWorkers.map(macUserForWorker).filter(Boolean))];
    const lowCount = Math.max(0, ...workers.map(lowGatewayIndex));
    const deepseekCount = Math.max(0, ...workers.map(deepseekGatewayIndex));
    const profileBindingRefreshRequested = input.refreshProfileBinding === true || input.bindingChanged === true;
    const profileBindingRefreshed = Boolean(profileBindingRefreshRequested && allWorkspaceWorkers.length);
    if (profileBindingRefreshed) {
      const refreshedAt = nowIso();
      for (const worker of allWorkspaceWorkers) worker.pluginBindingUpdatedAt = refreshedAt;
    }
    const annotatedManifest = annotateGatewayManifestReplicaMetadata(Object.assign({}, manifest, { workers }));
    if (annotatedManifest.changed) {
      workers.splice(0, workers.length, ...annotatedManifest.manifest.workers);
      manifest.workers = workers;
    }
    if (provisionedWorkers.length || profileBindingRefreshed || annotatedManifest.changed) {
      manifest.enabled = manifest.enabled !== false;
      manifest.workers = workers;
      manifest.updatedAt = nowIso();
      writeManifest(manifestPath, manifest);
    }
    return {
      ok: true,
      provisioned: provisionedWorkers.length > 0,
      manifestPath,
      workerName: provisionedWorkers[0]?.name || provisionedWorkers[0]?.profile || firstWorker?.name || firstWorker?.profile || "",
      workerNames: allWorkspaceWorkers.map((worker) => worker.name || worker.profile).filter(Boolean),
      macUser: workerOsUsers[0] || inputMacUser || "",
      osUser: workerOsUsers[0] || inputMacUser || "",
      workerOsUsers,
      profile: provisionedWorkers[0]?.profile || firstWorker?.profile || "",
      profiles: allWorkspaceWorkers.map((worker) => worker.profile).filter(Boolean),
      port: workerPort(provisionedWorkers[0] || firstWorker),
      ports: allWorkspaceWorkers.map(workerPort).filter(Boolean),
      workerCount: allWorkspaceWorkers.length,
      openAiWorkerCount: openAiWorkers.length,
      deepseekWorkerCount: deepseekWorkers.length,
      provisionedWorkers: [...new Set(provisionedWorkers.map((worker) => worker.profile).filter(Boolean))],
      replicaMetadataUpdated: annotatedManifest.changed,
      replicaMetadataUpdatedCount: annotatedManifest.updatedWorkerCount,
      lowGatewayCount: lowCount,
      deepseekGatewayCount: deepseekCount,
      restartRequired: Boolean(provisionedWorkers.length || skillStore.skillStoreProvisioned || profileBindingRefreshed),
      profileBindingRefreshed,
      skillStorePath: skillStore.skillStorePath,
      skillStoreProvisioned: skillStore.skillStoreProvisioned,
    };
  }

  return { ensureWorkspaceGateway };
}

module.exports = { createGatewayWorkspaceProvisioningService };
