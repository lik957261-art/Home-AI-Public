"use strict";

const assert = require("node:assert/strict");

const {
  createRuntimeConfigEffectiveService,
  stripTrailingSlash,
} = require("../adapters/runtime-config-effective-service");

function makeService(overrides = {}) {
  const resolved = [];
  const service = createRuntimeConfigEffectiveService(Object.assign({
    defaultHermesApiBase: () => "http://127.0.0.1:8797///",
    defaultWebPushSubject: () => "mailto:default@example.invalid",
    defaultWebPushVapidPath: () => "relative/default-vapid.json",
    pathResolve: (targetPath) => {
      resolved.push(String(targetPath));
      return `resolved:${targetPath}`;
    },
  }, overrides));
  return { resolved, service };
}

function testStripTrailingSlash() {
  assert.equal(stripTrailingSlash("http://localhost:8797///"), "http://localhost:8797");
  assert.equal(stripTrailingSlash(""), "");
}

function testDefaultsUseOptionFunctions() {
  const { resolved, service } = makeService();
  assert.equal(service.defaultHermesApiBase(), "http://127.0.0.1:8797");
  assert.equal(service.defaultWebPushSubject(), "mailto:default@example.invalid");
  assert.equal(service.defaultWebPushVapidPath(), "resolved:relative/default-vapid.json");
  assert.deepEqual(resolved, ["relative/default-vapid.json"]);
}

function testEffectiveValuesPreferConfigOverrides() {
  const { resolved, service } = makeService();
  const config = {
    hermesApiBase: "https://gateway.example.invalid///",
    webPushSubject: "mailto:override@example.invalid",
    webPushVapidPath: "runtime-vapid.json",
  };
  assert.equal(service.effectiveHermesApiBase(config), "https://gateway.example.invalid");
  assert.equal(service.effectiveWebPushSubject(config), "mailto:override@example.invalid");
  assert.equal(service.effectiveWebPushVapidPath(config), "resolved:runtime-vapid.json");
  assert.deepEqual(resolved, ["runtime-vapid.json"]);
}

function testEffectiveValuesFallbackToDefaults() {
  const { resolved, service } = makeService();
  assert.equal(service.effectiveHermesApiBase({}), "http://127.0.0.1:8797");
  assert.equal(service.effectiveWebPushSubject({}), "mailto:default@example.invalid");
  assert.equal(service.effectiveWebPushVapidPath({}), "resolved:resolved:relative/default-vapid.json");
  assert.deepEqual(resolved, ["relative/default-vapid.json", "resolved:relative/default-vapid.json"]);
}

function testEffectiveValuesUseInjectedLoadWhenConfigOmitted() {
  const { service } = makeService({
    load: () => ({
      hermesApiBase: "http://loaded.example.invalid///",
      webPushSubject: "mailto:loaded@example.invalid",
      webPushVapidPath: "loaded-vapid.json",
    }),
  });
  assert.equal(service.effectiveHermesApiBase(), "http://loaded.example.invalid");
  assert.equal(service.effectiveWebPushSubject(), "mailto:loaded@example.invalid");
  assert.equal(service.effectiveWebPushVapidPath(), "resolved:loaded-vapid.json");
}

function testStaticOptionsAreAccepted() {
  const { service } = makeService({
    defaultHermesApiBase: "https://static.example.invalid/",
    defaultWebPushSubject: "mailto:static@example.invalid",
    defaultWebPushVapidPath: "static-vapid.json",
  });
  assert.equal(service.defaultHermesApiBase(), "https://static.example.invalid");
  assert.equal(service.defaultWebPushSubject(), "mailto:static@example.invalid");
  assert.equal(service.defaultWebPushVapidPath(), "resolved:static-vapid.json");
}

testStripTrailingSlash();
testDefaultsUseOptionFunctions();
testEffectiveValuesPreferConfigOverrides();
testEffectiveValuesFallbackToDefaults();
testEffectiveValuesUseInjectedLoadWhenConfigOmitted();
testStaticOptionsAreAccepted();
console.log("runtime config effective service tests passed");
