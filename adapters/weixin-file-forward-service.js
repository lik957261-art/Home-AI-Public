"use strict";

const path = require("node:path");

function safeString(value) {
  return String(value || "").trim();
}

function requireFn(deps, name) {
  if (typeof deps[name] !== "function") {
    throw new Error(`weixin file forward service requires ${name}`);
  }
  return deps[name];
}

function createArtifactForwardFile(artifact, deps) {
  const localPath = artifact?.localPath || artifact?.path || "";
  return {
    localPath,
    displayPath: artifact?.displayPath || artifact?.path || "",
    name: artifact?.name || deps.basename(localPath || "file"),
    mime: artifact?.mime || deps.mimeFor(localPath || ""),
    size: Number(artifact?.size || 0) || 0,
    artifact,
  };
}

function fileResultFromResolvedForwardSource(resolved, workspaceId, fallbackError) {
  if (resolved?.file) return { file: resolved.file };
  if (resolved?.bridgeFile) return { bridgeFile: resolved.bridgeFile, bridgeWorkspaceId: workspaceId };
  return { status: resolved?.status || 404, error: resolved?.error || fallbackError || "File not found" };
}

function createWeixinFileForwardService(deps = {}) {
  const authCanAccessWorkspace = requireFn(deps, "authCanAccessWorkspace");
  const broadcast = requireFn(deps, "broadcast");
  const compactMessage = requireFn(deps, "compactMessage");
  const compactText = requireFn(deps, "compactText");
  const compactThread = requireFn(deps, "compactThread");
  const ensureWeixinSingleWindowThread = requireFn(deps, "ensureWeixinSingleWindowThread");
  const findThreadForAuth = requireFn(deps, "findThreadForAuth");
  const isOwnerAuth = requireFn(deps, "isOwnerAuth");
  const isWeixinSingleWindowThread = requireFn(deps, "isWeixinSingleWindowThread");
  const makeId = requireFn(deps, "makeId");
  const materializeWeixinForwardFile = requireFn(deps, "materializeWeixinForwardFile");
  const mimeFor = requireFn(deps, "mimeFor");
  const normalizeExternalDelivery = requireFn(deps, "normalizeExternalDelivery");
  const normalizeLocalPath = requireFn(deps, "normalizeLocalPath");
  const nowIso = requireFn(deps, "nowIso");
  const publicWeixinOutboundDelivery = requireFn(deps, "publicWeixinOutboundDelivery");
  const resolveArtifactForRequest = requireFn(deps, "resolveArtifactForRequest");
  const resolveFileForBrowserRequest = requireFn(deps, "resolveFileForBrowserRequest");
  const resolveKanbanOutputFile = requireFn(deps, "resolveKanbanOutputFile");
  const resolveWeixinForwardTarget = requireFn(deps, "resolveWeixinForwardTarget");
  const saveState = requireFn(deps, "saveState");
  const threadSummary = requireFn(deps, "threadSummary");

  const basename = typeof deps.basename === "function" ? deps.basename : path.basename;
  const egressPolicyProvider = deps.egressPolicyProvider;
  const fs = deps.fs;
  const resolveAuthorizedCronDeliverableFile = typeof deps.resolveAuthorizedCronDeliverableFile === "function"
    ? deps.resolveAuthorizedCronDeliverableFile
    : null;
  const resolveAuthorizedCronOutputFile = typeof deps.resolveAuthorizedCronOutputFile === "function"
    ? deps.resolveAuthorizedCronOutputFile
    : null;
  const fileResultFromBridgeFileForForward = typeof deps.fileResultFromBridgeFileForForward === "function"
    ? deps.fileResultFromBridgeFileForForward
    : null;
  const safeFileName = typeof deps.safeFileName === "function" ? deps.safeFileName : ((value) => basename(String(value || "file")));
  const singleWindowChatTaskGroupId = safeString(deps.singleWindowChatTaskGroupId) || "chat";
  const state = typeof deps.state === "function" ? deps.state : (() => deps.state || {});
  const deliveryId = typeof deps.deliveryId === "function" ? deps.deliveryId : null;

  if (!fs || typeof fs.existsSync !== "function" || typeof fs.statSync !== "function") {
    throw new Error("weixin file forward service requires fs.existsSync/statSync");
  }
  if (!egressPolicyProvider || typeof egressPolicyProvider.decide !== "function") {
    throw new Error("weixin file forward service requires egressPolicyProvider.decide");
  }
  if (!deliveryId) {
    throw new Error("weixin file forward service requires deliveryId");
  }

  async function resolveFileFromSourceUrlForRequest(sourceUrl, auth) {
    const raw = safeString(sourceUrl);
    if (!raw) return null;
    let parsed;
    try {
      parsed = new URL(raw, "http://hermes-mobile.local");
    } catch (_) {
      return { status: 400, error: "Invalid sourceUrl" };
    }
    const artifactMatch = parsed.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
    if (artifactMatch) {
      const resolved = resolveArtifactForRequest(decodeURIComponent(artifactMatch[1]), auth);
      if (!resolved.artifact) return { status: resolved.status || 404, error: resolved.error || "Artifact not found" };
      return {
        file: createArtifactForwardFile(resolved.artifact, { basename, mimeFor }),
        thread: resolved.thread,
      };
    }
    if (parsed.pathname === "/api/files" || parsed.pathname === "/api/files/preview") {
      return resolveFileForBrowserRequest(parsed.searchParams, auth);
    }
    if (parsed.pathname === "/api/automations/output" || parsed.pathname === "/api/automations/output/preview") {
      if (!resolveAuthorizedCronOutputFile) return { status: 404, error: "Automation output not found" };
      const workspaceId = safeString(parsed.searchParams.get("workspaceId") || auth?.workspaceId || "owner") || "owner";
      const resolved = await resolveAuthorizedCronOutputFile(parsed.searchParams, auth);
      return fileResultFromResolvedForwardSource(resolved, workspaceId, "Automation output not found");
    }
    if (parsed.pathname === "/api/automations/deliverable" || parsed.pathname === "/api/automations/deliverable/preview") {
      if (!resolveAuthorizedCronDeliverableFile) return { status: 404, error: "Automation deliverable not found" };
      const workspaceId = safeString(parsed.searchParams.get("workspaceId") || auth?.workspaceId || "owner") || "owner";
      const resolved = await resolveAuthorizedCronDeliverableFile(parsed.searchParams, auth);
      return fileResultFromResolvedForwardSource(resolved, workspaceId, "Automation deliverable not found");
    }
    if (parsed.pathname === "/api/kanban/cards/output" || parsed.pathname === "/api/kanban/cards/output/preview") {
      const workspaceId = safeString(parsed.searchParams.get("workspaceId") || auth?.workspaceId || "owner") || "owner";
      const resolved = resolveKanbanOutputFile(workspaceId, parsed.searchParams.get("path") || "", auth);
      return fileResultFromResolvedForwardSource(resolved, workspaceId, "Kanban output not found");
    }
    return { status: 400, error: "Unsupported file source for Weixin forwarding" };
  }

  async function resolveWeixinForwardFile(body, auth) {
    const source = body && typeof body === "object" ? body : {};
    const artifactId = safeString(source.artifactId || source.artifact_id);
    if (artifactId) {
      const resolved = resolveArtifactForRequest(artifactId, auth);
      if (!resolved.artifact) return { status: resolved.status || 404, error: resolved.error || "Artifact not found" };
      return {
        file: createArtifactForwardFile(resolved.artifact, { basename, mimeFor }),
        thread: resolved.thread,
      };
    }
    const sourceUrl = safeString(source.sourceUrl || source.source_url || source.url);
    if (sourceUrl) return resolveFileFromSourceUrlForRequest(sourceUrl, auth);
    const threadId = safeString(source.threadId || source.thread_id);
    const displayPath = safeString(source.path || source.displayPath || source.display_path);
    if (threadId && displayPath) {
      const params = new URLSearchParams({ threadId, path: displayPath });
      return resolveFileForBrowserRequest(params, auth);
    }
    return { status: 400, error: "Missing artifactId, sourceUrl, or threadId/path" };
  }

  function publicArtifactForWeixinForward(file, thread, message) {
    const localPath = normalizeLocalPath(file?.localPath || "");
    if (!localPath || !fs.existsSync(localPath)) return null;
    const stat = fs.statSync(localPath);
    const artifacts = Array.isArray(state().artifacts) ? state().artifacts : [];
    const existing = file?.artifact?.id
      ? artifacts.find((item) => String(item.id || "") === String(file.artifact.id || ""))
      : null;
    const record = existing || {
      id: makeId("artifact"),
      path: localPath,
      displayPath: String(file.displayPath || localPath),
      name: safeFileName(file.name || localPath),
      mime: file.mime || mimeFor(localPath),
      size: stat.size,
      createdAt: nowIso(),
      workspaceId: thread.workspaceId,
      projectId: thread.projectId,
      subprojectId: thread.subprojectId || "",
      threadId: thread.id,
      messageId: message.id,
    };
    if (!existing) artifacts.push(record);
    return {
      id: record.id,
      name: record.name || basename(localPath),
      mime: record.mime || mimeFor(localPath),
      size: stat.size,
      url: `/api/artifacts/${encodeURIComponent(record.id)}`,
      path: localPath,
    };
  }

  async function createWeixinFileForwardDelivery(auth, body = {}) {
    const workspaceId = safeString(body.workspaceId || body.workspace_id || auth?.workspaceId || "owner") || "owner";
    if (!authCanAccessWorkspace(auth, workspaceId)) {
      const err = new Error("Workspace access is not allowed");
      err.status = 403;
      throw err;
    }
    const resolved = await resolveWeixinForwardFile(body, auth);
    if (!resolved?.file && !resolved?.bridgeFile) {
      const err = new Error(resolved?.error || "File not found");
      err.status = resolved?.status || 404;
      throw err;
    }
    const target = resolveWeixinForwardTarget(body, auth, workspaceId);
    const egressDecision = egressPolicyProvider.decide({
      source: "hermes_mobile",
      destination: "weixin",
      operation: "manual_forward",
      workspaceId,
      actorWorkspaceId: auth?.workspaceId || workspaceId,
      targetWorkspaceId: workspaceId,
      originReply: false,
      explicitUserApproved: true,
      ownerApproved: isOwnerAuth(auth),
      sendsFileContent: true,
      contentKinds: ["artifact"],
      targetType: "weixin_outbound",
      targetId: [target.accountId, target.chatId, target.userId].filter(Boolean).join(":"),
    });
    if (!egressDecision.allowed) {
      const err = new Error(egressDecision.reason || "Weixin file forwarding is not allowed");
      err.status = 403;
      err.code = "weixin_forward_egress_denied";
      throw err;
    }
    const bridgeResult = resolved.file ? null : fileResultFromBridgeFileForForward?.(resolved.bridgeFile, workspaceId);
    const sourceFile = resolved.file || bridgeResult?.file;
    if (!sourceFile) {
      const err = new Error("File not found");
      err.status = 404;
      throw err;
    }
    const forwardFile = materializeWeixinForwardFile(sourceFile, workspaceId);
    const localPath = normalizeLocalPath(forwardFile.localPath || "");
    if (!localPath || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) {
      const err = new Error("File not found");
      err.status = 404;
      throw err;
    }
    const requestedThreadId = safeString(body.threadId || body.thread_id);
    const requestedThread = requestedThreadId ? findThreadForAuth(auth, requestedThreadId) : null;
    const thread = requestedThread && isWeixinSingleWindowThread(requestedThread)
      ? requestedThread
      : ensureWeixinSingleWindowThread(workspaceId, target);
    const createdAt = nowIso();
    const caption = String(body.caption ?? body.text ?? "").trim();
    const message = {
      id: makeId("msg"),
      role: "assistant",
      content: compactText(caption, 1000),
      status: "done",
      createdAt,
      updatedAt: createdAt,
      completedAt: createdAt,
      artifacts: [],
      taskGroupId: singleWindowChatTaskGroupId,
      messageKind: "plain",
      senderWorkspaceId: "hermes",
      senderPrincipalId: "hermes",
      senderLabel: "Hermes",
      actorWorkspaceId: workspaceId,
      singleWindowMode: "chat",
    };
    const artifact = publicArtifactForWeixinForward(forwardFile, thread, message);
    if (!artifact) {
      const err = new Error("File could not be registered for forwarding");
      err.status = 500;
      throw err;
    }
    message.artifacts = [artifact];
    message.externalDelivery = normalizeExternalDelivery({
      source: "weixin",
      deliveryId: deliveryId(thread.id, message.id),
      status: "pending",
      accountId: target.accountId,
      chatId: target.chatId,
      userId: target.userId,
      workspaceId,
      content: message.content,
      artifacts: message.artifacts,
      terminalStatus: "manual_forward",
      egressDecision: egressDecision.reason,
      queuedAt: createdAt,
      updatedAt: createdAt,
    });
    thread.messages.push(message);
    thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
    thread.updatedAt = createdAt;
    saveState();
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message, thread), thread: threadSummary(thread) });
    return {
      ok: true,
      target,
      delivery: publicWeixinOutboundDelivery(thread, message),
      message: compactMessage(message, thread),
      thread: compactThread(thread),
    };
  }

  return {
    createWeixinFileForwardDelivery,
    publicArtifactForWeixinForward,
    resolveFileFromSourceUrlForRequest,
    resolveWeixinForwardFile,
  };
}

module.exports = {
  createWeixinFileForwardService,
  createArtifactForwardFile,
  fileResultFromResolvedForwardSource,
};
