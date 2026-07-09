"use strict";

const {
  buildLoopEngineeringStatusProjection,
} = require("./loop-engineering-plan-service");

const DEFAULT_CODEX_AT_LOOP_STATUS_URL = "http://127.0.0.1:8787/api/at-loop/status";

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function redact(value, max = 240) {
  const text = clean(value, max);
  if (!text) return "";
  if (/([A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/private\/|\/var\/|\/opt\/|https?:\/\/|wss?:\/\/)/i.test(text)) return "redacted";
  if (/(password|secret|token|access.?key|cookie|authorization|bearer|launch)/i.test(text)) return "redacted";
  return text;
}

function boundedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedCounts(source = {}) {
  const counts = source && typeof source === "object" ? source : {};
  return {
    open: boundedNumber(counts.open ?? counts.running ?? counts.active ?? counts.total, 0),
    blocked: boundedNumber(counts.blocked ?? counts.failed, 0),
    waitingReturn: boundedNumber(counts.waitingReturn ?? counts.waiting_return ?? counts.waiting, 0),
    duplicateSuppressed: boundedNumber(counts.duplicateSuppressed ?? counts.duplicate_suppressed, 0),
    verifiedClosed: boundedNumber(counts.verifiedClosed ?? counts.verified_closed ?? counts.completed ?? counts.closed, 0),
  };
}

function boundedItem(item = {}) {
  const source = item && typeof item === "object" ? item : {};
  return {
    loopId: clean(source.loopId || source.loop_id || source.id || "", 160),
    target: clean(source.target || source.targetWorkspaceId || source.target_workspace_id || "", 120),
    targetKind: clean(source.targetKind || source.target_kind || "", 80),
    status: clean(source.status || source.state || "unknown", 80),
    currentRole: clean(source.currentRole || source.current_role || source.role || "", 80),
    iteration: boundedNumber(source.iteration || source.currentIteration || source.current_iteration, 0),
    maxIterations: boundedNumber(source.maxIterations || source.max_iterations, 0),
    blockedReason: redact(source.blockedReason || source.blocked_reason || source.reason || "", 180),
    nextRoute: clean(source.nextRoute || source.next_route || "", 120),
  };
}

function normalizeCodexAtLoopBody(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const statusPayload = source.status && typeof source.status === "object" ? source.status : source;
  const rawCounts = statusPayload.counts || statusPayload.summary || {};
  const rawItems = Array.isArray(statusPayload.items)
    ? statusPayload.items
    : (Array.isArray(statusPayload.loops) ? statusPayload.loops : []);
  const counts = boundedCounts(rawCounts);
  const items = rawItems.slice(0, 20).map(boundedItem);
  const ok = source.ok !== false && statusPayload.ok !== false;
  const status = clean(statusPayload.status || (ok ? "ok" : "blocked"), 80);
  return {
    available: ok,
    status,
    code: clean(statusPayload.code || statusPayload.error || source.error || "", 160),
    counts,
    items,
    itemCount: boundedNumber(statusPayload.itemCount ?? statusPayload.item_count ?? items.length, items.length),
    source: {
      name: "codex-mobile-at-loop-status",
      runtimeOwner: "codex_mobile_loop",
    },
    policy: {
      readOnlySummary: true,
      boundedMetadataOnly: true,
      codexMobileRuntime: true,
    },
  };
}

async function fetchJsonWithTimeout(url, options = {}) {
  const fetchImpl = options.fetchImpl;
  const AbortControllerImpl = options.AbortController || globalThis.AbortController;
  const timeoutMs = Math.max(250, Number(options.timeoutMs || 1500) || 1500);
  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 503, error: "fetch_unavailable" };
  }
  let controller = null;
  let timer = null;
  const fetchOptions = {
    headers: { Accept: "application/json" },
    cache: "no-store",
  };
  if (typeof AbortControllerImpl === "function") {
    controller = new AbortControllerImpl();
    fetchOptions.signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const response = await fetchImpl(url, fetchOptions);
    if (!response || !response.ok) {
      return {
        ok: false,
        status: Number(response?.status || 0) || 0,
        error: "codex_at_loop_status_http_failed",
      };
    }
    const body = await response.json();
    return { ok: true, status: response.status || 200, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err?.name === "AbortError" ? "codex_at_loop_status_timeout" : "codex_at_loop_status_unreachable",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createCodexMobileAtLoopStatusService(options = {}) {
  const env = Object.assign({}, options.env || process.env);
  const statusUrl = clean(options.statusUrl || env.HOMEAI_CODEX_MOBILE_AT_LOOP_STATUS_URL || DEFAULT_CODEX_AT_LOOP_STATUS_URL, 500);
  const timeoutMs = Math.max(250, Number(options.timeoutMs || env.HOMEAI_CODEX_MOBILE_AT_LOOP_STATUS_TIMEOUT_MS || 1500) || 1500);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  async function status() {
    if (options.disabled === true || env.HOMEAI_CODEX_MOBILE_AT_LOOP_STATUS_DISABLED === "1") {
      return buildLoopEngineeringStatusProjection({
        codexRuntimeAvailable: false,
        codexLoopRuntimeStatus: {
          available: false,
          status: "blocked",
          code: "codex_at_loop_status_disabled",
        },
      });
    }
    const result = await fetchJsonWithTimeout(statusUrl, {
      AbortController: options.AbortController,
      fetchImpl,
      timeoutMs,
    });
    if (!result.ok) {
      return buildLoopEngineeringStatusProjection({
        codexRuntimeAvailable: false,
        codexLoopRuntimeStatus: {
          available: false,
          status: "blocked",
          code: result.error || "codex_at_loop_status_unavailable",
        },
      });
    }
    return buildLoopEngineeringStatusProjection({
      codexLoopRuntimeStatus: normalizeCodexAtLoopBody(result.body),
    });
  }

  return {
    status,
  };
}

module.exports = {
  DEFAULT_CODEX_AT_LOOP_STATUS_URL,
  createCodexMobileAtLoopStatusService,
  normalizeCodexAtLoopBody,
};
