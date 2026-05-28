"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createApiRouteRegistry, validateRouteRegistry } = require("../adapters/api-route-registry");
const {
  createHermesMobileApiRouteInventory,
  groupHermesMobileApiRoutes,
  listHermesMobileApiRouteSpecs,
  listHermesMobileApiRoutes,
  matchHermesMobileApiRoute,
  summarizeHermesMobileApiRoutes,
  validateHermesMobileApiRouteInventory,
} = require("../adapters/api-route-inventory");
const { LEARNING_PROGRAM_API_ROUTE_SPECS } = require("../server-routes/learning-program-api-routes");

const ROUTE_MODULES = Object.freeze([
  {
    key: "public-api-routes",
    exportName: "createPublicApiRoutes",
    required: true,
    minRoutes: 4,
    probes: [
      { method: "GET", path: "/api/public-config", id: "public-config" },
      { method: "POST", path: "/api/login", id: "login" },
    ],
  },
  {
    key: "system-api-routes",
    exportName: "createSystemApiRoutes",
    required: true,
    minRoutes: 4,
    probes: [
      { method: "GET", path: "/api/status", id: "status" },
      { method: "POST", path: "/api/app-update/apply", id: "app-update-apply" },
    ],
  },
  {
    key: "runtime-config-api-routes",
    exportName: "createRuntimeConfigApiRoutes",
    required: true,
    minRoutes: 4,
    probes: [
      { method: "GET", path: "/api/runtime-config", id: "runtime-config" },
      { method: "POST", path: "/api/runtime-config/test", id: "runtime-config-test" },
    ],
  },
  {
    key: "push-api-routes",
    exportName: "createPushApiRoutes",
    required: true,
    minRoutes: 7,
    probes: [
      { method: "GET", path: "/api/push/vapid-public-key", id: "push-vapid-public-key" },
      { method: "POST", path: "/api/push/test", id: "push-test" },
    ],
  },
  {
    key: "event-stream-api-routes",
    exportName: "createEventStreamApiRoutes",
    required: false,
    minRoutes: 1,
    probes: [
      { method: "GET", path: "/api/events", id: "events" },
      { method: "POST", path: "/api/events", id: "events" },
    ],
  },
  {
    key: "owner-elevation-api-routes",
    exportName: "createOwnerElevationApiRoutes",
    required: false,
    minRoutes: 1,
    probes: [
      { method: "GET", path: "/api/owner-elevation", id: "owner-elevation-status" },
    ],
  },
  {
    key: "weixin-api-routes",
    exportName: "createWeixinApiRoutes",
    required: false,
    minRoutes: 1,
    probes: [
      { method: "GET", path: "/api/weixin/forward-targets", id: "weixin-forward-targets" },
      { method: "POST", path: "/api/ingress/weixin/outbound/delivery-1/ack", id: "weixin-outbound-ack" },
    ],
  },
  {
    key: "workspace-api-routes",
    exportName: "createWorkspaceApiRoutes",
    required: false,
    minRoutes: 1,
    probes: [
      { method: "GET", path: "/api/workspaces", id: "workspaces-list" },
    ],
  },
  {
    key: "automation-api-routes",
    exportName: "createAutomationApiRoutes",
    required: false,
    minRoutes: 8,
    probes: [
      { method: "GET", path: "/api/automations", id: "automations-list" },
      { method: "POST", path: "/api/automations/job-1/pause", id: "automations-action" },
      { method: "GET", path: "/api/automations/output/preview", id: "automations-output-preview" },
    ],
  },
  {
    key: "directory-browser-api-routes",
    exportName: "createDirectoryBrowserApiRoutes",
    required: false,
    minRoutes: 1,
    probes: [
      { method: "GET", path: "/api/directories/preview", id: "directories-preview" },
    ],
  },
  {
    key: "directory-share-api-routes",
    exportName: "createDirectoryShareApiRoutes",
    required: false,
    minRoutes: 3,
    probes: [
      { method: "POST", path: "/api/directories/share", id: "directories-share-create" },
      { method: "POST", path: "/api/directories/unshare", id: "directories-share-delete" },
      { method: "POST", path: "/api/directories/share/update", id: "directories-share-update" },
    ],
  },
  {
    key: "directory-mutation-api-routes",
    exportName: "createDirectoryMutationApiRoutes",
    required: false,
    minRoutes: 3,
    probes: [
      { method: "POST", path: "/api/directories/create", id: "directories-create" },
      { method: "POST", path: "/api/directories/upload", id: "directories-upload" },
      { method: "POST", path: "/api/directories/delete", id: "directories-delete" },
    ],
  },
  {
    key: "wardrobe-api-routes",
    exportName: "createWardrobeApiRoutes",
    required: false,
    minRoutes: 1,
    probes: [
      { method: "GET", path: "/api/wardrobe/overview", id: "wardrobe-overview" },
    ],
  },
  {
    key: "hermes-plugin-api-routes",
    exportName: "createHermesPluginApiRoutes",
    required: false,
    minRoutes: 2,
    probes: [
      { method: "GET", path: "/api/hermes-plugins", id: "hermes-plugins-list" },
      { method: "GET", path: "/api/hermes-plugins/wardrobe/manifest", id: "hermes-plugin-wardrobe-manifest" },
    ],
  },
  {
    key: "thread-read-upload-api-routes",
    exportName: "createThreadReadUploadApiRoutes",
    required: false,
    minRoutes: 5,
    probes: [
      { method: "GET", path: "/api/threads", id: "threads-list" },
      { method: "POST", path: "/api/threads", id: "threads-create" },
      { method: "GET", path: "/api/threads/thread-1", id: "thread-read" },
      { method: "GET", path: "/api/threads/thread-1/messages", id: "thread-messages-list" },
      { method: "POST", path: "/api/threads/thread-1/uploads", id: "thread-uploads-create" },
    ],
  },
  {
    key: "thread-task-api-routes",
    exportName: "createThreadTaskApiRoutes",
    required: false,
    minRoutes: 3,
    probes: [
      { method: "PATCH", path: "/api/threads/thread-1/tasks/task-1", id: "thread-task-rename" },
      { method: "DELETE", path: "/api/threads/thread-1/tasks/task-1", id: "thread-task-delete" },
      { method: "POST", path: "/api/threads/thread-1/interrupt", id: "thread-interrupt" },
    ],
  },
  {
    key: "single-window-group-chat-api-routes",
    exportName: "createSingleWindowGroupChatApiRoutes",
    required: false,
    minRoutes: 3,
    probes: [
      { method: "POST", path: "/api/single-window", id: "single-window" },
      { method: "PATCH", path: "/api/threads/thread-1/group-chat", id: "thread-group-chat-update" },
      { method: "POST", path: "/api/threads/thread-1/messages/msg-1/revoke", id: "thread-message-revoke" },
    ],
  },
  {
    key: "thread-message-run-api-routes",
    exportName: "createThreadMessageRunApiRoutes",
    required: false,
    minRoutes: 2,
    probes: [
      { method: "POST", path: "/api/threads/thread-1/messages", id: "thread-messages-create" },
      { method: "POST", path: "/api/threads/thread-1/messages/msg-1/owner-elevation", id: "thread-message-owner-elevation" },
    ],
  },
  {
    key: "action-inbox-api-routes",
    exportName: "createActionInboxApiRoutes",
    required: false,
    minRoutes: 4,
    probes: [
      { method: "GET", path: "/api/action-inbox", id: "action-inbox-list" },
      { method: "POST", path: "/api/action-inbox", id: "action-inbox-create" },
      { method: "GET", path: "/api/action-inbox/item-1", id: "action-inbox-detail" },
      { method: "POST", path: "/api/action-inbox/item-1/complete", id: "action-inbox-action" },
    ],
  },
  {
    key: "todo-api-routes",
    exportName: "createTodoApiRoutes",
    required: false,
    minRoutes: 4,
    probes: [
      { method: "GET", path: "/api/todos", id: "todos-list" },
      { method: "POST", path: "/api/todos/todo-1/block", id: "todos-action" },
      { method: "POST", path: "/api/todos/push/tick", id: "todos-push-tick" },
    ],
  },
  {
    key: "kanban-card-api-routes",
    exportName: "createKanbanCardApiRoutes",
    required: false,
    minRoutes: 10,
    probes: [
      { method: "GET", path: "/api/kanban/cards", id: "kanban-cards-list" },
      { method: "GET", path: "/api/kanban/cards/card-1/detail", id: "kanban-card-detail" },
      { method: "POST", path: "/api/kanban/cards/card-1/comment", id: "kanban-card-action" },
      { method: "POST", path: "/api/kanban/cards/card-1/learning-growth-submission", id: "kanban-card-learning-growth-submission" },
      { method: "POST", path: "/api/kanban/cards/card-1/learning-growth-submission/withdraw", id: "kanban-card-learning-growth-submission-withdraw" },
      { method: "POST", path: "/api/kanban/cards/card-1/learning-growth-reflection", id: "kanban-card-learning-growth-reflection" },
    ],
  },
  {
    key: "kanban-study-api-routes",
    exportName: "createKanbanStudyApiRoutes",
    required: false,
    minRoutes: 5,
    probes: [
      { method: "POST", path: "/api/kanban/cards/study-plan", id: "kanban-card-study-plan" },
      { method: "POST", path: "/api/kanban/cards/assessment-plan", id: "kanban-card-assessment-plan" },
      { method: "POST", path: "/api/kanban/cards/card-1/study-submission", id: "kanban-reading-submission" },
      { method: "GET", path: "/api/kanban/cards/card-1/study-quiz", id: "kanban-reading-quiz" },
      { method: "POST", path: "/api/kanban/cards/card-1/assessment-exam", id: "kanban-assessment-exam" },
    ],
  },
  {
    key: "learning-api-routes",
    exportName: "createLearningApiRoutes",
    required: true,
    minRoutes: 4,
    probes: [
      { method: "GET", path: "/api/learning-growth/overview", id: "learning-growth-overview" },
      { method: "GET", path: "/api/learning-growth/board", id: "learning-growth-board" },
      { method: "GET", path: "/api/learning/overview", id: "learning-overview" },
      { method: "GET", path: "/api/learning/status", id: "learning-status" },
    ],
  },
  {
    key: "learning-program-api-routes",
    exportName: "createLearningProgramApiRoutes",
    required: true,
    minRoutes: 36,
    probes: [
      { method: "GET", path: "/api/learning/programs", id: "learning-programs-list" },
      { method: "POST", path: "/api/learning/sources", id: "learning-sources-create" },
      { method: "POST", path: "/api/learning/source-directory/import", id: "learning-source-directory-import" },
      { method: "POST", path: "/api/learning/source-directory/bootstrap", id: "learning-source-directory-bootstrap" },
      { method: "GET", path: "/api/learning/profile", id: "learning-profile-read" },
      { method: "GET", path: "/api/learning/curriculum-references", id: "learning-curriculum-references-list" },
      { method: "POST", path: "/api/learning/foundation-import", id: "learning-foundation-import" },
      { method: "GET", path: "/api/learning/reports/parent", id: "learning-parent-report-read" },
      { method: "POST", path: "/api/learning/programs/program-1/draft-plan", id: "learning-program-draft-plan" },
      { method: "POST", path: "/api/learning/programs/program-1/rebuild-draft-plan", id: "learning-program-rebuild-draft-plan" },
      { method: "GET", path: "/api/learning/task-cards", id: "learning-task-cards-list" },
      { method: "GET", path: "/api/learning/task-execution-queue", id: "learning-task-execution-queue" },
      { method: "GET", path: "/api/learning/daily-plan", id: "learning-daily-plan" },
      { method: "POST", path: "/api/learning/task-cards/task-1/sessions", id: "learning-task-card-session-start" },
      { method: "POST", path: "/api/learning/task-cards/task-1/growth-submission", id: "learning-task-card-growth-submission" },
      { method: "POST", path: "/api/learning/task-cards/task-1/growth-reflection", id: "learning-task-card-growth-reflection" },
      { method: "POST", path: "/api/learning/sessions/session-1/evaluations", id: "learning-session-evaluation-create" },
      { method: "POST", path: "/api/learning/evaluations/eval-1/reward-settlement", id: "learning-evaluation-reward-settle" },
      { method: "GET", path: "/api/learning/reward-settlements", id: "learning-reward-settlements-list" },
      { method: "POST", path: "/api/learning/review-queue/review-1/decision", id: "learning-review-queue-decision" },
    ],
  },
  {
    key: "learning-parent-review-api-routes",
    exportName: "createLearningParentReviewApiRoutes",
    required: true,
    minRoutes: 3,
    probes: [
      { method: "GET", path: "/api/learning/parent-review-requests", id: "learning-parent-review-requests-list" },
      { method: "GET", path: "/api/learning/parent-review-requests/req-1", id: "learning-parent-review-request-read" },
      { method: "POST", path: "/api/learning/parent-review-requests/req-1/decision", id: "learning-parent-review-request-decision" },
    ],
  },
  {
    key: "learning-coin-api-routes",
    exportName: "createLearningCoinApiRoutes",
    required: false,
    minRoutes: 8,
    probes: [
      { method: "GET", path: "/api/learning-coins/summary", id: "learning-coins-summary" },
      { method: "POST", path: "/api/learning-coins/redemptions/redeem-1/approve", id: "learning-coins-redemption-owner-action" },
      { method: "POST", path: "/api/learning-coins/redemptions/redeem-1/cancel", id: "learning-coins-redemption-cancel" },
    ],
  },
  {
    key: "file-artifact-api-routes",
    exportName: "createFileArtifactApiRoutes",
    required: false,
    minRoutes: 3,
    probes: [
      { method: "GET", path: "/api/files/preview", id: "files-preview" },
      { method: "GET", path: "/api/files", id: "files-read" },
      { method: "GET", path: "/api/artifacts/art-1", id: "artifact-read" },
    ],
  },
]);

function routeModuleFile(moduleInfo) {
  return path.join(__dirname, "..", "server-routes", `${moduleInfo.key}.js`);
}

function createNoopRouteDeps() {
  function createNoopFunction() {
    const fn = function noopRouteDependency() {};
    return new Proxy(fn, {
      get(target, prop) {
        if (prop === "then") return undefined;
        if (!Object.hasOwn(target, prop)) target[prop] = createNoopFunction();
        return target[prop];
      },
    });
  }

  const deps = {};
  return new Proxy(deps, {
    get(target, prop) {
      if (prop === "then") return undefined;
      if (!Object.hasOwn(target, prop)) target[prop] = createNoopFunction();
      return target[prop];
    },
  });
}

function loadRouteModules() {
  return ROUTE_MODULES.flatMap((moduleInfo) => {
    const file = routeModuleFile(moduleInfo);
    if (!fs.existsSync(file)) {
      assert.equal(moduleInfo.required, false, `${moduleInfo.key} route module is required`);
      return [];
    }

    const exports = require(file);
    const createRoutes = exports[moduleInfo.exportName];
    assert.equal(typeof createRoutes, "function", `${moduleInfo.key} must export ${moduleInfo.exportName}`);
    const routes = createRoutes(createNoopRouteDeps());
    return [{ moduleInfo, routes }];
  });
}

function matcherSignature(route) {
  if (route.matchType === "exact") return `exact:${route.path}`;
  if (route.matchType === "prefix") return `prefix:${route.pathPrefix}`;
  if (route.matchType === "regex") return `regex:${route.pathRegex.source}:${route.pathRegex.flags}`;
  throw new Error(`unsupported match type for ${route.id}: ${route.matchType}`);
}

function testInventoryBuildsAValidRegistry() {
  const registry = createHermesMobileApiRouteInventory();
  const validation = registry.validate();
  assert.equal(validation.ok, true);
  assert.equal(validation.routeCount, listHermesMobileApiRouteSpecs().length);
  assert.equal(validateHermesMobileApiRouteInventory().ok, true);
  assert.equal(registry.list().length > 70, true);
}

function testInventoryMatchesCurrentServerRouteShapes() {
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/status" }).id, "status");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/login" }).id, "login");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/ingress/weixin/outbound/del-1/ack" }).id, "weixin-ingress-outbound-ack");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/hermes-plugins/wardrobe/manifest" }).id, "hermes-plugin-wardrobe-manifest");
  assert.equal(matchHermesMobileApiRoute({ method: "PATCH", path: "/api/workspaces/child-a" }).id, "workspaces-admin");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/automations/job-1/pause" }).id, "automations-action");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/kanban/cards/card-1/study-quiz" }).id, "kanban-reading-quiz");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/kanban/cards/card-1/assessment-exam" }).id, "kanban-assessment-exam");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning-growth/overview" }).id, "learning-growth-overview");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning-growth/board" }).id, "learning-growth-board");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/overview" }).id, "learning-overview");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/status" }).id, "learning-status");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/sources" }).id, "learning-sources-list");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/source-directory/import" }).id, "learning-source-directory-import");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/source-directory/bootstrap" }).id, "learning-source-directory-bootstrap");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/goals" }).id, "learning-goals-create");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/profile/rebuild" }).id, "learning-profile-rebuild");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/curriculum-references" }).id, "learning-curriculum-references-list");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/foundation-import" }).id, "learning-foundation-import");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/reports/parent" }).id, "learning-parent-report-read");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/recommendations/task-series" }).id, "learning-task-series-recommendations-read");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/recommendations/task-series" }).id, "learning-task-series-recommendations-create");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/recommendations/task-series/draft" }).id, "learning-task-series-recommendation-draft-create");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/programs/program-1/rebuild-draft-plan" }).id, "learning-program-rebuild-draft-plan");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/programs/program-1/publish" }).id, "learning-program-publish");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/task-cards" }).id, "learning-task-cards-list");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/task-execution-queue" }).id, "learning-task-execution-queue");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/daily-plan" }).id, "learning-daily-plan");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/task-cards/task-1" }).id, "learning-task-card-read");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/sessions/session-1/advance" }).id, "learning-session-advance");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/evaluations" }).id, "learning-evaluations-list");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/evaluations/eval-1/reward-settlement" }).id, "learning-evaluation-reward-settle");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/reward-settlements/settle-1" }).id, "learning-reward-settlement-read");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning/parent-review-requests" }).id, "learning-parent-review-requests-list");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/learning/parent-review-requests/req-1/decision" }).id, "learning-parent-review-request-decision");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/learning-coins/summary" }).id, "learning-coins-summary");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/directories/delete" }).id, "directories-delete");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/threads/thread-1/uploads" }).id, "thread-uploads-create");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/directories/share/update" }).id, "directories-share-update");
  assert.equal(matchHermesMobileApiRoute({ method: "DELETE", path: "/api/threads/thread-1/tasks/task-1" }).id, "thread-task-delete");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/artifacts/art-1?download=1" }).id, "artifact-read");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/unknown" }), null);
}

function testLearningProgramInventoryMatchesRouteModuleSpecs() {
  const inventoryById = new Map(listHermesMobileApiRoutes().map((route) => [route.id, route]));
  const moduleRoutes = createApiRouteRegistry(LEARNING_PROGRAM_API_ROUTE_SPECS).list();
  assert.equal(moduleRoutes.length, 44);
  for (const expected of moduleRoutes) {
    const actual = inventoryById.get(expected.id);
    assert.ok(actual, `global inventory is missing ${expected.id}`);
    assert.deepEqual(actual.method, expected.method, `${expected.id} method`);
    assert.equal(matcherSignature(actual), matcherSignature(expected), `${expected.id} matcher`);
    assert.equal(actual.riskLevel, expected.riskLevel, `${expected.id} risk`);
    assert.equal(actual.authMode, expected.authMode, `${expected.id} authMode`);
    assert.equal(actual.authRequired, expected.authRequired, `${expected.id} authRequired`);
    assert.equal(actual.ownerOnly, expected.ownerOnly, `${expected.id} ownerOnly`);
    assert.equal(actual.workspaceScoped, expected.workspaceScoped, `${expected.id} workspaceScoped`);
    assert.deepEqual(actual.resourceTypes, expected.resourceTypes, `${expected.id} resourceTypes`);
  }
}

function testSummarySeparatesRuntimeAuthDomains() {
  const summary = summarizeHermesMobileApiRoutes({ public: true });
  assert.equal(summary.total > 70, true);
  assert.equal(summary.byAuthMode.none >= 4, true);
  assert.equal(summary.byAuthMode.ingress, 3);
  assert.equal(summary.byAuthMode.owner > 10, true);
  assert.equal(summary.byGroup.kanban > summary.byGroup.todo, true);
  assert.equal(summary.byGroup.learning >= 1, true);
  assert.equal(summary.byGroup["learning-growth"] >= 1, true);
  assert.equal(summary.byGroup["learning-program"] >= 26, true);
  assert.equal(summary.byGroup["learning-parent-review"] >= 3, true);
  assert.equal(summary.byModule["kanban-study"] >= 4, true);
  assert.equal(summary.byMethod.GET > 20, true);
}

function testGroupingProducesModuleWorkPackages() {
  const groups = groupHermesMobileApiRoutes("moduleKey", { public: true });
  const modules = new Map(groups.map((group) => [group.key, group]));
  assert.ok(modules.has("kanban"));
  assert.ok(modules.has("kanban-study"));
  assert.ok(modules.has("learning-program"));
  assert.ok(modules.has("learning-parent-review"));
  assert.ok(modules.has("learning-coins"));
  assert.ok(modules.has("thread-message"));
  assert.ok(modules.has("single-window"));
  assert.ok(modules.has("group-chat"));
  assert.ok(modules.has("thread-task"));
  assert.ok(modules.has("thread-run"));
  assert.ok(modules.has("directory-share"));
  assert.ok(modules.has("directory-mutation"));
  assert.deepEqual(modules.get("weixin-ingress").authModes, ["ingress"]);
  assert.equal(modules.get("runtime-config").riskLevels.includes("owner"), true);
  assert.equal(JSON.stringify(groups).includes("/api/runtime-config"), false);
}

function testPublicRouteListRedactsPathMatchers() {
  const routes = listHermesMobileApiRoutes({ public: true });
  const ownerRoute = routes.find((route) => route.id === "runtime-config-update");
  const regexRoute = routes.find((route) => route.id === "kanban-card-action");
  assert.equal(Object.hasOwn(ownerRoute, "path"), false);
  assert.equal(Object.hasOwn(regexRoute, "pathRegex"), false);
  assert.equal(ownerRoute.ownerOnly, true);
  assert.equal(ownerRoute.authMode, "owner");
  assert.deepEqual(regexRoute.resourceTypes, ["kanban", "card"]);
}

function testRouteModulesExposeRegistryInventorySurface() {
  const modules = loadRouteModules();
  for (const requiredKey of ROUTE_MODULES.filter((moduleInfo) => moduleInfo.required).map((moduleInfo) => moduleInfo.key)) {
    assert.ok(modules.some(({ moduleInfo }) => moduleInfo.key === requiredKey), `${requiredKey} should be loaded`);
  }

  for (const { moduleInfo, routes } of modules) {
    assert.equal(typeof routes.list, "function", `${moduleInfo.key} must expose list()`);
    assert.equal(typeof routes.summary, "function", `${moduleInfo.key} must expose summary()`);
    assert.equal(typeof routes.match, "function", `${moduleInfo.key} must expose match()`);

    const list = routes.list();
    const publicList = routes.list({ public: true });
    const summary = routes.summary();
    const publicSummary = routes.summary({ public: true });

    assert.equal(Array.isArray(list), true, `${moduleInfo.key} list() must return an array`);
    assert.equal(list.length >= moduleInfo.minRoutes, true, `${moduleInfo.key} should list at least ${moduleInfo.minRoutes} routes`);
    assert.equal(publicList.length, list.length, `${moduleInfo.key} public list should preserve route count`);
    assert.equal(summary.total, list.length, `${moduleInfo.key} summary total should match list length`);
    assert.equal(publicSummary.total, list.length, `${moduleInfo.key} public summary total should match list length`);
    assert.equal(Array.isArray(summary.routes), true, `${moduleInfo.key} summary should include route inventory`);
    assert.equal(Object.keys(summary.byMethod).length > 0, true, `${moduleInfo.key} summary should count methods`);

    const routeIds = new Set(list.map((route) => route.id));
    for (const probe of moduleInfo.probes) {
      if (!routeIds.has(probe.id)) {
        assert.equal(moduleInfo.required, false, `${moduleInfo.key} should include ${probe.id}`);
        continue;
      }
      const matched = routes.match({ method: probe.method, path: probe.path });
      assert.ok(matched, `${moduleInfo.key} should match ${probe.method} ${probe.path}`);
      assert.equal(matched.id, probe.id, `${moduleInfo.key} probe ${probe.method} ${probe.path}`);
    }

    for (const route of list.filter((item) => item.matchType === "exact")) {
      const method = route.method.includes("ALL") ? "GET" : route.method[0];
      assert.equal(routes.match({ method, path: `${route.path}?inventoryProbe=1` }).id, route.id, `${moduleInfo.key} should match ${method} ${route.path}`);
    }

    const validation = validateRouteRegistry(list);
    assert.equal(validation.ok, true, `${moduleInfo.key} route inventory has errors: ${validation.errors.join("; ")}`);
  }
}

function testRouteModuleIdsAndMethodPathsAreUniqueAcrossLoadedModules() {
  const modules = loadRouteModules();
  const allRoutes = modules.flatMap(({ moduleInfo, routes }) => (
    routes.list().map((route) => Object.assign({ sourceModuleKey: moduleInfo.key }, route))
  ));

  const ids = new Map();
  const signatures = new Map();
  for (const route of allRoutes) {
    assert.equal(typeof route.id, "string");
    assert.notEqual(route.id.trim(), "", `${route.sourceModuleKey} route id should not be empty`);
    assert.equal(Array.isArray(route.method), true, `${route.sourceModuleKey}/${route.id} method should be normalized`);
    assert.equal(route.method.length > 0, true, `${route.sourceModuleKey}/${route.id} should have at least one method`);

    assert.equal(ids.has(route.id), false, `duplicate route id ${route.id} in ${ids.get(route.id)} and ${route.sourceModuleKey}`);
    ids.set(route.id, route.sourceModuleKey);

    for (const method of route.method) {
      const signature = `${method} ${matcherSignature(route)}`;
      assert.equal(signatures.has(signature), false, `duplicate route method/path ${signature} in ${signatures.get(signature)} and ${route.sourceModuleKey}/${route.id}`);
      signatures.set(signature, `${route.sourceModuleKey}/${route.id}`);
    }
  }

  const validation = validateRouteRegistry(allRoutes);
  assert.equal(validation.ok, true, `loaded route modules have duplicate registry entries: ${validation.errors.join("; ")}`);
}

testInventoryBuildsAValidRegistry();
testInventoryMatchesCurrentServerRouteShapes();
testLearningProgramInventoryMatchesRouteModuleSpecs();
testSummarySeparatesRuntimeAuthDomains();
testGroupingProducesModuleWorkPackages();
testPublicRouteListRedactsPathMatchers();
testRouteModulesExposeRegistryInventorySurface();
testRouteModuleIdsAndMethodPathsAreUniqueAcrossLoadedModules();
console.log("api-route-inventory tests passed");
