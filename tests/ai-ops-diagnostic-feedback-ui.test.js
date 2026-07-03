"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createAiOpsDiagnosticFeedbackController,
  parsePluginConversationActionComments,
  safeRoute,
  sanitizeClientDiagnosticValue,
} = require("../public/app-ai-ops-diagnostics-ui");

const repoRoot = path.resolve(__dirname, "..");
const diagnosticUiSource = fs.readFileSync(path.join(repoRoot, "public/app-ai-ops-diagnostics-ui.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public/styles.css"), "utf8");

function createFakeDocument(frames = []) {
  const listeners = {};
  return {
    listeners,
    body: { appendChild() {} },
    documentElement: { dataset: { clientVersion: "client-test-v1" } },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    querySelectorAll(selector) {
      if (selector.includes("iframe.embedded-plugin-frame")) return frames;
      if (selector.includes("assistant")) return { length: 0 };
      if (selector.includes("user")) return { length: 1 };
      if (selector.includes("img")) return { length: 1 };
      if (selector.includes("message")) return { length: 3 };
      return { length: 0 };
    },
  };
}

function createFakeWindow() {
  const listeners = {};
  let timer = null;
  const storage = new Map();
  return {
    listeners,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(String(key), String(value));
      },
      removeItem(key) {
        storage.delete(String(key));
      },
    },
    navigator: {},
    location: {
      origin: "http://127.0.0.1:8797",
      pathname: "/",
      search: "?view=codex-mobile&pluginRoute=single-window&workspaceId=owner&token=secret",
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    setTimeout(handler) {
      timer = handler;
      return 1;
    },
    clearTimeout() {
      timer = null;
    },
    get scheduledTimer() {
      return timer;
    },
  };
}

function createFakeWindowWithTransportDiagnostics() {
  const windowRef = createFakeWindow();
  const transportCalls = [];
  windowRef.HomeAiRuntimeFacade = {
    diagnostics: {
      async sendClientLayoutDiagnostic(payload = {}, options = {}) {
        transportCalls.push({ url: options.endpoint || "/api/client-layout-diagnostics", body: payload });
        return { ok: true, status: 202 };
      },
    },
    dedupe: {
      has() {
        return false;
      },
      mark() {
        return true;
      },
    },
  };
  windowRef.transportCalls = transportCalls;
  return windowRef;
}

function touches(count) {
  return Array.from({ length: count }, (_, index) => ({
    clientX: 100 + index * 8,
    clientY: 200 + index * 8,
  }));
}

function testSanitizeClientDiagnostics() {
  const value = sanitizeClientDiagnosticValue({
    authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
    messageText: "private message",
    count: 2,
  });
  assert.equal(value.authorization, "[REDACTED]");
  assert.equal(value.messageText, "[REDACTED]");
  assert.equal(value.count, 2);
}

function testSafeRouteKeepsOnlyAllowedParams() {
  assert.equal(safeRoute({
    pathname: "/",
    search: "?view=codex-mobile&pluginRoute=single-window&workspaceId=owner&token=secret",
  }), "/?view=codex-mobile&pluginRoute=single-window&workspaceId=owner");
}

function testPayloadIsBoundedAndRedacted() {
  const documentRef = createFakeDocument();
  const windowRef = createFakeWindow();
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "codex-mobile",
      singleWindowMode: "chat",
      currentThreadId: "thread-secret-id",
      currentThread: { messages: [{ id: "m1" }, { id: "m2" }] },
    },
    now: () => new Date("2026-06-24T00:00:00.000Z"),
  });
  controller.record("api_response", {
    token: "secret-token",
    messageText: "private text",
    count: 1,
  });
  const payload = controller.buildPayload({ category: "content_missing", note: "Bearer abcdefghijklmnopqrstuvwxyz" });
  assert.equal(payload.schema_version, "homeai.clientDiagnosticFeedback.v1");
  assert.equal(payload.route, "/?view=codex-mobile&pluginRoute=single-window&workspaceId=owner");
  assert.equal(payload.workspaceId, "owner");
  assert.equal(payload.thread_id, "thread-secret-id");
  assert.equal(payload.breadcrumbs[0].fields.token, "[REDACTED]");
  assert.equal(payload.breadcrumbs[0].fields.messageText, "[REDACTED]");
  assert.equal(payload.dom.image_nodes, 1);
  assert.doesNotMatch(JSON.stringify(payload), /secret-token|private text/);
}

function testPluginContextPayloadIsBounded() {
  const documentRef = createFakeDocument();
  const windowRef = createFakeWindow();
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-music",
      pluginContextNavPluginId: "music",
    },
  });
  const payload = controller.buildPayload({
    category: "plugin_issue",
    context: {
      pluginId: "music",
      sourceSurface: "embedded-plugin",
      route: "/plugins/music?pluginRoute=saved_records&workspaceId=weixin_wuping&launch=secret",
      workspaceId: "weixin_wuping",
    },
  });
  assert.equal(payload.plugin_id, "music");
  assert.equal(payload.source_surface, "embedded-plugin");
  assert.equal(payload.route, "/plugins/music?pluginRoute=saved_records&workspaceId=weixin_wuping");
  assert.equal(payload.workspaceId, "weixin_wuping");
  assert.doesNotMatch(JSON.stringify(payload), /secret/);
}

function testGestureDoesNotConflictWithTwoFingerShellGesture() {
  const documentRef = createFakeDocument();
  const windowRef = createFakeWindow();
  const controller = createAiOpsDiagnosticFeedbackController({ document: documentRef, window: windowRef });
  controller.install();
  documentRef.listeners.touchstart({ touches: touches(2) });
  assert.equal(windowRef.scheduledTimer, null);
  documentRef.listeners.touchstart({ touches: touches(3) });
  assert.equal(typeof windowRef.scheduledTimer, "function");
}

function testOwnerSystemConsoleActionLivesInFeedbackMenu() {
  assert.match(diagnosticUiSource, /data-ai-ops-open-system-console hidden>系统控制台<\/button>/);
  assert.match(diagnosticUiSource, /stateRef\.auth\?\.isOwner && typeof windowRef\.openOwnerSystemConsoleSurface === "function"/);
  assert.match(diagnosticUiSource, /openOwnerSystemConsoleSurface\(\{ trigger: "diagnostic_feedback_menu" \}\)/);
  assert.doesNotMatch(diagnosticUiSource, /event\.target\?\.closest\?\.\("#bottomNav"\)/);
}

function testPluginDiagnosticBridgeIsPlatformOwned() {
  assert.match(diagnosticUiSource, /PLUGIN_FRAME_SELECTOR = "iframe\.embedded-plugin-frame, iframe\.wardrobe-plugin-frame"/);
  assert.match(diagnosticUiSource, /homeai\.diagnostic\.open/);
  assert.match(diagnosticUiSource, /homeai\.diagnostic\.report/);
  assert.match(diagnosticUiSource, /homeai\.plugin_conversation\.action/);
  assert.match(diagnosticUiSource, /homeai-plugin-conversation-action/);
  assert.match(diagnosticUiSource, /submitPluginConversationAction/);
  assert.match(diagnosticUiSource, /scanPluginConversationActionMetadata/);
  assert.match(diagnosticUiSource, /plugin_three_finger_long_press/);
  assert.match(diagnosticUiSource, /frameForMessageSource/);
  assert.match(diagnosticUiSource, /installPluginFrameTouchBridge/);
}

async function testPluginConversationActionMetadataCommentCreatesOwnerApproval() {
  const documentRef = createFakeDocument([]);
  const windowRef = createFakeWindow();
  const apiCalls = [];
  const now = new Date("2026-06-25T08:00:00.000Z");
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    now: () => now,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-health-conversation",
      pluginContextNavPluginId: "health",
      currentThreadId: "thread-health",
      currentThread: {
        id: "thread-health",
        messages: [{
          id: "assistant-1",
          role: "assistant",
          status: "done",
          createdAt: "2026-06-25T07:59:30.000Z",
          content: [
            "我已准备修复请求，等待 Owner 审批。",
            "<!-- homeai-plugin-conversation-action",
            JSON.stringify({
              pluginId: "health",
              requestType: "catalog_missing",
              severity: "H2",
              title: "Strength catalog missing push_up",
              summary: "Health strength catalog lacks push_up.",
              suggestedChange: "Add push_up with label 俯卧撑.",
              acceptance: "Focused catalog tests pass.",
              evidence: {
                catalog: "strength_exercise",
                missingKey: "push_up",
                label: "俯卧撑",
                aliases: ["pushup", "push-up", "push up", "俯卧撑", "伏地挺身"],
                rawText: "private workout body",
              },
            }),
            "-->",
          ].join("\n"),
        }],
      },
    },
    api: async (url, options) => {
      apiCalls.push({ url, body: JSON.parse(options.body || "{}") });
      return {
        ok: true,
        autoDispatched: false,
        dispatchReady: true,
        inboxItem: { id: "ainb_health_push_up" },
      };
    },
  });

  controller.scanPluginConversationActionMetadata();
  controller.scanPluginConversationActionMetadata();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, "/api/plugin-conversation/actions");
  assert.equal(apiCalls[0].body.pluginId, "health");
  assert.equal(apiCalls[0].body.workspaceId, "owner");
  assert.equal(apiCalls[0].body.requestType, "catalog_missing");
  assert.equal(apiCalls[0].body.evidence.missing_key, "push_up");
  assert.equal(apiCalls[0].body.evidence.label, "俯卧撑");
  assert.deepEqual(apiCalls[0].body.evidence.aliases, ["pushup", "push-up", "push up", "俯卧撑", "伏地挺身"]);
  assert.doesNotMatch(JSON.stringify(apiCalls), /task-card|private workout body/);
}

async function testPluginConversationActionRequiresDispatchReadyInboxItem() {
  const documentRef = createFakeDocument([]);
  const windowRef = createFakeWindow();
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    now: () => new Date("2026-06-25T08:00:00.000Z"),
    state: {
      selectedWorkspaceId: "owner",
      pluginContextNavPluginId: "movie",
      currentThreadId: "thread-movie",
      currentThread: {
        id: "thread-movie",
        messages: [{
          id: "assistant-movie-1",
          role: "assistant",
          status: "done",
          createdAt: "2026-06-25T07:59:30.000Z",
          content: [
            "<!-- homeai-plugin-conversation-action",
            JSON.stringify({
              pluginId: "movie",
              requestType: "mcp_schema_gap",
              severity: "H2",
              title: "Movie MCP tools missing",
              summary: "Movie conversation needs source-search callables.",
            }),
            "-->",
          ].join("\n"),
        }],
      },
    },
    api: async () => ({
      ok: true,
      dispatchReady: false,
      inboxItem: { id: "ainb_movie_missing_task" },
    }),
  });

  controller.scanPluginConversationActionMetadata();
  await new Promise((resolve) => setImmediate(resolve));
  controller.scanPluginConversationActionMetadata();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.recentEvents.some((item) => item.kind === "plugin_conversation_action_submitted"), false);
  assert.ok(controller.recentEvents.some((item) => item.kind === "plugin_conversation_action_failed"
    && item.fields.error === "plugin_conversation_action_not_dispatch_ready"));
}

function testPluginConversationActionCommentParserRequiresJson() {
  const parsed = parsePluginConversationActionComments([
    "<!-- homeai-plugin-conversation-action",
    "{\"pluginId\":\"health\",\"requestType\":\"catalog_missing\"}",
    "-->",
  ].join("\n"));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pluginId, "health");
  const ownerTask = parsePluginConversationActionComments([
    "<!-- homeai-owner-task-request",
    "{\"title\":\"Office generation capability gap\",\"summary\":\"Low Gateway needs real PPTX generation.\"}",
    "-->",
  ].join("\n"));
  assert.equal(ownerTask.length, 1);
  assert.equal(ownerTask[0].pluginId, "home-ai");
  assert.equal(ownerTask[0].requestType, "capability_gap");
  assert.equal(parsePluginConversationActionComments("plain text").length, 0);
}

async function testOwnerTaskRequestCommentCreatesHomeAiApproval() {
  const documentRef = createFakeDocument([]);
  const windowRef = createFakeWindow();
  const apiCalls = [];
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    now: () => new Date("2026-06-27T08:00:00.000Z"),
    state: {
      selectedWorkspaceId: "wuping",
      viewMode: "topic",
      currentThreadId: "thread-directory",
      currentThread: {
        id: "thread-directory",
        messages: [{
          id: "assistant-directory-1",
          role: "assistant",
          status: "done",
          createdAt: "2026-06-27T07:59:30.000Z",
          content: [
            "已准备给 Owner 审批的能力缺口请求。",
            "<!-- homeai-owner-task-request",
            JSON.stringify({
              title: "Low Gateway cannot generate verified PPTX",
              summary: "Directory-bound low-permission Gateway needs a real Office/PPTX generation and validation tool path.",
              suggestedChange: "Add safe Home AI-owned Office/PPTX generation and validation capability.",
              acceptance: "Host returns a real ainb_* approval id before the assistant claims submission.",
              evidence: {
                capability: "office_pptx_generation_validation",
                affectedSurface: "directory-bound chat",
                requiredTools: ["pptx_create", "pptx_validate"],
                rawText: "private directory note",
                token: "secret-token",
              },
            }),
            "-->",
          ].join("\n"),
        }],
      },
    },
    api: async (url, options) => {
      apiCalls.push({ url, body: JSON.parse(options.body || "{}") });
      return {
        ok: true,
        autoDispatched: false,
        dispatchReady: true,
        inboxItem: { id: "ainb_homeai_office_gap" },
      };
    },
  });

  controller.scanPluginConversationActionMetadata();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, "/api/plugin-conversation/actions");
  assert.equal(apiCalls[0].body.pluginId, "home-ai");
  assert.equal(apiCalls[0].body.workspaceId, "wuping");
  assert.equal(apiCalls[0].body.requestType, "capability_gap");
  assert.equal(apiCalls[0].body.evidence.capability, "office_pptx_generation_validation");
  assert.equal(apiCalls[0].body.evidence.affected_surface, "directory-bound chat");
  assert.deepEqual(apiCalls[0].body.evidence.required_tools, ["pptx_create", "pptx_validate"]);
  assert.doesNotMatch(JSON.stringify(apiCalls), /secret-token|private directory note|ttc_/);
}

async function testPluginConversationActionPostMessageCreatesOwnerApproval() {
  const documentRef = createFakeDocument([]);
  const windowRef = createFakeWindow();
  const apiCalls = [];
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-health-conversation",
      pluginContextNavPluginId: "health",
    },
    api: async (url, options) => {
      apiCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        autoDispatched: false,
        inboxItem: { id: "inbox_health_push_up" },
      };
    },
  });
  controller.install();
  windowRef.listeners.message({
    source: windowRef,
    origin: "http://127.0.0.1:8797",
    data: {
      type: "homeai.plugin_conversation.action",
      pluginId: "health",
      requestType: "catalog_missing",
      severity: "H2",
      title: "Strength catalog missing push_up",
      summary: "Health strength catalog lacks a push_up exercise key.",
      suggestedChange: "Add key push_up with label 俯卧撑 and aliases pushup, push-up, push up, 俯卧撑, 伏地挺身.",
      acceptance: "Focused catalog tests pass and future push-up strength sessions can use the standard key.",
      evidence: {
        catalog: "strength_exercise",
        missingKey: "push_up",
        label: "俯卧撑",
        english: "Push-up",
        aliases: ["pushup", "push-up", "push up", "俯卧撑", "伏地挺身"],
        count: 65,
        rawText: "private workout body",
        token: "secret-token",
        path: "/private/health/workout.json",
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, "/api/plugin-conversation/actions");
  assert.equal(apiCalls[0].body.pluginId, "health");
  assert.equal(apiCalls[0].body.requestType, "catalog_missing");
  assert.equal(apiCalls[0].body.severity, "H2");
  assert.equal(apiCalls[0].body.workspaceId, "owner");
  assert.equal(apiCalls[0].body.evidence.missing_key, "push_up");
  assert.equal(apiCalls[0].body.evidence.label, "俯卧撑");
  assert.equal(apiCalls[0].body.evidence.english, "Push-up");
  assert.deepEqual(apiCalls[0].body.evidence.aliases, ["pushup", "push-up", "push up", "俯卧撑", "伏地挺身"]);
  assert.equal(apiCalls[0].body.evidence.count, 65);
  assert.doesNotMatch(JSON.stringify(apiCalls), /task-card|private workout body|secret-token|workout\.json/);
}

async function testPluginConversationActionRejectsUnmatchedForeignFrame() {
  const documentRef = createFakeDocument([]);
  const windowRef = createFakeWindowWithTransportDiagnostics();
  const apiCalls = [];
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-health-conversation",
      pluginContextNavPluginId: "health",
    },
    api: async (url, options) => {
      apiCalls.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    },
  });
  controller.install();
  windowRef.listeners.message({
    source: {},
    origin: "https://evil.example",
    data: {
      type: "homeai.plugin_conversation.action",
      pluginId: "health",
      title: "Should not create",
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(apiCalls.length, 0);
  assert.equal(windowRef.transportCalls.length, 1);
  assert.equal(windowRef.transportCalls[0].body.kind, "rejected_no_frame");
  assert.equal(windowRef.transportCalls[0].body.pluginId, "health");
}

async function testPluginDiagnosticReportAutoSubmitsBoundedEvent() {
  const frameWindow = {};
  const frame = {
    contentWindow: frameWindow,
    dataset: { pluginId: "music" },
    getAttribute(name) {
      if (name === "src") return "/api/hermes-plugins/music/proxy/?embed=hermes&workspaceId=owner&pluginRoute=favorites&launch=secret";
      return "";
    },
    closest() {
      return { dataset: { pluginId: "music", workspaceId: "owner" } };
    },
    addEventListener() {},
  };
  const documentRef = createFakeDocument([frame]);
  const windowRef = createFakeWindow();
  const apiCalls = [];
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-music",
      pluginContextNavPluginId: "music",
    },
    api: async (url, options) => {
      apiCalls.push({ url, body: JSON.parse(options.body) });
      return {
        case_id: "diag_music_playback_failed",
        status: "card_candidate",
        owner_notification: { notified: true },
      };
    },
  });
  controller.install();
  windowRef.listeners.message({
    source: frameWindow,
    origin: "http://127.0.0.1:4193",
    data: {
      type: "homeai.diagnostic.report",
      pluginId: "music",
      category: "music_playback_failed",
      diagnostic_type: "playback_failed",
      severity_hint: "H2",
      evidence_confidence: 0.82,
      error_code: "music_album_playback_failed",
      status_code: 504,
      duration_bucket: "gt_10s",
      pluginVersion: "music-shell-v1",
      context: {
        pluginId: "music",
        sourceSurface: "embedded-plugin",
        route: "/music?pluginRoute=favorites&workspaceId=owner&launch=secret",
        workspaceId: "owner",
        action: "album_play",
        routeKind: "album_detail",
        readMode: "detail",
        renderMode: "single-pane",
        sourceKind: "local_library",
        itemHash: "albumhash",
        buildId: "plugin-build-v1",
        cacheKey: "plugin-cache-v1",
        embedded: true,
        promptText: "private prompt",
        token: "secret-token",
        path: "/private/music/file.flac",
      },
      counts: {
        retryCount: 3,
        visibleCount: 2,
        duplicateCount: 1,
        paneCount: 1,
        statusCode: 500,
        rawText: "private text",
      },
      breadcrumbs: [{
        kind: "music_playback",
        code: "album_click",
        status: "failed",
        fields: {
          item_kind: "album",
          item_hash: "sha256prefix",
          retry_count: 3,
          visible_count: 2,
          route_kind: "album_detail",
          title: "Private Album Title",
          url: "https://private.example/play?token=secret",
          providerPayload: "raw provider payload",
        },
      }],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, "/api/v1/home-ai/diagnostics/events");
  const payload = apiCalls[0].body;
  assert.equal(payload.plugin_id, "music");
  assert.equal(payload.category, "music_playback_failed");
  assert.equal(payload.diagnostic_type, "playback_failed");
  assert.equal(payload.error_code, "music_album_playback_failed");
  assert.equal(payload.status_code, 504);
  assert.equal(payload.duration_bucket, "gt_10s");
  assert.equal(payload.severity_hint, "H2");
  assert.equal(payload.evidence_confidence, 0.82);
  assert.equal(payload.workspaceId, "owner");
  assert.equal(payload.route, "/music?pluginRoute=favorites&workspaceId=owner");
  assert.deepEqual(payload.counts, {
    duplicate_count: 1,
    pane_count: 1,
    retry_count: 3,
    status_code: 504,
    visible_count: 2,
  });
  assert.equal(payload.context.action, "album_play");
  assert.equal(payload.context.route_kind, "album_detail");
  assert.equal(payload.context.read_mode, "detail");
  assert.equal(payload.context.render_mode, "single-pane");
  assert.equal(payload.context.source_kind, "local_library");
  assert.equal(payload.context.item_hash, "albumhash");
  assert.equal(payload.context.build_id, "plugin-build-v1");
  assert.equal(payload.context.cache_key, "plugin-cache-v1");
  assert.equal(payload.context.embedded, true);
  assert.equal(payload.frontend_state.pluginVersion, "music-shell-v1");
  assert.equal(payload.breadcrumbs.at(-1).fields.item_hash, "sha256prefix");
  assert.equal(payload.breadcrumbs.at(-1).fields.retry_count, 3);
  assert.equal(payload.breadcrumbs.at(-1).fields.visible_count, 2);
  assert.equal(payload.breadcrumbs.at(-1).fields.route_kind, "album_detail");
  assert.doesNotMatch(JSON.stringify(apiCalls), /task-card/);
  assert.doesNotMatch(JSON.stringify(payload), /Private Album Title|private\.example|provider payload|launch=secret|secret-token|private prompt|private text|file\.flac/);
}

async function testPluginDiagnosticReportTransportFailureIsPersisted() {
  const frameWindow = {};
  const frame = {
    contentWindow: frameWindow,
    dataset: { pluginId: "music" },
    getAttribute(name) {
      if (name === "src") return "/api/hermes-plugins/music/proxy/?embed=hermes&workspaceId=owner";
      return "";
    },
    closest() {
      return { dataset: { pluginId: "music", workspaceId: "owner" } };
    },
    addEventListener() {},
  };
  const documentRef = createFakeDocument([frame]);
  const windowRef = createFakeWindowWithTransportDiagnostics();
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-music",
      pluginContextNavPluginId: "music",
    },
    api: async () => {
      throw new Error("diagnostic_submit_failed");
    },
  });
  controller.install();
  windowRef.listeners.message({
    source: frameWindow,
    origin: "http://127.0.0.1:4891",
    data: {
      type: "homeai.diagnostic.report",
      pluginId: "music",
      category: "music_playback_failed",
      diagnostic_type: "playback_failed",
      severity_hint: "H2",
      error_code: "music_album_playback_request_failed",
      breadcrumbs: [{
        kind: "music_playback",
        code: "album_click",
        status: "failed",
        fields: {
          item_hash: "albumhash",
          title: "Private Album Title",
          providerPayload: "raw provider payload",
        },
      }],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(windowRef.transportCalls.length, 3);
  assert.deepEqual(windowRef.transportCalls.map((call) => call.body.kind), [
    "received",
    "submit_started",
    "submit_failed",
  ]);
  assert.equal(windowRef.transportCalls[0].url, "/api/client-layout-diagnostics");
  assert.equal(windowRef.transportCalls[2].body.pluginId, "music");
  assert.equal(windowRef.transportCalls[2].body.category, "music_playback_failed");
  assert.doesNotMatch(JSON.stringify(windowRef.transportCalls), /Private Album Title|provider payload|albumhash/);
}

async function testPluginDiagnosticReportNoFrameRejectionIsPersisted() {
  const documentRef = createFakeDocument([]);
  const windowRef = createFakeWindowWithTransportDiagnostics();
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    window: windowRef,
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "plugin-music",
      pluginContextNavPluginId: "music",
    },
  });
  controller.install();
  windowRef.listeners.message({
    source: {},
    origin: "http://127.0.0.1:4891",
    data: {
      type: "homeai.diagnostic.report",
      pluginId: "music",
      category: "music_playback_failed",
      diagnostic_type: "playback_failed",
      error_code: "music_album_playback_request_failed",
      title: "Private Album Title",
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(windowRef.transportCalls.length, 1);
  assert.equal(windowRef.transportCalls[0].url, "/api/client-layout-diagnostics");
  assert.equal(windowRef.transportCalls[0].body.kind, "rejected_no_frame");
  assert.equal(windowRef.transportCalls[0].body.pluginId, "music");
  assert.equal(windowRef.transportCalls[0].body.error, "plugin_frame_not_matched");
  assert.doesNotMatch(JSON.stringify(windowRef.transportCalls), /Private Album Title/);
}

async function testRuntimeFacadeOwnsDiagnosticApiAndStateWhenPresent() {
  const frameWindow = {};
  const frame = {
    contentWindow: frameWindow,
    dataset: { pluginId: "music" },
    getAttribute(name) {
      return name === "src" ? "/plugins/music?pluginRoute=now-playing&workspaceId=owner&token=secret" : "";
    },
    closest() {
      return { dataset: { pluginId: "music", workspaceId: "owner" } };
    },
    addEventListener() {},
  };
  const documentRef = createFakeDocument([frame]);
  const windowRef = createFakeWindowWithTransportDiagnostics();
  const apiCalls = [];
  const eventCalls = [];
  const statePatches = [];
  const statusCalls = [];
  const runtimeFacade = {
    api: async (url, options = {}) => {
      apiCalls.push({ url, body: JSON.parse(options.body || "{}") });
      return {
        ok: true,
        case_id: "diagcase_runtime_facade",
        status: "recorded",
        owner_notification: { notified: true },
      };
    },
    events: {
      emit(type, detail = {}) {
        eventCalls.push({ type, detail });
      },
    },
    state: {
      get() {
        return {
          selectedWorkspaceId: "owner",
          viewMode: "plugin-music",
          pluginContextNavPluginId: "music",
        };
      },
      set(patch = {}) {
        statePatches.push(patch);
      },
    },
    feedback: {
      status(message, detail = {}) {
        statusCalls.push({ message, detail });
      },
    },
  };
  const controller = createAiOpsDiagnosticFeedbackController({
    document: documentRef,
    runtimeFacade,
    window: windowRef,
  });

  const result = await controller.submitPluginDiagnosticReport(frame, {
    type: "homeai.diagnostic.report",
    pluginId: "music",
    category: "music_playback_failed",
    diagnostic_type: "playback_failed",
    severity_hint: "H2",
    error_code: "music_album_playback_request_failed",
  });

  assert.equal(result.case_id, "diagcase_runtime_facade");
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].url, "/api/v1/home-ai/diagnostics/events");
  assert.equal(apiCalls[0].body.plugin_id, "music");
  assert.equal(apiCalls[0].body.workspaceId, "owner");
  assert.ok(statePatches.some((patch) => patch.aiOpsDiagnosticSubmissionStatus === "submitting"));
  assert.ok(statePatches.some((patch) => (
    patch.aiOpsDiagnosticSubmissionStatus === "submitted" &&
    patch.aiOpsDiagnosticCaseId === "diagcase_runtime_facade"
  )));
  assert.ok(eventCalls.some((event) => event.type === "ai-ops-diagnostic:plugin-submit:start"));
  assert.ok(eventCalls.some((event) => event.type === "ai-ops-diagnostic:plugin-submit:success"));
  assert.ok(eventCalls.some((event) => event.type === "ai-ops-diagnostic:record"));
  assert.equal(statusCalls.length, 0);
  assert.doesNotMatch(JSON.stringify(apiCalls), /secret/);
}

function testDiagnosticPanelUsesSolidSurface() {
  assert.match(stylesCss, /\.ai-ops-diagnostic-panel \{[\s\S]*?background: #fbfcfa;/);
  assert.match(stylesCss, /:root\[data-theme="dark"\] \.ai-ops-diagnostic-panel \{[\s\S]*?background: #171d20;/);
  assert.doesNotMatch(stylesCss, /\.ai-ops-diagnostic-panel \{[\s\S]*?background: var\(--surface\);/);
}

async function run() {
  testSanitizeClientDiagnostics();
  testSafeRouteKeepsOnlyAllowedParams();
  testPayloadIsBoundedAndRedacted();
  testPluginContextPayloadIsBounded();
  testGestureDoesNotConflictWithTwoFingerShellGesture();
  testOwnerSystemConsoleActionLivesInFeedbackMenu();
  testPluginDiagnosticBridgeIsPlatformOwned();
  testPluginConversationActionCommentParserRequiresJson();
  await testOwnerTaskRequestCommentCreatesHomeAiApproval();
  await testPluginConversationActionPostMessageCreatesOwnerApproval();
  await testPluginConversationActionMetadataCommentCreatesOwnerApproval();
  await testPluginConversationActionRequiresDispatchReadyInboxItem();
  await testPluginConversationActionRejectsUnmatchedForeignFrame();
  await testPluginDiagnosticReportAutoSubmitsBoundedEvent();
  await testPluginDiagnosticReportTransportFailureIsPersisted();
  await testPluginDiagnosticReportNoFrameRejectionIsPersisted();
  await testRuntimeFacadeOwnsDiagnosticApiAndStateWhenPresent();
  testDiagnosticPanelUsesSolidSurface();

  console.log("AI Ops diagnostic feedback UI tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
