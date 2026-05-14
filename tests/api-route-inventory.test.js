"use strict";

const assert = require("node:assert/strict");
const {
  createHermesMobileApiRouteInventory,
  groupHermesMobileApiRoutes,
  listHermesMobileApiRouteSpecs,
  listHermesMobileApiRoutes,
  matchHermesMobileApiRoute,
  summarizeHermesMobileApiRoutes,
  validateHermesMobileApiRouteInventory,
} = require("../adapters/api-route-inventory");

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
  assert.equal(matchHermesMobileApiRoute({ method: "PATCH", path: "/api/workspaces/child-a" }).id, "workspaces-admin");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/automations/job-1/pause" }).id, "automations-action");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/kanban/cards/card-1/study-quiz" }).id, "kanban-reading-quiz");
  assert.equal(matchHermesMobileApiRoute({ method: "POST", path: "/api/kanban/cards/card-1/assessment-exam" }).id, "kanban-assessment-exam");
  assert.equal(matchHermesMobileApiRoute({ method: "DELETE", path: "/api/threads/thread-1/tasks/task-1" }).id, "thread-task-delete");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/artifacts/art-1?download=1" }).id, "artifact-read");
  assert.equal(matchHermesMobileApiRoute({ method: "GET", path: "/api/unknown" }), null);
}

function testSummarySeparatesRuntimeAuthDomains() {
  const summary = summarizeHermesMobileApiRoutes({ public: true });
  assert.equal(summary.total > 70, true);
  assert.equal(summary.byAuthMode.none >= 4, true);
  assert.equal(summary.byAuthMode.ingress, 3);
  assert.equal(summary.byAuthMode.owner > 10, true);
  assert.equal(summary.byGroup.kanban > summary.byGroup.todo, true);
  assert.equal(summary.byModule["kanban-study"] >= 4, true);
  assert.equal(summary.byMethod.GET > 20, true);
}

function testGroupingProducesModuleWorkPackages() {
  const groups = groupHermesMobileApiRoutes("moduleKey", { public: true });
  const modules = new Map(groups.map((group) => [group.key, group]));
  assert.ok(modules.has("kanban"));
  assert.ok(modules.has("kanban-study"));
  assert.ok(modules.has("thread-message"));
  assert.ok(modules.has("directory-share"));
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

testInventoryBuildsAValidRegistry();
testInventoryMatchesCurrentServerRouteShapes();
testSummarySeparatesRuntimeAuthDomains();
testGroupingProducesModuleWorkPackages();
testPublicRouteListRedactsPathMatchers();
console.log("api-route-inventory tests passed");
