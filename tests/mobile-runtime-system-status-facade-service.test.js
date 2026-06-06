"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeSystemStatusFacadeService } = require("../adapters/mobile-runtime-system-status-facade-service");

const pathApi = {
  dirname(value) {
    return String(value || "").replace(/\/[^/]*$/, "") || ".";
  },
  join(...parts) {
    const first = String(parts[0] || "");
    const joined = parts.map((part) => String(part || "").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
    return first.startsWith("/") ? `/${joined}` : joined;
  },
};

let factoryCalls = 0;
const createdOptions = [];
const service = createMobileRuntimeSystemStatusFacadeService({
  allowWslReasoningConfigLookup: false,
  compactText: (value) => String(value || "").slice(0, 10),
  createSystemRuntimeStatusService(options) {
    factoryCalls += 1;
    createdOptions.push(options);
    return {
      appUpdateStatus: async () => ({ update: "status" }),
      applyAppUpdate: async () => ({ update: "applied" }),
      clientVersionInfo: (clientVersion) => ({ clientVersion }),
      readClientVersion: () => "client-v1",
      runtimeModelConfigInfo: () => ({ defaultEffort: "medium", source: "fixture" }),
    };
  },
  dedupe: (values) => [...new Set(values.filter(Boolean))],
  env: { HERMES_WEB_DEFAULT_REASONING_EFFORT: "high" },
  explicitHermesConfigPaths: new Set(["\\\\server\\allowed\\config.yaml"]),
  fetchImpl: async (url) => ({
    ok: url === "https://ok.example/version",
    status: 503,
    statusText: "Service Unavailable",
    text: async () => "remote-index",
  }),
  fs: {},
  gatewayPool: () => ({
    load: () => ({
      workers: [
        {
          profile: "hm-owner-openai-1",
          telemetryProfile: "hm-owner-telemetry-1",
          telemetryResponseStoreDbPath: "/var/homeai/response/state.db",
          telemetryStateDbPath: "/var/homeai/state/state.db",
        },
      ],
    }),
  }),
  gatewayUsageTelemetryProfileRoots: ["/profiles"],
  hermesConfigPaths: ["\\\\server\\blocked\\config.yaml", "\\\\server\\allowed\\config.yaml", "/etc/homeai/config.yaml"],
  indexHtmlPath: "/app/public/index.html",
  isUncPath: (value) => String(value || "").startsWith("\\\\"),
  nowIso: () => "2026-06-07T00:00:00.000Z",
  path: pathApi,
  process: { env: {} },
  repoRoot: "/repo",
  runProcessText: async () => ({ ok: true, stdout: "", stderr: "" }),
  updateBranch: "main",
  updateCheckTimeoutMs: 1234,
  updateRemoteName: "origin",
  updateVersionUrl: "https://ok.example/version",
});

assert.equal(service.configPathReadableForRuntimeInfo(""), false);
assert.equal(service.configPathReadableForRuntimeInfo("\\\\server\\blocked\\config.yaml"), false);
assert.equal(service.configPathReadableForRuntimeInfo("\\\\server\\allowed\\config.yaml"), true);
assert.equal(service.configPathReadableForRuntimeInfo("/etc/homeai/config.yaml"), true);

assert.deepEqual(service.gatewayPoolConfigPathCandidates(), [
  "/var/homeai/state/config.yaml",
  "/var/homeai/response/config.yaml",
  "/profiles/hm-owner-openai-1/config.yaml",
  "/profiles/hm-owner-telemetry-1/config.yaml",
]);

assert.deepEqual(service.runtimeConfigPathCandidates(), [
  "/var/homeai/state/config.yaml",
  "/var/homeai/response/config.yaml",
  "/profiles/hm-owner-openai-1/config.yaml",
  "/profiles/hm-owner-telemetry-1/config.yaml",
  "\\\\server\\allowed\\config.yaml",
  "/etc/homeai/config.yaml",
]);

(async () => {
  assert.equal(factoryCalls, 0);
  assert.deepEqual(service.runtimeModelConfigInfo(), { defaultEffort: "medium", source: "fixture" });
  assert.equal(service.defaultReasoningInfo().source, "fixture");
  assert.equal(service.readClientVersion(), "client-v1");
  assert.deepEqual(service.clientVersionInfo("old"), { clientVersion: "old" });
  assert.deepEqual(await service.appUpdateStatus(), { update: "status" });
  assert.deepEqual(await service.applyAppUpdate(), { update: "applied" });
  assert.equal(factoryCalls, 1);
  assert.equal(createdOptions.length, 1);
  assert.deepEqual(createdOptions[0].runtimeConfigPathCandidates(), service.runtimeConfigPathCandidates());
  assert.equal(createdOptions[0].updateCheckTimeoutMs, 1234);
  assert.equal(await createdOptions[0].fetchText("https://ok.example/version", 1000), "remote-index");
  await assert.rejects(() => createdOptions[0].fetchText("https://fail.example/version", 1000), /503 Service Unavailable/);

  assert.throws(() => createMobileRuntimeSystemStatusFacadeService({}), /requires createSystemRuntimeStatusService/);

  console.log("mobile runtime system status facade service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
