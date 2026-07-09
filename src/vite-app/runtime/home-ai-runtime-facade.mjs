import {
  createRuntimeEventBus,
  createRuntimeStateStore,
} from "./runtime-state-event-bus.mjs";

const RUNTIME_FACADE_VERSION = "20260702-vite-runtime-facade-v1";
const ACCESS_KEY_STORAGE_KEY = "hermesWebKey";
const ACCESS_KEY_COOKIE_NAME = "hermes_web_key";
const CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT = "/api/client-layout-diagnostics";
const VIEW_MODE_STORAGE_KEY = "hermesWebViewMode";
const VOICE_INPUT_MIC_GRANTED_KEY = "homeAiVoiceInputMicGranted";
const VOICE_INPUT_STATUS_PANEL_KEY = "homeAiVoiceInputStatusPanel";

function noop() {}

function safeString(value) {
  return String(value == null ? "" : value);
}

function safeUrlSearchParams(search = "") {
  try {
    return new URLSearchParams(search || "");
  } catch (_error) {
    return new URLSearchParams("");
  }
}

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues || {}).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function getStorage(options) {
  if (options.storage && typeof options.storage.getItem === "function") return options.storage;
  const root = options.root;
  try {
    if (root?.localStorage && typeof root.localStorage.getItem === "function") return root.localStorage;
  } catch (_error) {
    return createMemoryStorage();
  }
  return createMemoryStorage();
}

function normalizeHeaders(headers) {
  return Object.assign({}, headers || {});
}

async function parseErrorBody(response) {
  try {
    const body = await response.json();
    return body && typeof body === "object" ? body : null;
  } catch (_error) {
    return null;
  }
}

function createHttpError(response, body) {
  let message = `${response.status || 0} ${response.statusText || "Request failed"}`;
  if (body?.error) message = body.error;
  const error = new Error(message);
  error.status = response.status || 0;
  if (body && typeof body === "object") {
    error.code = body.code || "";
    error.operatorRequired = Boolean(body.operatorRequired);
    error.elevationRequired = Boolean(body.elevationRequired);
    error.elevationScope = body.elevationScope || body.code || "";
    error.elevationReason = body.elevationReason || "";
  }
  return error;
}

function createFallbackApiClient(options = {}) {
  const fetchImpl = typeof options.fetchImpl === "function"
    ? options.fetchImpl
    : (...args) => fetch(...args);
  const getAccessKey = typeof options.getAccessKey === "function" ? options.getAccessKey : () => "";
  const getClientVersion = typeof options.getClientVersion === "function" ? options.getClientVersion : () => "";
  const syncAccessKeyCookie = typeof options.syncAccessKeyCookie === "function" ? options.syncAccessKeyCookie : noop;
  const onUnauthorized = typeof options.onUnauthorized === "function" ? options.onUnauthorized : null;

  return async function api(path, requestOptions = {}) {
    const headers = normalizeHeaders(requestOptions.headers);
    const accessKey = getAccessKey();
    const clientVersion = getClientVersion();
    if (accessKey) {
      headers["X-Hermes-Web-Key"] = accessKey;
      syncAccessKeyCookie(accessKey);
    }
    if (clientVersion) headers["X-Hermes-Web-Client-Version"] = clientVersion;
    if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    const fetchOptions = Object.assign({}, requestOptions, { headers });
    delete fetchOptions.timeoutMs;
    if (!fetchOptions.cache && typeof path === "string" && path.startsWith("/api/")) {
      fetchOptions.cache = "no-store";
    }
    const response = await fetchImpl(path, fetchOptions);
    if (response?.status === 401) {
      if (onUnauthorized) onUnauthorized(response);
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }
    if (!response?.ok) {
      throw createHttpError(response || {}, await parseErrorBody(response || {}));
    }
    if (response.status === 204) return null;
    return response.json();
  };
}

function getClientVersionFromDocument(documentRef) {
  const meta = documentRef?.querySelector?.("meta[name='home-ai-client-version'], meta[name='hermes-web-client-version']");
  return meta?.getAttribute?.("content") || "";
}

function createAccessKeyStore(options = {}) {
  const storage = getStorage(options);
  const documentRef = options.documentRef || options.root?.document || null;
  const locationRef = options.locationRef || options.root?.location || null;
  const storageKey = options.storageKey || ACCESS_KEY_STORAGE_KEY;
  const cookieName = options.cookieName || ACCESS_KEY_COOKIE_NAME;
  const events = options.events || { emit: noop };

  function getAccessKey() {
    if (typeof options.getAccessKey === "function") return safeString(options.getAccessKey()).trim();
    try {
      return safeString(storage.getItem(storageKey)).trim();
    } catch (_error) {
      return "";
    }
  }

  function syncCookie(accessKey = getAccessKey()) {
    if (!accessKey || !documentRef) return;
    const secure = locationRef?.protocol === "https:" ? "; Secure" : "";
    documentRef.cookie = `${cookieName}=${encodeURIComponent(accessKey)}; Path=/; SameSite=Lax${secure}`;
  }

  function setAccessKey(accessKey) {
    const normalized = safeString(accessKey).trim();
    try {
      if (normalized) storage.setItem(storageKey, normalized);
      else storage.removeItem(storageKey);
    } catch (_error) {
      // Storage can be blocked in private WebView contexts; cookie sync still gives the server a bounded auth channel.
    }
    if (normalized) syncCookie(normalized);
    events.emit("auth:changed", { hasAccessKey: Boolean(normalized) });
    return normalized;
  }

  function clearAccessKey() {
    try {
      storage.removeItem(storageKey);
    } catch (_error) {
      // Ignore storage failures; the cookie expiry below is the observable browser-side cleanup.
    }
    if (documentRef) {
      const secure = locationRef?.protocol === "https:" ? "; Secure" : "";
      documentRef.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
    events.emit("auth:changed", { hasAccessKey: false });
  }

  return Object.freeze({
    storageKey,
    cookieName,
    getAccessKey,
    setAccessKey,
    clearAccessKey,
    syncCookie,
    hasAccessKey: () => Boolean(getAccessKey()),
  });
}

function createFeedbackBridge(options = {}) {
  const showError = typeof options.showError === "function" ? options.showError : options.root?.showError;
  const setStatus = typeof options.setStatus === "function" ? options.setStatus : options.root?.setStatus;
  const events = options.events || { emit: noop };

  function error(errorLike, detail = {}) {
    const message = errorLike?.message || safeString(errorLike || "unknown_error");
    if (typeof showError === "function") {
      showError(errorLike instanceof Error ? errorLike : new Error(message));
    }
    return events.emit("feedback:error", { message, code: errorLike?.code || "", detail });
  }

  function status(message, detail = {}) {
    if (typeof setStatus === "function") setStatus(safeString(message));
    return events.emit("feedback:status", { message: safeString(message), detail });
  }

  function toast(message, detail = {}) {
    return events.emit("feedback:toast", { message: safeString(message), detail });
  }

  return Object.freeze({ error, status, toast });
}

function createClientDiagnosticsBridge(options = {}) {
  const events = options.events || { emit: noop };
  const fetchImpl = typeof options.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof options.root?.fetch === "function" ? options.root.fetch.bind(options.root) : null);

  async function sendClientLayoutDiagnostic(payload = {}, requestOptions = {}) {
    if (!fetchImpl) {
      events.emit("diagnostics:client-layout:unavailable", {
        endpoint: requestOptions.endpoint || CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT,
      });
      return Object.freeze({ ok: false, skipped: true, code: "fetch_unavailable" });
    }
    const endpoint = requestOptions.endpoint || CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT;
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
        keepalive: requestOptions.keepalive !== false,
      });
      events.emit("diagnostics:client-layout:sent", {
        endpoint,
        ok: response?.ok !== false,
        status: response?.status || 0,
      });
      return Object.freeze({ ok: response?.ok !== false, status: response?.status || 0 });
    } catch (error) {
      events.emit("diagnostics:client-layout:error", {
        endpoint,
        error: error?.code || error?.message || "send_failed",
      });
      return Object.freeze({ ok: false, code: error?.code || error?.message || "send_failed" });
    }
  }

  return Object.freeze({ sendClientLayoutDiagnostic });
}

function createDedupeStore(options = {}) {
  const storage = getStorage(options);
  const events = options.events || { emit: noop };
  const namespacePrefix = safeString(options.namespacePrefix || "homeai").replace(/[^\w.-]/g, "") || "homeai";

  function storageKey(scope, key) {
    const safeScope = safeString(scope || "dedupe").replace(/[^\w.-]/g, "").slice(0, 80) || "dedupe";
    const safeKey = safeString(key || "").replace(/[^\w.-]/g, "").slice(0, 180);
    return `${namespacePrefix}.${safeScope}.${safeKey}`;
  }

  function has(scope, key) {
    if (!key) return false;
    try {
      return Boolean(storage.getItem(storageKey(scope, key)));
    } catch (error) {
      events.emit("dedupe:read:error", {
        scope: safeString(scope || "dedupe").slice(0, 80),
        error: error?.code || error?.message || "storage_read_failed",
      });
      return false;
    }
  }

  function mark(scope, key, payload = {}) {
    if (!key) return false;
    try {
      storage.setItem(storageKey(scope, key), JSON.stringify(Object.assign({
        at: new Date().toISOString(),
      }, payload || {})));
      events.emit("dedupe:marked", {
        scope: safeString(scope || "dedupe").slice(0, 80),
      });
      return true;
    } catch (error) {
      events.emit("dedupe:write:error", {
        scope: safeString(scope || "dedupe").slice(0, 80),
        error: error?.code || error?.message || "storage_write_failed",
      });
      return false;
    }
  }

  function clear(scope, key) {
    if (!key) return false;
    try {
      storage.removeItem(storageKey(scope, key));
      events.emit("dedupe:cleared", {
        scope: safeString(scope || "dedupe").slice(0, 80),
      });
      return true;
    } catch (error) {
      events.emit("dedupe:clear:error", {
        scope: safeString(scope || "dedupe").slice(0, 80),
        error: error?.code || error?.message || "storage_clear_failed",
      });
      return false;
    }
  }

  return Object.freeze({ clear, has, mark, storageKey });
}

function createRouteState(options = {}) {
  const locationRef = options.locationRef || options.root?.location || {};
  const historyRef = options.historyRef || options.root?.history || null;
  const events = options.events || { emit: noop };
  const stateStore = options.state || null;
  const storage = getStorage(options);
  const viewModeStorageKey = options.viewModeStorageKey || VIEW_MODE_STORAGE_KEY;

  function current() {
    return Object.freeze({
      href: safeString(locationRef.href || ""),
      pathname: safeString(locationRef.pathname || "/"),
      search: safeString(locationRef.search || ""),
      hash: safeString(locationRef.hash || ""),
    });
  }

  function push(url, state = {}) {
    if (historyRef?.pushState) historyRef.pushState(state, "", url);
    events.emit("route:changed", { mode: "push", url: safeString(url), route: current() });
  }

  function replace(url, state = {}) {
    if (historyRef?.replaceState) historyRef.replaceState(state, "", url);
    events.emit("route:changed", { mode: "replace", url: safeString(url), route: current() });
  }

  function getViewMode(fallback = "") {
    try {
      const stored = safeString(storage.getItem(viewModeStorageKey)).trim();
      if (stored) return stored;
    } catch (error) {
      events.emit("route:view-mode:read:error", {
        storageKey: viewModeStorageKey,
        error: error?.code || error?.message || "storage_read_failed",
      });
    }
    return safeString(stateStore?.get?.("viewMode") || fallback).trim();
  }

  function setViewMode(viewMode, detail = {}) {
    const normalized = safeString(viewMode).trim().slice(0, 120);
    if (!normalized) return "";
    try {
      storage.setItem(viewModeStorageKey, normalized);
    } catch (error) {
      events.emit("route:view-mode:write:error", {
        viewMode: normalized,
        storageKey: viewModeStorageKey,
        error: error?.code || error?.message || "storage_write_failed",
      });
    }
    stateStore?.set?.({ viewMode: normalized });
    events.emit("route:view-mode:changed", {
      viewMode: normalized,
      storageKey: viewModeStorageKey,
      source: safeString(detail.source || ""),
    });
    return normalized;
  }

  return Object.freeze({ current, getViewMode, push, replace, setViewMode, viewModeStorageKey });
}

function boolFromString(value) {
  return /^(1|true|yes|ios|android|native)$/i.test(safeString(value).trim());
}

function normalizeNativeShellParam(value) {
  const normalized = safeString(value).trim().toLowerCase();
  return normalized === "ios" || normalized === "android" ? normalized : "";
}

function nativeShareFileCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload?.files)) return payload.files.length;
  return 0;
}

function detectNativeBridge(options = {}) {
  const root = options.root || {};
  const documentRef = options.documentRef || root.document || null;
  const locationRef = options.locationRef || root.location || {};
  const events = options.events || { emit: noop };
  const storage = getStorage(options);
  const params = safeUrlSearchParams(locationRef.search || "");
  const documentDataset = Object.assign(
    {},
    documentRef?.documentElement?.dataset || {},
    documentRef?.body?.dataset || {},
  );
  let storedNativeFlag = "";
  let storedVoiceShell = "";
  try {
    storedNativeFlag = storage.getItem("homeAiNativeShell") || storage.getItem("hermesNativeShell") || "";
    storedVoiceShell = storage.getItem("homeAI.nativeShell") || "";
  } catch (_error) {
    storedNativeFlag = "";
    storedVoiceShell = "";
  }

  const platform =
    params.get("homeAiNativePlatform") ||
    params.get("nativePlatform") ||
    documentDataset.homeAiNativePlatform ||
    documentDataset.nativePlatform ||
    "";
  const explicitNative =
    boolFromString(params.get("homeAiNativeShell")) ||
    boolFromString(params.get("nativeShell")) ||
    boolFromString(documentDataset.homeAiNativeShell) ||
    boolFromString(documentDataset.nativeShell) ||
    boolFromString(storedNativeFlag);
  const webkitHandlers = root.webkit?.messageHandlers || {};
  const bridge = root.HomeAINativeBridge || root.HermesNativeBridge || null;
  const voiceBridge = root.HomeAINativeVoice || root.HomeAIVoiceInput || null;
  const shareBridge = root.HomeAINativeShareCapability || root.HomeAINativeShare || null;
  const homeAiMessageHandler = webkitHandlers.homeAI || null;
  const isIosShell =
    /ios/i.test(platform) ||
    Boolean(webkitHandlers.homeAiNative || webkitHandlers.hermesNative || webkitHandlers.voiceInput);
  const isNativeShell = explicitNative || isIosShell || Boolean(bridge || voiceBridge || shareBridge);

  function nativeShellParam() {
    const value = normalizeNativeShellParam(params.get("nativeShell"))
      || normalizeNativeShellParam(documentDataset.nativeShell)
      || normalizeNativeShellParam(storedVoiceShell)
      || normalizeNativeShellParam(platform);
    if (value) return value;
    return isIosShell ? "ios" : "";
  }

  function isVoiceInputShellActive() {
    return params.get("nativeShell") === "ios"
      || documentDataset.nativeShell === "ios"
      || storedVoiceShell === "ios"
      || isIosShell;
  }

  function isVoiceInputBridgeAvailable() {
    if (!isVoiceInputShellActive()) return false;
    let storedVoiceInput = "";
    try {
      storedVoiceInput = storage.getItem("homeAI.nativeVoiceInput") || "";
    } catch (_error) {
      storedVoiceInput = "";
    }
    const capability = root.HomeAINativeVoiceInputCapability || {};
    const declared = capability.voiceCapture === true
      || documentDataset.nativeVoiceInput === "1"
      || storedVoiceInput === "1";
    return Boolean(declared && typeof homeAiMessageHandler?.postMessage === "function");
  }

  function postHomeAiMessage(payload = {}) {
    if (!isVoiceInputBridgeAvailable()) return false;
    try {
      homeAiMessageHandler.postMessage(payload || {});
      events.emit("native:home-ai-message:posted", {
        type: safeString(payload?.type || ""),
      });
      return true;
    } catch (error) {
      events.emit("native:home-ai-message:error", {
        type: safeString(payload?.type || ""),
        error: error?.code || error?.message || "native_post_failed",
      });
      return false;
    }
  }

  function voiceInputStatusPanelExpanded() {
    const query = params.get("voiceStatusPanel");
    if (query === "0") return false;
    if (query === "1") return true;
    try {
      const stored = storage.getItem(VOICE_INPUT_STATUS_PANEL_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch (_error) {}
    return isVoiceInputShellActive();
  }

  function voiceInputDebugStatusEnabled() {
    if (params.get("voiceStatusDebug") === "1") return true;
    try {
      return storage.getItem("homeAiVoiceInputStatusDebug") === "1";
    } catch (_error) {
      return false;
    }
  }

  function rememberVoiceInputMicGranted() {
    try {
      storage.setItem(VOICE_INPUT_MIC_GRANTED_KEY, "1");
      events.emit("native:voice-input:mic-grant:remembered", {});
      return true;
    } catch (error) {
      events.emit("native:voice-input:mic-grant:write:error", {
        error: error?.code || error?.message || "storage_write_failed",
      });
      return false;
    }
  }

  function forgetVoiceInputMicGranted() {
    try {
      storage.removeItem(VOICE_INPUT_MIC_GRANTED_KEY);
      events.emit("native:voice-input:mic-grant:forgotten", {});
      return true;
    } catch (error) {
      events.emit("native:voice-input:mic-grant:remove:error", {
        error: error?.code || error?.message || "storage_remove_failed",
      });
      return false;
    }
  }

  function voiceInputMicWasGranted() {
    try {
      return storage.getItem(VOICE_INPUT_MIC_GRANTED_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function requestId(prefix = "native") {
    const safePrefix = safeString(prefix || "native");
    if (root.crypto?.randomUUID) return `${safePrefix}_${root.crypto.randomUUID()}`;
    return `${safePrefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function registerVoiceInputCallbacks(callbacks = {}) {
    if (!root || !callbacks || typeof callbacks !== "object") return null;
    const existing = root.HomeAINativeVoiceInput && typeof root.HomeAINativeVoiceInput === "object"
      ? root.HomeAINativeVoiceInput
      : {};
    root.HomeAINativeVoiceInput = Object.assign(existing, callbacks);
    events.emit("native:voice-input:callbacks:registered", {
      callbackCount: Object.keys(callbacks).length,
    });
    return root.HomeAINativeVoiceInput;
  }

  function registerNativeShareCallbacks(callbacks = {}) {
    if (!root || !callbacks || typeof callbacks !== "object") return null;
    const existing = root.HomeAINativeShare && typeof root.HomeAINativeShare === "object"
      ? root.HomeAINativeShare
      : {};
    root.HomeAINativeShare = Object.assign(existing, callbacks);
    events.emit("native:share:callbacks:registered", {
      callbackCount: Object.keys(callbacks).length,
    });
    if (typeof callbacks.receive === "function" && root.__homeAIPendingNativeShare) {
      const pendingShare = root.__homeAIPendingNativeShare;
      root.__homeAIPendingNativeShare = null;
      try {
        callbacks.receive(pendingShare);
        events.emit("native:share:pending:consumed", {
          fileCount: nativeShareFileCount(pendingShare),
        });
      } catch (error) {
        events.emit("native:share:pending:error", {
          error: error?.code || error?.message || "native_share_pending_receive_failed",
          fileCount: nativeShareFileCount(pendingShare),
        });
      }
    }
    return root.HomeAINativeShare;
  }

  return Object.freeze({
    isNativeShell,
    isIosShell,
    platform: safeString(platform || (isIosShell ? "ios" : "")),
    capabilities: Object.freeze({
      bridge: Boolean(bridge || webkitHandlers.homeAiNative || webkitHandlers.hermesNative),
      voice: Boolean(voiceBridge || webkitHandlers.voiceInput),
      share: Boolean(shareBridge || webkitHandlers.nativeShare),
    }),
    bridge,
    voiceBridge,
    shareBridge,
    forgetVoiceInputMicGranted,
    isVoiceInputBridgeAvailable,
    isVoiceInputShellActive,
    postHomeAiMessage,
    registerNativeShareCallbacks,
    registerVoiceInputCallbacks,
    rememberVoiceInputMicGranted,
    requestId,
    nativeShellParam,
    voiceInputDebugStatusEnabled,
    voiceInputMicWasGranted,
    voiceInputStatusPanelExpanded,
  });
}

function createDocumentPreviewBridge(options = {}) {
  const root = options.root || {};
  const locationRef = options.locationRef || root.location || {};
  const events = options.events || { emit: noop };
  const auth = options.auth || null;
  const fetchImpl = typeof options.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof root.fetch === "function" ? root.fetch.bind(root) : null);

  function absoluteUrl(value) {
    try {
      return new URL(value, locationRef.href || locationRef.origin || "http://127.0.0.1/").href;
    } catch (_error) {
      return safeString(value || "");
    }
  }

  async function fetchBlob(url, requestOptions = {}) {
    const sourceUrl = absoluteUrl(url);
    if (!sourceUrl) throw new Error("没有可打开的文件地址");
    if (!fetchImpl) throw new Error("document_preview_fetch_unavailable");
    const headers = normalizeHeaders(requestOptions.headers);
    const accessKey = auth?.getAccessKey?.() || "";
    if (accessKey) headers["X-Hermes-Web-Key"] = accessKey;
    const response = await fetchImpl(sourceUrl, Object.assign({}, requestOptions, { headers }));
    if (!response?.ok) throw new Error(`${response?.status || 0} ${response?.statusText || "Request failed"}`);
    events.emit("document-preview:blob-fetched", {
      status: response.status || 0,
      sameOrigin: sourceUrl.startsWith(locationRef.origin || ""),
    });
    return response.blob();
  }

  return Object.freeze({
    absoluteUrl,
    fetchBlob,
  });
}

function createEventSourceBridge(options = {}) {
  const root = options.root || {};
  const events = options.events || { emit: noop };
  const eventSourceImpl = options.EventSourceImpl || options.eventSourceImpl || null;

  function eventSourceConstructor() {
    if (typeof eventSourceImpl === "function") return eventSourceImpl;
    return typeof root.EventSource === "function" ? root.EventSource : null;
  }

  function isAvailable() {
    return typeof eventSourceConstructor() === "function";
  }

  function createEventSource(url, detail = {}) {
    const sourceUrl = safeString(url).trim();
    const ctor = eventSourceConstructor();
    if (!sourceUrl) {
      events.emit("event-stream:create:error", {
        code: "event_source_url_missing",
        source: safeString(detail.source || "runtime_facade_event_stream"),
      });
      throw new Error("event_source_url_missing");
    }
    if (typeof ctor !== "function") {
      events.emit("event-stream:unavailable", {
        code: "event_source_unavailable",
        source: safeString(detail.source || "runtime_facade_event_stream"),
      });
      throw new Error("event_source_unavailable");
    }
    try {
      const source = new ctor(sourceUrl);
      events.emit("event-stream:created", {
        endpoint: sourceUrl.split("?")[0].slice(0, 160),
        hasQuery: sourceUrl.includes("?"),
        source: safeString(detail.source || "runtime_facade_event_stream"),
      });
      return source;
    } catch (error) {
      events.emit("event-stream:create:error", {
        code: error?.code || error?.message || "event_source_create_failed",
        source: safeString(detail.source || "runtime_facade_event_stream"),
      });
      throw error;
    }
  }

  return Object.freeze({
    createEventSource,
    isAvailable,
  });
}

function resolveApiClientFactory(options = {}) {
  if (typeof options.apiClientFactory === "function") return options.apiClientFactory;
  const rootFactory = options.root?.HermesAppApiClient?.createApiClient;
  if (typeof rootFactory === "function") return rootFactory;
  return createFallbackApiClient;
}

export function attachHomeAiRuntimeFacade(root, facade, options = {}) {
  if (!root || !facade) return facade;
  const propertyName = options.propertyName || "HomeAiRuntimeFacade";
  if (root[propertyName] && options.overwrite === false) return facade;
  Object.defineProperty(root, propertyName, {
    value: facade,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return facade;
}

export function createHomeAiRuntimeFacade(options = {}) {
  const root = options.root || (typeof globalThis !== "undefined" ? globalThis : {});
  const documentRef = options.documentRef || root.document || null;
  const locationRef = options.locationRef || root.location || null;
  const historyRef = options.historyRef || root.history || null;
  const events = options.events || createRuntimeEventBus();
  const state = createRuntimeStateStore(options.appState || {}, events);
  const auth = createAccessKeyStore(Object.assign({}, options, { root, documentRef, locationRef, events }));
  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : root.fetch?.bind?.(root);
  const getClientVersion = typeof options.getClientVersion === "function"
    ? options.getClientVersion
    : () => options.clientVersion || getClientVersionFromDocument(documentRef) || "";
  const apiClientFactory = resolveApiClientFactory({ root, apiClientFactory: options.apiClientFactory });
  const feedback = createFeedbackBridge(Object.assign({}, options, { root, events }));
  const diagnostics = createClientDiagnosticsBridge(Object.assign({}, options, { root, events, fetchImpl }));
  const dedupe = createDedupeStore(Object.assign({}, options, { root, events }));
  const route = createRouteState(Object.assign({}, options, { root, locationRef, historyRef, events, state }));
  const native = detectNativeBridge(Object.assign({}, options, { root, documentRef, locationRef, events }));
  const documentPreview = createDocumentPreviewBridge(Object.assign({}, options, {
    root,
    locationRef,
    events,
    auth,
    fetchImpl,
  }));
  const eventStream = createEventSourceBridge(Object.assign({}, options, { root, events }));
  const api = apiClientFactory({
    fetchImpl,
    getAccessKey: auth.getAccessKey,
    getClientVersion,
    syncAccessKeyCookie: auth.syncCookie,
    onUnauthorized: options.onUnauthorized,
    onClientVersion: options.onClientVersion,
    clientVersionSource: options.clientVersionSource || "vite-runtime-facade",
  });

  const facade = Object.freeze({
    version: RUNTIME_FACADE_VERSION,
    mode: options.mode || "vite-preview",
    auth,
    api,
    clientVersion: getClientVersion,
    state,
    events,
    feedback,
    diagnostics,
    dedupe,
    documentPreview,
    eventStream,
    route,
    native,
    snapshot() {
      return Object.freeze({
        version: RUNTIME_FACADE_VERSION,
        mode: options.mode || "vite-preview",
        hasAccessKey: auth.hasAccessKey(),
        route: route.current(),
        native: {
          isNativeShell: native.isNativeShell,
          isIosShell: native.isIosShell,
          platform: native.platform,
          capabilities: native.capabilities,
        },
      });
    },
    attachClassicCompatibility(targetRoot = root, attachOptions = {}) {
      return attachHomeAiRuntimeFacade(targetRoot, facade, attachOptions);
    },
  });

  if (options.attachClassicCompatibility) attachHomeAiRuntimeFacade(root, facade, options.attachOptions || {});
  return facade;
}

export {
  ACCESS_KEY_COOKIE_NAME,
  ACCESS_KEY_STORAGE_KEY,
  CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT,
  RUNTIME_FACADE_VERSION,
  VIEW_MODE_STORAGE_KEY,
  createClientDiagnosticsBridge,
  createDedupeStore,
  createRuntimeEventBus as createEventBus,
  createRuntimeEventBus,
  createRuntimeStateStore as createStateStore,
  createRuntimeStateStore,
  createFallbackApiClient,
  createMemoryStorage,
  createDocumentPreviewBridge,
  createEventSourceBridge,
};
