"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadRuntimeModule() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-app/runtime/home-ai-runtime-facade.mjs",
  )).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function jsonResponse(body, overrides = {}) {
  return {
    ok: overrides.ok !== false,
    status: overrides.status || 200,
    statusText: overrides.statusText || "OK",
    headers: overrides.headers || { get: () => "" },
    json: async () => body,
  };
}

(async () => {
  const runtime = await loadRuntimeModule();

  await test("runtime facade sends access key and client version through API boundary", async () => {
    const calls = [];
    const documentRef = { cookie: "", querySelector: () => null };
    const storage = runtime.createMemoryStorage({ hermesWebKey: "owner-key" });
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      documentRef,
      locationRef: {
        href: "https://homeai.local/vite-app-preview/",
        pathname: "/vite-app-preview/",
        protocol: "https:",
        search: "",
        hash: "",
      },
      storage,
      clientVersion: "client-v-test",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return jsonResponse({ ok: true });
      },
    });

    const result = await facade.api("/api/owner/system-console", { method: "POST", body: "{}" });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/owner/system-console");
    assert.equal(calls[0].options.headers["X-Hermes-Web-Key"], "owner-key");
    assert.equal(calls[0].options.headers["X-Hermes-Web-Client-Version"], "client-v-test");
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    assert.equal(calls[0].options.cache, "no-store");
    assert.match(documentRef.cookie, /hermes_web_key=owner-key/);
    assert.match(documentRef.cookie, /Secure/);
  });

  await test("runtime facade preserves unauthorized permission behavior", async () => {
    let unauthorizedSeen = false;
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      fetchImpl: async () => jsonResponse({ error: "nope" }, { ok: false, status: 401, statusText: "Unauthorized" }),
      onUnauthorized: () => {
        unauthorizedSeen = true;
      },
    });

    await assert.rejects(
      () => facade.api("/api/owner/system-console"),
      (error) => {
        assert.equal(error.message, "Unauthorized");
        assert.equal(error.status, 401);
        return true;
      },
    );
    assert.equal(unauthorizedSeen, true);
  });

  await test("runtime facade exposes state and event bus without window.state", async () => {
    const seen = [];
    const root = {};
    const facade = runtime.createHomeAiRuntimeFacade({
      root,
      appState: { viewMode: "preview" },
      attachClassicCompatibility: true,
    });
    facade.events.on("state:changed", (event) => seen.push(event.detail.patch));
    facade.state.set({ viewMode: "console", selectedThreadId: "thread-1" });

    assert.equal(root.HomeAiRuntimeFacade, facade);
    assert.equal(root.state, undefined);
    assert.equal(facade.state.get("viewMode"), "console");
    assert.equal(facade.state.get("selectedThreadId"), "thread-1");
    assert.deepEqual(seen, [{ viewMode: "console", selectedThreadId: "thread-1" }]);
  });

  await test("runtime facade owns client-layout diagnostics and dedupe storage", async () => {
    const calls = [];
    const eventTypes = [];
    const storage = runtime.createMemoryStorage();
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      storage,
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, options });
        return { ok: true, status: 202 };
      },
    });
    facade.events.on("diagnostics:client-layout:sent", (event) => eventTypes.push(event.type));
    facade.events.on("dedupe:marked", (event) => eventTypes.push(event.type));

    const sent = await facade.diagnostics.sendClientLayoutDiagnostic({
      event: "plugin_diagnostic_transport",
      kind: "submit_started",
      pluginId: "music",
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.status, 202);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, runtime.CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT);
    assert.equal(calls[0].options.keepalive, true);
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    assert.equal(JSON.parse(calls[0].options.body).pluginId, "music");

    assert.equal(facade.dedupe.has("pluginConversationAction", "abc123"), false);
    assert.equal(facade.dedupe.mark("pluginConversationAction", "abc123", { inboxItemId: "ainb_1" }), true);
    assert.equal(facade.dedupe.has("pluginConversationAction", "abc123"), true);
    assert.match(facade.dedupe.storageKey("pluginConversationAction", "abc123"), /^homeai\.pluginConversationAction\.abc123$/);
    assert.deepEqual(eventTypes, ["diagnostics:client-layout:sent", "dedupe:marked"]);
  });

  await test("runtime facade route bridge emits push and replace events", async () => {
    const routeEvents = [];
    const viewModeEvents = [];
    const storage = runtime.createMemoryStorage();
    const locationRef = {
      href: "http://127.0.0.1/vite-app-preview/",
      pathname: "/vite-app-preview/",
      protocol: "http:",
      search: "",
      hash: "",
    };
    const historyRef = {
      pushState: (_state, _title, url) => {
        locationRef.pathname = String(url);
      },
      replaceState: (_state, _title, url) => {
        locationRef.pathname = String(url);
      },
    };
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      storage,
      locationRef,
      historyRef,
    });
    facade.events.on("route:changed", (event) => routeEvents.push(event.detail));
    facade.events.on("route:view-mode:changed", (event) => viewModeEvents.push(event.detail));

    facade.route.push("/tasks");
    facade.route.replace("/topics");
    assert.equal(facade.route.setViewMode("system-console", { source: "test" }), "system-console");

    assert.equal(facade.route.current().pathname, "/topics");
    assert.deepEqual(routeEvents.map((event) => event.mode), ["push", "replace"]);
    assert.deepEqual(routeEvents.map((event) => event.url), ["/tasks", "/topics"]);
    assert.equal(facade.route.getViewMode(), "system-console");
    assert.equal(facade.route.viewModeStorageKey, runtime.VIEW_MODE_STORAGE_KEY);
    assert.equal(storage.getItem(runtime.VIEW_MODE_STORAGE_KEY), "system-console");
    assert.equal(facade.state.get("viewMode"), "system-console");
    assert.deepEqual(viewModeEvents, [{
      viewMode: "system-console",
      storageKey: runtime.VIEW_MODE_STORAGE_KEY,
      source: "test",
    }]);
  });

  await test("runtime facade detects native shell bridge through bounded signals", async () => {
    const posted = [];
    const root = {
      __homeAIPendingNativeShare: {
        files: [{ path: "/系统分享/HomeAI/pending.md", name: "pending.md", workspaceId: "owner" }],
      },
      HomeAINativeVoiceInputCapability: { voiceCapture: true },
      webkit: {
        messageHandlers: {
          homeAI: { postMessage: (payload) => posted.push(payload) },
          voiceInput: {},
          nativeShare: {},
        },
      },
    };
    const storage = runtime.createMemoryStorage({ homeAiNativeShell: "1" });
    const facade = runtime.createHomeAiRuntimeFacade({
      root,
      storage,
      locationRef: {
        href: "homeai://local/vite-app-preview/?homeAiNativePlatform=ios",
        pathname: "/vite-app-preview/",
        protocol: "homeai:",
        search: "?homeAiNativePlatform=ios",
      },
    });

    assert.equal(facade.native.isNativeShell, true);
    assert.equal(facade.native.isIosShell, true);
    assert.equal(facade.native.platform, "ios");
    assert.equal(facade.native.nativeShellParam(), "ios");
    assert.equal(facade.native.capabilities.voice, true);
    assert.equal(facade.native.capabilities.share, true);
    assert.equal(facade.native.isVoiceInputShellActive(), true);
    assert.equal(facade.native.isVoiceInputBridgeAvailable(), true);
    assert.equal(facade.native.postHomeAiMessage({ type: "voiceInput.start" }), true);
    assert.deepEqual(posted, [{ type: "voiceInput.start" }]);
    assert.equal(facade.native.rememberVoiceInputMicGranted(), true);
    assert.equal(facade.native.voiceInputMicWasGranted(), true);
    assert.equal(facade.native.forgetVoiceInputMicGranted(), true);
    assert.equal(facade.native.voiceInputMicWasGranted(), false);
    const callbacks = facade.native.registerVoiceInputCallbacks({ started: () => true });
    assert.equal(typeof callbacks.started, "function");
    const nativeShareEvents = [];
    const receivedShares = [];
    facade.events.on("native:share:callbacks:registered", (event) => nativeShareEvents.push(event.detail));
    facade.events.on("native:share:pending:consumed", (event) => nativeShareEvents.push(event.detail));
    const shareCallbacks = facade.native.registerNativeShareCallbacks({
      receive: (payload) => receivedShares.push(payload),
    });
    assert.equal(typeof shareCallbacks.receive, "function");
    assert.equal(root.__homeAIPendingNativeShare, null);
    assert.equal(receivedShares.length, 1);
    assert.deepEqual(nativeShareEvents, [
      { callbackCount: 1 },
      { fileCount: 1 },
    ]);
  });

  await test("runtime facade preserves Android native shell parameter for document preview", async () => {
    const storage = runtime.createMemoryStorage({ "homeAI.nativeShell": "android" });
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      storage,
      locationRef: {
        href: "http://127.0.0.1/vite-app-preview/",
        pathname: "/vite-app-preview/",
        protocol: "http:",
        search: "",
      },
    });

    assert.equal(facade.native.nativeShellParam(), "android");
    assert.equal(facade.native.isNativeShell, false);
  });

  await test("runtime facade owns authenticated document preview blob fetch", async () => {
    const calls = [];
    const storage = runtime.createMemoryStorage({ hermesWebKey: "owner-key" });
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      storage,
      locationRef: {
        href: "https://homeai.local/tasks",
        origin: "https://homeai.local",
        pathname: "/tasks",
        protocol: "https:",
        search: "",
      },
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, options });
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          blob: async () => ({ type: "application/pdf", size: 128 }),
        };
      },
    });

    const blob = await facade.documentPreview.fetchBlob("/api/files?artifactId=artifact_1");

    assert.deepEqual(blob, { type: "application/pdf", size: 128 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://homeai.local/api/files?artifactId=artifact_1");
    assert.equal(calls[0].options.headers["X-Hermes-Web-Key"], "owner-key");
    assert.equal(facade.documentPreview.absoluteUrl("/api/files"), "https://homeai.local/api/files");
  });

  await test("runtime facade owns EventSource construction boundary", async () => {
    const createdUrls = [];
    const eventTypes = [];
    class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        createdUrls.push(url);
      }
      close() {
        this.readyState = 2;
      }
    }
    const facade = runtime.createHomeAiRuntimeFacade({
      root: { EventSource: FakeEventSource },
      locationRef: {
        href: "https://homeai.local/vite-app-preview/",
        pathname: "/vite-app-preview/",
        protocol: "https:",
        search: "",
      },
    });
    facade.events.on("event-stream:created", (event) => eventTypes.push(`${event.type}:${event.detail.endpoint}:${event.detail.hasQuery}`));

    const source = facade.eventStream.createEventSource("/api/events?clientVersion=test", {
      source: "runtime_test",
    });

    assert.equal(facade.eventStream.isAvailable(), true);
    assert.equal(source.url, "/api/events?clientVersion=test");
    assert.deepEqual(createdUrls, ["/api/events?clientVersion=test"]);
    assert.deepEqual(eventTypes, ["event-stream:created:/api/events:true"]);
  });

  await test("runtime facade fails closed when EventSource is unavailable", async () => {
    const eventTypes = [];
    const facade = runtime.createHomeAiRuntimeFacade({ root: {} });
    facade.events.on("event-stream:unavailable", (event) => eventTypes.push(event.detail.code));

    assert.equal(facade.eventStream.isAvailable(), false);
    assert.throws(
      () => facade.eventStream.createEventSource("/api/events"),
      /event_source_unavailable/,
    );
    assert.deepEqual(eventTypes, ["event_source_unavailable"]);
  });

  await test("runtime facade can use the classic API client factory when injected on root", async () => {
    let factoryOptions = null;
    const root = {
      HermesAppApiClient: {
        createApiClient(options) {
          factoryOptions = options;
          return async () => ({ ok: true, source: "classic-api-client" });
        },
      },
    };
    const storage = runtime.createMemoryStorage({ hermesWebKey: "owner-key" });
    const facade = runtime.createHomeAiRuntimeFacade({ root, storage, clientVersion: "client-v-test" });

    assert.deepEqual(await facade.api("/api/test"), { ok: true, source: "classic-api-client" });
    assert.equal(factoryOptions.getAccessKey(), "owner-key");
    assert.equal(factoryOptions.getClientVersion(), "client-v-test");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
