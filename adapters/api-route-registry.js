"use strict";

const RISK_LEVELS = new Set(["public", "low", "medium", "high", "owner"]);
const AUTH_MODES = new Set(["none", "access-key", "owner", "ingress", "internal"]);

function uniqStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeMethods(method) {
  if (method == null) return ["ALL"];
  const values = Array.isArray(method) ? method : [method];
  const methods = uniqStrings(values).map((value) => value.toUpperCase());
  return methods.length ? methods : ["ALL"];
}

function normalizeRouteAuthMode(spec, riskLevel) {
  const explicit = String(spec.authMode || "").trim();
  if (explicit) {
    if (!AUTH_MODES.has(explicit)) throw new Error(`unsupported route authMode: ${explicit}`);
    return explicit;
  }
  if (spec.authRequired === false || riskLevel === "public") return "none";
  if (spec.ownerOnly || riskLevel === "owner") return "owner";
  return "access-key";
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
  const authMode = normalizeRouteAuthMode(spec, riskLevel);

  return Object.freeze({
    id,
    order: Number.isInteger(spec.order) ? spec.order : index,
    method: normalizeMethods(spec.method ?? spec.methods),
    group: String(spec.group || "default").trim() || "default",
    moduleKey: String(spec.moduleKey || spec.module || spec.group || "default").trim() || "default",
    handlerKey: String(spec.handlerKey || spec.handler || "").trim(),
    summary: String(spec.summary || "").trim(),
    riskLevel,
    authMode,
    authRequired: spec.authRequired !== false,
    ownerOnly: Boolean(spec.ownerOnly),
    workspaceScoped: Boolean(spec.workspaceScoped),
    resourceTypes: Object.freeze(uniqStrings(spec.resourceTypes)),
    tags: Object.freeze(uniqStrings(spec.tags)),
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
    moduleKey: route.moduleKey,
    handlerKey: route.handlerKey,
    summary: route.summary,
    matchType: route.matchType,
    riskLevel: route.riskLevel,
    authMode: route.authMode,
    authRequired: route.authRequired,
    ownerOnly: route.ownerOnly,
    workspaceScoped: route.workspaceScoped,
    resourceTypes: [...route.resourceTypes],
    tags: [...route.tags],
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
  const byModule = {};
  const byRiskLevel = {};
  const byAuthMode = {};
  const byMethod = {};
  for (const route of routes) {
    byGroup[route.group] = (byGroup[route.group] || 0) + 1;
    byModule[route.moduleKey] = (byModule[route.moduleKey] || 0) + 1;
    byRiskLevel[route.riskLevel] = (byRiskLevel[route.riskLevel] || 0) + 1;
    byAuthMode[route.authMode] = (byAuthMode[route.authMode] || 0) + 1;
    for (const method of route.method) byMethod[method] = (byMethod[method] || 0) + 1;
  }
  return {
    total: routes.length,
    byGroup,
    byModule,
    byRiskLevel,
    byAuthMode,
    byMethod,
    routes,
  };
}

function routeMatcherKey(route) {
  if (route.matchType === "exact") return `exact:${route.path}`;
  if (route.matchType === "prefix") return `prefix:${route.pathPrefix}`;
  return `regex:${route.pathRegex.source}:${route.pathRegex.flags}`;
}

function routeSignatures(route) {
  const matcher = routeMatcherKey(route);
  return route.method.map((method) => `${method} ${matcher}`);
}

function groupRoutesBy(registryOrRoutes, field = "group", options = {}) {
  const routes = listRoutes(registryOrRoutes, { public: Boolean(options.public) });
  const groups = new Map();
  for (const route of routes) {
    const key = String(route[field] || "default");
    const current = groups.get(key) || {
      key,
      count: 0,
      methods: new Set(),
      riskLevels: new Set(),
      authModes: new Set(),
      resourceTypes: new Set(),
      routes: [],
    };
    current.count += 1;
    for (const method of route.method) current.methods.add(method);
    current.riskLevels.add(route.riskLevel);
    current.authModes.add(route.authMode);
    for (const type of route.resourceTypes) current.resourceTypes.add(type);
    current.routes.push(route);
    groups.set(key, current);
  }
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({
      key: group.key,
      count: group.count,
      methods: [...group.methods].sort(),
      riskLevels: [...group.riskLevels].sort(),
      authModes: [...group.authModes].sort(),
      resourceTypes: [...group.resourceTypes].sort(),
      routes: group.routes,
    }));
}

function validateRouteRegistry(registryOrRoutes) {
  const routes = listRoutes(registryOrRoutes);
  const ids = new Set();
  const signatures = new Map();
  const errors = [];
  for (const route of routes) {
    if (ids.has(route.id)) errors.push(`duplicate route id: ${route.id}`);
    ids.add(route.id);
    for (const signature of routeSignatures(route)) {
      const existing = signatures.get(signature);
      if (existing) errors.push(`duplicate route signature: ${signature} (${existing} vs ${route.id})`);
      signatures.set(signature, route.id);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    routeCount: routes.length,
    signatureCount: signatures.size,
  };
}

function createApiRouteRegistry(initialRoutes = [], options = {}) {
  const routes = [];
  const ids = new Set();
  const signatures = new Map();

  function register(spec) {
    const route = normalizeRouteSpec(spec, routes.length);
    if (ids.has(route.id)) throw new Error(`duplicate route id: ${route.id}`);
    if (options.rejectDuplicateMatchers) {
      for (const signature of routeSignatures(route)) {
        const existing = signatures.get(signature);
        if (existing) throw new Error(`duplicate route signature: ${signature} (${existing} vs ${route.id})`);
      }
    }
    ids.add(route.id);
    for (const signature of routeSignatures(route)) signatures.set(signature, route.id);
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
    groups(field, options) {
      return groupRoutesBy(routes, field, options);
    },
    validate() {
      return validateRouteRegistry(routes);
    },
  };
}

module.exports = {
  createApiRouteRegistry,
  normalizeRouteSpec,
  matchRoute,
  listRoutes,
  routeInventorySummary,
  groupRoutesBy,
  validateRouteRegistry,
};
