"use strict";

const SAFE_BINARY_RESPONSE_HEADERS = Object.freeze([
  ["cache-control", "Cache-Control"],
  ["content-disposition", "Content-Disposition"],
  ["content-length", "Content-Length"],
  ["content-range", "Content-Range"],
  ["accept-ranges", "Accept-Ranges"],
  ["etag", "ETag"],
  ["last-modified", "Last-Modified"],
  ["expires", "Expires"],
]);

function headerValue(response, name) {
  return response?.headers?.get?.(name) || response?.headers?.get?.(String(name || "").toLowerCase()) || "";
}

function safeHeaderValue(value = "", maxLength = 1024) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  return text.slice(0, maxLength);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function collectSafeBinaryResponseHeaders(response, options = {}) {
  const out = {};
  const hasContentEncoding = Boolean(safeHeaderValue(headerValue(response, "content-encoding"), 120));
  for (const [lower, canonical] of SAFE_BINARY_RESPONSE_HEADERS) {
    if (lower === "content-length" && hasContentEncoding && options.preserveEncodedContentLength !== true) continue;
    const value = safeHeaderValue(headerValue(response, lower));
    if (value) out[canonical] = value;
  }
  return out;
}

function binaryBodyBytesFromHeaders(response) {
  return positiveInteger(headerValue(response, "content-length"));
}

function writeBinaryChunk(res, chunk) {
  if (!chunk) return 0;
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (!buffer.length) return 0;
  res.write(buffer);
  return buffer.length;
}

async function streamBinaryResponseBody(upstream, res) {
  const body = upstream?.body;
  let bytes = 0;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += writeBinaryChunk(res, value);
      }
    } finally {
      if (typeof reader.releaseLock === "function") reader.releaseLock();
    }
    res.end();
    return bytes;
  }
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    for await (const chunk of body) bytes += writeBinaryChunk(res, chunk);
    res.end();
    return bytes;
  }
  if (typeof upstream?.arrayBuffer === "function") {
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length) res.write(buffer);
    res.end();
    return buffer.length;
  }
  res.end();
  return 0;
}

function numberFromObjectPath(source, path = []) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return 0;
    current = current[key];
  }
  const number = Number(current);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function codexReportedTotalMsFromJson(parsed, routeKind = "") {
  if (!parsed || typeof parsed !== "object") return 0;
  if (routeKind === "codex_thread_detail") {
    return numberFromObjectPath(parsed, ["thread", "mobileDiagnostics", "threadDetailTimings", "totalMs"]);
  }
  if (routeKind === "codex_thread_list") {
    return numberFromObjectPath(parsed, ["mobileDiagnostics", "threadListTimings", "totalMs"]);
  }
  return 0;
}

module.exports = {
  binaryBodyBytesFromHeaders,
  codexReportedTotalMsFromJson,
  collectSafeBinaryResponseHeaders,
  streamBinaryResponseBody,
};
