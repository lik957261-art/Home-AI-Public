"use strict";

function workerProfileId(worker) {
  return String(worker?.profile || worker?.id || worker?.name || "").trim();
}

function workerAllowsWorkspace(worker, workspaceId) {
  if (!worker || !workspaceId) return false;
  const allowed = Array.isArray(worker.allowedWorkspaceIds) ? worker.allowedWorkspaceIds : [];
  const skills = Array.isArray(worker.skillWorkspaceIds) ? worker.skillWorkspaceIds : [];
  return allowed.includes("*")
    || allowed.includes(workspaceId)
    || skills.includes("*")
    || skills.includes(workspaceId);
}

function createKanbanExecutableProfileService(options = {}) {
  const fs = options.fs || require("node:fs");
  const metadataPath = typeof options.metadataPath === "function"
    ? options.metadataPath
    : (() => options.metadataPath || "");
  const loadGatewayPool = typeof options.loadGatewayPool === "function"
    ? options.loadGatewayPool
    : (() => ({ workers: [] }));
  const cursor = options.cursor || new Map();

  function assignmentCounts(workspace, profiles) {
    const profileSet = new Set((Array.isArray(profiles) ? profiles : []).map(String).filter(Boolean));
    const counts = new Map([...profileSet].map((profile) => [profile, 0]));
    const filePath = metadataPath();
    if (!filePath || !profileSet.size) return counts;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const todos = parsed?.todos && typeof parsed.todos === "object" ? Object.values(parsed.todos) : [];
      for (const meta of todos) {
        if (String(meta?.workspaceId || meta?.workspace_id || "") !== workspace) continue;
        if (meta?.deletedAt || meta?.deleted_at || meta?.cancelledAt || meta?.cancelled_at || meta?.completedAt || meta?.completed_at) continue;
        const profile = String(meta?.kanbanAssignee || meta?.kanban_assignee || "").trim();
        if (profileSet.has(profile)) counts.set(profile, (counts.get(profile) || 0) + 1);
      }
    } catch (_) {
      // Missing or corrupt metadata should not block Kanban card creation.
    }
    return counts;
  }

  function nextProfile(workspace, workers) {
    const pool = (Array.isArray(workers) ? workers : []).filter((worker) => workerProfileId(worker));
    if (!pool.length) return "";
    const counts = assignmentCounts(workspace, pool.map(workerProfileId));
    const lowestCount = Math.min(...pool.map((worker) => counts.get(workerProfileId(worker)) || 0));
    const leastLoaded = pool.filter((worker) => (counts.get(workerProfileId(worker)) || 0) === lowestCount);
    const key = [
      String(workspace || "default").trim() || "default",
      leastLoaded.map(workerProfileId).join(","),
    ].join("|");
    const previous = cursor.get(key) || "";
    const previousIndex = leastLoaded.findIndex((worker) => workerProfileId(worker) === previous);
    const nextIndex = (previousIndex + 1) % leastLoaded.length;
    const profile = workerProfileId(leastLoaded[nextIndex]);
    cursor.set(key, profile);
    return profile;
  }

  function profileForWorkspace(workspaceId, principalId, requestedAssignee = "") {
    const workspace = String(workspaceId || principalId || requestedAssignee || "owner").trim() || "owner";
    try {
      const loaded = loadGatewayPool();
      const workers = Array.isArray(loaded?.workers) ? loaded.workers : [];
      const candidates = workers
        .filter((worker) => worker?.profile && worker.securityLevel === "user" && !worker.allowMaintenance)
        .filter((worker) => workerAllowsWorkspace(worker, workspace));
      const explicit = String(requestedAssignee || "").trim();
      const explicitWorker = candidates.find((worker) => workerProfileId(worker) === explicit);
      if (explicitWorker) return workerProfileId(explicitWorker);
      const exactSkill = candidates.filter((worker) => (worker.skillWorkspaceIds || []).includes(workspace));
      const exactAllowed = candidates.filter((worker) => (worker.allowedWorkspaceIds || []).includes(workspace));
      const wildcard = candidates.filter((worker) => (worker.skillWorkspaceIds || []).includes("*") || (worker.allowedWorkspaceIds || []).includes("*"));
      return nextProfile(workspace, exactSkill.length ? exactSkill : (exactAllowed.length ? exactAllowed : (wildcard.length ? wildcard : candidates)));
    } catch (_) {
      return "";
    }
  }

  return {
    assignmentCounts,
    nextProfile,
    profileForWorkspace,
    workerAllowsWorkspace,
    workerProfileId,
  };
}

module.exports = {
  createKanbanExecutableProfileService,
  workerAllowsWorkspace,
  workerProfileId,
};
