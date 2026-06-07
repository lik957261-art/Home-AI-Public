"use strict";

const assert = require("node:assert");
const { createMobileRuntimePathAccessService } = require("../adapters/mobile-runtime-path-access-service");

function testDelegatesFilesystemMountsAndFiltersAllowedRoots() {
  const calls = [];
  const service = createMobileRuntimePathAccessService({
    filesystemMountProvider: {
      normalizeLocalPath(value) {
        calls.push(["normalize", value]);
        return `local:${value}`;
      },
      windowsPathToWsl(value) {
        calls.push(["wsl", value]);
        return `/mnt/c/${String(value || "").replaceAll("\\", "/")}`;
      },
      resolvedAllowedRoots() {
        return ["C:/allowed", "C:/secret"];
      },
      isPathAllowed(value) {
        calls.push(["allowed", value]);
        return value === "C:/allowed/file.md";
      },
    },
    securityBoundaryProvider: {
      filterRoots(roots) {
        return roots.filter((root) => !root.includes("secret"));
      },
      isProtectedPath(value) {
        return String(value || "").includes("secret");
      },
    },
  });

  assert.equal(service.normalizeLocalPath("C:\\x"), "local:C:\\x");
  assert.equal(service.windowsPathToWsl("C:\\x"), "/mnt/c/C:/x");
  assert.deepEqual(service.allowedRoots(), ["C:/allowed"]);
  assert.equal(service.isPathAllowed("C:/allowed/file.md"), true);
  assert.equal(service.isPathAllowed("C:/secret/file.md"), false);
  assert.deepEqual(calls, [
    ["normalize", "C:\\x"],
    ["wsl", "C:\\x"],
    ["allowed", "C:/allowed/file.md"],
  ]);
}

function testDelegatesThreadPolicyBooleans() {
  const service = createMobileRuntimePathAccessService({
    pathPolicyProvider: {
      canReadForThread(_thread, localPath) {
        return { allowed: localPath === "readable" };
      },
      canBrowseDirectoryForThread(_thread, localPath) {
        return { allowed: localPath === "browseable" };
      },
    },
  });

  assert.equal(service.isPathAllowedForThread({ id: "t" }, "readable"), true);
  assert.equal(service.isPathAllowedForThread({ id: "t" }, "blocked"), false);
  assert.equal(service.isDirectoryBrowserPathAllowedForThread({ id: "t" }, "browseable"), true);
  assert.equal(service.isDirectoryBrowserPathAllowedForThread({ id: "t" }, "blocked"), false);
}

function testSafeFallbacks() {
  const service = createMobileRuntimePathAccessService();

  assert.equal(service.normalizeLocalPath("x"), "x");
  assert.equal(service.windowsPathToWsl("x"), "x");
  assert.deepEqual(service.allowedRoots(), []);
  assert.equal(service.isPathAllowed("x"), false);
  assert.equal(service.isPathAllowedForThread({}, "x"), false);
  assert.equal(service.isDirectoryBrowserPathAllowedForThread({}, "x"), false);
}

function testLazyProviderGetters() {
  let filesystemProvider = {
    normalizeLocalPath(value) {
      return `first:${value}`;
    },
  };
  const service = createMobileRuntimePathAccessService({
    filesystemMountProvider: () => filesystemProvider,
  });

  assert.equal(service.normalizeLocalPath("x"), "first:x");
  filesystemProvider = {
    normalizeLocalPath(value) {
      return `second:${value}`;
    },
    windowsPathToWsl(value) {
      return `/mnt/${value}`;
    },
  };
  assert.equal(service.normalizeLocalPath("x"), "second:x");
  assert.equal(service.windowsPathToWsl("c"), "/mnt/c");
}

testDelegatesFilesystemMountsAndFiltersAllowedRoots();
testDelegatesThreadPolicyBooleans();
testSafeFallbacks();
testLazyProviderGetters();

console.log("mobile runtime path access service tests passed");
