"use strict";

const assert = require("node:assert/strict");

const {
  createRuntimeConfigKeyService,
  parseEnvFileText,
  parseKeyFileText,
} = require("../adapters/runtime-config-key-service");

function makeService(files = {}, config = {}) {
  const readAttempts = [];
  const service = createRuntimeConfigKeyService({
    apiKeyPaths: () => ["fallback.key", "throw.key"],
    envPaths: () => ["app.env", "empty.env"],
    fileExists: (targetPath) => Object.prototype.hasOwnProperty.call(files, targetPath),
    load: () => config,
    readFile: (targetPath) => {
      readAttempts.push(targetPath);
      if (files[targetPath] instanceof Error) throw files[targetPath];
      return files[targetPath];
    },
  });
  return { readAttempts, service };
}

function testParsersPreserveExistingFormats() {
  assert.equal(parseKeyFileText("export API_SERVER_KEY='file-key'\n"), "file-key");
  assert.equal(parseKeyFileText("HERMES_API_KEY=\"quoted-key\""), "quoted-key");
  assert.equal(parseKeyFileText("plain-file-key\n"), "plain-file-key");
  assert.equal(parseEnvFileText("OTHER=1\nexport HERMES_API_KEY='env-key'\n"), "env-key");
  assert.equal(parseEnvFileText("API_SERVER_KEY=\n"), "");
}

function testDirectEnvWinsWithoutFileReads() {
  const { readAttempts, service } = makeService({ "fallback.key": "file-key" });
  assert.equal(service.loadHermesApiKey({ HERMES_WEB_HERMES_API_KEY: " direct-key " }), "direct-key");
  assert.deepEqual(service.hermesApiKeyStatus({ API_SERVER_KEY: "direct-status" }), {
    configured: true,
    source: "env",
    path: "",
  });
  assert.deepEqual(readAttempts, []);
}

function testConfiguredPathAndFallbackFileParsing() {
  const { service } = makeService(
    {
      "runtime.key": "export API_SERVER_KEY='runtime-key'\n",
      "fallback.key": "fallback-key",
    },
    { hermesApiKeyPath: "runtime.key" },
  );
  assert.deepEqual(service.configuredHermesApiKeyPaths(), ["runtime.key", "fallback.key", "throw.key"]);
  assert.equal(service.loadHermesApiKey({}), "runtime-key");
  assert.deepEqual(service.hermesApiKeyStatus({}), {
    configured: true,
    source: "file",
    path: "runtime.key",
  });
}

function testEnvFileFallbackAndEmptyStatusCompatibility() {
  const { service } = makeService({
    "throw.key": new Error("denied"),
    "app.env": "OTHER=1\nexport HERMES_API_KEY=\"env-file-key\"\n",
    "empty.env": "API_SERVER_KEY=\n",
  });
  assert.equal(service.loadHermesApiKey({}), "env-file-key");
  assert.deepEqual(service.hermesApiKeyStatus({}), {
    configured: true,
    source: "env-file",
    path: "app.env",
  });

  const emptyOnly = makeService({ "empty.env": "API_SERVER_KEY=\n" }).service;
  assert.equal(emptyOnly.loadHermesApiKey({}), "");
  assert.deepEqual(emptyOnly.hermesApiKeyStatus({}), {
    configured: true,
    source: "env-file",
    path: "empty.env",
  });
}

function testMissingOrUnreadableFilesFailClosed() {
  const { service } = makeService({ "throw.key": new Error("denied") });
  assert.equal(service.loadHermesApiKey({}), "");
  assert.deepEqual(service.hermesApiKeyStatus({}), {
    configured: false,
    source: "",
    path: "",
  });
}

testParsersPreserveExistingFormats();
testDirectEnvWinsWithoutFileReads();
testConfiguredPathAndFallbackFileParsing();
testEnvFileFallbackAndEmptyStatusCompatibility();
testMissingOrUnreadableFilesFailClosed();
console.log("runtime-config-key-service tests passed");
