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
    label: "Household",
    root: "/volume1/Hermes-Alice/Household",
  }), "Hermes-Alice · Household");
  assert.equal(provider.sharedProjectDisplayLabel({
    shared: true,
    label: "Family",
    root: "/mnt/c/Example/SynologyDrive/ChatGPT-Drive/Family",
  }), "Hermes Owner · Family");
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
  assert.equal(provider.logicalUserPathFallback("D:\\Work\\Hermes-Drive\\Health\\Report.pdf"), "Health / Report.pdf");
  assert.equal(provider.logicalUserPathFallback("/srv/example/random/file.txt", "Fallback"), "Fallback");
}

testSharedRootLabels();
testDirectoryAndFallbackLabels();
console.log("display-path-provider tests passed");
