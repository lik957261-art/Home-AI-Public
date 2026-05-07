"use strict";

const assert = require("node:assert/strict");
const { createDisplayPathProvider } = require("../adapters/display-path-provider");

function testSharedRootLabels() {
  const provider = createDisplayPathProvider({
    ownerDriveRootNames: () => ["ChatGPT-Drive", "Hermes-Drive"],
    ownerRootFallbackLabel: () => "Hermes Owner",
  });

  assert.equal(provider.sharedProjectDisplayLabel({
    shared: true,
    label: "家政",
    root: "/volume1/Hermes-吴萍/家政",
  }), "Hermes-吴萍 · 家政");
  assert.equal(provider.sharedProjectDisplayLabel({
    shared: true,
    label: "凡凡",
    root: "/mnt/c/Users/alice/SynologyDrive/ChatGPT-Drive/凡凡",
  }), "Hermes Owner · 凡凡");
  assert.equal(provider.sharedProjectDisplayLabel({
    shared: true,
    label: "Shared",
    createdByLabel: "Alice",
  }), "Alice · Shared");
}

function testDirectoryAndFallbackLabels() {
  const provider = createDisplayPathProvider({
    ownerDriveRootNames: () => ["Hermes-Drive"],
    ownerRootFallbackLabel: () => "Owner",
    normalizeLocalPath: (value) => String(value || "").replaceAll("\\", "/"),
  });

  assert.equal(provider.directoryRouteDisplayLabel(
    { shared: true, label: "Project", root: "/volume1/Hermes-A/Project" },
    { label: "Sub" },
  ), "Hermes-A · Project / Sub");
  assert.equal(provider.logicalUserPathFallback("C:\\Users\\alice\\Hermes-Drive\\Health\\Report.pdf"), "Health / Report.pdf");
  assert.equal(provider.logicalUserPathFallback("/home/alice/random/file.txt", "Fallback"), "Fallback");
}

testSharedRootLabels();
testDirectoryAndFallbackLabels();
console.log("display-path-provider tests passed");
