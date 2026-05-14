"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const routeRegistry = require("../adapters/api-route-registry");
const routeInventory = require("../adapters/api-route-inventory");
const requestContext = require("../adapters/request-context-provider");
const resourceResolver = require("../adapters/resource-access-resolver");
const kanbanStory = require("../adapters/kanban-story-provider");
const markdownRenderer = require("../adapters/markdown-renderer");
const sqliteStore = require("../adapters/mobile-sqlite-store");
const publicApiRoutes = require("../server-routes/public-api-routes");

function fileText(file) {
  return fs.readFileSync(file, "utf8");
}

function testRefactorModulesExportStableContracts() {
  assert.equal(typeof routeRegistry.createApiRouteRegistry, "function");
  assert.equal(typeof routeInventory.createHermesMobileApiRouteInventory, "function");
  assert.equal(typeof publicApiRoutes.createPublicApiRoutes, "function");
  assert.equal(typeof requestContext.buildRequestContext, "function");
  assert.equal(typeof resourceResolver.resolveResourceAccess, "function");
  assert.equal(typeof kanbanStory.groupKanbanCaseCards, "function");
  assert.equal(typeof markdownRenderer.renderMarkdownDocument, "function");
  assert.equal(sqliteStore.CURRENT_SCHEMA_VERSION >= 2, true);
}

function testServerUsesRequestContextAndSqliteCaseShareMigration() {
  const server = fileText("server.js");
  assert.match(server, /createPublicApiRoutes/);
  assert.match(server, /publicApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /buildRequestContext/);
  assert.match(server, /req\.hermesRequestContext/);
  assert.match(server, /syncKanbanCaseShareStoreToSqlite/);
  assert.match(server, /listKanbanCaseShares/);
  assert.match(server, /upsertKanbanCaseShare/);
}

function testPackageRunsArchitectureContracts() {
  const pkg = JSON.parse(fileText("package.json"));
  for (const name of [
    "api-route-registry",
    "api-route-inventory",
    "request-context-provider",
    "resource-access-resolver",
    "kanban-story-provider",
    "markdown-renderer",
    "architecture-refactor-boundary",
  ]) {
    assert.match(pkg.scripts.check, new RegExp(`node --check (?:adapters|tests)[\\\\/]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  for (const testFile of [
    "tests/api-route-registry.test.js",
    "tests/api-route-inventory.test.js",
    "tests/public-api-routes.test.js",
    "tests/request-context-provider.test.js",
    "tests/resource-access-resolver.test.js",
    "tests/kanban-story-provider.test.js",
    "tests/markdown-renderer.test.js",
    "tests/architecture-refactor-boundary.test.js",
  ]) {
    assert.match(pkg.scripts.test, new RegExp(testFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(pkg.scripts.check, /server-routes[\\/]public-api-routes\.js/);
}

function testRefactorPlanTracksTwelveWorkPackages() {
  const doc = fileText("docs/ARCHITECTURE_REFACTOR_PLAN.zh-CN.md");
  assert.match(doc, /4\.1/);
  assert.match(doc, /4\.12/);
  assert.match(doc, /Request context/i);
  assert.match(doc, /Resource access resolver/i);
  assert.match(doc, /SQLite/i);
  assert.match(doc, /Markdown renderer/i);
}

testRefactorModulesExportStableContracts();
testServerUsesRequestContextAndSqliteCaseShareMigration();
testPackageRunsArchitectureContracts();
testRefactorPlanTracksTwelveWorkPackages();

console.log("architecture refactor boundary tests passed");
