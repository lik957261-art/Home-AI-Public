const CHAT_LIVE_EVENT_SOURCE_CLIENT_VERSION = "20260702-vite-chat-live-event-source-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedTransportDiagnostic(code, fields = {}) {
  return Object.freeze({
    code: cleanString(code, 120),
    source: cleanString(fields.source || "chat_live_event_source_client", 120),
    detail: cleanString(fields.detail || "", 240),
    url: cleanString(fields.url || "", 240),
    readyState: cleanString(fields.readyState || "", 40),
  });
}

function buildChatEventSourceUrl(input = {}) {
  const endpoint = cleanString(input.endpoint || "/api/events", 400);
  const params = new URLSearchParams();
  const key = cleanString(input.key || "", 800);
  const clientVersion = cleanString(input.clientVersion || input.client_version || "", 160);
  if (key) params.set("key", key);
  if (clientVersion) params.set("clientVersion", clientVersion);
  const query = params.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

function normalizeStatus(patch = {}) {
  return Object.freeze({
    version: CHAT_LIVE_EVENT_SOURCE_CLIENT_VERSION,
    status: cleanString(patch.status || "disconnected", 80),
    url: cleanString(patch.url || "", 240),
    lastEventType: cleanString(patch.lastEventType || "", 120),
    closeReason: cleanString(patch.closeReason || "", 120),
    diagnostic: patch.diagnostic || null,
  });
}

function createChatEventSourceClient(options = {}) {
  const eventSourceFactory = options.eventSourceFactory;
  const applyFrame = typeof options.applyFrame === "function" ? options.applyFrame : null;
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : null;
  const onResult = typeof options.onResult === "function" ? options.onResult : null;
  const onDiagnostic = typeof options.onDiagnostic === "function" ? options.onDiagnostic : null;
  let source = null;
  let currentStatus = normalizeStatus();

  function publishStatus(patch = {}) {
    currentStatus = normalizeStatus(Object.assign({}, currentStatus, patch));
    if (onStatus) onStatus(currentStatus);
    return currentStatus;
  }

  function publishDiagnostic(code, fields = {}) {
    const diagnostic = boundedTransportDiagnostic(code, fields);
    if (onDiagnostic) onDiagnostic(diagnostic);
    publishStatus({
      status: cleanString(fields.status || currentStatus.status || "warning", 80),
      diagnostic,
      url: fields.url || currentStatus.url,
      readyState: fields.readyState || "",
    });
    return diagnostic;
  }

  function close(reason = "manual_close") {
    if (source && typeof source.close === "function") {
      try {
        source.close();
      } catch (error) {
        publishDiagnostic("event_source_close_failed", {
          detail: error?.message || "close failed",
          status: "warning",
          url: currentStatus.url,
        });
      }
    }
    source = null;
    return publishStatus({
      status: "disconnected",
      closeReason: reason,
      lastEventType: "close",
      diagnostic: null,
    });
  }

  function start(overrides = {}) {
    close("restart");
    const url = buildChatEventSourceUrl({
      endpoint: overrides.endpoint || options.endpoint,
      key: overrides.key || options.key,
      clientVersion: overrides.clientVersion || options.clientVersion,
    });
    if (typeof eventSourceFactory !== "function") {
      const diagnostic = publishDiagnostic("event_source_factory_missing", {
        status: "blocked",
        url,
      });
      return {
        ok: false,
        status: "blocked",
        url,
        diagnostic,
        source: null,
      };
    }
    publishStatus({
      status: "connecting",
      url,
      closeReason: "",
      lastEventType: "connect",
      diagnostic: null,
    });
    try {
      source = eventSourceFactory(url);
    } catch (error) {
      const diagnostic = publishDiagnostic("event_source_create_failed", {
        detail: error?.message || "create failed",
        status: "blocked",
        url,
      });
      source = null;
      return {
        ok: false,
        status: "blocked",
        url,
        diagnostic,
        source: null,
      };
    }
    if (!isObject(source)) {
      const diagnostic = publishDiagnostic("event_source_invalid_instance", {
        detail: typeof source,
        status: "blocked",
        url,
      });
      source = null;
      return {
        ok: false,
        status: "blocked",
        url,
        diagnostic,
        source: null,
      };
    }
    source.onopen = () => {
      publishStatus({
        status: "connected",
        url,
        lastEventType: "open",
        diagnostic: null,
      });
    };
    source.onmessage = (event) => {
      if (!applyFrame) {
        const diagnostic = publishDiagnostic("event_source_apply_frame_missing", {
          status: "blocked",
          url,
        });
        if (onResult) onResult({ ok: false, applied: false, diagnostic });
        return;
      }
      const result = applyFrame(event);
      publishStatus({
        status: "connected",
        url,
        lastEventType: "message",
        diagnostic: result?.diagnostic || null,
      });
      if (onResult) onResult(result);
    };
    source.onerror = (event = {}) => {
      const diagnostic = publishDiagnostic("event_source_reconnecting", {
        detail: event?.message || "",
        status: "reconnecting",
        url,
        readyState: source?.readyState,
      });
      if (onResult) onResult({ ok: false, applied: false, diagnostic });
    };
    return {
      ok: true,
      status: "connecting",
      url,
      source,
      diagnostic: null,
    };
  }

  return Object.freeze({
    start,
    close,
    status: () => currentStatus,
    source: () => source,
  });
}

export {
  CHAT_LIVE_EVENT_SOURCE_CLIENT_VERSION,
  buildChatEventSourceUrl,
  createChatEventSourceClient,
};
