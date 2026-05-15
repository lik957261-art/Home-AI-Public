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

    return async function api(path, requestOptions = {}) {
      const headers = normalizeHeaders(requestOptions.headers);
      const accessKey = getAccessKey();
      const clientVersion = getClientVersion();
      if (accessKey) headers["X-Hermes-Web-Key"] = accessKey;
      if (clientVersion) headers["X-Hermes-Web-Client-Version"] = clientVersion;
      if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const response = await fetchImpl(path, Object.assign({}, requestOptions, { headers }));
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
