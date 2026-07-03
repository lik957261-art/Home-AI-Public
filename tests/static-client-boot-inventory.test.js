"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildInventory,
} = require("../scripts/static-client-boot-inventory");

const repoRoot = path.resolve(__dirname, "..");
const inventoryDocPath = path.join(repoRoot, "docs/IMPLEMENTATION_NOTES/static-client-boot-inventory.md");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function readInventoryDoc() {
  return fs.readFileSync(inventoryDocPath, "utf8");
}

test("static client boot inventory document is generated from current index script order", () => {
  const inventory = buildInventory();
  const doc = readInventoryDoc();
  assert.match(doc, /generated-by: scripts\/static-client-boot-inventory\.js/);
  assert.match(doc, new RegExp(`script-count: ${inventory.generatedFrom.scriptCount}`));
  assert.match(doc, new RegExp(`script-order-sha256: ${inventory.generatedFrom.scriptOrderHash}`));
  assert.equal(inventory.generatedFrom.scriptCount, 102);
  assert.equal(inventory.scripts[0].path, "fixed-viewport.js");
  assert.equal(inventory.scripts.at(-1).path, "app-start.js");
});

test("inventory covers the expected migration groups", () => {
  const inventory = buildInventory();
  const groups = new Set(inventory.groupCounts.map(([group]) => group));
  for (const group of ["foundation", "runtime", "surfaces", "input", "plugin-host", "viewers", "pwa-native"]) {
    assert.ok(groups.has(group), `missing group ${group}`);
  }
  assert.ok(!groups.has("unclassified"), "current startup scripts should all be classified");
});

test("inventory records global-state and DOM migration evidence", () => {
  const inventory = buildInventory();
  const doc = readInventoryDoc();
  const facadeSymbols = new Set(inventory.facadeCounts.map(([symbol]) => symbol));
  assert.ok(facadeSymbols.has("state"));
  assert.ok(facadeSymbols.has("api"));
  assert.ok(facadeSymbols.has("document"));
  assert.match(doc, /Runtime Facade Candidate Uses/);
  assert.match(doc, /Ordered Script Inventory/);
  assert.match(doc, /Import side effects/);
});

if (process.exitCode) process.exit(process.exitCode);
