"use strict";

const RISK_LEVELS = new Set(["public", "low", "medium", "high", "owner"]);

function uniqStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeMethods(method) {
  if (method == null) return ["ALL"];
  const values = Array.isArray(method) ? method : [method];
  const methods = uniqStrings(values).map((value) => value.toUpperCase());
  return methods.length ? methods : ["ALL"];
}

function normalizePathSpec(spec) {
  const hasExact = Object.hasOwn(spec, "path") && typeof spec.path === "string";
  const hasPrefix = Object.hasOwn(spec, "pathPrefix") || Object.hasOwn(spec, "prefix");
  const hasRegex = spec.path instanceof RegExp || spec.pathRegex instanceof RegExp || spec.regex instanceof RegExp;
  const matcherCount = [hasExact, hasPrefix, hasRegex].filter(Boolean).length;
  if (matcherCount !== 1) {
    throw new Error("route spec must declare exactly one path matcher");
  }
  if (hasExact) {
    const path = String(spec.path || "").trim();
    if (!path.startsWith("/")) throw new Error("exact route path must start with /");
    return { matchType: "exact", path };
  }
  if (hasPrefix) {
    const pathPrefix = String(spec.pathPrefix ?? spec.prefix ?? "").trim();
    if (!pathPrefix.startsWith("/")) throw new Error("route path prefix must start with /");
    return { matchType: "prefix", pathPrefix };
  }
  const regex = spec.path instanceof RegExp ? spec.path : (spec.pathRegex || spec.regex);
  return { matchType: "regex", pathRegex: regex };
}

function normalizeRouteSpec(spec, index = 0) {
  if (!spec || typeof spec !== "object") throw new Error("route spec must be an object");
  const id = String(spec.id || "").trim();
  if (!id) throw new Error("route spec requires an id");
  const pathSpec = normalizePathSpec(spec);
  const riskLevel = String(spec.riskLevel || (spec.authRequired === false ? "public" : "low")).trim();
  if (!RISK_LEVELS.has(riskLevel)) throw new Error(`unsupported route riskLevel: ${riskLevel}`);

  return Object.freeze({
    id,
    order: Number.isInteger(spec.order) ? spec.order : index,
    method: normalizeMethods(spec.method ?? spec.methods),
    group: String(spec.group || "default").trim() || "default",
    riskLevel,
    authRequired: spec.authRequired !== false,
    ownerOnly: Boolean(spec.ownerOnly),
    workspaceScoped: Boolean(spec.workspaceScoped),
    resourceTypes: Object.freeze(uniqStrings(spec.resourceTypes)),
    ...pathSpec,
  });
}

function methodMatches(route, method) {
  const normalized = String(method || "GET").toUpperCase();
  return route.method.includes("ALL") || route.method.includes(normalized);
}

function pathMatches(route, path) {
  const value = String(path || "").split("?")[0] || "/";
  if (route.matchType === "exact") return value === route.path;
  if (route.matchType === "prefix") return value === route.pathPrefix || value.startsWith(route.pathPrefix.endsWith("/") ? route.pathPrefix : `${route.pathPrefix}/`);
  route.pathRegex.lastIndex = 0;
  return route.pathRegex.test(value);
}

function matchRoute(routes, request) {
  const routeList = Array.isArray(routes) ? routes : listRoutes(routes);
  const method = typeof request === "string" ? "GET" : request?.method;
  const path = typeof request === "string" ? request : request?.path;
  return routeList.find((route) => methodMatches(route, method) && pathMatches(route, path)) || null;
}

function redactRoute(route) {
  return {
    id: route.id,
    order: route.order,
    method: [...route.method],
    group: route.group,
    matchType: route.matchType,
    riskLevel: route.riskLevel,
    authRequired: route.authRequired,
    ownerOnly: route.ownerOnly,
    workspaceScoped: route.workspaceScoped,
    resourceTypes: [...route.resourceTypes],
  };
}

function fullRoute(route) {
  const out = redactRoute(route);
  if (route.matchType === "exact") out.path = route.path;
  if (route.matchType === "prefix") out.pathPrefix = route.pathPrefix;
  if (route.matchType === "regex") out.pathRegex = route.pathRegex;
  return out;
}

function listRoutes(registryOrRoutes, options = {}) {
  const source = Array.isArray(registryOrRoutes) ? registryOrRoutes : registryOrRoutes?._routes;
  const routes = [...(source || [])].sort((a, b) => a.order - b.order);
  return routes.map((route) => options.public ? redactRoute(route) : fullRoute(route));
}

function routeInventorySummary(registryOrRoutes, options = {}) {
  const routes = listRoutes(registryOrRoutes, { public: Boolean(options.public) });
  const byGroup = {};
  const byRiskLevel = {};
  const byMethod = {};
  for (const route of routes) {
    byGroup[route.group] = (byGroup[route.group] || 0) + 1;
    byRiskLevel[route.riskLevel] = (byRiskLevel[route.riskLevel] || 0) + 1;
    for (const method of route.method) byMethod[method] = (byMethod[method] || 0) + 1;
  }
  return {
    total: routes.length,
    byGroup,
    byRiskLevel,
    byMethod,
    routes,
  };
}

function createApiRouteRegistry(initialRoutes = []) {
  const routes = [];
  const ids = new Set();

  function register(spec) {
    const route = normalizeRouteSpec(spec, routes.length);
    if (ids.has(route.id)) throw new Error(`duplicate route id: ${route.id}`);
    ids.add(route.id);
    routes.push(route);
    return route;
  }

  for (const spec of initialRoutes) register(spec);

  return {
    _routes: routes,
    register,
    match(request) {
      return matchRoute(routes, request);
    },
    list(options) {
      return listRoutes(routes, options);
    },
    summary(options) {
      return routeInventorySummary(routes, options);
    },
  };
}

module.exports = {
  createApiRouteRegistry,
  normalizeRouteSpec,
  matchRoute,
  listRoutes,
  routeInventorySummary,
};
