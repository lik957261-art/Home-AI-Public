"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HomeAIDiagnosticFeedback = factory(root);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (root = {}) {
  const RING_LIMIT = 80;
  const LONG_PRESS_MS = 900;
  const MOVE_CANCEL_PX = 24;
  const TRIGGER_TOUCH_COUNT = 3;
  const PLUGIN_FRAME_SELECTOR = "iframe.embedded-plugin-frame, iframe.wardrobe-plugin-frame";
  const PLUGIN_DIAGNOSTIC_OPEN_MESSAGE_TYPES = new Set([
    "homeai.diagnostic.open",
    "homeai:open-diagnostic-feedback",
    "hermes.diagnostic.open",
  ]);
  const PLUGIN_DIAGNOSTIC_REPORT_MESSAGE_TYPES = new Set([
    "homeai.diagnostic.report",
    "homeai:diagnostic-report",
    "hermes.diagnostic.report",
  ]);
  const PLUGIN_CONVERSATION_ACTION_MESSAGE_TYPES = new Set([
    "homeai.plugin_conversation.action",
    "homeai.pluginConversation.action",
    "homeai.plugin_conversation.repair_request",
    "homeai.pluginConversation.repairRequest",
  ]);
  const PLUGIN_CONVERSATION_ACTION_COMMENT_RE = /<!--\s*homeai-plugin-conversation-action\b([\s\S]*?)-->/gi;
  const PLUGIN_CONVERSATION_ACTION_SCAN_RECENT_MS = 15 * 60 * 1000;
  const CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT = "/api/client-layout-diagnostics";
  const SAFE_PLUGIN_REPORT_FIELD_KEYS = new Set([
    "action",
    "actual_count",
    "build_id",
    "cache_key",
    "client_build_id",
    "collection_hash",
    "collection_kind",
    "count",
    "current_count",
    "dom_count",
    "duration_bucket",
    "duplicate_count",
    "embedded",
    "error_code",
    "expected_count",
    "failure_count",
    "item_hash",
    "item_kind",
    "mode",
    "pane_count",
    "playback_mode",
    "player",
    "plugin_version",
    "provider",
    "pwa",
    "read_mode",
    "refresh_count",
    "render_mode",
    "render_signature_hash",
    "rendered_count",
    "repeated_failure_count",
    "request_count",
    "route_kind",
    "retry_count",
    "route",
    "shell_cache_name",
    "source_hash",
    "source_kind",
    "source_surface",
    "status",
    "status_code",
    "surface",
    "visible_count",
    "workspaceId",
  ]);
  const SAFE_PLUGIN_REPORT_COUNT_KEYS = new Set([
    "actual_count",
    "count",
    "current_count",
    "dom_count",
    "duplicate_count",
    "expected_count",
    "failure_count",
    "pane_count",
    "refresh_count",
    "rendered_count",
    "repeated_failure_count",
    "request_count",
    "retry_count",
    "status_code",
    "visible_count",
  ]);
  const SAFE_PLUGIN_REPORT_CONTEXT_KEYS = new Set([
    "action",
    "build_id",
    "cache_key",
    "client_build_id",
    "collection_hash",
    "collection_kind",
    "embedded",
    "item_hash",
    "item_kind",
    "mode",
    "plugin_id",
    "plugin_version",
    "provider",
    "pwa",
    "read_mode",
    "render_mode",
    "render_signature_hash",
    "route",
    "route_kind",
    "shell_cache_name",
    "source_hash",
    "source_kind",
    "source_surface",
    "surface",
    "workspaceId",
  ]);
  const SAFE_PLUGIN_CONVERSATION_EVIDENCE_KEYS = new Set([
    "action",
    "alias",
    "aliases",
    "catalog",
    "category",
    "code",
    "count",
    "current_count",
    "english",
    "error_code",
    "expected_count",
    "key",
    "label",
    "labels",
    "missing_key",
    "request_type",
    "route_kind",
    "source_kind",
    "status",
    "status_code",
    "surface",
    "type",
    "workspaceId",
  ]);
  const CONTENT_KEY_RE = /message|prompt|completion|transcript|markdown|html|text|value|input|image|screenshot|payload/i;
  const SENSITIVE_KEY_RE = /authorization|cookie|password|secret|token|access.?key|workspace.?key|launch.?key|oauth|bearer/i;
  const SECRET_VALUE_RE = /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}|((?:token|key|password|secret)\s*[:= ]\s*)[A-Za-z0-9._~+/=-]{12,}/gi;

  function cleanString(value, maxLength = 180) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function isSafeDiagnosticContentKey(key) {
    return /^(category|route|context|counts|frontend_state|viewMode|pluginId|sourceSurface|workspaceId|thread_id|turn_id|build_id|pluginContextNavPluginId|count|currentMessageCount|duration_bucket|message_nodes|image_nodes|assistant_image_nodes|user_image_nodes|loading_nodes|disabled_buttons)$/i.test(key);
  }

  function sanitizeClientDiagnosticValue(value, key = "", depth = 0) {
    const normalizedKey = cleanString(key, 80);
    if (SENSITIVE_KEY_RE.test(normalizedKey)) return "[REDACTED]";
    if (CONTENT_KEY_RE.test(normalizedKey) && !isSafeDiagnosticContentKey(normalizedKey)) return "[REDACTED]";
    if (value == null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
    if (typeof value === "string") {
      return cleanString(value, normalizedKey === "userAgent" ? 260 : 180)
        .replace(SECRET_VALUE_RE, (match, bearerPrefix, assignmentPrefix) => {
          if (bearerPrefix) return `${bearerPrefix}[REDACTED]`;
          if (assignmentPrefix) return `${assignmentPrefix}[REDACTED]`;
          return "[REDACTED]";
        });
    }
    if (depth >= 4) return null;
    if (Array.isArray(value)) return value.slice(0, RING_LIMIT).map((item) => sanitizeClientDiagnosticValue(item, normalizedKey, depth + 1));
    if (typeof value !== "object") return cleanString(value);
    const out = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      const safeKey = cleanString(childKey, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
      if (!safeKey) continue;
      out[safeKey] = sanitizeClientDiagnosticValue(childValue, safeKey, depth + 1);
    }
    return out;
  }

  function safeRoute(locationRef = root.location) {
    if (!locationRef) return "";
    const params = new URLSearchParams();
    const source = new URLSearchParams(locationRef.search || "");
    ["view", "plugin", "pluginId", "pluginRoute", "workspaceId"].forEach((key) => {
      const value = source.get(key);
      if (value) params.set(key, cleanString(value, 80));
    });
    const query = params.toString();
    return `${locationRef.pathname || "/"}${query ? `?${query}` : ""}`;
  }

  function durationBucket(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value < 0) return "";
    if (value < 100) return "lt_100ms";
    if (value < 500) return "100_500ms";
    if (value < 1000) return "500_1000ms";
    if (value < 3000) return "1_3s";
    if (value < 10000) return "3_10s";
    return "gt_10s";
  }

  function boundedNumber(value, min, max, defaultValue = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return defaultValue;
    return Math.min(max, Math.max(min, number));
  }

  function safeReportCode(value, defaultValue = "") {
    const text = cleanString(value || defaultValue, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
    return text || defaultValue;
  }

  function snakeKey(value) {
    return cleanString(value, 80)
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^A-Za-z0-9._:-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  function normalizePluginReportFields(fields = {}) {
    if (!fields || typeof fields !== "object") return {};
    const out = {};
    for (const [key, value] of Object.entries(fields).slice(0, 32)) {
      const safeKey = cleanString(key, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
      if (!SAFE_PLUGIN_REPORT_FIELD_KEYS.has(safeKey)) continue;
      out[safeKey] = sanitizeClientDiagnosticValue(value, safeKey);
    }
    return out;
  }

  function normalizePluginReportCounts(input = {}, extra = {}) {
    const raw = input && typeof input === "object" ? input : {};
    const source = Object.assign({}, raw, {
      actual_count: raw.actual_count ?? raw.actualCount,
      current_count: raw.current_count ?? raw.currentCount,
      dom_count: raw.dom_count ?? raw.domCount,
      duplicate_count: raw.duplicate_count ?? raw.duplicateCount,
      expected_count: raw.expected_count ?? raw.expectedCount,
      failure_count: raw.failure_count ?? raw.failureCount,
      pane_count: raw.pane_count ?? raw.paneCount,
      refresh_count: raw.refresh_count ?? raw.refreshCount,
      rendered_count: raw.rendered_count ?? raw.renderedCount,
      repeated_failure_count: raw.repeated_failure_count ?? raw.repeatedFailureCount,
      request_count: raw.request_count ?? raw.requestCount,
      retry_count: raw.retry_count ?? raw.retryCount,
      status_code: raw.status_code ?? raw.statusCode,
      visible_count: raw.visible_count ?? raw.visibleCount,
    });
    for (const [key, value] of Object.entries(extra || {})) {
      if (value !== undefined && value !== null && value !== "") source[key] = value;
    }
    const out = {};
    for (const [key, value] of Object.entries(source).slice(0, 40)) {
      const safeKey = cleanString(key, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
      if (!SAFE_PLUGIN_REPORT_COUNT_KEYS.has(safeKey)) continue;
      if (typeof value === "boolean") {
        out[safeKey] = value;
        continue;
      }
      const number = Number(value);
      if (!Number.isFinite(number)) continue;
      out[safeKey] = boundedNumber(number, -1000000, 1000000, 0);
    }
    return out;
  }

  function normalizePluginReportContext(input = {}, extra = {}) {
    const raw = input && typeof input === "object" ? input : {};
    const source = Object.assign({}, raw, {
      build_id: raw.build_id ?? raw.buildId,
      cache_key: raw.cache_key ?? raw.cacheKey,
      client_build_id: raw.client_build_id ?? raw.clientBuildId,
      collection_hash: raw.collection_hash ?? raw.collectionHash,
      collection_kind: raw.collection_kind ?? raw.collectionKind,
      embedded: raw.embedded ?? raw.isEmbedded,
      item_hash: raw.item_hash ?? raw.itemHash,
      item_kind: raw.item_kind ?? raw.itemKind,
      plugin_id: raw.plugin_id ?? raw.pluginId,
      plugin_version: raw.plugin_version ?? raw.pluginVersion,
      pwa: raw.pwa ?? raw.isPwa,
      read_mode: raw.read_mode ?? raw.readMode,
      render_mode: raw.render_mode ?? raw.renderMode,
      render_signature_hash: raw.render_signature_hash ?? raw.renderSignatureHash,
      route_kind: raw.route_kind ?? raw.routeKind,
      shell_cache_name: raw.shell_cache_name ?? raw.shellCacheName,
      source_hash: raw.source_hash ?? raw.sourceHash,
      source_kind: raw.source_kind ?? raw.sourceKind,
      source_surface: raw.source_surface ?? raw.sourceSurface,
    });
    for (const [key, value] of Object.entries(extra || {})) {
      if (value !== undefined && value !== null && value !== "") source[key] = value;
    }
    const out = {};
    for (const [key, value] of Object.entries(source).slice(0, 48)) {
      const safeKey = cleanString(key, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
      if (!SAFE_PLUGIN_REPORT_CONTEXT_KEYS.has(safeKey)) continue;
      if (safeKey === "route") {
        out.route = safeRouteFromValue(value, root.location);
        continue;
      }
      out[safeKey] = sanitizeClientDiagnosticValue(value, safeKey);
    }
    return out;
  }

  function normalizePluginReportBreadcrumbs(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-20).map((item) => {
      const source = item && typeof item === "object" ? item : {};
      const fields = normalizePluginReportFields(source.fields || {});
      const statusCode = source.status_code || source.statusCode || fields.status_code || "";
      if (statusCode) fields.status_code = sanitizeClientDiagnosticValue(statusCode, "status_code");
      return sanitizeClientDiagnosticValue({
        at: source.at ? cleanString(source.at, 40) : "",
        kind: safeReportCode(source.kind, "plugin_event"),
        code: safeReportCode(source.code || source.error_code || source.errorCode, "event"),
        status: safeReportCode(source.status, "unknown"),
        duration_bucket: safeReportCode(source.duration_bucket || source.durationBucket, ""),
        fields,
      });
    });
  }

  function safeRouteFromValue(value, fallbackLocation = root.location) {
    if (!value) return safeRoute(fallbackLocation);
    try {
      return safeRoute(new URL(String(value), fallbackLocation?.href || fallbackLocation?.origin || "http://home.ai/"));
    } catch (_) {
      return cleanString(value, 180);
    }
  }

  function normalizeFeedbackContext(input = {}) {
    if (!input || typeof input !== "object") return {};
    const source = input.context && typeof input.context === "object" ? input.context : input;
    const context = {};
    const pluginId = source.plugin_id || source.pluginId;
    const sourceSurface = source.source_surface || source.sourceSurface;
    const workspaceId = source.workspaceId || source.workspace_id;
    if (pluginId) context.plugin_id = cleanString(pluginId, 80);
    if (sourceSurface) context.source_surface = cleanString(sourceSurface, 80);
    if (source.route) context.route = safeRouteFromValue(source.route, root.location);
    if (workspaceId) context.workspaceId = cleanString(workspaceId, 80);
    return context;
  }

  function inferPluginId(state = {}, locationRef = root.location, context = {}) {
    if (context.plugin_id || context.pluginId) return cleanString(context.plugin_id || context.pluginId, 80);
    const params = new URLSearchParams(locationRef?.search || "");
    return cleanString(params.get("pluginId") || params.get("plugin") || state.pluginContextNavPluginId || state.viewMode || "home-ai", 80);
  }

  function collectDomCounts(documentRef = root.document) {
    if (!documentRef?.querySelectorAll) return {};
    return {
      message_nodes: documentRef.querySelectorAll("[data-message-id], .message").length,
      image_nodes: documentRef.querySelectorAll("img").length,
      assistant_image_nodes: documentRef.querySelectorAll("[data-role='assistant'] img, .message.assistant img, .assistant-message img").length,
      user_image_nodes: documentRef.querySelectorAll("[data-role='user'] img, .message.user img, .user-message img").length,
      loading_nodes: documentRef.querySelectorAll("[aria-busy='true'], .loading, .spinner, [data-loading='true']").length,
      disabled_buttons: documentRef.querySelectorAll("button:disabled, [aria-disabled='true']").length,
    };
  }

  function shortHash(value) {
    const text = String(value || "");
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }

  function parsePluginConversationActionComments(text = "") {
    const actions = [];
    const source = String(text || "");
    PLUGIN_CONVERSATION_ACTION_COMMENT_RE.lastIndex = 0;
    let match = null;
    while ((match = PLUGIN_CONVERSATION_ACTION_COMMENT_RE.exec(source))) {
      const body = String(match[1] || "").trim();
      const start = body.indexOf("{");
      const end = body.lastIndexOf("}");
      if (start < 0 || end <= start) continue;
      try {
        const parsed = JSON.parse(body.slice(start, end + 1));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) actions.push(parsed);
      } catch (_) {
        actions.push({ __parseError: true });
      }
    }
    return actions;
  }

  function createAiOpsDiagnosticFeedbackController(options = {}) {
    const documentRef = options.document || root.document;
    const windowRef = options.window || root;
    const stateRef = options.state || root.state || {};
    const apiClient = options.api || root.api;
    const now = typeof options.now === "function" ? options.now : () => new Date();
    const recentEvents = [];
    let sheet = null;
    let touchTimer = 0;
    let touchStart = null;
    let pendingFeedbackContext = {};
    let frameObserver = null;
    const boundPluginFrames = typeof WeakSet === "function" ? new WeakSet() : null;
    const submittedPluginConversationActionKeys = new Set();

    function record(kind, fields = {}) {
      const item = sanitizeClientDiagnosticValue({
        at: now().toISOString(),
        kind,
        fields,
      });
      recentEvents.push(item);
      while (recentEvents.length > RING_LIMIT) recentEvents.shift();
      return item;
    }

    function submitTransportDiagnostic(kind, fields = {}) {
      if (typeof windowRef.fetch !== "function") return;
      const body = JSON.stringify(sanitizeClientDiagnosticValue({
        event: "plugin_diagnostic_transport",
        kind: safeReportCode(kind, "event"),
        clientVersion: documentRef?.documentElement?.dataset?.clientVersion || "",
        pluginId: fields.pluginId || fields.plugin_id || "",
        category: fields.category || "",
        diagnostic_type: fields.diagnostic_type || fields.diagnosticType || "",
        status: fields.status || "",
        error: fields.error || "",
        case_id: fields.case_id || "",
        owner_notified: Boolean(fields.owner_notified || fields.ownerNotified),
        source_surface: fields.source_surface || fields.sourceSurface || "embedded-plugin",
      }));
      windowRef.fetch(CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    function normalizePluginConversationEvidence(input = {}) {
      const evidence = {};
      const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
      for (const [key, value] of Object.entries(raw)) {
        const safeKey = snakeKey(key);
        if (!SAFE_PLUGIN_CONVERSATION_EVIDENCE_KEYS.has(safeKey)) continue;
        if (value == null) continue;
        if (typeof value === "string") {
          evidence[safeKey] = cleanString(value, 220);
        } else if (typeof value === "number") {
          evidence[safeKey] = Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
        } else if (typeof value === "boolean") {
          evidence[safeKey] = value;
        } else if (Array.isArray(value)) {
          evidence[safeKey] = value.slice(0, 12)
            .filter((item) => ["string", "number", "boolean"].includes(typeof item))
            .map((item) => cleanString(item, 120))
            .filter(Boolean);
        }
      }
      return evidence;
    }

    function buildPayload(input = {}) {
      const category = cleanString(input.category || "visual_mismatch", 80);
      const note = cleanString(input.note || "", 260);
      const feedbackContext = Object.assign({}, pendingFeedbackContext, normalizeFeedbackContext(input.context || {}));
      const pluginId = inferPluginId(stateRef, windowRef.location, feedbackContext);
      return sanitizeClientDiagnosticValue({
        schema_version: "homeai.clientDiagnosticFeedback.v1",
        plugin_id: pluginId,
        source_surface: feedbackContext.source_surface || (windowRef.navigator?.standalone ? "ios-pwa" : "web"),
        diagnostic_type: `user_report_${category}`,
        category,
        severity_hint: input.severity_hint || "H3",
        route: feedbackContext.route ? cleanString(feedbackContext.route, 180) : safeRoute(windowRef.location),
        build_id: documentRef?.documentElement?.dataset?.clientVersion || "",
        workspaceId: feedbackContext.workspaceId || stateRef.selectedWorkspaceId || "",
        thread_id: stateRef.currentThreadId || stateRef.currentThread?.id || "",
        user_note: note,
        breadcrumbs: recentEvents.slice(-RING_LIMIT),
        dom: collectDomCounts(documentRef),
        frontend_state: {
          viewMode: stateRef.viewMode || "",
          singleWindowMode: stateRef.singleWindowMode || "",
          pluginContextNavPluginId: stateRef.pluginContextNavPluginId || "",
          composerSendInFlight: Boolean(stateRef.composerSendInFlight),
          currentThreadRefreshInFlight: Boolean(stateRef.currentThreadRefreshInFlight),
          currentMessageCount: Array.isArray(stateRef.currentThread?.messages) ? stateRef.currentThread.messages.length : 0,
        },
      });
    }

    function buildPluginDiagnosticReportPayload(frame, input = {}) {
      const contextInput = input.context && typeof input.context === "object" ? input.context : input;
      const feedbackContext = pluginFrameContext(frame, contextInput);
      const pluginId = feedbackContext.plugin_id || inferPluginId(stateRef, windowRef.location, feedbackContext);
      const severity = cleanString(input.severity_hint || input.severityHint || "H3", 8).toUpperCase();
      const normalizedSeverity = /^H[1-4]$/.test(severity) ? severity : "H3";
      const confidence = boundedNumber(input.evidence_confidence ?? input.evidenceConfidence, 0, 1, normalizedSeverity === "H2" ? 0.75 : 0.55);
      const category = safeReportCode(input.category || input.issueCategory || "plugin_runtime_failure", "plugin_runtime_failure");
      const diagnosticType = safeReportCode(input.diagnostic_type || input.diagnosticType || category, category);
      const errorCode = safeReportCode(input.error_code || input.errorCode || input.code || category, category);
      const statusCode = input.status_code ?? input.statusCode ?? "";
      const durationBucket = safeReportCode(input.duration_bucket || input.durationBucket, "");
      const counts = input.counts && typeof input.counts === "object" ? input.counts : {};
      const pluginReportCounts = normalizePluginReportCounts(counts, {
        retry_count: input.retry_count ?? input.retryCount,
        status_code: statusCode,
      });
      const pluginReportContext = normalizePluginReportContext(contextInput, {
        plugin_id: pluginId,
        plugin_version: input.pluginVersion || input.plugin_version,
        cache_key: input.cacheKey || input.cache_key,
        source_surface: feedbackContext.source_surface || "embedded-plugin",
      });
      const pluginReportFields = normalizePluginReportFields({
        plugin_version: input.pluginVersion || input.plugin_version,
        cache_key: input.cacheKey || input.cache_key,
        error_code: errorCode,
        status_code: statusCode,
        retry_count: input.retry_count ?? input.retryCount ?? counts.retry_count ?? counts.retryCount,
        duration_bucket: durationBucket,
        item_kind: input.item_kind || input.itemKind,
        collection_kind: input.collection_kind || input.collectionKind,
        item_hash: input.item_hash || input.itemHash,
        collection_hash: input.collection_hash || input.collectionHash,
        playback_mode: input.playback_mode || input.playbackMode,
        provider: input.provider,
        player: input.player,
      });
      const pluginBreadcrumbs = normalizePluginReportBreadcrumbs(input.breadcrumbs || input.events || []);
      return sanitizeClientDiagnosticValue({
        schema_version: "homeai.clientDiagnosticFeedback.v1",
        plugin_id: pluginId,
        source_surface: feedbackContext.source_surface || "embedded-plugin",
        diagnostic_type: diagnosticType,
        category,
        error_code: errorCode,
        status_code: statusCode,
        duration_bucket: durationBucket,
        severity_hint: normalizedSeverity,
        evidence_confidence: confidence,
        route: feedbackContext.route ? cleanString(feedbackContext.route, 180) : safeRoute(windowRef.location),
        build_id: documentRef?.documentElement?.dataset?.clientVersion || "",
        workspaceId: feedbackContext.workspaceId || stateRef.selectedWorkspaceId || "",
        thread_id: stateRef.currentThreadId || stateRef.currentThread?.id || "",
        user_note: "",
        counts: pluginReportCounts,
        context: pluginReportContext,
        breadcrumbs: recentEvents.slice(-20).concat(pluginBreadcrumbs).slice(-RING_LIMIT),
        dom: collectDomCounts(documentRef),
        frontend_state: Object.assign({
          viewMode: stateRef.viewMode || "",
          singleWindowMode: stateRef.singleWindowMode || "",
          pluginContextNavPluginId: stateRef.pluginContextNavPluginId || "",
          pluginVersion: cleanString(input.pluginVersion || input.plugin_version || "", 80),
          pluginCacheKey: cleanString(input.cacheKey || input.cache_key || "", 80),
        }, pluginReportFields),
      });
    }

    function ensureSheet() {
      if (sheet || !documentRef?.body) return sheet;
      sheet = documentRef.createElement("div");
      sheet.className = "ai-ops-diagnostic-sheet hidden";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", "问题反馈");
      sheet.innerHTML = `
        <div class="ai-ops-diagnostic-panel">
          <div class="ai-ops-diagnostic-head">
            <strong>反馈当前问题</strong>
            <button type="button" data-ai-ops-close aria-label="关闭">×</button>
          </div>
          <div class="ai-ops-diagnostic-context" data-ai-ops-context>当前页面：Home AI</div>
          <label>
            <span>类型</span>
            <select data-ai-ops-category>
              <option value="plugin_issue">插件内问题</option>
              <option value="visual_mismatch">画面不对</option>
              <option value="action_unresponsive">按钮没反应</option>
              <option value="save_failed">保存失败</option>
              <option value="content_missing">内容缺失</option>
              <option value="stuck_loading">卡住/加载不出</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            <span>补充一句</span>
            <textarea data-ai-ops-note maxlength="260" rows="3" placeholder="可以不填；不要输入密码、密钥或隐私正文"></textarea>
          </label>
          <p data-ai-ops-status>将只提交最近的状态、计数和错误码。</p>
          <div class="ai-ops-diagnostic-actions">
            <button type="button" data-ai-ops-close>取消</button>
            <button type="button" data-ai-ops-submit>提交</button>
          </div>
        </div>
      `;
      sheet.querySelectorAll("[data-ai-ops-close]").forEach((button) => button.addEventListener("click", closeFeedback));
      sheet.querySelector("[data-ai-ops-submit]")?.addEventListener("click", submitFeedback);
      documentRef.body.appendChild(sheet);
      return sheet;
    }

    function setStatus(message, tone = "") {
      const target = sheet?.querySelector?.("[data-ai-ops-status]");
      if (!target) return;
      target.textContent = message;
      target.dataset.tone = tone;
    }

    function setContextLabel(context = {}) {
      const target = sheet?.querySelector?.("[data-ai-ops-context]");
      if (!target) return;
      if (context.plugin_id && context.plugin_id !== "home-ai") {
        const source = context.source_surface ? ` · ${context.source_surface}` : "";
        target.textContent = `当前插件：${context.plugin_id}${source}`;
      } else {
        target.textContent = "当前页面：Home AI";
      }
    }

    function optionExists(select, value) {
      if (!select || !value) return false;
      return Array.from(select.options || []).some((option) => option.value === value);
    }

    function openFeedback(detail = {}) {
      ensureSheet();
      if (!sheet) return;
      pendingFeedbackContext = normalizeFeedbackContext(detail);
      setContextLabel(pendingFeedbackContext);
      const category = sheet.querySelector("[data-ai-ops-category]");
      const wantedCategory = cleanString(detail.category || (pendingFeedbackContext.plugin_id ? "plugin_issue" : ""), 80);
      if (optionExists(category, wantedCategory)) category.value = wantedCategory;
      setStatus("将只提交最近的状态、计数和错误码。", "");
      sheet.classList.remove("hidden");
      record("feedback_opened", {
        trigger: detail.trigger || "manual",
        pluginId: pendingFeedbackContext.plugin_id || "",
        sourceSurface: pendingFeedbackContext.source_surface || "",
      });
      sheet.querySelector("[data-ai-ops-category]")?.focus?.();
    }

    function closeFeedback() {
      if (!sheet) return;
      sheet.classList.add("hidden");
    }

    async function submitFeedback() {
      if (!sheet) return;
      const category = sheet.querySelector("[data-ai-ops-category]")?.value || "visual_mismatch";
      const note = sheet.querySelector("[data-ai-ops-note]")?.value || "";
      const payload = buildPayload({ category, note, context: pendingFeedbackContext });
      if (typeof apiClient !== "function") {
        setStatus("当前 API 尚未就绪，稍后再试。", "error");
        return;
      }
      setStatus("正在提交诊断...", "pending");
      try {
        const result = await apiClient("/api/v1/home-ai/diagnostics/events", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        record("feedback_submitted", { case_id: result?.case_id || "", status: result?.status || "" });
        setStatus(`已记录：${result?.case_id || "diagnostic case"}`, "ok");
        windowRef.setTimeout?.(closeFeedback, 900);
      } catch (err) {
        record("feedback_submit_failed", { error: err?.code || err?.message || "submit_failed" });
        setStatus("提交失败，诊断未记录。", "error");
      }
    }

    async function submitPluginDiagnosticReport(frame, input = {}) {
      const payload = buildPluginDiagnosticReportPayload(frame, input);
      if (typeof apiClient !== "function") {
        record("plugin_diagnostic_report_failed", {
          pluginId: payload.plugin_id,
          error: "api_unavailable",
        });
        submitTransportDiagnostic("submit_failed", {
          pluginId: payload.plugin_id,
          category: payload.category,
          diagnostic_type: payload.diagnostic_type,
          error: "api_unavailable",
        });
        return null;
      }
      submitTransportDiagnostic("submit_started", {
        pluginId: payload.plugin_id,
        category: payload.category,
        diagnostic_type: payload.diagnostic_type,
      });
      try {
        const result = await apiClient("/api/v1/home-ai/diagnostics/events", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        record("plugin_diagnostic_report_submitted", {
          pluginId: payload.plugin_id,
          category: payload.category,
          case_id: result?.case_id || "",
          ownerNotified: Boolean(result?.owner_notification?.notified),
        });
        submitTransportDiagnostic("submit_ok", {
          pluginId: payload.plugin_id,
          category: payload.category,
          diagnostic_type: payload.diagnostic_type,
          case_id: result?.case_id || "",
          owner_notified: Boolean(result?.owner_notification?.notified),
        });
        return result;
      } catch (err) {
        record("plugin_diagnostic_report_failed", {
          pluginId: payload.plugin_id,
          category: payload.category,
          error: err?.code || err?.message || "submit_failed",
        });
        submitTransportDiagnostic("submit_failed", {
          pluginId: payload.plugin_id,
          category: payload.category,
          diagnostic_type: payload.diagnostic_type,
          error: err?.code || err?.message || "submit_failed",
        });
        return null;
      }
    }

    function buildPluginConversationActionPayload(frame, input = {}) {
      const contextInput = input.context && typeof input.context === "object" ? input.context : input;
      const context = frame ? pluginFrameContext(frame, contextInput) : normalizeFeedbackContext({
        plugin_id: input.pluginId || input.plugin_id || stateRef.pluginContextNavPluginId || "",
        source_surface: input.source_surface || input.sourceSurface || "host-plugin-conversation",
        route: input.route || safeRoute(windowRef.location),
        workspaceId: input.workspaceId || input.workspace_id || stateRef.selectedWorkspaceId || "",
      });
      const pluginId = cleanString(input.pluginId || input.plugin_id || context.plugin_id || "", 80);
      const evidence = Object.assign({
        source_surface: context.source_surface || "host-plugin-conversation",
        route_kind: cleanString(input.routeKind || input.route_kind || stateRef.viewMode || "", 80),
      }, normalizePluginConversationEvidence(input.evidence || input.boundedEvidence || input.bounded_evidence || {}));
      return sanitizeClientDiagnosticValue({
        pluginId,
        workspaceId: context.workspaceId || input.workspaceId || input.workspace_id || stateRef.selectedWorkspaceId || "",
        requestType: safeReportCode(input.requestType || input.request_type || input.category || "repair_request", "repair_request"),
        severity: cleanString(input.severity || input.severity_hint || input.severityHint || "H2", 8).toUpperCase(),
        title: cleanString(input.title || input.summary || "Plugin repair request", 180),
        summary: cleanString(input.summary || input.problem || input.userSummary || input.user_summary || "", 900),
        suggestedChange: cleanString(input.suggestedChange || input.suggested_change || input.recommendedChange || input.recommended_change || "", 1400),
        acceptance: cleanString(input.acceptance || input.validation || input.expectedResult || input.expected_result || "", 900),
        privacyBoundary: cleanString(input.privacyBoundary || input.privacy_boundary || "", 700),
        sourceSurface: context.source_surface || "host-plugin-conversation",
        evidence,
      });
    }

    async function submitPluginConversationAction(frame, input = {}) {
      const payload = buildPluginConversationActionPayload(frame, input);
      if (!payload.pluginId) {
        record("plugin_conversation_action_failed", { error: "plugin_id_required" });
        return null;
      }
      if (typeof apiClient !== "function") {
        record("plugin_conversation_action_failed", {
          pluginId: payload.pluginId,
          error: "api_unavailable",
        });
        return null;
      }
      try {
        const result = await apiClient("/api/plugin-conversation/actions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        record("plugin_conversation_action_submitted", {
          pluginId: payload.pluginId,
          requestType: payload.requestType,
          inboxItemId: result?.inboxItem?.id || "",
          autoDispatched: Boolean(result?.autoDispatched),
        });
        return result;
      } catch (err) {
        record("plugin_conversation_action_failed", {
          pluginId: payload.pluginId,
          requestType: payload.requestType,
          error: err?.code || err?.message || "submit_failed",
        });
        return null;
      }
    }

    function pluginConversationActionStorageKey(key) {
      return `homeai.pluginConversationAction.${key}`;
    }

    function pluginConversationActionAlreadySubmitted(key) {
      if (!key || submittedPluginConversationActionKeys.has(key)) return true;
      try {
        return Boolean(windowRef.localStorage?.getItem(pluginConversationActionStorageKey(key)));
      } catch (_) {
        return false;
      }
    }

    function markPluginConversationActionSubmitted(key, payload = {}) {
      if (!key) return;
      submittedPluginConversationActionKeys.add(key);
      try {
        windowRef.localStorage?.setItem(pluginConversationActionStorageKey(key), JSON.stringify({
          at: now().toISOString(),
          inboxItemId: payload.inboxItemId || "",
        }));
      } catch (err) {
        record("plugin_conversation_action_storage_failed", {
          error: err?.code || err?.message || "storage_write_failed",
        });
      }
    }

    function messageTimestampMs(message = {}) {
      const raw = message.completedAt || message.updatedAt || message.createdAt || message.submittedAt || message.timestamp || "";
      const ms = Date.parse(String(raw || ""));
      return Number.isFinite(ms) ? ms : 0;
    }

    function assistantMessageEligibleForPluginConversationActionScan(message = {}) {
      if (String(message.role || "") !== "assistant") return false;
      if (message.revokedAt) return false;
      if (["queued", "running"].includes(String(message.status || ""))) return false;
      const ms = messageTimestampMs(message);
      if (!ms) return true;
      return Math.abs(now().getTime() - ms) <= PLUGIN_CONVERSATION_ACTION_SCAN_RECENT_MS;
    }

    function pluginConversationActionKey(message = {}, action = {}, index = 0) {
      return shortHash([
        stateRef.currentThreadId || stateRef.currentThread?.id || "",
        message.id || "",
        index,
        action.pluginId || action.plugin_id || "",
        action.requestType || action.request_type || action.category || "",
        action.title || "",
        action.summary || "",
        action.suggestedChange || action.suggested_change || "",
      ].join("\n"));
    }

    function scanPluginConversationActionMetadata() {
      const messages = Array.isArray(stateRef.currentThread?.messages) ? stateRef.currentThread.messages : [];
      for (const message of messages) {
        if (!assistantMessageEligibleForPluginConversationActionScan(message)) continue;
        const actions = parsePluginConversationActionComments(message.content || "");
        actions.forEach((action, index) => {
          const key = pluginConversationActionKey(message, action, index);
          if (pluginConversationActionAlreadySubmitted(key)) return;
          submittedPluginConversationActionKeys.add(key);
          if (action.__parseError) {
            record("plugin_conversation_action_metadata_failed", {
              error: "invalid_json",
              messageId: message.id || "",
            });
            return;
          }
          submitPluginConversationAction(null, action).then((result) => {
            if (result?.ok !== false && result?.inboxItem?.id) {
              markPluginConversationActionSubmitted(key, { inboxItemId: result.inboxItem.id });
              if (typeof root.showPushToast === "function") {
                root.showPushToast("已提交插件修复审批，等待 Owner 发卡", "success");
              }
            } else {
              submittedPluginConversationActionKeys.delete(key);
            }
          }).catch(() => {
            submittedPluginConversationActionKeys.delete(key);
          });
        });
      }
    }

    function cancelTouchTimer() {
      if (touchTimer) windowRef.clearTimeout(touchTimer);
      touchTimer = 0;
      touchStart = null;
    }

    function touchCenter(touches) {
      const relevantTouches = Array.from(touches || []).slice(0, TRIGGER_TOUCH_COUNT);
      if (relevantTouches.length < TRIGGER_TOUCH_COUNT) return null;
      const total = relevantTouches.reduce((acc, touch) => ({
        x: acc.x + Number(touch.clientX || 0),
        y: acc.y + Number(touch.clientY || 0),
      }), { x: 0, y: 0 });
      return {
        x: total.x / relevantTouches.length,
        y: total.y / relevantTouches.length,
      };
    }

    function onTouchStart(event) {
      if (!event?.touches || event.touches.length !== TRIGGER_TOUCH_COUNT) return;
      const center = touchCenter(event.touches);
      if (!center) return;
      touchStart = {
        x: center.x,
        y: center.y,
      };
      if (touchTimer) windowRef.clearTimeout(touchTimer);
      touchTimer = windowRef.setTimeout(() => {
        touchTimer = 0;
        openFeedback({ trigger: "three_finger_long_press" });
      }, LONG_PRESS_MS);
    }

    function onTouchMove(event) {
      if (!touchStart || !event?.touches || event.touches.length !== TRIGGER_TOUCH_COUNT) return cancelTouchTimer();
      const center = touchCenter(event.touches);
      if (!center) return cancelTouchTimer();
      if (Math.hypot(center.x - touchStart.x, center.y - touchStart.y) > MOVE_CANCEL_PX) cancelTouchTimer();
    }

    function pluginFrameContext(frame, input = {}) {
      const shell = frame?.closest?.("[data-plugin-id], .embedded-plugin-shell");
      const pluginId = cleanString(input.plugin_id || input.pluginId || frame?.dataset?.pluginId || shell?.dataset?.pluginId || stateRef.pluginContextNavPluginId || "plugin", 80);
      const frameRoute = input.route || frame?.getAttribute?.("src") || frame?.src || "";
      return normalizeFeedbackContext({
        plugin_id: pluginId,
        source_surface: input.source_surface || input.sourceSurface || "embedded-plugin",
        route: safeRouteFromValue(frameRoute, windowRef.location),
        workspaceId: input.workspaceId || input.workspace_id || shell?.dataset?.workspaceId || stateRef.selectedWorkspaceId || "",
      });
    }

    function frameForMessageSource(source) {
      if (!source || !documentRef?.querySelectorAll) return null;
      return Array.from(documentRef.querySelectorAll(PLUGIN_FRAME_SELECTOR))
        .find((frame) => frame?.contentWindow === source) || null;
    }

    function sameWindowMessageSource(event) {
      if (!event || event.source !== windowRef) return false;
      const expectedOrigin = windowRef.location?.origin || "";
      const actualOrigin = cleanString(event.origin || "", 180);
      return !expectedOrigin || !actualOrigin || actualOrigin === expectedOrigin;
    }

    function handlePluginDiagnosticMessage(event) {
      const data = event?.data && typeof event.data === "object" ? event.data : {};
      const isOpenMessage = PLUGIN_DIAGNOSTIC_OPEN_MESSAGE_TYPES.has(data.type);
      const isReportMessage = PLUGIN_DIAGNOSTIC_REPORT_MESSAGE_TYPES.has(data.type);
      const isConversationActionMessage = PLUGIN_CONVERSATION_ACTION_MESSAGE_TYPES.has(data.type);
      if (!isOpenMessage && !isReportMessage && !isConversationActionMessage) return false;
      const frame = frameForMessageSource(event.source);
      if (!frame) {
        if (isConversationActionMessage && sameWindowMessageSource(event)) {
          submitPluginConversationAction(null, data);
          return true;
        }
        submitTransportDiagnostic("rejected_no_frame", {
          pluginId: data.pluginId || data.plugin_id || "",
          category: data.category || "",
          diagnostic_type: data.diagnostic_type || data.diagnosticType || "",
          error: "plugin_frame_not_matched",
        });
        return false;
      }
      if (isConversationActionMessage) {
        submitPluginConversationAction(frame, data);
        return true;
      }
      if (isReportMessage) {
        const context = pluginFrameContext(frame, data.context && typeof data.context === "object" ? data.context : data);
        submitTransportDiagnostic("received", {
          pluginId: context.plugin_id,
          category: data.category || "",
          diagnostic_type: data.diagnostic_type || data.diagnosticType || "",
          source_surface: context.source_surface,
        });
        submitPluginDiagnosticReport(frame, data);
        return true;
      }
      const context = pluginFrameContext(frame, data.context && typeof data.context === "object" ? data.context : data);
      openFeedback({
        category: data.category || "plugin_issue",
        trigger: data.trigger || "plugin_message",
        context,
      });
      record("plugin_diagnostic_message", {
        pluginId: context.plugin_id,
        sourceSurface: context.source_surface,
        origin: cleanString(event.origin || "", 120),
      });
      return true;
    }

    function openFromPluginFrame(frame, trigger) {
      const context = pluginFrameContext(frame, { source_surface: "embedded-plugin" });
      openFeedback({ category: "plugin_issue", trigger, context });
    }

    function installPluginFrameTouchBridge(frame) {
      if (!frame || (boundPluginFrames && boundPluginFrames.has(frame))) return;
      if (boundPluginFrames) boundPluginFrames.add(frame);
      const installIntoFrame = () => {
        try {
          const frameDocument = frame.contentDocument || frame.contentWindow?.document;
          if (!frameDocument?.addEventListener || frameDocument.documentElement?.dataset?.homeAiDiagnosticBridge === "1") return;
          frameDocument.documentElement.dataset.homeAiDiagnosticBridge = "1";
          let frameTouchTimer = 0;
          let frameTouchStart = null;
          const clearFrameTimer = () => {
            if (frameTouchTimer) windowRef.clearTimeout(frameTouchTimer);
            frameTouchTimer = 0;
            frameTouchStart = null;
          };
          frameDocument.addEventListener("touchstart", (event) => {
            if (!event?.touches || event.touches.length !== TRIGGER_TOUCH_COUNT) return;
            const center = touchCenter(event.touches);
            if (!center) return;
            frameTouchStart = center;
            if (frameTouchTimer) windowRef.clearTimeout(frameTouchTimer);
            frameTouchTimer = windowRef.setTimeout(() => {
              frameTouchTimer = 0;
              openFromPluginFrame(frame, "plugin_three_finger_long_press");
            }, LONG_PRESS_MS);
          }, { capture: true, passive: true });
          frameDocument.addEventListener("touchmove", (event) => {
            if (!frameTouchStart || !event?.touches || event.touches.length !== TRIGGER_TOUCH_COUNT) return clearFrameTimer();
            const center = touchCenter(event.touches);
            if (!center) return clearFrameTimer();
            if (Math.hypot(center.x - frameTouchStart.x, center.y - frameTouchStart.y) > MOVE_CANCEL_PX) clearFrameTimer();
          }, { capture: true, passive: true });
          frameDocument.addEventListener("touchend", clearFrameTimer, { capture: true, passive: true });
          frameDocument.addEventListener("touchcancel", clearFrameTimer, { capture: true, passive: true });
        } catch (_) {
          // Cross-origin plugins cannot be inspected by the host; they can use the same postMessage contract.
        }
      };
      frame.addEventListener?.("load", installIntoFrame);
      installIntoFrame();
    }

    function pluginFramesFromNode(node) {
      const frames = [];
      if (!node || typeof node !== "object") return frames;
      if (node.matches?.(PLUGIN_FRAME_SELECTOR)) frames.push(node);
      Array.from(node.querySelectorAll?.(PLUGIN_FRAME_SELECTOR) || []).forEach((frame) => frames.push(frame));
      return frames;
    }

    function installPluginDiagnosticBridge() {
      Array.from(documentRef?.querySelectorAll?.(PLUGIN_FRAME_SELECTOR) || []).forEach(installPluginFrameTouchBridge);
      if (!documentRef?.body || frameObserver || typeof windowRef.MutationObserver !== "function") return;
      frameObserver = new windowRef.MutationObserver((mutations) => {
        scanPluginConversationActionMetadata();
        mutations.forEach((mutation) => {
          Array.from(mutation.addedNodes || []).forEach((node) => {
            pluginFramesFromNode(node).forEach(installPluginFrameTouchBridge);
          });
        });
      });
      frameObserver.observe(documentRef.body, { childList: true, subtree: true });
    }

    function install() {
      if (!documentRef?.addEventListener) return;
      documentRef.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
      documentRef.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
      documentRef.addEventListener("touchend", cancelTouchTimer, { capture: true, passive: true });
      documentRef.addEventListener("touchcancel", cancelTouchTimer, { capture: true, passive: true });
      windowRef.addEventListener?.("error", (event) => record("window_error", { message: event?.message || "", filename: event?.filename || "" }));
      windowRef.addEventListener?.("unhandledrejection", (event) => record("unhandled_rejection", { reason: event?.reason?.code || event?.reason?.message || "unhandled_rejection" }));
      windowRef.addEventListener?.("homeai:open-diagnostic-feedback", (event) => openFeedback(Object.assign({ trigger: "custom_event" }, event?.detail || {})));
      windowRef.addEventListener?.("message", handlePluginDiagnosticMessage);
      installPluginDiagnosticBridge();
      scanPluginConversationActionMetadata();
      record("diagnostic_feedback_ready", {
        clientVersion: documentRef?.documentElement?.dataset?.clientVersion || "",
        route: safeRoute(windowRef.location),
      });
    }

    return Object.freeze({
      buildPluginDiagnosticReportPayload,
      buildPayload,
      closeFeedback,
      install,
      openFeedback,
      record,
      recentEvents,
      scanPluginConversationActionMetadata,
      submitPluginConversationAction,
      submitPluginDiagnosticReport,
      submitFeedback,
    });
  }

  return Object.freeze({
    createAiOpsDiagnosticFeedbackController,
    durationBucket,
    parsePluginConversationActionComments,
    safeRoute,
    sanitizeClientDiagnosticValue,
  });
}));

if (typeof window !== "undefined" && window.HomeAIDiagnosticFeedback) {
  window.homeAiDiagnosticFeedback = window.HomeAIDiagnosticFeedback.createAiOpsDiagnosticFeedbackController({
    api: typeof api === "function" ? api : null,
    document,
    state: typeof state === "object" ? state : {},
    window,
  });
  window.homeAiDiagnosticFeedback.install();
}
