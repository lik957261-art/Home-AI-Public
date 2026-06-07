"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeArtifactFacadeService } = require("../adapters/mobile-runtime-artifact-facade-service");

function makeFileArtifactAccessService(calls) {
  const methods = [
    "safeFileName",
    "safeDirectoryName",
    "uniqueChildPath",
    "workspaceDefaultRoot",
    "threadUploadRoot",
    "workspaceUploadRoot",
    "uploadWorkspaceAllowedForThread",
    "uploadWorkspaceIdForRequest",
    "uploadRootsForThread",
    "workspaceUploadDirectoryForRequest",
    "registerUploadArtifact",
    "publicArtifactFromClient",
    "attachUploadedArtifactsToMessage",
  ];
  return Object.fromEntries(methods.map((methodName) => [
    methodName,
    (...args) => {
      calls.push({ type: "file", methodName, args });
      return { methodName, args };
    },
  ]));
}

function makeArtifactTextService(calls) {
  const methods = [
    "compactArtifactForMessage",
    "compactArtifactPathKey",
    "compactArtifactStemKey",
    "publicMarkdownPreviewArtifact",
    "sourceMarkdownSearchRoots",
    "findMarkdownByStemUnderRoot",
    "findSourceMarkdownForArtifact",
    "companionMarkdownPathForArtifact",
    "findThreadForMessage",
    "compactArtifactsForMessage",
    "registerArtifactsFromText",
  ];
  return Object.fromEntries(methods.map((methodName) => [
    methodName,
    (...args) => {
      calls.push({ type: "text", methodName, args });
      return { methodName, args };
    },
  ]));
}

function testRequiresFileAccessService() {
  assert.throws(
    () => createMobileRuntimeArtifactFacadeService(),
    /requires fileArtifactAccessService/
  );
}

function testDelegatesFileAccessWithoutInitializingTextRegistration() {
  const calls = [];
  let created = 0;
  const facade = createMobileRuntimeArtifactFacadeService({
    fileArtifactAccessService: makeFileArtifactAccessService(calls),
    createArtifactTextRegistrationService: () => {
      created += 1;
      return makeArtifactTextService(calls);
    },
  });

  const result = facade.workspaceUploadDirectoryForRequest({ workspaceId: "owner" }, { id: "thread1" }, {});

  assert.deepEqual(result, {
    methodName: "workspaceUploadDirectoryForRequest",
    args: [{ workspaceId: "owner" }, { id: "thread1" }, {}],
  });
  assert.equal(created, 0);
  assert.deepEqual(calls.map((call) => call.methodName), ["workspaceUploadDirectoryForRequest"]);
}

function testLazilyCreatesTextRegistrationServiceOnceWithRuntimeDeps() {
  const calls = [];
  const state = { artifacts: [], threads: [] };
  const cache = new Map();
  const deps = {
    dedupe: (values) => values,
    effectiveProjectForThread: () => ({ id: "project" }),
    extractArtifactPaths: () => ["MEDIA:/tmp/report.md"],
    findProject: () => ({ id: "project" }),
    findSubproject: () => ({ id: "subproject" }),
    isPathAllowedForThread: () => true,
    makeId: (prefix) => `${prefix}_1`,
    mimeFor: () => "text/markdown",
    normalizeLocalPath: (value) => String(value || ""),
    nowIso: () => "2026-06-07T00:00:00.000Z",
    sourceMarkdownSearchCache: cache,
    sourceMarkdownSearchLimit: 17,
    state: () => state,
  };
  const factoryDeps = [];
  const facade = createMobileRuntimeArtifactFacadeService(Object.assign({}, deps, {
    fileArtifactAccessService: makeFileArtifactAccessService(calls),
    createArtifactTextRegistrationService: (options) => {
      factoryDeps.push(options);
      return makeArtifactTextService(calls);
    },
  }));

  assert.deepEqual(facade.compactArtifactsForMessage({ id: "message1" }, { id: "thread1" }), {
    methodName: "compactArtifactsForMessage",
    args: [{ id: "message1" }, { id: "thread1" }],
  });
  assert.deepEqual(facade.registerArtifactsFromText({ id: "thread1" }, { id: "message1" }, "MEDIA:/tmp/report.md"), {
    methodName: "registerArtifactsFromText",
    args: [{ id: "thread1" }, { id: "message1" }, "MEDIA:/tmp/report.md"],
  });

  assert.equal(factoryDeps.length, 1);
  assert.strictEqual(factoryDeps[0].sourceMarkdownSearchCache, cache);
  assert.equal(factoryDeps[0].sourceMarkdownSearchLimit, 17);
  assert.strictEqual(factoryDeps[0].state(), state);
  assert.strictEqual(factoryDeps[0].extractArtifactPaths, deps.extractArtifactPaths);
  assert.equal(facade.getArtifactTextRegistrationService(), facade.getArtifactTextRegistrationService());
  assert.deepEqual(calls.map((call) => call.methodName), [
    "compactArtifactsForMessage",
    "registerArtifactsFromText",
  ]);
}

function testResolvesArtifactPathFromMessageWithoutInitializingTextRegistration() {
  const calls = [];
  let created = 0;
  const facade = createMobileRuntimeArtifactFacadeService({
    fileArtifactAccessService: makeFileArtifactAccessService(calls),
    createArtifactTextRegistrationService: () => {
      created += 1;
      return makeArtifactTextService(calls);
    },
    extractArtifactPaths(text) {
      return String(text || "").match(/MEDIA:[^\s]+/g) || [];
    },
    fs: {
      existsSync(value) {
        return !String(value || "").includes("missing");
      },
    },
    normalizeLocalPath(value) {
      return String(value || "").replace(/^MEDIA:/, "").replaceAll("\\", "/");
    },
    path: {
      basename(value) {
        return String(value || "").split(/[\\/]/).filter(Boolean).pop() || "";
      },
    },
  });

  assert.deepEqual(facade.resolveArtifactPathFromMessage({}, { content: "MEDIA:C:/out/report.md" }), {
    rawPath: "MEDIA:C:/out/report.md",
    localPath: "C:/out/report.md",
  });
  assert.deepEqual(
    facade.resolveArtifactPathFromMessage(
      { name: "final.md" },
      { content: "MEDIA:C:/out/report.md MEDIA:C:/out/final.md MEDIA:C:/out/missing.md" }
    ),
    {
      rawPath: "MEDIA:C:/out/final.md",
      localPath: "C:/out/final.md",
    }
  );
  assert.equal(facade.resolveArtifactPathFromMessage({ name: "absent.md" }, { content: "MEDIA:C:/out/report.md MEDIA:C:/out/final.md" }), null);
  assert.equal(created, 0);
}

testRequiresFileAccessService();
testDelegatesFileAccessWithoutInitializingTextRegistration();
testLazilyCreatesTextRegistrationServiceOnceWithRuntimeDeps();
testResolvesArtifactPathFromMessageWithoutInitializingTextRegistration();

console.log("mobile-runtime-artifact-facade-service tests passed");
