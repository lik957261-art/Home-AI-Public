"use strict";

const assert = require("node:assert/strict");
const {
  contentTypeFamily,
  createPluginProxyTimingService,
  formatServerTiming,
  routeKindForProxyTarget,
} = require("../adapters/plugin-proxy-timing-service");

function testRouteKindClassification() {
  assert.equal(routeKindForProxyTarget({
    pluginId: "codex-mobile",
    targetUrl: "http://127.0.0.1:8787/api/threads/thread-secret?workspaceId=owner&key=private",
  }), "codex_thread_detail");
  assert.equal(routeKindForProxyTarget({
    pluginId: "codex-mobile",
    targetUrl: "http://127.0.0.1:8787/api/threads?workspaceId=owner",
  }), "codex_thread_list");
  assert.equal(routeKindForProxyTarget({
    pluginId: "finance",
    targetUrl: "http://127.0.0.1:8791/api/finance/accounts?workspaceId=owner",
  }), "plugin_api");
  assert.equal(routeKindForProxyTarget({
    pluginId: "wardrobe",
    targetUrl: "http://127.0.0.1:8765/styles.css?v=1",
  }), "plugin_static");
}

function testContentTypeFamily() {
  assert.equal(contentTypeFamily("application/json; charset=utf-8"), "json");
  assert.equal(contentTypeFamily("text/event-stream"), "event_stream");
  assert.equal(contentTypeFamily("text/javascript"), "javascript");
  assert.equal(contentTypeFamily("image/png"), "image");
  assert.equal(contentTypeFamily(""), "unknown");
}

function testServerTimingFormatting() {
  const header = formatServerTiming({
    preflight_ms: 1.24,
    upstream_headers_ms: 42,
    upstream_body_ms: 7,
    transform_ms: 3.5,
    response_write_ms: 0,
  });
  assert.match(header, /hm_proxy_preflight;dur=1\.2/);
  assert.match(header, /hm_proxy_upstream;dur=42/);
  assert.match(header, /hm_proxy_transform;dur=3\.5/);
}

function testBoundedCodexEventRecording() {
  const recorded = [];
  let now = 1000;
  const service = createPluginProxyTimingService({
    nowMs: () => {
      now += 10;
      return now;
    },
    nowIso: () => "2026-06-28T00:00:00.000Z",
    recordEvent: (event) => recorded.push(event),
  });
  const timing = service.begin({
    pluginId: "codex-mobile",
    method: "GET",
    requestPath: "/api/hermes-plugins/codex-mobile/proxy/api/threads/thread-private",
  });
  timing.update({ targetUrl: "http://127.0.0.1:8787/api/threads/thread-private?workspaceId=owner&key=secret" });
  timing.start("preflight");
  timing.end("preflight");
  timing.start("upstream_headers");
  timing.end("upstream_headers");
  timing.start("upstream_body");
  timing.end("upstream_body");
  timing.start("transform");
  timing.end("transform");
  const header = timing.serverTimingHeader({
    statusCode: 200,
    upstreamStatus: 200,
    contentType: "application/json",
    responseKind: "json",
    bodyBytes: 128,
  });
  assert.match(header, /hm_proxy_preflight;dur=/);
  timing.finish({
    statusCode: 200,
    upstreamStatus: 200,
    contentType: "application/json",
    responseKind: "json",
    bodyBytes: 128,
    upstreamReportedTotalMs: 25,
  });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].event, "plugin_proxy_timing");
  assert.equal(recorded[0].plugin_id, "codex-mobile");
  assert.equal(recorded[0].route_kind, "codex_thread_detail");
  assert.equal(recorded[0].content_type_family, "json");
  assert.equal(recorded[0].status_code, 200);
  assert.equal(recorded[0].upstream_reported_total_ms, 25);
  assert.ok(recorded[0].proxy_upstream_gap_ms >= 0);
  assert.ok(recorded[0].proxy_header_gap_ms >= 0);
  assert.equal(Object.hasOwn(recorded[0], "targetUrl"), false);
  assert.equal(Object.hasOwn(recorded[0], "requestPath"), false);
  assert.equal(JSON.stringify(recorded[0]).includes("thread-private"), false);
  assert.equal(JSON.stringify(recorded[0]).includes("secret"), false);
}

function run() {
  testRouteKindClassification();
  testContentTypeFamily();
  testServerTimingFormatting();
  testBoundedCodexEventRecording();
}

run();
console.log("plugin proxy timing service tests passed");
