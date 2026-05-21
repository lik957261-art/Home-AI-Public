"use strict";

function compactWeixinForwardTarget(target = {}) {
  const source = target && typeof target === "object" ? target : {};
  const accountId = String(source.accountId || source.account_id || "").trim();
  const chatId = String(source.chatId || source.chat_id || "").trim();
  const userId = String(source.userId || source.user_id || "").trim();
  if (!accountId || !(chatId || userId)) return null;
  return {
    source: "weixin",
    type: "weixin",
    label: String(source.label || source.targetLabel || "Weixin").trim() || "Weixin",
    accountId,
    chatId,
    userId,
    workspaceId: String(source.workspaceId || source.workspace_id || "").trim(),
    threadId: String(source.threadId || source.thread_id || "").trim(),
    messageId: String(source.messageId || source.message_id || "").trim(),
    outboundStatus: String(source.outboundStatus || source.outbound_status || "").trim(),
    updatedAt: String(source.updatedAt || source.updated_at || "").trim(),
  };
}

function createWeixinForwardService(deps = {}) {
  const authCanAccessWorkspace = typeof deps.authCanAccessWorkspace === "function"
    ? deps.authCanAccessWorkspace
    : (() => false);
  const chatGroupMemberWorkspaceIds = typeof deps.chatGroupMemberWorkspaceIds === "function"
    ? deps.chatGroupMemberWorkspaceIds
    : (() => []);
  const findWorkspace = typeof deps.findWorkspace === "function"
    ? deps.findWorkspace
    : (() => null);
  const isOwnerAuth = typeof deps.isOwnerAuth === "function"
    ? deps.isOwnerAuth
    : (() => false);
  const threadAccessibleToAuth = typeof deps.threadAccessibleToAuth === "function"
    ? deps.threadAccessibleToAuth
    : (() => false);
  const workspaceLabel = typeof deps.workspaceLabel === "function"
    ? deps.workspaceLabel
    : ((workspaceId) => String(workspaceId || "Weixin"));

  function stateThreads() {
    const state = typeof deps.state === "function" ? deps.state() : deps.state;
    return Array.isArray(state?.threads) ? state.threads : [];
  }

  function targetFromWorkspace(workspace) {
    if (!workspace) return null;
    const policy = workspace.policy || {};
    return compactWeixinForwardTarget({
      label: workspace.label || workspace.id || "Weixin",
      workspaceId: workspace.id,
      accountId: workspace.accountId || policy.source_chat_id_alt || policy.adapter_account_id || policy.account_id || "",
      chatId: workspace.chatId || policy.source_chat_id || policy.chat_id || "",
      userId: workspace.userId || policy.source_user_id || policy.user_id || "",
      outboundStatus: workspace.outboundStatus || policy.outbound_status || "",
    });
  }

  function collectRecentTargets(workspaceId, auth) {
    const out = [];
    for (const thread of stateThreads()) {
      if (!threadAccessibleToAuth(auth, thread)) continue;
      if (workspaceId && String(thread.workspaceId || "") !== workspaceId && !chatGroupMemberWorkspaceIds(thread).includes(workspaceId)) continue;
      for (const message of thread.messages || []) {
        const external = message.externalDelivery?.source === "weixin" ? message.externalDelivery : message.externalIngress;
        if (!external || external.source !== "weixin") continue;
        const target = compactWeixinForwardTarget({
          label: workspaceLabel(workspaceId || thread.workspaceId),
          workspaceId: workspaceId || thread.workspaceId,
          threadId: thread.id,
          messageId: message.id,
          accountId: external.accountId,
          chatId: external.chatId,
          userId: external.userId,
          updatedAt: external.updatedAt || message.updatedAt || thread.updatedAt,
        });
        if (target) out.push(target);
      }
    }
    return out;
  }

  function targetsForWorkspace(workspaceId, auth) {
    const id = String(workspaceId || auth?.workspaceId || "owner").trim() || "owner";
    const workspace = findWorkspace(id);
    if (!workspace || !authCanAccessWorkspace(auth, id)) return [];
    const targets = [
      targetFromWorkspace(workspace),
      ...collectRecentTargets(id, auth),
    ].filter(Boolean);
    const byKey = new Map();
    for (const target of targets) {
      const key = [target.accountId, target.chatId, target.userId].join("\n");
      const previous = byKey.get(key);
      if (!previous || String(target.updatedAt || "") > String(previous.updatedAt || "")) byKey.set(key, target);
    }
    return [...byKey.values()]
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function resolveTarget(body, auth, workspaceId) {
    const explicit = compactWeixinForwardTarget(body?.target || body || {});
    const targets = targetsForWorkspace(workspaceId, auth);
    if (explicit) {
      if (isOwnerAuth(auth)) return Object.assign({}, targets[0] || {}, explicit, { workspaceId });
      const allowed = targets.some((target) => (
        target.accountId === explicit.accountId
        && (target.chatId || "") === (explicit.chatId || "")
        && (target.userId || "") === (explicit.userId || "")
      ));
      if (allowed) return Object.assign({}, explicit, { workspaceId });
      const err = new Error("Weixin forwarding target is not allowed for this workspace");
      err.status = 403;
      throw err;
    }
    const target = targets[0];
    if (!target) {
      const err = new Error("No Weixin forwarding target is configured for this workspace");
      err.status = 409;
      err.code = "weixin_forward_target_unavailable";
      throw err;
    }
    return Object.assign({}, target, { workspaceId });
  }

  return {
    collectRecentTargets,
    compactTarget: compactWeixinForwardTarget,
    resolveTarget,
    targetFromWorkspace,
    targetsForWorkspace,
  };
}

module.exports = {
  compactWeixinForwardTarget,
  createWeixinForwardService,
};
