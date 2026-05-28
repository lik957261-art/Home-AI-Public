"use strict";

function cleanWorkspaceId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
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

function workerPort(worker) {
  const port = Number(worker?.port || 0);
  return Number.isFinite(port) && port > 0 ? port : 0;
}

function nextGatewayPort(workers, lowGatewayBasePort, nextIndex) {
  const used = new Set(workers.map(workerPort).filter(Boolean));
  const highestLowOrGrokPort = workers
    .filter((worker) => lowGatewayIndex(worker) > 0 || grokGatewayIndex(worker) > 0)
    .map(workerPort)
    .reduce((max, port) => Math.max(max, port), 0);
  let port = Math.max(lowGatewayBasePort + nextIndex, highestLowOrGrokPort + 1);
  while (used.has(port)) port += 1;
  return port;
}

function replaceProfileInPath(value, profile) {
  const text = String(value || "");
  if (!text) return "";
  return text.replace(/profiles[\\/][^\\/]+/i, `profiles\\${profile}`).replace(/lowgw\d+/gi, profile).replace(/grokgw\d+/gi, profile);
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
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const lowGatewayBasePort = Number(options.lowGatewayBasePort || 18750);

  function writeManifest(manifestPath, manifest) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  function ensureWorkspaceGateway(input = {}) {
    const workspaceId = cleanWorkspaceId(input.workspaceId || input.id);
    if (!workspaceId || workspaceId === "owner") return { ok: true, skipped: true, reason: "system_workspace" };
    const paths = manifestPaths();
    const manifestPath = firstExistingManifestPath(fs, Array.isArray(paths) ? paths : [paths]);
    if (!manifestPath) return { ok: false, skipped: true, reason: "manifest_path_missing" };
    const manifest = readManifest(fs, manifestPath);
    const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
    const existing = workers.find((worker) => worker?.provider === "openai-codex" && cleanList(worker.allowedWorkspaceIds || worker.allowed_workspace_ids).includes(workspaceId));
    if (existing) {
      return { ok: true, provisioned: false, manifestPath, workerName: existing.name || existing.profile, profile: existing.profile, port: Number(existing.port || 0), restartRequired: false };
    }
    const lowWorkers = workers.filter((worker) => lowGatewayIndex(worker) > 0);
    const template = lowWorkers.find((worker) => cleanList(worker.allowedWorkspaceIds || worker.allowed_workspace_ids).some((id) => id !== "owner")) || lowWorkers[lowWorkers.length - 1] || {};
    const nextIndex = Math.max(0, ...lowWorkers.map(lowGatewayIndex)) + 1;
    const profile = `lowgw${nextIndex}`;
    const newWorker = Object.assign({}, template, {
      name: profile,
      profile,
      host: template.host || "127.0.0.1",
      port: nextGatewayPort(workers, lowGatewayBasePort, nextIndex),
      provider: "openai-codex",
      enabled: template.enabled !== false,
      securityLevel: "user",
      allowMaintenance: false,
      allowedWorkspaceIds: [workspaceId],
      skillProfile: `workspace:${workspaceId}`,
      skillWorkspaceIds: [workspaceId],
      tags: cleanList(template.tags).length ? cleanList(template.tags) : ["official", "clean", "low-privilege", "user"],
      telemetryStateDbPath: replaceProfileInPath(template.telemetryStateDbPath, profile),
      telemetryResponseStoreDbPath: replaceProfileInPath(template.telemetryResponseStoreDbPath, profile),
    });
    workers.push(newWorker);
    const lowCount = Math.max(nextIndex, ...workers.map(lowGatewayIndex));
    manifest.enabled = manifest.enabled !== false;
    manifest.workers = workers;
    manifest.updatedAt = nowIso();
    writeManifest(manifestPath, manifest);
    return { ok: true, provisioned: true, manifestPath, workerName: profile, profile, port: newWorker.port, lowGatewayCount: lowCount, restartRequired: true };
  }

  return { ensureWorkspaceGateway };
}

module.exports = { createGatewayWorkspaceProvisioningService };
