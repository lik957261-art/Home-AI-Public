"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\s]+/).map(cleanString).filter(Boolean);
  return [];
}

function sortedUnique(values = []) {
  return Array.from(new Set(cleanList(values))).sort((a, b) => a.localeCompare(b));
}

function normalizeWorkspaceId(value) {
  const text = cleanString(value).toLowerCase();
  if (!text || text === "*" || text === "all") return "";
  return text.replace(/^workspace:/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function normalizeSecurityLevel(value) {
  const text = cleanString(value).toLowerCase().replaceAll("_", "-");
  if (["owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"].includes(text)) return "owner-maintenance";
  return "user";
}

function normalizeProvider(value) {
  return cleanString(value || "openai-codex") || "openai-codex";
}

function workspaceIdForProfileTemplate(worker = {}, hints = {}) {
  const hinted = normalizeWorkspaceId(
    hints.workspaceId
    || hints.workspace_id
    || hints.skillWorkspaceId
    || hints.skill_workspace_id,
  );
  if (hinted) return hinted;
  const candidates = [
    ...cleanList(worker.skillWorkspaceIds || worker.skill_workspace_ids || worker.skillWorkspaceId || worker.skill_workspace_id),
    ...cleanList(worker.allowedWorkspaceIds || worker.allowed_workspace_ids || worker.workspaceIds || worker.workspace_ids),
  ].map(normalizeWorkspaceId).filter(Boolean);
  const unique = sortedUnique(candidates);
  if (unique.length === 1) return unique[0];
  if (unique.includes("owner")) return "owner";
  return unique.join("+") || "owner";
}

function permissionTierForProfileTemplate(worker = {}, hints = {}) {
  return normalizeSecurityLevel(hints.securityLevel || hints.security_level || worker.securityLevel || worker.security_level);
}

function providerForProfileTemplate(worker = {}, hints = {}) {
  return normalizeProvider(hints.provider || hints.provider_id || worker.provider || worker.provider_id);
}

function buildGatewayProfileTemplateKey(worker = {}, hints = {}) {
  return [
    workspaceIdForProfileTemplate(worker, hints),
    permissionTierForProfileTemplate(worker, hints),
    providerForProfileTemplate(worker, hints),
  ].join("|");
}

function buildGatewayPoolKey(worker = {}, hints = {}) {
  return buildGatewayProfileTemplateKey(worker, hints);
}

function replicaIdForWorker(worker = {}) {
  return cleanString(worker.replicaId || worker.replica_id || worker.profile || worker.id || worker.name || worker.apiBase || worker.api_base);
}

function endpointKeyForWorker(worker = {}) {
  const apiBase = cleanString(worker.apiBase || worker.api_base || worker.gatewayUrl || worker.gateway_url || worker.url);
  if (apiBase) return apiBase.replace(/\/+$/, "");
  const host = cleanString(worker.host || "127.0.0.1") || "127.0.0.1";
  const port = cleanString(worker.port || "");
  return port ? `${host}:${port}` : "";
}

function normalizeGatewayWorkerReplica(worker = {}, hints = {}) {
  const profileTemplateKey = buildGatewayProfileTemplateKey(worker, hints);
  const poolKey = buildGatewayPoolKey(worker, hints);
  const replicaId = replicaIdForWorker(worker);
  return {
    replicaId,
    profileAlias: cleanString(worker.profileAlias || worker.profile_alias || worker.profile || ""),
    profileTemplateKey,
    poolKey,
    workspaceId: workspaceIdForProfileTemplate(worker, hints),
    permissionTier: permissionTierForProfileTemplate(worker, hints),
    provider: providerForProfileTemplate(worker, hints),
    endpointKey: endpointKeyForWorker(worker),
    port: cleanString(worker.port || ""),
    hasApiKey: Boolean(cleanString(worker.apiKey || worker.api_key)),
  };
}

function buildGatewayReplicaIdentityKey(worker = {}, hints = {}) {
  const replica = normalizeGatewayWorkerReplica(worker, hints);
  return [
    `pool=${replica.poolKey}`,
    `replica=${replica.replicaId}`,
    `endpoint=${replica.endpointKey}`,
  ].join("|");
}

function buildGatewayRunCompatibilityKey(worker = {}, hints = {}) {
  const replica = normalizeGatewayWorkerReplica(worker, hints);
  return [
    `pool=${replica.poolKey}`,
    `template=${replica.profileTemplateKey}`,
    `capability=${cleanString(hints.capabilityHash || hints.capability_hash || worker.capabilityHash || worker.capability_hash)}`,
    `schema=${cleanString(hints.toolSchemaEpoch || hints.tool_schema_epoch || worker.toolSchemaEpoch || worker.tool_schema_epoch)}`,
    `activeToolsets=${sortedUnique(hints.enabledToolsets || hints.enabled_toolsets || hints.toolsets || []).join(",")}`,
    `mcpBindings=${sortedUnique(hints.mcpBindings || hints.mcp_bindings || hints.mcpServers || hints.mcp_servers || []).join(",")}`,
    `skillWorkspaces=${sortedUnique(hints.skillWorkspaceIds || hints.skill_workspace_ids || worker.skillWorkspaceIds || worker.skill_workspace_ids || []).join(",")}`,
  ].join("|");
}

function summarizeGatewayReplicaPools(workers = [], hints = {}) {
  const groups = new Map();
  for (const worker of Array.isArray(workers) ? workers : []) {
    const replica = normalizeGatewayWorkerReplica(worker, hints);
    if (!replica.replicaId) continue;
    if (!groups.has(replica.poolKey)) {
      groups.set(replica.poolKey, {
        poolKey: replica.poolKey,
        profileTemplateKey: replica.profileTemplateKey,
        workspaceId: replica.workspaceId,
        permissionTier: replica.permissionTier,
        provider: replica.provider,
        replicas: [],
      });
    }
    groups.get(replica.poolKey).replicas.push({
      replicaId: replica.replicaId,
      profileAlias: replica.profileAlias,
      endpointKey: replica.endpointKey,
      hasApiKey: replica.hasApiKey,
    });
  }
  return Array.from(groups.values())
    .map((group) => Object.assign({}, group, {
      replicas: group.replicas.sort((a, b) => a.replicaId.localeCompare(b.replicaId)),
    }))
    .sort((a, b) => a.poolKey.localeCompare(b.poolKey));
}

module.exports = {
  buildGatewayPoolKey,
  buildGatewayProfileTemplateKey,
  buildGatewayReplicaIdentityKey,
  buildGatewayRunCompatibilityKey,
  normalizeGatewayWorkerReplica,
  summarizeGatewayReplicaPools,
};
