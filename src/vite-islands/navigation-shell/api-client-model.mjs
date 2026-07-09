export const API_CLIENT_MODEL_VERSION = "20260706-api-client-model-v1";

export function normalizeHeadersPlan(headers) {
  return Object.assign({}, headers || {});
}

export function apiRequestPlan(path, requestOptions = {}, context = {}) {
  const headers = normalizeHeadersPlan(requestOptions.headers);
  const accessKey = String(context.accessKey || "");
  const clientVersion = String(context.clientVersion || "");
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

export function clientVersionResponsePlan(headers = {}, options = {}) {
  const serverVersion = String(headers.serverVersion || "");
  if (!serverVersion) return null;
  return {
    payload: {
      version: serverVersion,
      clientVersion: String(headers.clientVersion || options.clientVersion || ""),
      refreshRequired: headers.refreshRequired === "1" || headers.refreshRequired === true,
    },
    source: options.source || "response",
  };
}

export function httpErrorPlan(response = {}, body = null) {
  const status = Number(response.status || 0) || 0;
  const statusText = String(response.statusText || "");
  const safeBody = body && typeof body === "object" ? body : null;
  return {
    message: safeBody?.error || `${status} ${statusText}`,
    status,
    code: safeBody?.code || "",
    operatorRequired: Boolean(safeBody?.operatorRequired),
    elevationRequired: Boolean(safeBody?.elevationRequired),
    elevationScope: safeBody?.elevationScope || safeBody?.code || "",
    elevationReason: safeBody?.elevationReason || "",
    hasBody: Boolean(safeBody),
  };
}

export function timeoutErrorPlan() {
  return {
    message: "Request timed out",
    code: "request_timeout",
  };
}
