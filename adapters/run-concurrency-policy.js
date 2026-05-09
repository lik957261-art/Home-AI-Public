"use strict";

function readLimit(value) {
  const number = Number(typeof value === "function" ? value() : value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function messageWorkspaceId(message, thread) {
  return String(
    message?.actorWorkspaceId
      || message?.senderWorkspaceId
      || thread?.workspaceId
      || "owner",
  ).trim() || "owner";
}

function isActiveRunMessage(message) {
  return message?.role === "assistant"
    && message?.status === "running"
    && Boolean(message?.runId);
}

function activeRunRecords(threads = []) {
  const records = [];
  for (const thread of Array.isArray(threads) ? threads : []) {
    for (const message of Array.isArray(thread?.messages) ? thread.messages : []) {
      if (!isActiveRunMessage(message)) continue;
      records.push({
        threadId: thread.id || "",
        messageId: message.id || "",
        runId: message.runId || "",
        taskGroupId: message.taskGroupId || "",
        workspaceId: messageWorkspaceId(message, thread),
        gatewayName: message.gatewayName || "",
        gatewayProfile: message.gatewayProfile || "",
        gatewaySource: message.gatewaySource || "",
      });
    }
  }
  return records;
}

function createRunConcurrencyPolicy(options = {}) {
  function snapshot(threads = []) {
    const records = activeRunRecords(threads);
    const byWorkspace = {};
    for (const record of records) {
      byWorkspace[record.workspaceId] = (byWorkspace[record.workspaceId] || 0) + 1;
    }
    return {
      maxGlobal: readLimit(options.maxGlobal),
      maxPerWorkspace: readLimit(options.maxPerWorkspace),
      activeGlobal: records.length,
      activeByWorkspace: byWorkspace,
    };
  }

  function limitError(threads = [], workspaceId = "owner") {
    const current = snapshot(threads);
    const normalizedWorkspaceId = String(workspaceId || "owner").trim() || "owner";
    if (current.maxGlobal && current.activeGlobal >= current.maxGlobal) {
      return {
        code: "global_run_concurrency_limit",
        status: 429,
        message: `Hermes Mobile active run limit reached (${current.activeGlobal}/${current.maxGlobal}).`,
        limit: current.maxGlobal,
        active: current.activeGlobal,
        workspaceId: normalizedWorkspaceId,
        snapshot: current,
      };
    }
    const workspaceActive = current.activeByWorkspace[normalizedWorkspaceId] || 0;
    if (current.maxPerWorkspace && workspaceActive >= current.maxPerWorkspace) {
      return {
        code: "workspace_run_concurrency_limit",
        status: 429,
        message: `Workspace active run limit reached (${workspaceActive}/${current.maxPerWorkspace}).`,
        limit: current.maxPerWorkspace,
        active: workspaceActive,
        workspaceId: normalizedWorkspaceId,
        snapshot: current,
      };
    }
    return null;
  }

  return {
    activeRunRecords,
    limitError,
    snapshot,
  };
}

module.exports = {
  activeRunRecords,
  createRunConcurrencyPolicy,
  isActiveRunMessage,
};
