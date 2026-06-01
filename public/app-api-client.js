"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesAppApiClient = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeHeaders(headers) {
    return Object.assign({}, headers || {});
  }

  function handleClientVersionFromResponse(response, options = {}) {
    const serverVersion = response?.headers?.get?.("X-Hermes-Web-Version") || "";
    if (!serverVersion) return;
    const getClientVersion = typeof options.getClientVersion === "function"
      ? options.getClientVersion
      : () => "";
    const onClientVersion = typeof options.onClientVersion === "function"
      ? options.onClientVersion
      : null;
    if (!onClientVersion) return;
    onClientVersion({
      version: serverVersion,
      clientVersion: response.headers.get("X-Hermes-Web-Client-Version") || getClientVersion(),
      refreshRequired: response.headers.get("X-Hermes-Web-Refresh-Required") === "1",
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
    let message = `${response.status} ${response.statusText}`;
    if (body?.error) message = body.error;
    const err = new Error(message);
    err.status = response.status;
    if (body && typeof body === "object") {
      err.code = body.code || "";
      err.operatorRequired = Boolean(body.operatorRequired);
      err.elevationRequired = Boolean(body.elevationRequired);
      err.elevationScope = body.elevationScope || body.code || "";
      err.elevationReason = body.elevationReason || "";
    }
    return err;
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
      const headers = normalizeHeaders(requestOptions.headers);
      const accessKey = getAccessKey();
      const clientVersion = getClientVersion();
      if (accessKey) {
        headers["X-Hermes-Web-Key"] = accessKey;
        syncAccessKeyCookie(accessKey);
      }
      if (clientVersion) headers["X-Hermes-Web-Client-Version"] = clientVersion;
      if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const timeoutMs = Math.max(0, Number(requestOptions.timeoutMs || 0) || 0);
      const fetchOptions = Object.assign({}, requestOptions, { headers });
      if (!fetchOptions.cache && typeof path === "string" && path.startsWith("/api/")) {
        fetchOptions.cache = "no-store";
      }
      delete fetchOptions.timeoutMs;
      let timeoutId = 0;
      if (timeoutMs && !fetchOptions.signal && typeof AbortController === "function") {
        const controller = new AbortController();
        fetchOptions.signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }
      let response = null;
      try {
        response = await fetchImpl(path, fetchOptions);
      } catch (err) {
        if (err?.name === "AbortError") {
          const timeoutError = new Error("Request timed out");
          timeoutError.code = "request_timeout";
          throw timeoutError;
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
