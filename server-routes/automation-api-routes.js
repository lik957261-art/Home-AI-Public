"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const AUTOMATION_API_ROUTE_SPECS = Object.freeze([
  {
    id: "automations-list",
    method: "GET",
    path: "/api/automations",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "listAutomations",
    summary: "List CRON automation jobs visible to a workspace.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation"],
    tags: ["automation", "list"],
  },
  {
    id: "automations-create",
    method: "POST",
    path: "/api/automations",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "createAutomation",
    summary: "Create an automation job from a natural-language request.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation"],
    tags: ["automation", "create"],
  },
  {
    id: "automations-action",
    method: "POST",
    pathRegex: /^\/api\/automations\/[^/]+\/(?:delete|pause|resume|run|update)$/,
    group: "automation",
    moduleKey: "automation",
    handlerKey: "mutateAutomation",
    summary: "Mutate one workspace-scoped automation job.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation"],
    tags: ["automation", "mutate"],
  },
  {
    id: "automations-push-tick",
    method: "POST",
    path: "/api/automations/push/tick",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "pushTick",
    summary: "Run an Owner-only automation Web Push tick.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["automation", "web-push"],
    tags: ["automation", "push", "owner"],
  },
  {
    id: "automations-deliverable",
    method: "GET",
    path: "/api/automations/deliverable",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "deliverable",
    summary: "Read an authorized automation deliverable.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
    tags: ["automation", "deliverable"],
  },
  {
    id: "automations-deliverable-preview",
    method: "GET",
    path: "/api/automations/deliverable/preview",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "deliverablePreview",
    summary: "Preview an authorized automation deliverable.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
    tags: ["automation", "deliverable", "preview"],
  },
  {
    id: "automations-output",
    method: "GET",
    path: "/api/automations/output",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "output",
    summary: "Read an authorized automation output file.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
    tags: ["automation", "output"],
  },
  {
    id: "automations-output-preview",
    method: "GET",
    path: "/api/automations/output/preview",
    group: "automation",
    moduleKey: "automation",
    handlerKey: "outputPreview",
    summary: "Preview an authorized automation output file.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
    tags: ["automation", "output", "preview"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`automation api routes require ${name}`);
  }
}

function compactError(deps, err) {
  return deps.compactText(err?.message || String(err), 800);
}

function automationActionFromPath(pathname) {
  const match = String(pathname || "").match(/^\/api\/automations\/([^/]+)\/(delete|pause|resume|run|update)$/);
  if (!match) return null;
  return {
    jobId: decodeURIComponent(match[1] || ""),
    action: match[2],
  };
}

function automationListDetailLevel(url) {
  const raw = String(url?.searchParams?.get("detail") || url?.searchParams?.get("fields") || "full")
    .trim()
    .toLowerCase();
  return ["summary", "list", "light"].includes(raw) ? "summary" : "full";
}

function automationSummarySort(left, right) {
  const leftNext = Date.parse(left?.nextRunAt || "");
  const rightNext = Date.parse(right?.nextRunAt || "");
  const leftHasNext = Number.isFinite(leftNext);
  const rightHasNext = Number.isFinite(rightNext);
  if (leftHasNext !== rightHasNext) return leftHasNext ? -1 : 1;
  if (leftHasNext && rightHasNext && leftNext !== rightNext) return leftNext - rightNext;
  return String(left?.name || left?.id || "").localeCompare(String(right?.name || right?.id || ""));
}

function createAutomationApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "automationListSortByLatestDeliverable",
    "boolParam",
    "clearCronListCache",
    "compactText",
    "cronJobMatchesOwner",
    "cronJobMatchesSearch",
    "findWorkspace",
    "interpretAutomationNaturalLanguage",
    "readBody",
    "requireOwner",
    "requireWorkspaceAccess",
    "resolveAuthorizedCronDeliverableFile",
    "resolveAuthorizedCronOutputFile",
    "runAutomationWebPushTick",
    "runCronListBridgeCached",
    "sanitizePolicy",
    "sendJson",
    "sendResolvedBridgeFile",
    "sendResolvedBridgeFilePreview",
    "sendResolvedFile",
    "sendResolvedFilePreview",
    "workspacePrincipal",
  ]);
  if (!deps.automationProvider || typeof deps.automationProvider.createJob !== "function" || typeof deps.automationProvider.mutateJob !== "function") {
    throw new Error("automation api routes require automationProvider.createJob/mutateJob");
  }

  const registry = createApiRouteRegistry(AUTOMATION_API_ROUTE_SPECS);

  function requestedWorkspaceId(url, body = null) {
    return body?.workspaceId || url?.searchParams?.get("workspaceId") || "owner";
  }

  async function handleList(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    const ownerPrincipalId = deps.workspacePrincipal(workspaceId);
    const requestedLimit = Number(url.searchParams.get("limit") || "200");
    const includeDisabled = deps.boolParam(url.searchParams.get("includeDisabled") || "1");
    const bypassCache = deps.boolParam(url.searchParams.get("refresh") || url.searchParams.get("fresh"));
    const detail = automationListDetailLevel(url);
    let result;
    try {
      result = await deps.runCronListBridgeCached({ includeDisabled, bypassCache, ownerPrincipalId, detail });
    } catch (err) {
      deps.sendJson(res, 200, {
        data: [],
        source: { name: "hermes_cron", available: false, jobCount: 0, workspaceId, ownerPrincipalId },
        warning: compactError(deps, err),
      });
      return;
    }
    if (!result.ok) {
      deps.sendJson(res, 200, {
        data: [],
        source: Object.assign({}, result.source || { name: "hermes_cron", available: false }, {
          jobCount: 0,
          workspaceId,
          ownerPrincipalId,
        }),
        warning: deps.compactText(result.error || "Hermes CRON bridge failed", 800),
      });
      return;
    }
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
    let jobs = (result.jobs || [])
      .filter((job) => deps.cronJobMatchesOwner(job, ownerPrincipalId))
      .filter((job) => deps.cronJobMatchesSearch(job, search))
      .sort(detail === "summary" ? automationSummarySort : deps.automationListSortByLatestDeliverable);
    if (requestedLimit > 0) jobs = jobs.slice(0, requestedLimit);
    deps.sendJson(res, 200, {
      data: jobs,
      source: Object.assign({}, result.source || { name: "hermes_cron", available: true }, {
        detailLevel: detail,
        jobCount: jobs.length,
        totalJobCount: result.source?.jobCount ?? (result.jobs || []).length,
        workspaceId,
        ownerPrincipalId,
      }),
      warning: result.warning || "",
    });
  }

  async function handleCreate(req, res) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const workspace = deps.findWorkspace(workspaceId);
    const text = String(body.text || body.prompt || "").trim();
    if (!text) {
      deps.sendJson(res, 400, { error: "Automation description is required" });
      return;
    }
    const ownerPrincipalId = deps.workspacePrincipal(workspaceId);
    let draft;
    try {
      draft = await deps.interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId);
    } catch (err) {
      deps.sendJson(res, err.status || 502, { error: compactError(deps, err) });
      return;
    }
    const dryRun = deps.boolParam(body.dryRun || body.dry_run);
    let result;
    try {
      result = await deps.automationProvider.createJob({
        dryRun,
        text,
        job: draft,
        ownerPrincipalId,
        accessPolicyContext: deps.sanitizePolicy(workspace.policy || {}),
      });
    } catch (err) {
      deps.sendJson(res, err.status || 500, { error: compactError(deps, err), draft });
      return;
    }
    if (!result.ok) {
      deps.sendJson(res, 400, { error: deps.compactText(result.error || "Hermes CRON create failed", 800), draft, result });
      return;
    }
    if (!dryRun) deps.clearCronListCache();
    deps.sendJson(res, dryRun ? 200 : 201, {
      ok: true,
      job: result.job,
      draft,
      source: Object.assign({}, result.source || {}, { workspaceId, ownerPrincipalId, interpreter: "hermes_model" }),
      dryRun,
    });
  }

  async function handleAction(req, res, url) {
    const parsed = automationActionFromPath(url.pathname);
    if (!parsed) return false;
    const { jobId, action } = parsed;
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return true;
    if (!jobId) {
      deps.sendJson(res, 400, { error: "Automation job id is required" });
      return true;
    }
    const ownerPrincipalId = deps.workspacePrincipal(workspaceId);
    const dryRun = deps.boolParam(body.dryRun ?? body.dry_run ?? url.searchParams.get("dryRun"));
    const patch = action === "update" ? {
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule,
      deliver: body.deliver,
      skills: body.skills,
      enabled_toolsets: body.enabled_toolsets || body.enabledToolsets,
      model: body.model,
      provider: body.provider,
      workdir: body.workdir,
    } : {};
    let result;
    try {
      result = await deps.automationProvider.mutateJob({
        action,
        jobId,
        ownerPrincipalId,
        dryRun,
        patch,
        reason: String(body.reason || ""),
      });
    } catch (err) {
      deps.sendJson(res, err.status || 500, { error: compactError(deps, err) });
      return true;
    }
    if (!result.ok) {
      deps.sendJson(res, result.status || 400, { error: deps.compactText(result.error || "Hermes CRON action failed", 800), result });
      return true;
    }
    if (!dryRun) deps.clearCronListCache();
    deps.sendJson(res, 200, {
      ok: true,
      job: result.job || null,
      deletedJob: result.deletedJob || null,
      source: Object.assign({}, result.source || {}, { workspaceId, ownerPrincipalId }),
      dryRun,
    });
    return true;
  }

  async function handlePushTick(req, res, url) {
    if (!deps.requireOwner(req, res)) return;
    const body = await deps.readBody(req).catch(() => ({}));
    const result = await deps.runAutomationWebPushTick({
      dryRun: deps.boolParam(body.dryRun ?? body.dry_run ?? url.searchParams.get("dryRun")),
      includeInitial: deps.boolParam(body.includeInitial ?? body.include_initial ?? url.searchParams.get("includeInitial")),
      limit: Number(body.limit || url.searchParams.get("limit") || 100),
    });
    deps.sendJson(res, 200, result);
  }

  async function sendResolvedAutomationFile(res, url, resolveFile, options = {}) {
    const resolved = await resolveFile(url.searchParams, options.auth);
    if (resolved.bridgeFile) {
      if (options.preview) deps.sendResolvedBridgeFilePreview(res, resolved.bridgeFile);
      else deps.sendResolvedBridgeFile(res, resolved.bridgeFile, url.searchParams);
      return;
    }
    if (!resolved.file) {
      deps.sendJson(res, resolved.status || 404, { error: resolved.error || options.notFoundMessage });
      return;
    }
    if (options.preview) deps.sendResolvedFilePreview(res, resolved.file);
    else deps.sendResolvedFile(res, resolved.file, url.searchParams);
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "automations-list") await handleList(req, res, url);
    else if (route.id === "automations-create") await handleCreate(req, res);
    else if (route.id === "automations-action") await handleAction(req, res, url);
    else if (route.id === "automations-push-tick") await handlePushTick(req, res, url);
    else if (route.id === "automations-deliverable") {
      await sendResolvedAutomationFile(res, url, deps.resolveAuthorizedCronDeliverableFile, {
        auth: context.auth,
        notFoundMessage: "Automation deliverable not found",
      });
    } else if (route.id === "automations-deliverable-preview") {
      await sendResolvedAutomationFile(res, url, deps.resolveAuthorizedCronDeliverableFile, {
        auth: context.auth,
        preview: true,
        notFoundMessage: "Automation deliverable not found",
      });
    } else if (route.id === "automations-output") {
      await sendResolvedAutomationFile(res, url, deps.resolveAuthorizedCronOutputFile, {
        auth: context.auth,
        notFoundMessage: "Automation output not found",
      });
    } else if (route.id === "automations-output-preview") {
      await sendResolvedAutomationFile(res, url, deps.resolveAuthorizedCronOutputFile, {
        auth: context.auth,
        preview: true,
        notFoundMessage: "Automation output not found",
      });
    } else {
      return { handled: false };
    }

    return { handled: true, route, auth: context.auth };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  AUTOMATION_API_ROUTE_SPECS,
  createAutomationApiRoutes,
};
