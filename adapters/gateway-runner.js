"use strict";

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeApiPath(value) {
  const text = String(value || "");
  return text.startsWith("/") ? text : `/${text}`;
}

function readOption(value) {
  return typeof value === "function" ? value() : value;
}

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 8000));
}

function createGatewayError(message, status, cause = null) {
  const err = new Error(message);
  if (status) err.status = status;
  if (cause) err.cause = cause;
  return err;
}

async function responseErrorDetail(response) {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const parsed = await response.json();
    detail = parsed.error?.message || parsed.error || JSON.stringify(parsed);
  } catch (_) {
    try {
      detail = await response.text();
    } catch (_) {}
  }
  return detail || `${response.status} ${response.statusText}`;
}

function parseSseFrame(frame) {
  const dataLines = [];
  let eventName = "";
  for (const rawLine of String(frame || "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join("\n"));
    if (eventName && parsed && typeof parsed === "object" && !parsed.event) parsed.event = eventName;
    return parsed;
  } catch (_) {
    return null;
  }
}

function createGatewayRunner(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("GatewayRunner requires fetch");

  function apiBase(override = "") {
    return stripTrailingSlash(override || readOption(options.apiBase) || "http://127.0.0.1:8642");
  }

  function apiKey(override = undefined) {
    return String(override ?? readOption(options.apiKey) ?? "").trim();
  }

  function timeoutMs() {
    return Number(readOption(options.timeoutMs) || 8000);
  }

  async function request(apiPath, requestOptions = {}) {
    const headers = Object.assign({}, requestOptions.headers || {});
    if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const key = apiKey(requestOptions.apiKey);
    if (key) headers.Authorization = `Bearer ${key}`;
    const body = requestOptions.body && typeof requestOptions.body !== "string"
      ? JSON.stringify(requestOptions.body)
      : requestOptions.body;
    const base = apiBase(requestOptions.apiBase || requestOptions.gatewayUrl || "");
    const signal = requestOptions.signal || timeoutSignal(requestOptions.timeoutMs || timeoutMs());
    let response;
    try {
      response = await fetchImpl(`${base}${normalizeApiPath(apiPath)}`, Object.assign({}, requestOptions, { headers, body, signal }));
    } catch (err) {
      const isTimeout = err?.name === "AbortError" || err?.name === "TimeoutError";
      const message = isTimeout
        ? `Hermes Gateway API request timed out at ${base}${normalizeApiPath(apiPath)}`
        : `Hermes Gateway API unreachable at ${base}${normalizeApiPath(apiPath)}: ${err?.message || String(err)}`;
      throw createGatewayError(message, 502, err);
    }
    if (!response.ok) {
      const detail = await responseErrorDetail(response);
      throw createGatewayError(detail, response.status);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    return response;
  }

  async function status() {
    const out = {
      apiBase: apiBase(),
      health: null,
      detailed: null,
      capabilities: null,
      ok: false,
      error: null,
    };
    try {
      out.health = await request("/health");
      out.detailed = await request("/health/detailed");
      try {
        out.capabilities = await request("/v1/capabilities");
      } catch (err) {
        out.capabilities = { error: err.message };
      }
      out.ok = true;
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
  }

  async function createResponseStream(body, streamOptions = {}) {
    return request("/v1/responses", {
      method: "POST",
      body,
      signal: streamOptions.signal,
      apiBase: streamOptions.apiBase || streamOptions.gatewayUrl || "",
      apiKey: streamOptions.apiKey,
      timeoutMs: streamOptions.timeoutMs,
    });
  }

  async function streamResponses(body, streamOptions = {}) {
    const response = await createResponseStream(body, streamOptions);
    if (!response?.body?.getReader) return response;
    const onEvent = typeof streamOptions.onEvent === "function" ? streamOptions.onEvent : () => {};
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseSseFrame(frame);
        if (event) onEvent(event);
      }
    }
    const final = parseSseFrame(buffer);
    if (final) onEvent(final);
    return response;
  }

  function stopRun(runId, runRef = {}) {
    return request(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: "POST",
      body: {},
      apiBase: runRef.apiBase || runRef.gatewayUrl || "",
      apiKey: runRef.apiKey,
      signal: runRef.signal,
      timeoutMs: runRef.timeoutMs,
    });
  }

  function checkRun(runId, runRef = {}) {
    return request(`/v1/runs/${encodeURIComponent(runId)}`, {
      method: "GET",
      apiBase: runRef.apiBase || runRef.gatewayUrl || "",
      apiKey: runRef.apiKey,
      signal: runRef.signal,
      timeoutMs: runRef.timeoutMs,
    });
  }

  return {
    apiBase,
    checkRun,
    createResponseStream,
    request,
    status,
    stopRun,
    streamResponses,
  };
}

module.exports = {
  createGatewayRunner,
  parseSseFrame,
};
