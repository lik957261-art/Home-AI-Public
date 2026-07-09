"use strict";

const CHAT_EVENT_STREAM_CLIENT_ESM_PATH = "/vite-islands/chat-live-event-source-client/chat-live-event-source-client.js";
let chatEventStreamClient = null;
let chatEventStreamClientPromise = null;

function importChatEventStreamClient(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatEventStreamClient) return Promise.resolve(chatEventStreamClient);
  if (!chatEventStreamClientPromise) {
    const importer = typeof rootRef.__homeAiImportChatEventStreamClient === "function"
      ? rootRef.__homeAiImportChatEventStreamClient
      : (path) => import(path);
    chatEventStreamClientPromise = Promise.resolve()
      .then(() => importer(CHAT_EVENT_STREAM_CLIENT_ESM_PATH))
      .then((client) => {
        chatEventStreamClient = client || null;
        return chatEventStreamClient;
      })
      .catch((error) => {
        chatEventStreamClientPromise = null;
        throw error;
      });
  }
  return chatEventStreamClientPromise;
}

function currentChatEventStreamClient() {
  return chatEventStreamClient;
}

if (typeof window !== "undefined") {
  importChatEventStreamClient().catch(() => null);
}

function chatEventStreamUrl() {
  const client = currentChatEventStreamClient();
  const plan = client?.chatEventSourceConnectionPlan?.({
    key: state.key,
    clientVersion: state.clientVersion,
  });
  if (plan?.url) return plan.url;
  const params = new URLSearchParams();
  if (state.key) params.set("key", state.key);
  if (state.clientVersion) params.set("clientVersion", state.clientVersion);
  const query = params.toString() ? `?${params.toString()}` : "";
  return `/api/events${query}`;
}

function applyChatEventStreamFrame(event) {
  const plan = currentChatEventStreamClient()?.chatEventFramePayloadPlan?.(event);
  if (plan) {
    if (!plan.ok) throw new Error(plan.errorMessage || plan.diagnostic?.code || "event_stream_invalid_frame");
    applyEvent(plan.payload);
    return;
  }
  applyEvent(JSON.parse(event.data));
}

function eventStreamStatusText(status, text) {
  const plan = currentChatEventStreamClient()?.chatEventConnectionStatusPlan?.({ status, text });
  return plan?.text || text || status || "";
}

function connectEvents() {
  if (state.events) state.events.close();
  const url = chatEventStreamUrl();
  state.events = new EventSource(url);
  state.events.onmessage = (event) => {
    try {
      applyChatEventStreamFrame(event);
    } catch (err) {
      showError(err);
    }
  };
  state.events.onerror = () => {
    $("connectionState").textContent = eventStreamStatusText("reconnecting", "Reconnecting");
  };
}
