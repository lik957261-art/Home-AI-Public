"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const crypto = require("crypto");

function parseArgs(argv = process.argv.slice(2)) {
  const appiumPort = Number(process.env.APPIUM_PORT || "") || 4723;
  const out = {
    host: "127.0.0.1",
    port: 19073,
    appiumUrl: process.env.HOMEAI_IOS_APPIUM_URL || `http://127.0.0.1:${appiumPort}`,
    deviceName: "HomeAI iPhone 17 Pro",
    udid: "C2EB6D31-F485-4DAE-BFB4-25E27FC65389",
    wdaLocalPort: 8101,
    mjpegServerPort: 9100,
    mjpegUrl: "",
    appUrl: "https://wardrobe-xuxin.synology.me:8555/?source=pwa",
    screenshotCacheMs: 350,
    appiumTimeoutMs: 15000,
    mjpegConnectTimeoutMs: 2500,
    screenshotSource: "simctl",
    streamMode: "simctl",
    laneOwner: process.env.HOMEAI_IOS_DEBUG_LANE_OWNER || process.env.USER || "homeai-ios-debug",
    leaseTtlMs: 120000,
    appiumStartScript: path.join(process.env.HOME || "/Users/xuxin", ".homeai-qa/scripts/macos-ios-appium-start.sh"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    const next = () => argv[++i] || "";
    if (item === "--host") out.host = next();
    else if (item === "--port") out.port = Number(next()) || out.port;
    else if (item === "--appium-url") out.appiumUrl = next();
    else if (item === "--device-name") out.deviceName = next();
    else if (item === "--udid") out.udid = next();
    else if (item === "--wda-local-port") out.wdaLocalPort = Number(next()) || out.wdaLocalPort;
    else if (item === "--mjpeg-server-port") out.mjpegServerPort = Number(next()) || out.mjpegServerPort;
    else if (item === "--mjpeg-url") out.mjpegUrl = next();
    else if (item === "--app-url") out.appUrl = next();
    else if (item === "--screenshot-cache-ms") out.screenshotCacheMs = Number(next()) || out.screenshotCacheMs;
    else if (item === "--appium-timeout-ms") out.appiumTimeoutMs = Number(next()) || out.appiumTimeoutMs;
    else if (item === "--mjpeg-connect-timeout-ms") out.mjpegConnectTimeoutMs = Number(next()) || out.mjpegConnectTimeoutMs;
    else if (item === "--screenshot-source") out.screenshotSource = next() || out.screenshotSource;
    else if (item === "--stream") out.streamMode = next() || out.streamMode;
    else if (item === "--lane-owner") out.laneOwner = next() || out.laneOwner;
    else if (item === "--lease-ttl-ms") out.leaseTtlMs = Number(next()) || out.leaseTtlMs;
    else if (item === "--appium-start-script") out.appiumStartScript = next();
  }
  return out;
}

const args = parseArgs();
const state = {
  sessionId: "",
  webContext: "",
  screenshot: null,
  screenshotAt: 0,
  connecting: null,
  commandQueue: Promise.resolve(),
  lastDeepState: null,
  lastDeepStateAt: 0,
  lastError: "",
  streamClients: 0,
  streamLastConnectedAt: 0,
  streamLastError: "",
  lease: null,
  coordinateCalibration: null,
  coordinateCalibrationAt: 0,
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

function html(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error("request_body_too_large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function boundedText(value, fallback = "") {
  const text = String(value || "").trim();
  return (text || fallback).replace(/[^\w:./@-]+/g, "-").slice(0, 160);
}

function laneInfo() {
  return {
    port: args.port,
    udid: args.udid,
    deviceName: args.deviceName,
    wdaLocalPort: args.wdaLocalPort,
    mjpegServerPort: args.mjpegServerPort,
    appiumUrl: args.appiumUrl,
  };
}

function laneError(error, statusCode = 423, extra = {}) {
  const err = new Error(error);
  err.statusCode = statusCode;
  err.details = extra;
  return err;
}

function readLeaseTtlMs(value) {
  const fallback = Math.max(30000, Number(args.leaseTtlMs || 120000) || 120000);
  const requested = Number(value || fallback);
  if (!Number.isFinite(requested) || requested <= 0) return fallback;
  return Math.max(30000, Math.min(600000, Math.floor(requested)));
}

function pruneExpiredLease(now = Date.now()) {
  if (state.lease && Number(state.lease.expiresAt || 0) <= now) state.lease = null;
}

function publicLeaseInfo() {
  pruneExpiredLease();
  return {
    required: true,
    active: Boolean(state.lease),
    owner: state.lease?.owner || "",
    acquiredAt: state.lease?.acquiredAt || 0,
    expiresAt: state.lease?.expiresAt || 0,
    ttlMs: state.lease?.ttlMs || readLeaseTtlMs(),
  };
}

function formatLeaseResponse() {
  return {
    ok: true,
    token: state.lease?.token || "",
    owner: state.lease?.owner || "",
    acquiredAt: state.lease?.acquiredAt || 0,
    expiresAt: state.lease?.expiresAt || 0,
    ttlMs: state.lease?.ttlMs || readLeaseTtlMs(),
    lease: publicLeaseInfo(),
    lane: laneInfo(),
  };
}

function acquireDebugLaneLease(body = {}) {
  pruneExpiredLease();
  const now = Date.now();
  const ttlMs = readLeaseTtlMs(body.ttlMs);
  const owner = boundedText(body.owner || args.laneOwner, args.laneOwner || "homeai-ios-debug");
  const token = String(body.leaseToken || body.token || "").trim();
  if (state.lease && state.lease.token !== token && state.lease.owner !== owner) {
    throw laneError("debug_lane_locked", 423, { lease: publicLeaseInfo(), lane: laneInfo() });
  }
  if (!state.lease || state.lease.token !== token) {
    state.lease = {
      token: crypto.randomUUID(),
      owner,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      ttlMs,
    };
  } else {
    state.lease.expiresAt = now + ttlMs;
    state.lease.ttlMs = ttlMs;
  }
  return formatLeaseResponse();
}

function releaseDebugLaneLease(body = {}) {
  pruneExpiredLease();
  const token = String(body.leaseToken || body.token || "").trim();
  const released = Boolean(token && state.lease && state.lease.token === token);
  if (released) state.lease = null;
  return { ok: true, released, lease: publicLeaseInfo(), lane: laneInfo() };
}

function leaseTokenFromRequest(req, url, body = {}) {
  return String(
    body.leaseToken
      || body.token
      || url.searchParams.get("leaseToken")
      || req.headers["x-homeai-debug-lane-lease"]
      || "",
  ).trim();
}

function hasValidDebugLaneLease(token) {
  pruneExpiredLease();
  return Boolean(token && state.lease && state.lease.token === token);
}

function requireDebugLaneLease(token) {
  pruneExpiredLease();
  if (hasValidDebugLaneLease(token)) {
    state.lease.expiresAt = Date.now() + readLeaseTtlMs(state.lease.ttlMs);
    return;
  }
  if (!state.lease) throw laneError("debug_lane_lease_required", 423, { lease: publicLeaseInfo(), lane: laneInfo() });
  throw laneError("debug_lane_locked", 423, { lease: publicLeaseInfo(), lane: laneInfo() });
}

async function appium(method, route, body = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(args.appiumTimeoutMs || 15000)));
  let response;
  try {
    response = await fetch(`${args.appiumUrl}${route}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`${method} ${route}: appium_timeout`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const message = String(parsed?.value?.message || parsed?.message || text || response.statusText || "appium_error");
    if (response.status === 404 && /session is either terminated|not started|invalid session|Session .* not found/i.test(message)) {
      state.sessionId = "";
      state.webContext = "";
    }
    throw new Error(`${method} ${route} ${response.status}: ${message.slice(0, 600)}`);
  }
  return parsed;
}

function invalidSessionError(err) {
  return /session is either terminated|not started|invalid session|Session .* not found/i.test(String(err?.message || err || ""));
}

function recoverableAppiumError(err) {
  const message = String(err?.message || err || "");
  return invalidSessionError(err)
    || /Unexpected EOF|socket hang up|ECONNRESET|webview_context_missing|appium_timeout/i.test(message);
}

function clearAppiumSessionState() {
  state.sessionId = "";
  state.webContext = "";
}

function enqueue(fn) {
  const run = state.commandQueue.then(fn, fn);
  state.commandQueue = run.catch(() => null);
  return run;
}

async function ensureAppiumServer() {
  try {
    const response = await fetch(`${args.appiumUrl}/status`);
    if (response.ok) return true;
  } catch (_) {}
  if (args.appiumStartScript && fs.existsSync(args.appiumStartScript)) {
    const parsed = new URL(args.appiumUrl);
    const appiumPort = Number(parsed.port || "4723") || 4723;
    childProcess.execFileSync("bash", [args.appiumStartScript], {
      env: { ...process.env, APPIUM_PORT: String(appiumPort) },
      stdio: "ignore",
    });
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    try {
      const response = await fetch(`${args.appiumUrl}/status`);
      if (response.ok) return true;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("appium_server_not_ready");
}

async function deleteSession() {
  if (!state.sessionId) return;
  const id = state.sessionId;
  state.sessionId = "";
  state.webContext = "";
  await appium("DELETE", `/session/${id}`).catch(() => null);
}

async function connectSession(options = {}) {
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    await ensureAppiumServer();
    if (options.resetSession) await deleteSession();
    if (!state.sessionId) {
      const created = await appium("POST", "/session", {
        capabilities: {
          alwaysMatch: {
            platformName: "iOS",
            "appium:automationName": "XCUITest",
            "appium:deviceName": args.deviceName,
            "appium:udid": args.udid,
            "appium:wdaLocalPort": args.wdaLocalPort,
            "appium:mjpegServerPort": args.mjpegServerPort,
            "appium:newCommandTimeout": 600,
            "appium:noReset": true,
            "appium:includeSafariInWebviews": true,
            "appium:webviewConnectTimeout": Math.max(12000, Number(args.appiumTimeoutMs || 15000)),
          },
        },
      });
      state.sessionId = created?.value?.sessionId || created?.sessionId || "";
    }
    await refreshWebContext();
    state.lastError = "";
    return { ok: true, sessionId: state.sessionId, webContext: state.webContext };
  })();
  try {
    return await state.connecting;
  } finally {
    state.connecting = null;
  }
}

async function refreshWebContext() {
  if (!state.sessionId) return "";
  const startedAt = Date.now();
  let web = "";
  while (Date.now() - startedAt < 12000) {
    const contexts = await appium("GET", `/session/${state.sessionId}/contexts`);
    const list = Array.isArray(contexts?.value) ? contexts.value : [];
    web = list.find((item) => String(item).startsWith("WEBVIEW")) || "";
    if (web) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  state.webContext = web;
  return web;
}

async function withWebContext(fn) {
  await connectSession();
  const web = state.webContext || await refreshWebContext();
  if (!web) throw new Error("webview_context_missing");
  await appium("POST", `/session/${state.sessionId}/context`, { name: web });
  return fn();
}

async function execute(script, scriptArgs = []) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 550 * attempt));
      return await withWebContext(async () => {
        const result = await appium("POST", `/session/${state.sessionId}/execute/sync`, { script, args: scriptArgs });
        return result?.value;
      });
    } catch (err) {
      if (!recoverableAppiumError(err)) throw err;
      lastError = err;
      clearAppiumSessionState();
      await connectSession({ resetSession: true }).catch((connectErr) => {
        lastError = connectErr;
      });
    }
  }
  throw lastError || new Error("appium_execute_failed");
}

async function executeAsync(script, scriptArgs = []) {
  const run = async () => {
    await appium("POST", `/session/${state.sessionId}/timeouts`, {
      script: Math.max(1000, Number(args.appiumTimeoutMs || 15000)),
    }).catch(() => null);
    const result = await appium("POST", `/session/${state.sessionId}/execute/async`, { script, args: scriptArgs });
    return result?.value;
  };
  try {
    return await withWebContext(run);
  } catch (err) {
    if (!recoverableAppiumError(err)) throw err;
    clearAppiumSessionState();
    await connectSession({ resetSession: true });
    return withWebContext(run);
  }
}

async function nativeExecute(command, payload = {}) {
  try {
    await connectSession();
    const result = await appium("POST", `/session/${state.sessionId}/execute/sync`, {
      script: `mobile: ${command}`,
      args: [payload],
    });
    return result?.value;
  } catch (err) {
    if (!recoverableAppiumError(err)) throw err;
    clearAppiumSessionState();
    await connectSession({ resetSession: true });
    const result = await appium("POST", `/session/${state.sessionId}/execute/sync`, {
      script: `mobile: ${command}`,
      args: [payload],
    });
    return result?.value;
  }
}

async function nativePointerTap(px, py, pauseMs = 80, pointerId = "finger1") {
  await appium("POST", `/session/${state.sessionId}/actions`, {
    actions: [{
      type: "pointer",
      id: pointerId,
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: px, y: py },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: Math.max(0, Math.min(1200, Math.floor(Number(pauseMs || 0) || 0))) },
        { type: "pointerUp", button: 0 },
      ],
    }],
  });
  await appium("DELETE", `/session/${state.sessionId}/actions`).catch(() => null);
}

function rawNativeCalibrationSummary(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of ["offsetX", "offsetY", "pixelRatioX", "pixelRatioY", "x", "y", "dx", "dy"]) {
    if (Number.isFinite(Number(value[key]))) out[key] = Number(value[key]);
  }
  return Object.keys(out).length ? out : value;
}

async function nativeCoordinateCalibration(options = {}) {
  await connectSession();
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && state.coordinateCalibration && now - state.coordinateCalibrationAt < 30000) {
    return state.coordinateCalibration;
  }

  const rect = await appium("GET", `/session/${state.sessionId}/window/rect`);
  const width = Number(rect?.value?.width || rect?.width || 0) || 1;
  const height = Number(rect?.value?.height || rect?.height || 0) || 1;
  const nativePoint = {
    x: Math.max(8, Math.min(width - 8, Math.round(width * 0.5))),
    y: Math.max(80, Math.min(height - 80, Math.round(height * 0.5))),
  };
  const probeId = `homeai-native-coordinate-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rawMobileCalibration = options.includeNativeCalibration
    ? await nativeExecute("calibrateWebToRealCoordinatesTranslation", {})
      .then(rawNativeCalibrationSummary)
      .catch((err) => ({ error: String(err?.message || err || "calibration_command_failed").slice(0, 180) }))
    : null;

  await execute(`
    const probeId = arguments[0];
    const old = document.getElementById("__homeAiNativeCoordinateProbe");
    if (old) old.remove();
    window.__homeAiNativeCoordinateProbe = null;
    const overlay = document.createElement("div");
    overlay.id = "__homeAiNativeCoordinateProbe";
    overlay.setAttribute("data-probe-id", probeId);
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "rgba(0,0,0,0)",
      pointerEvents: "auto",
      touchAction: "none"
    });
    const record = (event) => {
      const touch = (event.changedTouches && event.changedTouches[0])
        || (event.touches && event.touches[0])
        || null;
      const touchClientX = Number(touch && touch.clientX);
      const touchClientY = Number(touch && touch.clientY);
      const touchPageX = Number(touch && touch.pageX);
      const touchPageY = Number(touch && touch.pageY);
      const eventClientX = Number(event.clientX);
      const eventClientY = Number(event.clientY);
      const eventPageX = Number(event.pageX);
      const eventPageY = Number(event.pageY);
      const clientX = Number.isFinite(touchClientX) ? touchClientX : eventClientX;
      const clientY = Number.isFinite(touchClientY) ? touchClientY : eventClientY;
      const pageX = Number.isFinite(touchPageX) ? touchPageX : eventPageX;
      const pageY = Number.isFinite(touchPageY) ? touchPageY : eventPageY;
      window.__homeAiNativeCoordinateProbe = {
        ok: true,
        probeId,
        type: event.type,
        clientX,
        clientY,
        pageX,
        pageY,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetTop: window.visualViewport.offsetTop,
          offsetLeft: window.visualViewport.offsetLeft,
          scale: window.visualViewport.scale
        } : null
      };
      event.preventDefault();
      event.stopPropagation();
    };
    ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"].forEach((type) => {
      overlay.addEventListener(type, record, true);
    });
    document.documentElement.appendChild(overlay);
    return { ok: true, probeId, innerWidth: window.innerWidth, innerHeight: window.innerHeight };
  `, [probeId]);

  await nativePointerTap(nativePoint.x, nativePoint.y, 70, "coordinate-probe");
  await new Promise((resolve) => setTimeout(resolve, 120));
  const probe = await execute(`
    const probeId = arguments[0];
    const probe = window.__homeAiNativeCoordinateProbe || null;
    const overlay = document.getElementById("__homeAiNativeCoordinateProbe");
    if (overlay && overlay.getAttribute("data-probe-id") === probeId) overlay.remove();
    window.__homeAiNativeCoordinateProbe = null;
    return probe;
  `, [probeId]).catch(async (err) => {
    await execute(`
      const overlay = document.getElementById("__homeAiNativeCoordinateProbe");
      if (overlay) overlay.remove();
      window.__homeAiNativeCoordinateProbe = null;
      return true;
    `).catch(() => null);
    throw err;
  });

  if (!probe || !Number.isFinite(Number(probe.clientX)) || !Number.isFinite(Number(probe.clientY))) {
    throw new Error("native_coordinate_probe_failed");
  }

  const calibration = {
    ok: true,
    coordinateSpace: "web",
    width,
    height,
    nativePoint,
    webPoint: {
      x: Number(probe.clientX),
      y: Number(probe.clientY),
    },
    offsetX: Math.round((nativePoint.x - Number(probe.clientX)) * 1000) / 1000,
    offsetY: Math.round((nativePoint.y - Number(probe.clientY)) * 1000) / 1000,
    visualViewport: probe.visualViewport || null,
    rawMobileCalibration,
  };
  state.coordinateCalibration = calibration;
  state.coordinateCalibrationAt = Date.now();
  return calibration;
}

function coordinateSpaceRequiresCalibration(value) {
  return String(value || "").trim().toLowerCase() === "web";
}

function nativeCoordinatePoint(point = {}, rect = {}, calibration = null) {
  const width = Number(rect.width || 0) || 1;
  const height = Number(rect.height || 0) || 1;
  const absoluteX = Number(point.absoluteX);
  const absoluteY = Number(point.absoluteY);
  const baseX = Number.isFinite(absoluteX) ? absoluteX : width * Number(point.x || 0);
  const baseY = Number.isFinite(absoluteY) ? absoluteY : height * Number(point.y || 0);
  const px = Number(baseX) + Number(calibration?.offsetX || 0);
  const py = Number(baseY) + Number(calibration?.offsetY || 0);
  return {
    x: Math.max(0, Math.min(width - 1, Math.round(px))),
    y: Math.max(0, Math.min(height - 1, Math.round(py))),
    durationMs: Math.max(0, Math.min(4000, Math.floor(Number(point.durationMs || point.duration || 0) || 0))),
  };
}

async function screenshotBase64(force = false) {
  if (args.screenshotSource !== "appium") return simctlScreenshotBase64(force);
  try {
    await connectSession();
    const now = Date.now();
    if (!force && state.screenshot && now - state.screenshotAt < args.screenshotCacheMs) return state.screenshot;
    const result = await appium("GET", `/session/${state.sessionId}/screenshot`);
    state.screenshot = String(result?.value || "");
    state.screenshotAt = now;
    return state.screenshot;
  } catch (err) {
    if (!recoverableAppiumError(err)) throw err;
    clearAppiumSessionState();
    state.screenshot = null;
    state.screenshotAt = 0;
    await connectSession({ resetSession: true });
    const result = await appium("GET", `/session/${state.sessionId}/screenshot`);
    state.screenshot = String(result?.value || "");
    state.screenshotAt = Date.now();
    return state.screenshot;
  }
}

async function simctlScreenshotBase64(force = false) {
  const now = Date.now();
  if (!force && state.screenshot && now - state.screenshotAt < args.screenshotCacheMs) return state.screenshot;
  const target = path.join("/tmp", `homeai-ios-live-debug-${args.udid || "booted"}.png`);
  childProcess.execFileSync("xcrun", ["simctl", "io", args.udid || "booted", "screenshot", target], {
    stdio: "ignore",
    timeout: 5000,
  });
  state.screenshot = fs.readFileSync(target).toString("base64");
  state.screenshotAt = now;
  return state.screenshot;
}

function mjpegStreamUrl() {
  if (args.mjpegUrl) return args.mjpegUrl;
  return `http://127.0.0.1:${args.mjpegServerPort}/`;
}

function mjpegPreferred() {
  return String(args.streamMode || "").toLowerCase() === "wda-mjpeg";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs || 2500)));
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timeout);
  }
}

async function currentStreamInfo() {
  const info = {
    preferred: mjpegPreferred() ? "wda-mjpeg" : "simctl",
    mjpegUrl: mjpegStreamUrl(),
    mjpegServerPort: args.mjpegServerPort,
    wdaLocalPort: args.wdaLocalPort,
    lane: laneInfo(),
    lease: publicLeaseInfo(),
    clients: state.streamClients,
    lastConnectedAt: state.streamLastConnectedAt,
    lastError: state.streamLastError,
    ready: false,
  };
  if (!mjpegPreferred()) return info;
  try {
    const response = await fetchWithTimeout(info.mjpegUrl, { method: "HEAD" }, args.mjpegConnectTimeoutMs);
    info.ready = response.ok && /multipart\/x-mixed-replace/i.test(String(response.headers.get("content-type") || ""));
    if (!info.ready) info.lastError = `mjpeg_not_ready:${response.status}`;
  } catch (err) {
    info.lastError = err?.name === "AbortError" ? "mjpeg_probe_timeout" : String(err?.message || err);
  }
  return info;
}

async function proxyMjpegStream(req, res) {
  if (!mjpegPreferred()) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: "mjpeg_stream_disabled" }));
    return;
  }
  const target = new URL(mjpegStreamUrl());
  if (!/^https?:$/.test(target.protocol)) throw new Error("mjpeg_url_must_be_http");
  const transport = target.protocol === "https:" ? https : http;
  const request = transport.request(target, {
    method: "GET",
    timeout: Math.max(500, Number(args.mjpegConnectTimeoutMs || 2500)),
  }, (upstream) => {
    const contentType = String(upstream.headers["content-type"] || "multipart/x-mixed-replace; boundary=--BoundaryString");
    if (upstream.statusCode < 200 || upstream.statusCode >= 300 || !/multipart\/x-mixed-replace/i.test(contentType)) {
      state.streamLastError = `mjpeg_upstream_${upstream.statusCode || "unknown"}`;
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      upstream.resume();
      res.end(JSON.stringify({ ok: false, error: state.streamLastError }));
      return;
    }
    state.streamClients += 1;
    state.streamLastConnectedAt = Date.now();
    state.streamLastError = "";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Connection": "close",
    });
    upstream.pipe(res);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      upstream.destroy();
      state.streamClients = Math.max(0, state.streamClients - 1);
    };
    req.once("close", close);
    res.once("close", close);
  });
  request.on("timeout", () => {
    request.destroy(new Error("mjpeg_connect_timeout"));
  });
  request.on("error", (err) => {
    state.streamLastError = String(err?.message || err || "mjpeg_proxy_error");
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: false, error: state.streamLastError }));
    } else {
      res.destroy(err);
    }
  });
  req.once("close", () => request.destroy());
  request.end();
}

async function headMjpegStream(res) {
  const info = await currentStreamInfo();
  res.writeHead(info.ready ? 200 : 502, {
    "Content-Type": "multipart/x-mixed-replace; boundary=--BoundaryString",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "X-HomeAI-MJPEG-Ready": info.ready ? "1" : "0",
  });
  res.end();
}

function currentStateFast(leaseToken = "") {
  if (!state.sessionId && !state.connecting && hasValidDebugLaneLease(leaseToken)) {
    connectSession().catch((err) => { state.lastError = err.message || String(err); });
  }
  return {
    ok: true,
    sessionId: state.sessionId,
    webContext: state.webContext,
    connecting: Boolean(state.connecting),
    lastDeepStateAt: state.lastDeepStateAt,
    lastDeepState: state.lastDeepState,
    lastError: state.lastError,
    lane: laneInfo(),
    lease: publicLeaseInfo(),
    stream: {
      preferred: mjpegPreferred() ? "wda-mjpeg" : "simctl",
      mjpegUrl: mjpegStreamUrl(),
      mjpegServerPort: args.mjpegServerPort,
      wdaLocalPort: args.wdaLocalPort,
      clients: state.streamClients,
      lastConnectedAt: state.streamLastConnectedAt,
      lastError: state.streamLastError,
    },
  };
}

async function currentStateDeep() {
  if (!state.sessionId) {
    if (!state.connecting) connectSession().catch((err) => { state.lastError = err.message || String(err); });
    return {
      ok: true,
      sessionId: "",
      webContext: "",
      connecting: true,
      active: null,
      web: { error: "appium_connecting" },
      lastError: state.lastError,
    };
  }
  const active = await nativeExecute("activeAppInfo", {}).catch((err) => ({ error: err.message }));
  const web = await execute(`
    const rect = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const nav = document.getElementById("bottomNav");
    const app = document.getElementById("app");
    const title = document.getElementById("threadTitle");
    return {
      href: location.href,
      title: document.title,
      clientVersion: document.documentElement.getAttribute("data-client-version") || "",
      readyState: document.readyState,
      standalone: Boolean((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        visual: window.visualViewport ? {
          width: Math.round(window.visualViewport.width),
          height: Math.round(window.visualViewport.height),
          offsetTop: Math.round(window.visualViewport.offsetTop),
          offsetLeft: Math.round(window.visualViewport.offsetLeft),
          scale: window.visualViewport.scale,
        } : null,
      },
      app: {
        className: app?.className || "",
        viewMode: window.state?.viewMode || "",
        workspaceId: window.state?.selectedWorkspaceId || "",
        currentTaskGroupId: window.state?.currentTaskGroupId || "",
        currentThreadId: window.state?.currentThreadId || "",
        pluginContextNavPluginId: window.state?.pluginContextNavPluginId || "",
        authenticated: Boolean(window.state?.auth && (state.auth.ok || state.auth.authenticated || state.auth.isOwner)),
      },
      controls: {
        backTarget: typeof backSwipeTarget === "function" ? backSwipeTarget() : "",
        codexOuterBack: typeof codexPluginOuterBackActive === "function" ? codexPluginOuterBackActive() : null,
        bottomNav: rect(nav),
        title: title?.textContent || "",
      },
      mobileBottomLayout: window.__hermesMobileBottomLayoutMetrics || null,
    };
  `).catch((err) => ({ error: err.message }));
  const payload = {
    ok: true,
    sessionId: state.sessionId,
    webContext: state.webContext,
    active,
    web,
    lastError: state.lastError,
  };
  state.lastDeepState = payload;
  state.lastDeepStateAt = Date.now();
  return payload;
}

async function nativeTapNormalized(x, y, options = {}) {
  await connectSession();
  const rect = await appium("GET", `/session/${state.sessionId}/window/rect`);
  const width = Number(rect?.value?.width || rect?.width || 0) || 1;
  const height = Number(rect?.value?.height || rect?.height || 0) || 1;
  const calibration = coordinateSpaceRequiresCalibration(options.coordinateSpace)
    ? await nativeCoordinateCalibration({ force: Boolean(options.forceCalibration) })
    : null;
  const point = nativeCoordinatePoint({
    x,
    y,
    absoluteX: options.absoluteX,
    absoluteY: options.absoluteY,
  }, { width, height }, calibration);
  await nativePointerTap(point.x, point.y, 80);
  return { x: point.x, y: point.y, width, height, coordinateSpace: options.coordinateSpace || "screen", calibration };
}

function nativeTouchPoint(point = {}, rect = {}, calibration = null) {
  return nativeCoordinatePoint(point, rect, calibration);
}

async function nativeTouchSequenceNormalized(sequence = {}) {
  await connectSession();
  const rect = await appium("GET", `/session/${state.sessionId}/window/rect`);
  const size = {
    width: Number(rect?.value?.width || rect?.width || 0) || 1,
    height: Number(rect?.value?.height || rect?.height || 0) || 1,
  };
  const calibration = coordinateSpaceRequiresCalibration(sequence.coordinateSpace)
    ? await nativeCoordinateCalibration({ force: Boolean(sequence.forceCalibration) })
    : null;
  const rawPoints = Array.isArray(sequence.points) ? sequence.points : [];
  const points = rawPoints.map((point) => nativeTouchPoint(point, size, calibration));
  if (!points.length) throw new Error("touch_sequence_points_required");
  const holdMs = Math.max(0, Math.min(5000, Math.floor(Number(sequence.holdMs || 0) || 0)));
  const actions = [
    { type: "pointerMove", duration: 0, x: points[0].x, y: points[0].y },
    { type: "pointerDown", button: 0 },
  ];
  if (holdMs > 0) actions.push({ type: "pause", duration: holdMs });
  points.slice(1).forEach((point) => {
    actions.push({ type: "pointerMove", duration: point.durationMs || 220, x: point.x, y: point.y });
  });
  const releasePauseMs = Math.max(0, Math.min(1200, Math.floor(Number(sequence.releasePauseMs || 0) || 0)));
  if (releasePauseMs > 0) actions.push({ type: "pause", duration: releasePauseMs });
  actions.push({ type: "pointerUp", button: 0 });
  await appium("POST", `/session/${state.sessionId}/actions`, {
    actions: [{
      type: "pointer",
      id: `finger-${Date.now()}`,
      parameters: { pointerType: "touch" },
      actions,
    }],
  });
  await appium("DELETE", `/session/${state.sessionId}/actions`).catch(() => null);
  return { width: size.width, height: size.height, points, holdMs, releasePauseMs, coordinateSpace: sequence.coordinateSpace || "screen", calibration };
}

async function nativeLongPressNormalized(x, y, options = {}) {
  const holdMs = Math.max(450, Math.min(5000, Math.floor(Number(options.holdMs || options.durationMs || 700) || 700)));
  return nativeTouchSequenceNormalized({
    coordinateSpace: options.coordinateSpace,
    forceCalibration: options.forceCalibration,
    holdMs,
    points: [{
      x,
      y,
      absoluteX: options.absoluteX,
      absoluteY: options.absoluteY,
    }],
  });
}

async function nativeSwipeNormalized(body = {}) {
  const durationMs = Math.max(80, Math.min(3000, Math.floor(Number(body.durationMs || 260) || 260)));
  return nativeTouchSequenceNormalized({
    coordinateSpace: body.coordinateSpace,
    forceCalibration: body.forceCalibration,
    holdMs: Math.max(0, Math.min(1000, Math.floor(Number(body.holdMs || 0) || 0))),
    points: [
      {
        x: body.startX,
        y: body.startY,
        absoluteX: body.startAbsoluteX,
        absoluteY: body.startAbsoluteY,
      },
      {
        x: body.endX,
        y: body.endY,
        absoluteX: body.endAbsoluteX,
        absoluteY: body.endAbsoluteY,
        durationMs,
      },
    ],
  });
}

async function nativeSwipeBack() {
  await connectSession();
  const rect = await appium("GET", `/session/${state.sessionId}/window/rect`);
  const width = Number(rect?.value?.width || rect?.width || 390) || 390;
  const height = Number(rect?.value?.height || rect?.height || 844) || 844;
  const y = Math.round(height * 0.5);
  await appium("POST", `/session/${state.sessionId}/actions`, {
    actions: [{
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: 4, y },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: 260, x: Math.round(width * 0.78), y },
        { type: "pointerUp", button: 0 },
      ],
    }],
  });
  await appium("DELETE", `/session/${state.sessionId}/actions`).catch(() => null);
  return { y, width, height };
}

async function performAction(body = {}) {
  requireDebugLaneLease(String(body.leaseToken || body.token || "").trim());
  const type = String(body.type || "").trim();
  if (type === "connect") return connectSession({ resetSession: Boolean(body.resetSession) });
  if (type === "launchPwa") {
    childProcess.execFileSync("xcrun", ["simctl", "launch", args.udid || "booted", "com.apple.webapp"], {
      stdio: "ignore",
      timeout: 5000,
    });
    return { launched: "com.apple.webapp" };
  }
  if (type === "reload") return execute("location.reload(); return true;");
  if (type === "open") {
    const targetUrl = String(body.url || args.appUrl);
    try {
      return await execute("location.href = arguments[0]; return location.href;", [targetUrl]);
    } catch (err) {
      if (!recoverableAppiumError(err)) throw err;
      clearAppiumSessionState();
      childProcess.execFileSync("xcrun", ["simctl", "openurl", args.udid || "booted", targetUrl], {
        stdio: "ignore",
        timeout: 5000,
      });
      return { navigating: true, url: targetUrl, recoveredFrom: String(err?.message || err).slice(0, 160) };
    }
  }
  if (type === "home") return nativeExecute("pressButton", { name: "home" });
  if (type === "calibrateCoordinates") {
    return nativeCoordinateCalibration({
      force: Boolean(body.force),
      includeNativeCalibration: Boolean(body.includeNativeCalibration),
    });
  }
  if (type === "swipeBack") return nativeSwipeBack();
  if (type === "tap") return nativeTapNormalized(Number(body.x), Number(body.y), {
    absoluteX: body.absoluteX,
    absoluteY: body.absoluteY,
    coordinateSpace: body.coordinateSpace,
    forceCalibration: body.forceCalibration,
  });
  if (type === "longPress") return nativeLongPressNormalized(Number(body.x), Number(body.y), {
    absoluteX: body.absoluteX,
    absoluteY: body.absoluteY,
    holdMs: body.holdMs,
    durationMs: body.durationMs,
    coordinateSpace: body.coordinateSpace,
    forceCalibration: body.forceCalibration,
  });
  if (type === "swipe") return nativeSwipeNormalized(body);
  if (type === "touchSequence") return nativeTouchSequenceNormalized(body);
  if (type === "js") return execute(String(body.script || "return null;"), Array.isArray(body.args) ? body.args : []);
  if (type === "clickSelector") {
    return execute(`
      const selector = arguments[0];
      const node = document.querySelector(selector);
      if (!node) return { ok: false, error: "selector_not_found", selector };
      node.scrollIntoView({ block: "center", inline: "center" });
      node.click();
      const rect = node.getBoundingClientRect();
      return { ok: true, selector, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } };
    `, [String(body.selector || "")]);
  }
  if (type === "setLocalStorage") {
    return execute("localStorage.setItem(arguments[0], arguments[1]); return true;", [String(body.key || ""), String(body.value || "")]);
  }
  if (type === "clearStaticCaches") {
    return executeAsync(`
      var done = arguments[arguments.length - 1];
      try {
        var cacheApi = window.caches;
        if (!cacheApi || typeof cacheApi.keys !== "function") {
          done({ deleted: [], unavailable: true });
          return;
        }
        cacheApi.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return cacheApi.delete(key); })).then(function () {
            done({ deleted: keys });
          });
        }).catch(function (err) {
          done({ deleted: [], error: String((err && err.message) || err || "cache_clear_failed") });
        });
      } catch (err) {
        done({ deleted: [], error: String((err && err.message) || err || "cache_clear_failed") });
      }
    `);
  }
  throw new Error(`unknown_action:${type}`);
}

function pageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Home AI iOS Live Debug</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif; }
    body { margin: 0; background: #101214; color: #eef3f0; }
    .shell { display: grid; grid-template-columns: minmax(320px, 520px) minmax(360px, 1fr); gap: 12px; height: 100vh; box-sizing: border-box; padding: 12px; }
    .screen { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
    .bar, .panel { background: #171b1d; border: 1px solid #2a3134; border-radius: 8px; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 8px; flex-wrap: wrap; }
    button, input, textarea { font: inherit; }
    button { border: 1px solid #3b474c; border-radius: 6px; background: #243035; color: #f4f7f5; padding: 7px 10px; cursor: pointer; }
    button:hover { background: #2e3c42; }
    input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #344044; border-radius: 6px; background: #0f1315; color: #f4f7f5; padding: 8px; }
    textarea { min-height: 96px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .viewport { min-height: 0; overflow: auto; display: grid; place-items: start center; padding: 8px; }
    #shot { display: block; width: min(100%, 430px); height: auto; border-radius: 8px; background: #000; cursor: crosshair; }
    .panel { min-height: 0; overflow: auto; padding: 10px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin: 8px 0; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 12px; line-height: 1.45; color: #c9d4d0; }
    .status { color: #9fb4ad; font-size: 12px; }
    .warn { color: #ffd08a; }
  </style>
</head>
<body>
  <main class="shell">
    <section class="screen">
      <div class="bar">
        <button data-action="connect">连接</button>
        <button data-action="launchPwa">启动 PWA</button>
        <button data-action="reload">刷新 PWA</button>
        <button data-action="swipeBack">右滑返回</button>
        <button data-action="home">Home</button>
        <button data-stream-restart>重连视频</button>
        <label class="status"><input id="auto" type="checkbox" checked style="width:auto"> 实时刷新</label>
        <span id="status" class="status"></span>
      </div>
      <div class="viewport bar">
        <img id="shot" alt="iOS simulator live screenshot">
      </div>
    </section>
    <section class="panel">
      <div class="grid">
        <button data-state>刷新状态</button>
        <button data-deep-state>深读 WebView</button>
        <button data-action="clearStaticCaches">清静态缓存</button>
      </div>
      <div class="row">
        <input id="openUrl" value="${escapeHtml(args.appUrl)}">
        <button data-open>打开</button>
      </div>
      <div class="row">
        <input id="selector" placeholder="CSS selector, e.g. #bottomCodexMode">
        <button data-click-selector>点 selector</button>
      </div>
      <textarea id="script">return {
  href: location.href,
  version: document.documentElement.getAttribute("data-client-version"),
  viewMode: window.state?.viewMode,
  backTarget: typeof backSwipeTarget === "function" ? backSwipeTarget() : ""
};</textarea>
      <div class="grid">
        <button data-js>执行 JS</button>
        <button data-deep-state>深读 WebView</button>
      </div>
      <pre id="out"></pre>
    </section>
  </main>
  <script>
    const STREAM_MODE = ${JSON.stringify(mjpegPreferred() ? "wda-mjpeg" : "simctl")};
    const shot = document.getElementById("shot");
    const out = document.getElementById("out");
    const statusEl = document.getElementById("status");
    const auto = document.getElementById("auto");
    const runtime = { streamActive: false, streamFailed: false };
    const lease = {
      owner: sessionStorage.getItem("homeaiDebugLaneOwner") || "",
      token: sessionStorage.getItem("homeaiDebugLaneToken") || "",
      expiresAt: Number(sessionStorage.getItem("homeaiDebugLaneExpiresAt") || 0) || 0,
    };
    if (!lease.owner) {
      lease.owner = "browser:" + (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2));
      sessionStorage.setItem("homeaiDebugLaneOwner", lease.owner);
    }
    async function post(url, body) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || JSON.stringify(data));
      return data;
    }
    async function acquireLease() {
      if (lease.token && lease.expiresAt - Date.now() > 15000) return lease.token;
      const data = await post("/api/lease", { owner: lease.owner, leaseToken: lease.token, ttlMs: 120000 });
      lease.token = data.token || "";
      lease.expiresAt = Number(data.expiresAt || 0) || (Date.now() + 120000);
      sessionStorage.setItem("homeaiDebugLaneToken", lease.token);
      sessionStorage.setItem("homeaiDebugLaneExpiresAt", String(lease.expiresAt));
      statusEl.textContent = "Lease " + (data.owner || lease.owner);
      return lease.token;
    }
    function leaseQuery() {
      return lease.token ? "&leaseToken=" + encodeURIComponent(lease.token) : "";
    }
    function screenshotUrl(force) {
      return "/api/screenshot?t=" + Date.now() + (force ? "&force=1" : "") + leaseQuery();
    }
    function startStream() {
      if (STREAM_MODE !== "wda-mjpeg" || runtime.streamFailed || runtime.streamActive || !auto.checked) return false;
      runtime.streamActive = true;
      shot.src = "/api/stream.mjpeg?t=" + Date.now();
      statusEl.textContent = "WDA MJPEG";
      return true;
    }
    async function refreshShot(options = {}) {
      if (!auto.checked) return;
      if (!options.forceScreenshot && startStream()) return;
      if (STREAM_MODE === "wda-mjpeg" && runtime.streamActive && !options.forceScreenshot) return;
      shot.src = screenshotUrl(Boolean(options.forceScreenshot));
      statusEl.textContent = "PNG " + new Date().toLocaleTimeString();
    }
    async function state(options = {}) {
      if (options.withLease) await acquireLease();
      const res = await fetch("/api/state?t=" + Date.now() + (options.withLease ? leaseQuery() : ""));
      const data = await res.json();
      out.textContent = JSON.stringify(data, null, 2);
    }
    async function deepState() {
      await acquireLease();
      const res = await fetch("/api/deep-state?t=" + Date.now() + leaseQuery());
      const data = await res.json();
      out.textContent = JSON.stringify(data, null, 2);
    }
    async function action(type, extra) {
      const leaseToken = await acquireLease();
      const data = await post("/api/action", Object.assign({ type, leaseToken }, extra || {}));
      out.textContent = JSON.stringify(data, null, 2);
      await state({ withLease: true }).catch(() => {});
      await refreshShot();
    }
    document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => action(button.dataset.action).catch((err) => out.textContent = err.message)));
    document.querySelectorAll("[data-state]").forEach((button) => button.addEventListener("click", () => state().catch((err) => out.textContent = err.message)));
    document.querySelectorAll("[data-deep-state]").forEach((button) => button.addEventListener("click", () => deepState().catch((err) => out.textContent = err.message)));
    document.querySelector("[data-open]").addEventListener("click", () => action("open", { url: document.getElementById("openUrl").value }).catch((err) => out.textContent = err.message));
    document.querySelector("[data-click-selector]").addEventListener("click", () => action("clickSelector", { selector: document.getElementById("selector").value }).catch((err) => out.textContent = err.message));
    document.querySelector("[data-js]").addEventListener("click", () => action("js", { script: document.getElementById("script").value }).catch((err) => out.textContent = err.message));
    document.querySelector("[data-stream-restart]").addEventListener("click", () => {
      runtime.streamActive = false;
      runtime.streamFailed = false;
      refreshShot({ forceScreenshot: false }).catch((err) => out.textContent = err.message);
    });
    shot.addEventListener("error", () => {
      if (!runtime.streamActive) return;
      runtime.streamActive = false;
      runtime.streamFailed = true;
      statusEl.textContent = "MJPEG failed; PNG fallback";
      refreshShot({ forceScreenshot: true }).catch((err) => out.textContent = err.message);
    });
    shot.addEventListener("click", (event) => {
      const rect = shot.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      action("tap", { x, y }).catch((err) => out.textContent = err.message);
    });
    setInterval(refreshShot, STREAM_MODE === "wda-mjpeg" ? 1200 : 550);
    refreshShot();
    state().catch(() => {});
  </script>
</body>
</html>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  try {
    if (req.method === "GET" && url.pathname === "/") return html(res, pageHtml());
    if (req.method === "GET" && url.pathname === "/api/lease") return json(res, 200, { ok: true, lease: publicLeaseInfo(), lane: laneInfo() });
    if (req.method === "POST" && url.pathname === "/api/lease") return json(res, 200, acquireDebugLaneLease(await readBody(req)));
    if (req.method === "POST" && url.pathname === "/api/lease/release") return json(res, 200, releaseDebugLaneLease(await readBody(req)));
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, currentStateFast(leaseTokenFromRequest(req, url)));
    if (req.method === "GET" && url.pathname === "/api/stream-info") return json(res, 200, await currentStreamInfo());
    if (req.method === "HEAD" && url.pathname === "/api/stream.mjpeg") return headMjpegStream(res);
    if (req.method === "GET" && url.pathname === "/api/stream.mjpeg") return proxyMjpegStream(req, res);
    if (req.method === "GET" && url.pathname === "/api/deep-state") {
      requireDebugLaneLease(leaseTokenFromRequest(req, url));
      return json(res, 200, await enqueue(() => currentStateDeep()));
    }
    if (req.method === "GET" && url.pathname === "/api/screenshot") {
      if (args.screenshotSource === "appium") requireDebugLaneLease(leaseTokenFromRequest(req, url));
      const b64 = await screenshotBase64(url.searchParams.get("force") === "1");
      const bytes = Buffer.from(b64, "base64");
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      return res.end(bytes);
    }
    if (req.method === "POST" && url.pathname === "/api/action") {
      const body = await readBody(req);
      return json(res, 200, { ok: true, value: await enqueue(() => performAction(body)) });
    }
    return json(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    state.lastError = err.message || String(err);
    return json(res, Number(err.statusCode || 500) || 500, Object.assign({ ok: false, error: state.lastError }, err.details ? { details: err.details } : {}));
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => json(res, Number(err.statusCode || 500) || 500, Object.assign(
    { ok: false, error: err.message || String(err) },
    err.details ? { details: err.details } : {},
  )));
});

server.listen(args.port, args.host, () => {
  const url = `http://${args.host}:${args.port}/`;
  console.log(JSON.stringify({
    ok: true,
    url,
    appiumUrl: args.appiumUrl,
    udid: args.udid,
    laneOwner: args.laneOwner,
    leaseRequired: true,
    leaseTtlMs: readLeaseTtlMs(),
    streamMode: mjpegPreferred() ? "wda-mjpeg" : "simctl",
    wdaLocalPort: args.wdaLocalPort,
    mjpegServerPort: args.mjpegServerPort,
    mjpegUrl: mjpegStreamUrl(),
  }, null, 2));
});
