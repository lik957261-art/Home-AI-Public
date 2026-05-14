"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const routeRegistry = require("../adapters/api-route-registry");
const routeInventory = require("../adapters/api-route-inventory");
const requestContext = require("../adapters/request-context-provider");
const resourceResolver = require("../adapters/resource-access-resolver");
const kanbanStory = require("../adapters/kanban-story-provider");
const markdownRenderer = require("../adapters/markdown-renderer");
const runtimeStateRepository = require("../adapters/runtime-state-repository");
const studyAssessmentService = require("../adapters/study-assessment-service");
const sqliteStore = require("../adapters/mobile-sqlite-store");
const accessKeyApiRoutes = require("../server-routes/access-key-api-routes");
const automationApiRoutes = require("../server-routes/automation-api-routes");
const directoryBrowserApiRoutes = require("../server-routes/directory-browser-api-routes");
const fileArtifactApiRoutes = require("../server-routes/file-artifact-api-routes");
const kanbanCardApiRoutes = require("../server-routes/kanban-card-api-routes");
const kanbanStudyApiRoutes = require("../server-routes/kanban-study-api-routes");
const ownerElevationApiRoutes = require("../server-routes/owner-elevation-api-routes");
const publicApiRoutes = require("../server-routes/public-api-routes");
const pushApiRoutes = require("../server-routes/push-api-routes");
const resourceApiRoutes = require("../server-routes/resource-api-routes");
const runtimeConfigApiRoutes = require("../server-routes/runtime-config-api-routes");
const systemApiRoutes = require("../server-routes/system-api-routes");
const todoApiRoutes = require("../server-routes/todo-api-routes");
const weixinApiRoutes = require("../server-routes/weixin-api-routes");
const workspaceApiRoutes = require("../server-routes/workspace-api-routes");

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
  assert.equal(typeof runtimeStateRepository.createRuntimeStateRepository, "function");
  assert.equal(typeof studyAssessmentService.deriveSubmissionWorkflowState, "function");
  assert.equal(sqliteStore.CURRENT_SCHEMA_VERSION >= 2, true);
  assert.equal(typeof publicApiRoutes.createPublicApiRoutes, "function");
  assert.equal(typeof systemApiRoutes.createSystemApiRoutes, "function");
  assert.equal(typeof runtimeConfigApiRoutes.createRuntimeConfigApiRoutes, "function");
  assert.equal(typeof pushApiRoutes.createPushApiRoutes, "function");
  assert.equal(typeof ownerElevationApiRoutes.createOwnerElevationApiRoutes, "function");
  assert.equal(typeof weixinApiRoutes.createWeixinApiRoutes, "function");
  assert.equal(typeof workspaceApiRoutes.createWorkspaceApiRoutes, "function");
  assert.equal(typeof accessKeyApiRoutes.createAccessKeyApiRoutes, "function");
  assert.equal(typeof resourceApiRoutes.createResourceApiRoutes, "function");
  assert.equal(typeof automationApiRoutes.createAutomationApiRoutes, "function");
  assert.equal(typeof directoryBrowserApiRoutes.createDirectoryBrowserApiRoutes, "function");
  assert.equal(typeof todoApiRoutes.createTodoApiRoutes, "function");
  assert.equal(typeof kanbanCardApiRoutes.createKanbanCardApiRoutes, "function");
  assert.equal(typeof kanbanStudyApiRoutes.createKanbanStudyApiRoutes, "function");
  assert.equal(typeof fileArtifactApiRoutes.createFileArtifactApiRoutes, "function");
}

function testServerUsesRequestContextAndSqliteCaseShareMigration() {
  const server = fileText("server.js");
  assert.match(server, /createPublicApiRoutes/);
  assert.match(server, /publicApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createSystemApiRoutes/);
  assert.match(server, /systemApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createRuntimeConfigApiRoutes/);
  assert.match(server, /runtimeConfigApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createPushApiRoutes/);
  assert.match(server, /pushApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createWeixinApiRoutes/);
  assert.match(server, /weixinApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createOwnerElevationApiRoutes/);
  assert.match(server, /ownerElevationApiRoutes\.handle\(req, res, url\)/);
  assert.match(server, /createWorkspaceApiRoutes/);
  assert.match(server, /workspaceApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createAccessKeyApiRoutes/);
  assert.match(server, /accessKeyApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createResourceApiRoutes/);
  assert.match(server, /resourceApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createAutomationApiRoutes/);
  assert.match(server, /automationApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createDirectoryBrowserApiRoutes/);
  assert.match(server, /directoryBrowserApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createTodoApiRoutes/);
  assert.match(server, /todoApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createKanbanCardApiRoutes/);
  assert.match(server, /kanbanCardApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createKanbanStudyApiRoutes/);
  assert.match(server, /kanbanStudyApiRoutes\.handle\(req, res, url/);
  assert.match(server, /createFileArtifactApiRoutes/);
  assert.match(server, /fileArtifactApiRoutes\.handle\(req, res, url/);
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
    "runtime-state-repository",
    "study-assessment-service",
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
    "tests/system-api-routes.test.js",
    "tests/runtime-config-api-routes.test.js",
    "tests/push-api-routes.test.js",
    "tests/owner-elevation-api-routes.test.js",
    "tests/weixin-api-routes.test.js",
    "tests/workspace-api-routes.test.js",
    "tests/access-key-api-routes.test.js",
    "tests/resource-api-routes.test.js",
    "tests/automation-api-routes.test.js",
    "tests/directory-browser-api-routes.test.js",
    "tests/todo-api-routes.test.js",
    "tests/kanban-card-api-routes.test.js",
    "tests/kanban-study-api-routes.test.js",
    "tests/file-artifact-api-routes.test.js",
    "tests/runtime-state-repository.test.js",
    "tests/study-assessment-service.test.js",
    "tests/request-context-provider.test.js",
    "tests/resource-access-resolver.test.js",
    "tests/kanban-story-provider.test.js",
    "tests/markdown-renderer.test.js",
    "tests/architecture-refactor-boundary.test.js",
  ]) {
    assert.match(pkg.scripts.test, new RegExp(testFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(pkg.scripts.check, /server-routes[\\/]public-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]system-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]runtime-config-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]push-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]owner-elevation-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]weixin-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]workspace-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]access-key-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]resource-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]automation-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]directory-browser-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]todo-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]kanban-card-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]kanban-study-api-routes\.js/);
  assert.match(pkg.scripts.check, /server-routes[\\/]file-artifact-api-routes\.js/);
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
