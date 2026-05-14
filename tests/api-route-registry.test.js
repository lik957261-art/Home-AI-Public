"use strict";

const assert = require("node:assert/strict");
const {
  createApiRouteRegistry,
  groupRoutesBy,
  listRoutes,
  matchRoute,
  normalizeRouteSpec,
  routeInventorySummary,
  validateRouteRegistry,
} = require("../adapters/api-route-registry");

function testNormalizeRouteSpec() {
  const route = normalizeRouteSpec({
    id: "kanban-list",
    method: "get",
    path: "/api/kanban/cards",
    group: "kanban",
    riskLevel: "medium",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "kanban", "card"],
  }, 7);

  assert.equal(route.id, "kanban-list");
  assert.deepEqual(route.method, ["GET"]);
  assert.equal(route.matchType, "exact");
  assert.equal(route.path, "/api/kanban/cards");
  assert.equal(route.order, 7);
  assert.equal(route.group, "kanban");
  assert.equal(route.moduleKey, "kanban");
  assert.equal(route.riskLevel, "medium");
  assert.equal(route.authMode, "access-key");
  assert.equal(route.authRequired, true);
  assert.equal(route.workspaceScoped, true);
  assert.deepEqual(route.resourceTypes, ["kanban", "card"]);
  assert.deepEqual(route.tags, []);
}

function testRegistrationOrderAndMethodMatching() {
  const registry = createApiRouteRegistry();
  registry.register({ id: "prefix", method: "GET", pathPrefix: "/api/items", group: "items" });
  registry.register({ id: "exact-post", method: "POST", path: "/api/items", group: "items" });
  registry.register({ id: "exact-get", method: "GET", path: "/api/items", group: "items" });

  assert.deepEqual(registry.list().map((route) => route.id), ["prefix", "exact-post", "exact-get"]);
  assert.equal(registry.match({ method: "GET", path: "/api/items/123" }).id, "prefix");
  assert.equal(registry.match({ method: "POST", path: "/api/items" }).id, "exact-post");
  assert.equal(registry.match({ method: "DELETE", path: "/api/items" }), null);
}

function testExactPrefixAndRegexMatching() {
  const registry = createApiRouteRegistry([
    { id: "status", method: "GET", path: "/api/status", group: "system", riskLevel: "low" },
    { id: "workspace", method: ["GET", "POST"], pathPrefix: "/api/workspaces", group: "workspace", workspaceScoped: true },
    { id: "thread-message", method: "GET", pathRegex: /^\/api\/threads\/[^/]+\/messages$/, group: "thread", resourceTypes: ["thread"] },
  ]);

  assert.equal(matchRoute(registry, { method: "GET", path: "/api/status?workspaceId=owner" }).id, "status");
  assert.equal(registry.match({ method: "POST", path: "/api/workspaces/alpha" }).id, "workspace");
  assert.equal(registry.match({ method: "GET", path: "/api/workspaces-other" }), null);
  assert.equal(registry.match({ method: "GET", path: "/api/threads/t-1/messages" }).id, "thread-message");
  assert.equal(registry.match({ method: "GET", path: "/api/threads/t-1/messages/extra" }), null);
}

function testDuplicateRouteIdRejected() {
  const registry = createApiRouteRegistry([
    { id: "status", method: "GET", path: "/api/status" },
  ]);
  assert.throws(
    () => registry.register({ id: "status", method: "POST", path: "/api/status" }),
    /duplicate route id: status/,
  );
}

function testDuplicateRouteSignatureValidation() {
  const registry = createApiRouteRegistry([
    { id: "status-one", method: "GET", path: "/api/status" },
    { id: "status-two", method: "GET", path: "/api/status" },
  ]);
  const validation = validateRouteRegistry(registry);
  assert.equal(validation.ok, false);
  assert.equal(validation.routeCount, 2);
  assert.match(validation.errors[0], /duplicate route signature: GET exact:\/api\/status/);

  assert.throws(
    () => createApiRouteRegistry([
      { id: "status-one", method: "GET", path: "/api/status" },
      { id: "status-two", method: "GET", path: "/api/status" },
    ], { rejectDuplicateMatchers: true }),
    /duplicate route signature: GET exact:\/api\/status/,
  );
}

function testGroupRoutesByModule() {
  const registry = createApiRouteRegistry([
    { id: "kanban-list", method: "GET", path: "/api/kanban/cards", group: "kanban", moduleKey: "kanban" },
    { id: "kanban-add", method: "POST", path: "/api/kanban/cards", group: "kanban", moduleKey: "kanban", riskLevel: "medium", resourceTypes: ["kanban", "card"] },
    { id: "status", method: "GET", path: "/api/status", group: "system", moduleKey: "status" },
  ]);
  const groups = groupRoutesBy(registry, "moduleKey", { public: true });
  assert.deepEqual(groups.map((group) => group.key), ["kanban", "status"]);
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].methods, ["GET", "POST"]);
  assert.deepEqual(groups[0].resourceTypes, ["card", "kanban"]);
  assert.equal(JSON.stringify(groups).includes("/api/kanban/cards"), false);
}

function testInventorySummaryAndPublicRedaction() {
  const registry = createApiRouteRegistry([
    {
      id: "public-config",
      method: "GET",
      path: "/api/public-config",
      group: "public",
      riskLevel: "public",
      authRequired: false,
    },
    {
      id: "owner-runtime",
      method: "POST",
      pathRegex: /^\/api\/owner\/runtime-config$/,
      group: "owner",
      riskLevel: "owner",
      ownerOnly: true,
      resourceTypes: ["runtime-config"],
    },
  ]);

  const fullRoutes = listRoutes(registry);
  assert.equal(fullRoutes[0].path, "/api/public-config");
  assert.ok(fullRoutes[1].pathRegex instanceof RegExp);

  const publicRoutes = listRoutes(registry, { public: true });
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);
  assert.equal(Object.hasOwn(publicRoutes[1], "pathRegex"), false);
  assert.equal(publicRoutes[1].id, "owner-runtime");
  assert.equal(publicRoutes[1].moduleKey, "owner");
  assert.equal(publicRoutes[1].matchType, "regex");
  assert.equal(publicRoutes[1].riskLevel, "owner");
  assert.equal(publicRoutes[1].authMode, "owner");
  assert.deepEqual(publicRoutes[1].resourceTypes, ["runtime-config"]);

  const summary = routeInventorySummary(registry, { public: true });
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.byGroup, { public: 1, owner: 1 });
  assert.deepEqual(summary.byModule, { public: 1, owner: 1 });
  assert.deepEqual(summary.byRiskLevel, { public: 1, owner: 1 });
  assert.deepEqual(summary.byAuthMode, { none: 1, owner: 1 });
  assert.equal(JSON.stringify(summary).includes("/api/owner/runtime-config"), false);
}

testNormalizeRouteSpec();
testRegistrationOrderAndMethodMatching();
testExactPrefixAndRegexMatching();
testDuplicateRouteIdRejected();
testDuplicateRouteSignatureValidation();
testGroupRoutesByModule();
testInventorySummaryAndPublicRedaction();
console.log("api-route-registry tests passed");
