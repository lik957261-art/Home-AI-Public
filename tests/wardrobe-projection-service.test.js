"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  WARDROBE_DASHBOARD_TOOLS,
  createWardrobeProjectionService,
  findWardrobeDirectory,
} = require("../adapters/wardrobe-projection-service");

function wardrobeProject(root = "C:\\Wardrobe") {
  return [{
    id: "luxury",
    label: "Luxury",
    root: "C:\\Root",
    children: [{
      id: "wardrobe",
      label: "衣橱",
      root,
    }],
  }];
}

async function testFindWardrobeDirectory() {
  const directory = findWardrobeDirectory(wardrobeProject("C:\\Wardrobe"));
  assert.equal(directory.root, "C:\\Wardrobe");
  assert.equal(directory.projectId, "luxury");
  assert.equal(directory.subprojectId, "wardrobe");
}

async function testFindWardrobeDirectoryDoesNotBindDeliveryChild() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "wardrobe-root-"));
  const wardrobeRoot = path.join(temp, "衣橱");
  const deliveryRoot = path.join(wardrobeRoot, "交付");
  fs.mkdirSync(path.join(wardrobeRoot, ".hermes-wardrobe"), { recursive: true });
  fs.mkdirSync(deliveryRoot, { recursive: true });
  fs.writeFileSync(path.join(wardrobeRoot, ".hermes-wardrobe", "config.json"), "{}", "utf8");
  try {
    const directory = findWardrobeDirectory([{
      id: "wardrobe",
      label: "衣橱",
      root: wardrobeRoot,
      children: [{
        id: "delivery",
        label: "交付",
        root: deliveryRoot,
      }],
    }]);
    assert.equal(directory.root, wardrobeRoot);
    assert.equal(directory.projectId, "wardrobe");
    assert.equal(directory.subprojectId, "");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function testFindWardrobeDirectoryIgnoresParentNameInChildRootPath() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hm-child-root-"));
  const wardrobeRoot = path.join(temp, "衣橱");
  const deliveryRoot = path.join(wardrobeRoot, "交付");
  fs.mkdirSync(deliveryRoot, { recursive: true });
  try {
    const directory = findWardrobeDirectory([{
      id: "root",
      label: "根目录",
      root: temp,
      children: [{
        id: "delivery",
        label: "交付",
        root: deliveryRoot,
      }],
    }]);
    assert.equal(directory, null);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function testFindWardrobeDirectoryIgnoresOutfitDeliveryFolder() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hm-outfit-root-"));
  const deliveryRoot = path.join(temp, "Hermes同步文件夹", "穿搭建议");
  fs.mkdirSync(deliveryRoot, { recursive: true });
  try {
    const directory = findWardrobeDirectory([{
      id: "delivery",
      label: "Hermes同步文件夹",
      root: path.join(temp, "Hermes同步文件夹"),
      children: [{
        id: "outfit-delivery",
        label: "穿搭建议",
        root: deliveryRoot,
      }],
    }]);
    assert.equal(directory, null);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function testOverviewCallsMcpStatsTools() {
  const calls = [];
  const service = createWardrobeProjectionService({
    nowIso: () => "2026-05-28T00:00:00.000Z",
    mcpClient: {
      callTools(input) {
        calls.push(input);
        return Promise.resolve({
          overview: {
            items: { total: 12, wardrobe: 10, watch: 2 },
            wear_history: { total: 4 },
            photos: { total: 9 },
            maintenance: { red: 1, orange: 2 },
            data_quality: { issue_count: 3 },
          },
          inventory: { item_count: 12, groups: [{ key: "Outerwear", count: 3 }] },
          brandInventory: { groups: [{ key: "Zegna", count: 7, amount: 1000 }] },
          watch: { item_count: 2, totals: { count: 2, amount: 2000 }, groups: [{ key: "WatchBrand", count: 2, amount: 2000 }] },
          wear: { item_count: 10, groups: [{ key: "Zegna", count: 3 }] },
          featuredLooks: { look_count: 5, with_photos: 4, groups: [{ key: "Zegna", count: 2 }] },
          history: { record_count: 4, groups: [{ key: "2026-05-28", count: 1 }] },
          maintenance: { item_count: 12, groups: [{ key: "red", count: 1 }] },
          photos: { items: { total: 12, with_photo: 9 } },
          dataQuality: { quality: { item_count: 12, issue_count: 3, checks: { missing_photo: 2 } } },
          items: { items: [{ code: "A1", brand: "Zegna", section: "Polo", price_cny: "¥1,200" }], count: 1, limit: 80 },
        });
      },
    },
  });

  const projection = await service.overview({ projects: wardrobeProject("C:\\Wardrobe") });
  assert.equal(projection.ok, true);
  assert.equal(projection.available, true);
  assert.equal(projection.checkedAt, "2026-05-28T00:00:00.000Z");
  assert.equal(projection.source.mode, "wardrobe_mcp_stats");
  assert.equal(projection.source.toolCount, WARDROBE_DASHBOARD_TOOLS.length);
  assert.equal(projection.overview.itemCount, 12);
  assert.equal(projection.overview.wardrobeCount, 10);
  assert.equal(projection.overview.watchCount, 2);
  assert.equal(projection.overview.maintenanceIssueCount, 3);
  assert.equal(projection.dataQuality.issueCount, 3);
  assert.equal(projection.inventory.brandGroups[0].key, "Zegna");
  assert.equal(projection.watch.itemCount, 2);
  assert.equal(projection.featuredLooks.lookCount, 5);
  assert.equal(projection.items.items[0].code, "A1");
  assert.equal(projection.items.items[0].priceCny, 1200);
  assert.deepEqual(calls.map((item) => item.workspaceRoot), ["C:\\Wardrobe"]);
  assert.deepEqual(calls[0].calls.map((item) => item.name), WARDROBE_DASHBOARD_TOOLS.map((item) => item.name));
}

async function testOverviewPassesFiltersToInventoryAndSearch() {
  const calls = [];
  const service = createWardrobeProjectionService({
    mcpClient: {
      callTools(input) {
        calls.push(input);
        return Promise.resolve({
          overview: {},
          inventory: {},
          brandInventory: {},
          watch: {},
          wear: {},
          featuredLooks: {},
          history: {},
          maintenance: {},
          photos: {},
          dataQuality: {},
          items: { items: [] },
        });
      },
    },
  });
  await service.overview({ projects: wardrobeProject("C:\\Wardrobe"), filters: { q: "polo", brand: "Zegna", section: "watch" } });
  const inventory = calls[0].calls.find((item) => item.key === "inventory");
  const brandInventory = calls[0].calls.find((item) => item.key === "brandInventory");
  const watch = calls[0].calls.find((item) => item.key === "watch");
  const items = calls[0].calls.find((item) => item.key === "items");
  assert.equal(inventory.arguments.q, "polo");
  assert.equal(inventory.arguments.brand, "Zegna");
  assert.equal(watch.arguments.brand, "Zegna");
  assert.equal(items.arguments.q, "polo");
  assert.equal(items.arguments.brand, "Zegna");
  assert.equal(items.arguments.kind, "watch");
  assert.equal(brandInventory.arguments.brand, undefined);
}

async function testMissingDirectoryDoesNotCallMcp() {
  let called = false;
  const service = createWardrobeProjectionService({
    nowIso: () => "now",
    mcpClient: {
      callTools() {
        called = true;
        throw new Error("should not call");
      },
    },
  });
  const projection = await service.overview({ projects: [] });
  assert.equal(projection.ok, false);
  assert.equal(projection.available, false);
  assert.equal(projection.code, "wardrobe_directory_not_found");
  assert.equal(called, false);
}

async function run() {
  await testFindWardrobeDirectory();
  await testFindWardrobeDirectoryDoesNotBindDeliveryChild();
  await testFindWardrobeDirectoryIgnoresParentNameInChildRootPath();
  await testFindWardrobeDirectoryIgnoresOutfitDeliveryFolder();
  await testOverviewCallsMcpStatsTools();
  await testOverviewPassesFiltersToInventoryAndSearch();
  await testMissingDirectoryDoesNotCallMcp();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
