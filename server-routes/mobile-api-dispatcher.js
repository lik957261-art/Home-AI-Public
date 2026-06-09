"use strict";

const WEIXIN_INGRESS_PATH_PREFIX = "/api/ingress/weixin/";
const EMBEDDED_PLUGIN_PROXY_PATH_REGEX = /^\/api\/hermes-plugins\/[^/]+\/proxy(?:\/|$)/;
const PRE_AUTH_SYSTEM_PATHS = Object.freeze(new Set([
  "/api/client-version",
]));

const MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE = Object.freeze([
  Object.freeze({ key: "systemApiRoutes", passAuth: false }),
  Object.freeze({ key: "weixinApiRoutes", passAuth: true }),
  Object.freeze({ key: "ownerElevationApiRoutes", passAuth: false }),
  Object.freeze({ key: "runtimeConfigApiRoutes", passAuth: false }),
  Object.freeze({ key: "pushApiRoutes", passAuth: false }),
  Object.freeze({ key: "workspaceApiRoutes", passAuth: true }),
  Object.freeze({ key: "workspaceOnboardingApiRoutes", passAuth: true }),
  Object.freeze({ key: "platformCurrencyApiRoutes", passAuth: true }),
  Object.freeze({ key: "familyProfileApiRoutes", passAuth: true }),
  Object.freeze({ key: "accessKeyApiRoutes", passAuth: true }),
  Object.freeze({ key: "resourceApiRoutes", passAuth: true }),
  Object.freeze({ key: "hermesPluginApiRoutes", passAuth: true }),
  Object.freeze({ key: "pluginTopicUsageApiRoutes", passAuth: true }),
  Object.freeze({ key: "noteReceiptApiRoutes", passAuth: true }),
  Object.freeze({ key: "actionInboxApiRoutes", passAuth: true }),
  Object.freeze({ key: "automationApiRoutes", passAuth: true }),
  Object.freeze({ key: "todoApiRoutes", passAuth: true }),
  Object.freeze({ key: "kanbanCardApiRoutes", passAuth: true }),
  Object.freeze({ key: "kanbanStudyApiRoutes", passAuth: true }),
  Object.freeze({ key: "kanbanLearningGuidanceApiRoutes", passAuth: true }),
  Object.freeze({ key: "learningApiRoutes", passAuth: true }),
  Object.freeze({ key: "learningGrowthCardApiRoutes", passAuth: true }),
  Object.freeze({ key: "learningProgramApiRoutes", passAuth: true }),
  Object.freeze({ key: "learningParentReviewApiRoutes", passAuth: true }),
  Object.freeze({ key: "learningCoinApiRoutes", passAuth: true }),
  Object.freeze({ key: "fileArtifactApiRoutes", passAuth: true }),
  Object.freeze({ key: "directoryBrowserApiRoutes", passAuth: true }),
  Object.freeze({ key: "directoryShareApiRoutes", passAuth: true }),
  Object.freeze({ key: "directoryMutationApiRoutes", passAuth: true }),
  Object.freeze({ key: "threadReadUploadApiRoutes", passAuth: true }),
  Object.freeze({ key: "threadTaskApiRoutes", passAuth: true }),
  Object.freeze({ key: "singleWindowGroupChatApiRoutes", passAuth: true }),
  Object.freeze({ key: "threadMessageRunApiRoutes", passAuth: true }),
]);

const MOBILE_API_AUTHENTICATED_ROUTE_KEYS = Object.freeze(
  MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.map((entry) => entry.key),
);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`mobile api dispatcher requires ${name}`);
  return deps[name];
}

function ensureRouteHandler(deps, key) {
  const routes = deps[key];
  if (!routes || typeof routes.handle !== "function") {
    throw new Error(`mobile api dispatcher requires ${key}.handle`);
  }
  return routes;
}

function normalizeAuthenticatedRouteEntry(deps, entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("mobile api dispatcher authenticated route entries must be objects");
  }
  const key = String(entry.key || "").trim();
  if (!key) throw new Error("mobile api dispatcher authenticated route entries require key");
  return {
    key,
    passAuth: Boolean(entry.passAuth),
    routes: ensureRouteHandler(deps, key),
  };
}

function routeWasHandled(result) {
  return Boolean(result && result.handled);
}

function createRequestContextInput(req, auth, url, requestClientVersion) {
  const headers = req.headers || {};
  return {
    auth,
    url,
    request: {
      method: req.method,
      headers,
      requestId: headers["x-request-id"] || "",
      clientVersion: requestClientVersion(req),
    },
  };
}

function createMobileApiDispatcher(deps = {}) {
  const getUrl = ensureFunction(deps, "getUrl");
  const attachClientVersionHeaders = ensureFunction(deps, "attachClientVersionHeaders");
  const authenticateRequest = ensureFunction(deps, "authenticateRequest");
  const buildRequestContext = ensureFunction(deps, "buildRequestContext");
  const requestClientVersion = ensureFunction(deps, "requestClientVersion");
  const sendJson = ensureFunction(deps, "sendJson");

  const publicApiRoutes = ensureRouteHandler(deps, "publicApiRoutes");
  const weixinApiRoutes = ensureRouteHandler(deps, "weixinApiRoutes");
  const systemApiRoutes = ensureRouteHandler(deps, "systemApiRoutes");
  const authenticatedRoutes = (deps.authenticatedRoutePipeline || MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE)
    .map((entry) => normalizeAuthenticatedRouteEntry(deps, entry));

  async function handleApi(req, res) {
    const url = getUrl(req);
    attachClientVersionHeaders(req, res);

    const publicResult = await publicApiRoutes.handle(req, res, url);
    if (routeWasHandled(publicResult)) return publicResult;

    if (url.pathname.startsWith(WEIXIN_INGRESS_PATH_PREFIX)) {
      const ingressResult = await weixinApiRoutes.handle(req, res, url);
      if (routeWasHandled(ingressResult)) return ingressResult;
    }

    if (EMBEDDED_PLUGIN_PROXY_PATH_REGEX.test(url.pathname)) {
      const proxyResult = await deps.hermesPluginApiRoutes.handle(req, res, url);
      if (routeWasHandled(proxyResult)) return proxyResult;
    }

    if (PRE_AUTH_SYSTEM_PATHS.has(url.pathname)) {
      const systemResult = await systemApiRoutes.handle(req, res, url);
      if (routeWasHandled(systemResult)) return systemResult;
    }

    const auth = authenticateRequest(req);
    if (!auth.ok) {
      sendJson(res, 401, { error: "Unauthorized" });
      return { handled: true, status: 401, auth };
    }

    req.hermesRequestContext = buildRequestContext(
      createRequestContextInput(req, auth, url, requestClientVersion),
    );

    for (const entry of authenticatedRoutes) {
      const result = entry.passAuth
        ? await entry.routes.handle(req, res, url, { auth })
        : await entry.routes.handle(req, res, url);
      if (routeWasHandled(result)) return result;
    }

    sendJson(res, 404, { error: "Not found" });
    return { handled: true, status: 404 };
  }

  return {
    handle: handleApi,
    handleApi,
    authenticatedRouteKeys: authenticatedRoutes.map((entry) => entry.key),
  };
}

module.exports = {
  EMBEDDED_PLUGIN_PROXY_PATH_REGEX,
  WEIXIN_INGRESS_PATH_PREFIX,
  MOBILE_API_AUTHENTICATED_ROUTE_KEYS,
  MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE,
  PRE_AUTH_SYSTEM_PATHS,
  createMobileApiDispatcher,
};
