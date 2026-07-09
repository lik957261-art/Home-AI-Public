"use strict";

(function (root) {
  if (!root || root.HomeAiRuntimeFacade) return;

  const VERSION = "20260702-classic-runtime-facade-v1";
  const CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT = "/api/client-layout-diagnostics";
  const ACCESS_KEY_STORAGE_KEY = "hermesWebKey";
  const ACCESS_KEY_COOKIE_NAME = "hermes_web_key";
  const VIEW_MODE_STORAGE_KEY = "hermesWebViewMode";
  const VOICE_INPUT_MIC_GRANTED_KEY = "homeAiVoiceInputMicGranted";
  const VOICE_INPUT_STATUS_PANEL_KEY = "homeAiVoiceInputStatusPanel";
  const RUNTIME_FACADE_COMPAT_MODEL_ESM_PATH = "/vite-islands/runtime-facade-compat-model/runtime-facade-compat-model.js";
  let runtimeFacadeCompatModel = null;
  let runtimeFacadeCompatModelPromise = null;

  function noop() {}

  function importRuntimeFacadeCompatModel(rootRef = root) {
    if (runtimeFacadeCompatModel) return Promise.resolve(runtimeFacadeCompatModel);
    if (!runtimeFacadeCompatModelPromise) {
      const importer = typeof rootRef.__homeAiImportRuntimeFacadeCompatModel === "function"
        ? rootRef.__homeAiImportRuntimeFacadeCompatModel
        : (path) => import(path);
      runtimeFacadeCompatModelPromise = Promise.resolve()
        .then(() => importer(RUNTIME_FACADE_COMPAT_MODEL_ESM_PATH))
        .then((model) => {
          runtimeFacadeCompatModel = model || null;
          return runtimeFacadeCompatModel;
        })
        .catch((error) => {
          runtimeFacadeCompatModelPromise = null;
          throw error;
        });
    }
    return runtimeFacadeCompatModelPromise;
  }

  function currentRuntimeFacadeCompatModel() {
    return runtimeFacadeCompatModel;
  }

  function runtimeFacadeCompatModelFunction(name) {
    const model = currentRuntimeFacadeCompatModel();
    return model && typeof model[name] === "function" ? model[name] : null;
  }

  importRuntimeFacadeCompatModel().catch(() => null);

  function safeString(value) {
    const modelFn = runtimeFacadeCompatModelFunction("safeRuntimeStringPlan");
    return modelFn ? modelFn(value) : String(value == null ? "" : value);
  }

  function normalizeNativeShellParam(value) {
    const modelFn = runtimeFacadeCompatModelFunction("normalizeNativeShellParamPlan");
    if (modelFn) return modelFn(value);
    const normalized = safeString(value).trim().toLowerCase();
    return normalized === "ios" || normalized === "android" ? normalized : "";
  }

  function nativeShareFileCount(payload) {
    const modelFn = runtimeFacadeCompatModelFunction("nativeShareFileCountPlan");
    if (modelFn) return modelFn(payload);
    if (Array.isArray(payload)) return payload.length;
    if (Array.isArray(payload?.files)) return payload.files.length;
    return 0;
  }

  function createMemoryStorage() {
    const values = new Map();
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(String(key), String(value));
      },
      removeItem(key) {
        values.delete(String(key));
      },
    };
  }

  function getStorage() {
    try {
      if (root.localStorage && typeof root.localStorage.getItem === "function") return root.localStorage;
    } catch (_) {
      return createMemoryStorage();
    }
    return createMemoryStorage();
  }

  function createEventBus() {
    const handlers = new Map();
    function on(type, handler) {
      if (!type || typeof handler !== "function") return noop;
      const key = safeString(type);
      if (!handlers.has(key)) handlers.set(key, new Set());
      handlers.get(key).add(handler);
      return () => off(key, handler);
    }
    function off(type, handler) {
      const bucket = handlers.get(safeString(type));
      if (!bucket) return;
      bucket.delete(handler);
      if (!bucket.size) handlers.delete(safeString(type));
    }
    function emit(type, detail) {
      const event = Object.freeze({
        type: safeString(type),
        detail: detail || {},
        timestamp: new Date().toISOString(),
      });
      for (const handler of handlers.get(event.type) || []) handler(event);
      return event;
    }
    return Object.freeze({ emit, off, on });
  }

  function createStateStore(events) {
    let current = {};
    function get(key) {
      if (typeof key === "string") return current[key];
      return Object.assign({}, current);
    }
    function set(patch) {
      current = Object.assign({}, current, patch || {});
      events.emit("state:changed", { state: get(), patch: Object.assign({}, patch || {}) });
      return get();
    }
    return Object.freeze({ get, set, update: (updater) => (typeof updater === "function" ? set(updater(get()) || {}) : get()) });
  }

  function getClientVersion() {
    return root.document?.querySelector?.("meta[name='home-ai-client-version'], meta[name='hermes-web-client-version']")?.getAttribute?.("content")
      || root.document?.documentElement?.dataset?.clientVersion
      || "";
  }

  function createSearchParams(search) {
    const modelFn = runtimeFacadeCompatModelFunction("searchParamEntriesPlan");
    if (modelFn) {
      const pairs = new Map(modelFn(search));
      return Object.freeze({ get: (key) => pairs.get(safeString(key)) || "" });
    }
    const pairs = new Map();
    const text = safeString(search || "").replace(/^\?/, "");
    for (const part of text.split("&")) {
      if (!part) continue;
      const splitAt = part.indexOf("=");
      const rawKey = splitAt >= 0 ? part.slice(0, splitAt) : part;
      const rawValue = splitAt >= 0 ? part.slice(splitAt + 1) : "";
      try {
        pairs.set(decodeURIComponent(rawKey.replace(/\+/g, " ")), decodeURIComponent(rawValue.replace(/\+/g, " ")));
      } catch (_) {
        pairs.set(rawKey, rawValue);
      }
    }
    return Object.freeze({ get: (key) => pairs.get(safeString(key)) || "" });
  }

  function createAuth(events) {
    const storage = getStorage();
    function getAccessKey() {
      try {
        return safeString(storage.getItem(ACCESS_KEY_STORAGE_KEY)).trim();
      } catch (_) {
        return "";
      }
    }
    function syncCookie(accessKey = getAccessKey()) {
      if (!accessKey || !root.document) return;
      const secure = root.location?.protocol === "https:" ? "; Secure" : "";
      root.document.cookie = `${ACCESS_KEY_COOKIE_NAME}=${encodeURIComponent(accessKey)}; Path=/; SameSite=Lax${secure}`;
    }
    function setAccessKey(accessKey) {
      const normalized = safeString(accessKey).trim();
      try {
        if (normalized) storage.setItem(ACCESS_KEY_STORAGE_KEY, normalized);
        else storage.removeItem(ACCESS_KEY_STORAGE_KEY);
      } catch (_) {}
      if (normalized) syncCookie(normalized);
      events.emit("auth:changed", { hasAccessKey: Boolean(normalized) });
      return normalized;
    }
    return Object.freeze({
      cookieName: ACCESS_KEY_COOKIE_NAME,
      getAccessKey,
      hasAccessKey: () => Boolean(getAccessKey()),
      setAccessKey,
      storageKey: ACCESS_KEY_STORAGE_KEY,
      syncCookie,
    });
  }

  function createFeedback(events) {
    return Object.freeze({
      error(errorLike, detail) {
        return events.emit("feedback:error", {
          message: errorLike?.message || safeString(errorLike || "unknown_error"),
          code: errorLike?.code || "",
          detail: detail || {},
        });
      },
      status(message, detail) {
        return events.emit("feedback:status", { message: safeString(message), detail: detail || {} });
      },
      toast(message, detail) {
        return events.emit("feedback:toast", { message: safeString(message), detail: detail || {} });
      },
    });
  }

  function createDiagnostics(events) {
    return Object.freeze({
      async sendClientLayoutDiagnostic(payload, options) {
        const endpoint = options?.endpoint || CLIENT_LAYOUT_DIAGNOSTIC_ENDPOINT;
        if (typeof root.fetch !== "function") {
          events.emit("diagnostics:client-layout:unavailable", { endpoint });
          return Object.freeze({ ok: false, skipped: true, code: "fetch_unavailable" });
        }
        try {
          const response = await root.fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {}),
            keepalive: options?.keepalive !== false,
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
      },
    });
  }

  function createDedupe(events) {
    const storage = getStorage();
    function storageKey(scope, key) {
      const modelFn = runtimeFacadeCompatModelFunction("runtimeScopedStorageKeyPlan");
      if (modelFn) return modelFn({ scope, key });
      const safeScope = safeString(scope || "dedupe").replace(/[^\w.-]/g, "").slice(0, 80) || "dedupe";
      const safeKey = safeString(key || "").replace(/[^\w.-]/g, "").slice(0, 180);
      return `homeai.${safeScope}.${safeKey}`;
    }
    return Object.freeze({
      has(scope, key) {
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
      },
      mark(scope, key, payload) {
        if (!key) return false;
        try {
          storage.setItem(storageKey(scope, key), JSON.stringify(Object.assign({ at: new Date().toISOString() }, payload || {})));
          events.emit("dedupe:marked", { scope: safeString(scope || "dedupe").slice(0, 80) });
          return true;
        } catch (error) {
          events.emit("dedupe:write:error", {
            scope: safeString(scope || "dedupe").slice(0, 80),
            error: error?.code || error?.message || "storage_write_failed",
          });
          return false;
        }
      },
      storageKey,
    });
  }

  function createRoute(events, stateStore) {
    const storage = getStorage();
    return Object.freeze({
      current() {
        const modelFn = runtimeFacadeCompatModelFunction("routeSnapshotPlan");
        const snapshotInput = {
          href: safeString(root.location?.href || ""),
          pathname: safeString(root.location?.pathname || "/"),
          search: safeString(root.location?.search || ""),
          hash: safeString(root.location?.hash || ""),
        };
        return modelFn ? modelFn(snapshotInput) : Object.freeze(snapshotInput);
      },
      getViewMode(fallback) {
        try {
          const stored = safeString(storage.getItem(VIEW_MODE_STORAGE_KEY)).trim();
          if (stored) return stored;
        } catch (error) {
          events.emit("route:view-mode:read:error", {
            storageKey: VIEW_MODE_STORAGE_KEY,
            error: error?.code || error?.message || "storage_read_failed",
          });
        }
        return safeString(stateStore?.get?.("viewMode") || fallback || "").trim();
      },
      setViewMode(viewMode, detail) {
        const normalized = safeString(viewMode).trim().slice(0, 120);
        if (!normalized) return "";
        try {
          storage.setItem(VIEW_MODE_STORAGE_KEY, normalized);
        } catch (error) {
          events.emit("route:view-mode:write:error", {
            viewMode: normalized,
            storageKey: VIEW_MODE_STORAGE_KEY,
            error: error?.code || error?.message || "storage_write_failed",
          });
        }
        stateStore?.set?.({ viewMode: normalized });
        events.emit("route:view-mode:changed", {
          viewMode: normalized,
          storageKey: VIEW_MODE_STORAGE_KEY,
          source: safeString(detail?.source || ""),
        });
        return normalized;
      },
      viewModeStorageKey: VIEW_MODE_STORAGE_KEY,
    });
  }

  function createNative(events) {
    const storage = getStorage();
    const params = createSearchParams(root.location?.search || "");
    const dataset = Object.assign(
      {},
      root.document?.documentElement?.dataset || {},
      root.document?.body?.dataset || {},
    );
    const shareBridge = root.HomeAINativeShareCapability || root.HomeAINativeShare || null;
    let storedVoiceShell = "";
    try {
      storedVoiceShell = storage.getItem("homeAI.nativeShell") || "";
    } catch (_) {
      storedVoiceShell = "";
    }

    function nativeShellParam() {
      const value = normalizeNativeShellParam(params.get("nativeShell"))
        || normalizeNativeShellParam(dataset.nativeShell)
        || normalizeNativeShellParam(storedVoiceShell);
      if (value) return value;
      return isVoiceInputShellActive() ? "ios" : "";
    }

    function isVoiceInputShellActive() {
      return params.get("nativeShell") === "ios"
        || dataset.nativeShell === "ios"
        || storedVoiceShell === "ios"
        || Boolean(root.webkit?.messageHandlers?.homeAI);
    }

    function isVoiceInputBridgeAvailable() {
      if (!isVoiceInputShellActive()) return false;
      let stored = "";
      try {
        stored = storage.getItem("homeAI.nativeVoiceInput") || "";
      } catch (_) {
        stored = "";
      }
      const capability = root.HomeAINativeVoiceInputCapability || {};
      const declared = capability.voiceCapture === true
        || dataset.nativeVoiceInput === "1"
        || stored === "1";
      return Boolean(declared && typeof root.webkit?.messageHandlers?.homeAI?.postMessage === "function");
    }

    function postHomeAiMessage(payload) {
      if (!isVoiceInputBridgeAvailable()) return false;
      try {
        root.webkit.messageHandlers.homeAI.postMessage(payload || {});
        events.emit("native:home-ai-message:posted", { type: safeString(payload?.type || "") });
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
      } catch (_) {}
      return isVoiceInputShellActive();
    }

    function voiceInputDebugStatusEnabled() {
      if (params.get("voiceStatusDebug") === "1") return true;
      try {
        return storage.getItem("homeAiVoiceInputStatusDebug") === "1";
      } catch (_) {
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
      } catch (_) {
        return false;
      }
    }

    function requestId(prefix) {
      const safePrefix = safeString(prefix || "native");
      if (root.crypto?.randomUUID) return `${safePrefix}_${root.crypto.randomUUID()}`;
      return `${safePrefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function registerVoiceInputCallbacks(callbacks) {
      if (!callbacks || typeof callbacks !== "object") return null;
      const existing = root.HomeAINativeVoiceInput && typeof root.HomeAINativeVoiceInput === "object"
        ? root.HomeAINativeVoiceInput
        : {};
      root.HomeAINativeVoiceInput = Object.assign(existing, callbacks);
      events.emit("native:voice-input:callbacks:registered", { callbackCount: Object.keys(callbacks).length });
      return root.HomeAINativeVoiceInput;
    }

    function registerNativeShareCallbacks(callbacks) {
      if (!callbacks || typeof callbacks !== "object") return null;
      const existing = root.HomeAINativeShare && typeof root.HomeAINativeShare === "object"
        ? root.HomeAINativeShare
        : {};
      root.HomeAINativeShare = Object.assign(existing, callbacks);
      events.emit("native:share:callbacks:registered", { callbackCount: Object.keys(callbacks).length });
      if (typeof callbacks.receive === "function" && root.__homeAIPendingNativeShare) {
        const pendingShare = root.__homeAIPendingNativeShare;
        root.__homeAIPendingNativeShare = null;
        try {
          callbacks.receive(pendingShare);
          events.emit("native:share:pending:consumed", { fileCount: nativeShareFileCount(pendingShare) });
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
      isNativeShell: isVoiceInputShellActive() || Boolean(shareBridge || root.webkit?.messageHandlers?.nativeShare),
      isIosShell: isVoiceInputShellActive(),
      platform: isVoiceInputShellActive() ? "ios" : "",
      capabilities: Object.freeze({
        voice: isVoiceInputBridgeAvailable(),
        share: Boolean(shareBridge || root.webkit?.messageHandlers?.nativeShare),
      }),
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

  function createDocumentPreview(events, auth) {
    function absoluteUrl(value) {
      try {
        return new URL(value, root.location?.href || root.location?.origin || "http://127.0.0.1/").href;
      } catch (_) {
        return safeString(value || "");
      }
    }

    async function fetchBlob(url, options) {
      const sourceUrl = absoluteUrl(url);
      if (!sourceUrl) throw new Error("没有可打开的文件地址");
      if (typeof root.fetch !== "function") throw new Error("document_preview_fetch_unavailable");
      const headers = Object.assign({}, options?.headers || {});
      const accessKey = auth?.getAccessKey?.() || "";
      if (accessKey) headers["X-Hermes-Web-Key"] = accessKey;
      const response = await root.fetch(sourceUrl, Object.assign({}, options || {}, { headers }));
      if (!response?.ok) throw new Error(`${response?.status || 0} ${response?.statusText || "Request failed"}`);
      events.emit("document-preview:blob-fetched", { status: response.status || 0 });
      return response.blob();
    }

    return Object.freeze({
      absoluteUrl,
      fetchBlob,
    });
  }

  function createEventStream(events) {
    function eventSourceConstructor() {
      return typeof root.EventSource === "function" ? root.EventSource : null;
    }

    function isAvailable() {
      return typeof eventSourceConstructor() === "function";
    }

    function createEventSource(url, detail) {
      const sourceUrl = safeString(url).trim();
      const ctor = eventSourceConstructor();
      if (!sourceUrl) {
        events.emit("event-stream:create:error", {
          code: "event_source_url_missing",
          source: safeString(detail?.source || "classic_runtime_facade_event_stream"),
        });
        throw new Error("event_source_url_missing");
      }
      if (typeof ctor !== "function") {
        events.emit("event-stream:unavailable", {
          code: "event_source_unavailable",
          source: safeString(detail?.source || "classic_runtime_facade_event_stream"),
        });
        throw new Error("event_source_unavailable");
      }
      try {
        const source = new ctor(sourceUrl);
        events.emit("event-stream:created", {
          endpoint: sourceUrl.split("?")[0].slice(0, 160),
          hasQuery: sourceUrl.includes("?"),
          source: safeString(detail?.source || "classic_runtime_facade_event_stream"),
        });
        return source;
      } catch (error) {
        events.emit("event-stream:create:error", {
          code: error?.code || error?.message || "event_source_create_failed",
          source: safeString(detail?.source || "classic_runtime_facade_event_stream"),
        });
        throw error;
      }
    }

    return Object.freeze({
      createEventSource,
      isAvailable,
    });
  }

  function createApi(events, auth) {
    if (typeof root.api === "function") return root.api;
    if (typeof root.HermesAppApiClient?.createApiClient !== "function") return null;
    return root.HermesAppApiClient.createApiClient({
      fetchImpl: typeof root.fetch === "function" ? root.fetch.bind(root) : undefined,
      getAccessKey: () => auth.getAccessKey(),
      getClientVersion,
      onClientVersion: (payload, source) => {
        events.emit("client-version:received", Object.assign({ source: source || "response" }, payload || {}));
      },
    });
  }

  const events = createEventBus();
  const auth = createAuth(events);
  const state = createStateStore(events);
  const native = createNative(events);
  const facade = Object.freeze({
    version: VERSION,
    mode: "classic-shell-compat",
    auth,
    api: createApi(events, auth),
    clientVersion: getClientVersion,
    dedupe: createDedupe(events),
    diagnostics: createDiagnostics(events),
    documentPreview: createDocumentPreview(events, auth),
    eventStream: createEventStream(events),
    events,
    feedback: createFeedback(events),
    native,
    route: createRoute(events, state),
    state,
    snapshot() {
      const modelFn = runtimeFacadeCompatModelFunction("runtimeSnapshotPlan");
      const snapshotInput = {
        version: VERSION,
        mode: "classic-shell-compat",
        hasAccessKey: auth.hasAccessKey(),
        route: this.route.current(),
      };
      return modelFn ? modelFn(snapshotInput) : Object.freeze(snapshotInput);
    },
  });

  Object.defineProperty(root, "HomeAiRuntimeFacade", {
    value: facade,
    configurable: true,
    enumerable: false,
    writable: false,
  });
}(typeof window !== "undefined" ? window : globalThis));
