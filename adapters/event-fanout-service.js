"use strict";

function defaultIsOwnerAuth(auth) {
  return Boolean(auth?.isOwner || auth?.role === "owner");
}

function sseFrame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function payloadWorkspaceId(payload) {
  return String(
    payload?.workspaceId
      || payload?.thread?.workspaceId
      || payload?.message?.workspaceId
      || payload?.todo?.workspaceId
      || "",
  );
}

function createEventFanoutService(options = {}) {
  const clients = options.clients || new Set();
  const state = typeof options.state === "function" ? options.state : (() => options.state || {});
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : defaultIsOwnerAuth;
  const threadAccessibleToAuth = typeof options.threadAccessibleToAuth === "function"
    ? options.threadAccessibleToAuth
    : (() => true);
  const authCanAccessWorkspace = typeof options.authCanAccessWorkspace === "function"
    ? options.authCanAccessWorkspace
    : (() => true);

  function registerClient(client) {
    clients.add(client);
    return client;
  }

  function removeClient(client) {
    clients.delete(client);
  }

  function clientCanReceivePayload(client, payload) {
    const auth = client?.auth || { ok: true, role: "owner", isOwner: true };
    if (isOwnerAuth(auth)) return true;
    const threadId = payload?.threadId || payload?.thread?.id || payload?.message?.threadId || "";
    if (threadId) {
      const currentState = state() || {};
      const thread = (currentState.threads || []).find((item) => item.id === String(threadId));
      if (thread) return threadAccessibleToAuth(auth, thread);
    }
    const workspaceId = payloadWorkspaceId(payload);
    if (workspaceId) return authCanAccessWorkspace(auth, workspaceId);
    return true;
  }

  function broadcast(payload) {
    const body = sseFrame(payload);
    for (const client of [...clients]) {
      if (!clientCanReceivePayload(client, payload)) continue;
      const res = client?.res || client;
      try {
        if (!res || typeof res.write !== "function") throw new Error("event client response is not writable");
        res.write(body);
      } catch (_) {
        clients.delete(client);
      }
    }
  }

  return {
    broadcast,
    clientCanReceivePayload,
    clientCount: () => clients.size,
    listClients: () => [...clients],
    payloadWorkspaceId,
    registerClient,
    removeClient,
    sseFrame,
  };
}

module.exports = {
  createEventFanoutService,
  payloadWorkspaceId,
  sseFrame,
};
