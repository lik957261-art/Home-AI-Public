"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesAppApiClient = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const API_CLIENT_MODEL_ESM_PATH = "/vite-islands/api-client-model/api-client-model.js";
  let apiClientModel = null;
  let apiClientModelPromise = null;

  function apiClientRoot() {
    if (typeof window !== "undefined") return window;
    if (typeof globalThis !== "undefined") return globalThis;
    return {};
  }

  function importApiClientModel() {
    if (apiClientModel) return Promise.resolve(apiClientModel);
    if (!apiClientModelPromise) {
      const root = apiClientRoot();
      const importer = typeof root.__homeAiImportApiClientModel === "function"
        ? root.__homeAiImportApiClientModel
        : (() => import(API_CLIENT_MODEL_ESM_PATH));
      apiClientModelPromise = Promise.resolve()
        .then(() => importer(API_CLIENT_MODEL_ESM_PATH))
        .then((model) => {
          apiClientModel = model || null;
          return apiClientModel;
        })
        .catch((error) => {
          apiClientModelPromise = null;
          console.warn("API client ESM model unavailable", error);
          return null;
        });
    }
    return apiClientModelPromise;
  }

  function currentApiClientModel() {
    return apiClientModel;
  }

  if (typeof window !== "undefined") importApiClientModel();

  function apiClientModelFunction(name) {
    const fn = currentApiClientModel()?.[name];
    return typeof fn === "function" ? fn : null;
  }

  function normalizeHeaders(headers) {
    const modelFn = apiClientModelFunction("normalizeHeadersPlan");
    if (modelFn) return modelFn(headers);
    return Object.assign({}, headers || {});
  }

  function clientVersionHeadersFromResponse(response) {
    return {
      serverVersion: response?.headers?.get?.("X-Hermes-Web-Version") || "",
      clientVersion: response?.headers?.get?.("X-Hermes-Web-Client-Version") || "",
      refreshRequired: response?.headers?.get?.("X-Hermes-Web-Refresh-Required") || "",
    };
  }

  function handleClientVersionFromResponse(response, options = {}) {
    const getClientVersion = typeof options.getClientVersion === "function"
      ? options.getClientVersion
      : () => "";
    const onClientVersion = typeof options.onClientVersion === "function"
      ? options.onClientVersion
      : null;
    const headers = clientVersionHeadersFromResponse(response);
    const modelFn = apiClientModelFunction("clientVersionResponsePlan");
    if (modelFn) {
      const plan = modelFn(headers, {
        clientVersion: getClientVersion(),
        source: options.source || "response",
      });
      if (!plan || !onClientVersion) return;
      onClientVersion(plan.payload, plan.source);
      return;
    }
    const serverVersion = headers.serverVersion;
    if (!serverVersion) return;
    if (!onClientVersion) return;
    onClientVersion({
      version: serverVersion,
      clientVersion: headers.clientVersion || getClientVersion(),
      refreshRequired: headers.refreshRequired === "1",
    }, options.source || "response");
  }

  async function parseErrorBody(response) {
    try {
      const body = await response.json();
      return body && typeof body === "object" ? body : null;
    } catch (_) {
      return null;
    }
  }

  function createHttpError(response, body) {
    const modelFn = apiClientModelFunction("httpErrorPlan");
    const plan = modelFn
      ? modelFn(response, body)
      : {
        message: body?.error || `${response.status} ${response.statusText}`,
        status: response.status,
        code: body?.code || "",
        operatorRequired: Boolean(body?.operatorRequired),
        elevationRequired: Boolean(body?.elevationRequired),
        elevationScope: body?.elevationScope || body?.code || "",
        elevationReason: body?.elevationReason || "",
        hasBody: Boolean(body && typeof body === "object"),
      };
    const err = new Error(plan.message);
    err.status = plan.status;
    if (plan.hasBody) {
      err.code = plan.code || "";
      err.operatorRequired = Boolean(plan.operatorRequired);
      err.elevationRequired = Boolean(plan.elevationRequired);
      err.elevationScope = plan.elevationScope || "";
      err.elevationReason = plan.elevationReason || "";
    }
    return err;
  }

  function requestPlan(path, requestOptions = {}, context = {}) {
    const modelFn = apiClientModelFunction("apiRequestPlan");
    if (modelFn) return modelFn(path, requestOptions, context);
    const headers = normalizeHeaders(requestOptions.headers);
    const accessKey = context.accessKey || "";
    const clientVersion = context.clientVersion || "";
    if (accessKey) headers["X-Hermes-Web-Key"] = accessKey;
    if (clientVersion) headers["X-Hermes-Web-Client-Version"] = clientVersion;
    if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const timeoutMs = Math.max(0, Number(requestOptions.timeoutMs || 0) || 0);
    const fetchOptions = Object.assign({}, requestOptions, { headers });
    if (!fetchOptions.cache && typeof path === "string" && path.startsWith("/api/")) {
      fetchOptions.cache = "no-store";
    }
    delete fetchOptions.timeoutMs;
    return {
      headers,
      fetchOptions,
      timeoutMs,
      shouldSyncAccessKeyCookie: Boolean(accessKey),
    };
  }

  function createTimeoutError() {
    const modelFn = apiClientModelFunction("timeoutErrorPlan");
    const plan = modelFn ? modelFn() : { message: "Request timed out", code: "request_timeout" };
    const timeoutError = new Error(plan.message || "Request timed out");
    timeoutError.code = plan.code || "request_timeout";
    return timeoutError;
  }

  function createApiClient(options = {}) {
    const fetchImpl = typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : (...args) => fetch(...args);
    const getAccessKey = typeof options.getAccessKey === "function"
      ? options.getAccessKey
      : () => "";
    const getClientVersion = typeof options.getClientVersion === "function"
      ? options.getClientVersion
      : () => "";
    const onUnauthorized = typeof options.onUnauthorized === "function"
      ? options.onUnauthorized
      : null;
    const syncAccessKeyCookie = typeof options.syncAccessKeyCookie === "function"
      ? options.syncAccessKeyCookie
      : (accessKey) => {
        if (!accessKey || typeof document === "undefined") return;
        const secure = window?.location?.protocol === "https:" ? "; Secure" : "";
        document.cookie = `hermes_web_key=${encodeURIComponent(accessKey)}; Path=/; SameSite=Lax${secure}`;
      };

    return async function api(path, requestOptions = {}) {
      const accessKey = getAccessKey();
      const clientVersion = getClientVersion();
      const plan = requestPlan(path, requestOptions, { accessKey, clientVersion });
      if (plan.shouldSyncAccessKeyCookie) {
        syncAccessKeyCookie(accessKey);
      }
      const fetchOptions = plan.fetchOptions;
      const timeoutMs = plan.timeoutMs;
      let timeoutId = 0;
      let timedOut = false;
      let timeoutPromise = null;
      let controller = null;
      if (timeoutMs && !fetchOptions.signal && typeof AbortController === "function") {
        controller = new AbortController();
        fetchOptions.signal = controller.signal;
      }
      if (timeoutMs) {
        timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            if (controller) controller.abort();
            reject(createTimeoutError());
          }, timeoutMs);
        });
      }
      let response = null;
      try {
        const fetchPromise = fetchImpl(path, fetchOptions);
        response = timeoutPromise ? await Promise.race([fetchPromise, timeoutPromise]) : await fetchPromise;
      } catch (err) {
        if (err?.code === "request_timeout") {
          throw err;
        }
        if (err?.name === "AbortError" || timedOut) {
          throw createTimeoutError();
        }
        throw err;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      handleClientVersionFromResponse(response, {
        getClientVersion,
        onClientVersion: options.onClientVersion,
        source: options.clientVersionSource || "response",
      });
      if (response.status === 401) {
        if (onUnauthorized) onUnauthorized(response);
        throw new Error("Unauthorized");
      }
      if (!response.ok) {
        throw createHttpError(response, await parseErrorBody(response));
      }
      if (response.status === 204) return null;
      return response.json();
    };
  }

  return Object.freeze({
    createApiClient,
    createHttpError,
    handleClientVersionFromResponse,
  });
}));
