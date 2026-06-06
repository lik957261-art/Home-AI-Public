"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeConfigFacadeService } = require("../adapters/mobile-runtime-config-facade-service");

const calls = [];
const runtimeConfigProvider = {
  effectiveHermesApiBase(config) {
    calls.push(["effectiveHermesApiBase", config]);
    return config.hermesApiBase || "http://default-gateway";
  },
  effectiveWebPushSubject(config) {
    calls.push(["effectiveWebPushSubject", config]);
    return config.webPushSubject || "mailto:default@example.invalid";
  },
  effectiveWebPushVapidPath(config) {
    calls.push(["effectiveWebPushVapidPath", config]);
    return config.webPushVapidPath || "/tmp/vapid.json";
  },
  load() {
    calls.push(["load"]);
    return { hermesApiBase: "http://configured-gateway", webPushSubject: "mailto:ops@example.invalid" };
  },
  loadHermesApiKey() {
    calls.push(["loadHermesApiKey"]);
    return "secret-key";
  },
  publicConfig(args) {
    calls.push(["publicConfig", args]);
    return { ok: true, args };
  },
  save(input, actor) {
    calls.push(["save", input, actor]);
    return Object.assign({ savedBy: actor }, input);
  },
};

const service = createMobileRuntimeConfigFacadeService({
  runtimeConfigProvider,
  pushStatus: () => ({ enabled: true, subscriptionCount: 3 }),
  webPushConfig: () => ({ publicKey: "present", source: "fixture" }),
  webPushEnabled: () => true,
});

assert.deepEqual(service.loadRuntimeConfig(), {
  hermesApiBase: "http://configured-gateway",
  webPushSubject: "mailto:ops@example.invalid",
});
assert.deepEqual(service.saveRuntimeConfig({ hermesApiBase: "http://next" }, "tester"), {
  hermesApiBase: "http://next",
  savedBy: "tester",
});
assert.equal(service.effectiveHermesApiBase({ hermesApiBase: "http://manual" }), "http://manual");
assert.equal(service.effectiveWebPushSubject({}), "mailto:default@example.invalid");
assert.equal(service.effectiveWebPushVapidPath({ webPushVapidPath: "/tmp/custom-vapid.json" }), "/tmp/custom-vapid.json");
assert.equal(service.loadHermesApiKey(), "secret-key");
assert.deepEqual(service.publicRuntimeConfig(), {
  ok: true,
  args: {
    pushStatus: { enabled: true, subscriptionCount: 3 },
    webPushConfig: { publicKey: "present", source: "fixture" },
    webPushEnabled: true,
  },
});

assert.throws(() => createMobileRuntimeConfigFacadeService(), /requires runtimeConfigProvider/);

assert.deepEqual(calls.map((item) => item[0]), [
  "load",
  "save",
  "effectiveHermesApiBase",
  "effectiveWebPushSubject",
  "effectiveWebPushVapidPath",
  "loadHermesApiKey",
  "publicConfig",
]);

console.log("mobile runtime config facade service tests passed");
