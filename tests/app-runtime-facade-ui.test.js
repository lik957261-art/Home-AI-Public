"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function runClassicFacade() {
  const storageValues = new Map();
  const fetchCalls = [];
  const nativeMessages = [];
  const eventSourceUrls = [];
  function FakeEventSource(url) {
    this.url = url;
    this.readyState = 0;
    eventSourceUrls.push(url);
  }
  FakeEventSource.prototype.close = function close() {
    this.readyState = 2;
  };
  const windowRef = {
    HomeAINativeVoiceInputCapability: { voiceCapture: true },
    HomeAINativeShareCapability: { fileIntake: true },
    __homeAIPendingNativeShare: {
      files: [{ path: "/系统分享/HomeAI/classic-pending.md", name: "classic-pending.md", workspaceId: "owner" }],
    },
    EventSource: FakeEventSource,
    document: {
      cookie: "",
      documentElement: { dataset: { clientVersion: "classic-client-v1", nativeShell: "ios", nativeVoiceInput: "1" } },
      querySelector() {
        return { getAttribute: () => "classic-client-v1" };
      },
    },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 202,
        statusText: "Accepted",
        headers: { get: () => "" },
        json: async () => ({ ok: true, url }),
        blob: async () => ({ type: "application/pdf", size: 128 }),
      };
    },
    localStorage: {
      getItem(key) {
        return storageValues.has(key) ? storageValues.get(key) : null;
      },
      setItem(key, value) {
        storageValues.set(String(key), String(value));
      },
      removeItem(key) {
        storageValues.delete(String(key));
      },
    },
    location: {
      href: "http://127.0.0.1/",
      pathname: "/",
      protocol: "http:",
      search: "",
      hash: "",
    },
    webkit: {
      messageHandlers: {
        homeAI: { postMessage: (payload) => nativeMessages.push(payload) },
      },
    },
  };
  const context = vm.createContext({
    window: windowRef,
    globalThis: windowRef,
    Map,
    Set,
    JSON,
    Object,
    Date,
    String,
    Boolean,
    Promise,
    URL,
    encodeURIComponent,
  });
  const apiClientSource = fs.readFileSync(path.join(repoRoot, "public", "app-api-client.js"), "utf8");
  const source = fs.readFileSync(path.join(repoRoot, "public", "app-runtime-facade-ui.js"), "utf8");
  vm.runInContext(apiClientSource, context);
  vm.runInContext(source, context);
  return { eventSourceUrls, fetchCalls, nativeMessages, storageValues, windowRef };
}

async function main() {
  const { eventSourceUrls, fetchCalls, nativeMessages, windowRef } = runClassicFacade();
  const facade = windowRef.HomeAiRuntimeFacade;
  assert.ok(facade, "classic shell facade should attach");
  assert.equal(facade.mode, "classic-shell-compat");
  assert.equal(facade.clientVersion(), "classic-client-v1");

  const events = [];
  const nativeShareEvents = [];
  const receivedShares = [];
  facade.events.on("diagnostics:client-layout:sent", (event) => events.push(event.type));
  facade.events.on("dedupe:marked", (event) => events.push(event.type));
  facade.events.on("event-stream:created", (event) => events.push(`${event.type}:${event.detail.endpoint}:${event.detail.hasQuery}`));
  facade.events.on("route:view-mode:changed", (event) => events.push(`${event.type}:${event.detail.viewMode}`));
  facade.events.on("native:share:callbacks:registered", (event) => nativeShareEvents.push(event.detail));
  facade.events.on("native:share:pending:consumed", (event) => nativeShareEvents.push(event.detail));

  const diagnosticResult = await facade.diagnostics.sendClientLayoutDiagnostic({
    event: "plugin_diagnostic_transport",
    kind: "submit_started",
    pluginId: "music",
  });
  assert.equal(diagnosticResult.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/api/client-layout-diagnostics");
  assert.equal(fetchCalls[0].options.keepalive, true);
  assert.equal(JSON.parse(fetchCalls[0].options.body).pluginId, "music");

  assert.equal(facade.auth.setAccessKey("owner-key"), "owner-key");
  const apiResult = await facade.api("/api/runtime-facade-test");
  assert.equal(apiResult.ok, true);
  assert.equal(fetchCalls[1].url, "/api/runtime-facade-test");
  assert.equal(fetchCalls[1].options.headers["X-Hermes-Web-Key"], "owner-key");
  assert.equal(fetchCalls[1].options.headers["X-Hermes-Web-Client-Version"], "classic-client-v1");

  const blob = await facade.documentPreview.fetchBlob("/api/files?artifactId=artifact_1");
  assert.deepEqual(blob, { type: "application/pdf", size: 128 });
  assert.equal(fetchCalls[2].url, "http://127.0.0.1/api/files?artifactId=artifact_1");
  assert.equal(fetchCalls[2].options.headers["X-Hermes-Web-Key"], "owner-key");

  assert.equal(facade.dedupe.has("pluginConversationAction", "abc123"), false);
  assert.equal(facade.dedupe.mark("pluginConversationAction", "abc123", { inboxItemId: "ainb_1" }), true);
  assert.equal(facade.dedupe.has("pluginConversationAction", "abc123"), true);
  assert.equal(facade.route.setViewMode("system-console", { source: "test" }), "system-console");
  assert.equal(facade.route.getViewMode(), "system-console");
  assert.equal(facade.state.get("viewMode"), "system-console");
  assert.equal(windowRef.localStorage.getItem("hermesWebViewMode"), "system-console");
  assert.equal(facade.native.nativeShellParam(), "ios");
  assert.equal(facade.native.isVoiceInputShellActive(), true);
  assert.equal(facade.native.isVoiceInputBridgeAvailable(), true);
  assert.equal(facade.native.capabilities.share, true);
  assert.equal(facade.native.postHomeAiMessage({ type: "voiceInput.start" }), true);
  assert.deepEqual(nativeMessages, [{ type: "voiceInput.start" }]);
  assert.equal(facade.native.rememberVoiceInputMicGranted(), true);
  assert.equal(facade.native.voiceInputMicWasGranted(), true);
  assert.equal(facade.native.forgetVoiceInputMicGranted(), true);
  assert.equal(facade.native.voiceInputMicWasGranted(), false);
  assert.equal(typeof facade.native.registerVoiceInputCallbacks({ status: () => true }).status, "function");
  assert.equal(typeof facade.native.registerNativeShareCallbacks({
    receive: (payload) => receivedShares.push(payload),
  }).receive, "function");
  assert.equal(windowRef.__homeAIPendingNativeShare, null);
  assert.equal(receivedShares.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(nativeShareEvents)), [
    { callbackCount: 1 },
    { fileCount: 1 },
  ]);
  const eventSource = facade.eventStream.createEventSource("/api/events?clientVersion=classic", {
    source: "classic_test",
  });
  assert.equal(facade.eventStream.isAvailable(), true);
  assert.equal(eventSource.url, "/api/events?clientVersion=classic");
  assert.deepEqual(eventSourceUrls, ["/api/events?clientVersion=classic"]);
  assert.match(windowRef.document.cookie, /hermes_web_key=owner-key/);
  assert.deepEqual(events, [
    "diagnostics:client-layout:sent",
    "dedupe:marked",
    "route:view-mode:changed:system-console",
    "event-stream:created:/api/events:true",
  ]);
  console.log("classic runtime facade UI tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
