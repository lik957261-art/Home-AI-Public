"use strict";

const {
  createApiRouteRegistry,
  groupRoutesBy,
  listRoutes,
  matchRoute,
  routeInventorySummary,
  validateRouteRegistry,
} = require("./api-route-registry");

function exact(id, method, path, group, options = {}) {
  return Object.freeze(Object.assign({ id, method, path, group }, options));
}

function regex(id, method, pathRegex, group, options = {}) {
  return Object.freeze(Object.assign({ id, method, pathRegex, group }, options));
}

function routeOptions(moduleKey, options = {}) {
  return Object.assign({ moduleKey }, options);
}

const HERMES_MOBILE_API_ROUTE_SPECS = Object.freeze([
  exact("public-config", "ALL", "/api/public-config", "public", routeOptions("public-config", {
    riskLevel: "public",
    authRequired: false,
    summary: "Public bootstrap config and owner setup state.",
    resourceTypes: ["config"],
  })),
  exact("setup-status", "GET", "/api/setup/status", "setup", routeOptions("setup", {
    riskLevel: "public",
    authRequired: false,
    resourceTypes: ["setup"],
  })),
  exact("setup-owner", "POST", "/api/setup/owner", "setup", routeOptions("setup", {
    riskLevel: "public",
    authRequired: false,
    resourceTypes: ["access-key", "setup"],
  })),
  exact("login", "POST", "/api/login", "auth", routeOptions("auth", {
    riskLevel: "public",
    authRequired: false,
    resourceTypes: ["access-key"],
  })),
  exact("weixin-ingress-events", "POST", "/api/ingress/weixin/events", "ingress", routeOptions("weixin-ingress", {
    riskLevel: "high",
    authMode: "ingress",
    resourceTypes: ["weixin", "message"],
  })),
  exact("weixin-ingress-outbound", "GET", "/api/ingress/weixin/outbound", "ingress", routeOptions("weixin-ingress", {
    riskLevel: "high",
    authMode: "ingress",
    resourceTypes: ["weixin", "delivery"],
  })),
  regex("weixin-ingress-outbound-ack", "POST", /^\/api\/ingress\/weixin\/outbound\/[^/]+\/ack$/, "ingress", routeOptions("weixin-ingress", {
    riskLevel: "high",
    authMode: "ingress",
    resourceTypes: ["weixin", "delivery"],
  })),

  exact("client-version", "GET", "/api/client-version", "system", routeOptions("system-status", {
    resourceTypes: ["client-version"],
  })),
  exact("app-update-status", "GET", "/api/app-update/status", "owner", routeOptions("app-update", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["app-update"],
  })),
  exact("app-update-apply", "POST", "/api/app-update/apply", "owner", routeOptions("app-update", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["app-update"],
  })),
  exact("status", "GET", "/api/status", "system", routeOptions("system-status", {
    resourceTypes: ["status", "gateway-pool"],
  })),
  exact("weixin-forward-targets", "GET", "/api/weixin/forward-targets", "weixin", routeOptions("weixin-forwarding", {
    workspaceScoped: true,
    resourceTypes: ["weixin", "workspace"],
  })),
  exact("weixin-forward-file", "POST", "/api/weixin/forward-file", "weixin", routeOptions("weixin-forwarding", {
    workspaceScoped: true,
    resourceTypes: ["weixin", "file", "delivery"],
    riskLevel: "medium",
  })),

  exact("owner-elevation-status", "GET", "/api/owner-elevation", "owner-elevation", routeOptions("owner-elevation", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
  })),
  exact("owner-elevation-grant-once", "POST", "/api/owner-elevation/once", "owner-elevation", routeOptions("owner-elevation", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
  })),
  exact("owner-elevation-grant", "POST", "/api/owner-elevation", "owner-elevation", routeOptions("owner-elevation", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
  })),
  exact("owner-elevation-revoke", "DELETE", "/api/owner-elevation", "owner-elevation", routeOptions("owner-elevation", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
  })),

  exact("runtime-config-read", "GET", "/api/runtime-config", "runtime-config", routeOptions("runtime-config", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["runtime-config"],
  })),
  exact("runtime-config-update", "PATCH", "/api/runtime-config", "runtime-config", routeOptions("runtime-config", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["runtime-config"],
  })),
  exact("runtime-config-web-push-generate", "POST", "/api/runtime-config/web-push/generate", "runtime-config", routeOptions("runtime-config", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["runtime-config", "web-push"],
  })),
  exact("runtime-config-web-push-reload", "POST", "/api/runtime-config/web-push/reload", "runtime-config", routeOptions("runtime-config", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["runtime-config", "web-push"],
  })),
  exact("runtime-config-test", "POST", "/api/runtime-config/test", "runtime-config", routeOptions("runtime-config", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["runtime-config", "gateway"],
  })),

  exact("push-vapid-public-key", "GET", "/api/push/vapid-public-key", "push", routeOptions("push", {
    resourceTypes: ["web-push"],
  })),
  exact("push-receipt-create", "POST", "/api/push/receipt", "push", routeOptions("push", {
    resourceTypes: ["web-push", "receipt"],
  })),
  exact("push-receipts-list", "GET", "/api/push/receipts", "push", routeOptions("push", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["web-push", "receipt"],
  })),
  exact("push-deliveries-list", "GET", "/api/push/deliveries", "push", routeOptions("push", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["web-push", "delivery"],
  })),
  exact("push-subscribe", "POST", "/api/push/subscribe", "push", routeOptions("push", {
    workspaceScoped: true,
    resourceTypes: ["web-push", "workspace"],
  })),
  exact("push-unsubscribe", "POST", "/api/push/unsubscribe", "push", routeOptions("push", {
    workspaceScoped: true,
    resourceTypes: ["web-push", "workspace"],
  })),
  exact("push-test", "POST", "/api/push/test", "push", routeOptions("push", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["web-push"],
  })),

  exact("workspaces-list", "GET", "/api/workspaces", "workspace-admin", routeOptions("workspace-admin", {
    resourceTypes: ["workspace"],
  })),
  exact("workspaces-defaults", "GET", "/api/workspaces/defaults", "workspace-admin", routeOptions("workspace-admin", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["workspace"],
  })),
  exact("workspaces-create", "POST", "/api/workspaces", "workspace-admin", routeOptions("workspace-admin", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["workspace"],
  })),
  regex("workspaces-admin", ["PATCH", "DELETE"], /^\/api\/workspaces\/[^/]+$/, "workspace-admin", routeOptions("workspace-admin", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["workspace"],
  })),
  exact("access-keys-list", "GET", "/api/access-keys", "access-key", routeOptions("access-key", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["access-key"],
  })),
  exact("access-keys-workspace-create", "POST", "/api/access-keys/workspace", "access-key", routeOptions("access-key", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["access-key", "workspace"],
  })),
  regex("access-keys-workspace-delete", "DELETE", /^\/api\/access-keys\/workspace\/[^/]+$/, "access-key", routeOptions("access-key", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["access-key", "workspace"],
  })),
  exact("access-keys-web-create", "POST", "/api/access-keys/web", "access-key", routeOptions("access-key", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["access-key"],
  })),

  exact("projects-list", "GET", "/api/projects", "project", routeOptions("project-catalog", {
    workspaceScoped: true,
    resourceTypes: ["project", "workspace"],
  })),
  exact("directories-shared-list", "GET", "/api/directories/shared", "directory", routeOptions("directory", {
    workspaceScoped: true,
    resourceTypes: ["directory", "share"],
  })),
  exact("skills-detail", "GET", "/api/skills/detail", "skill", routeOptions("skill", {
    resourceTypes: ["skill"],
  })),

  exact("automations-list", "GET", "/api/automations", "automation", routeOptions("automation", {
    workspaceScoped: true,
    resourceTypes: ["automation"],
  })),
  exact("automations-create", "POST", "/api/automations", "automation", routeOptions("automation", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["automation"],
  })),
  regex("automations-action", "POST", /^\/api\/automations\/[^/]+\/(?:delete|pause|resume|update)$/, "automation", routeOptions("automation", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["automation"],
  })),
  exact("automations-push-tick", "POST", "/api/automations/push/tick", "automation", routeOptions("automation", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["automation", "web-push"],
  })),
  exact("automations-deliverable", "GET", "/api/automations/deliverable", "automation", routeOptions("automation", {
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
  })),
  exact("automations-deliverable-preview", "GET", "/api/automations/deliverable/preview", "automation", routeOptions("automation", {
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
  })),
  exact("automations-output", "GET", "/api/automations/output", "automation", routeOptions("automation", {
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
  })),
  exact("automations-output-preview", "GET", "/api/automations/output/preview", "automation", routeOptions("automation", {
    workspaceScoped: true,
    resourceTypes: ["automation", "file"],
  })),

  exact("todos-list", "GET", "/api/todos", "todo", routeOptions("todo", {
    workspaceScoped: true,
    resourceTypes: ["todo"],
  })),
  exact("todos-create", "POST", "/api/todos", "todo", routeOptions("todo", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["todo"],
  })),
  exact("todos-push-tick", "POST", "/api/todos/push/tick", "todo", routeOptions("todo", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["todo", "web-push"],
  })),
  regex("todos-action", "POST", /^\/api\/todos\/[^/]+\/(?:complete|cancel|postpone|delete|block|unblock|comment|revise)$/, "todo", routeOptions("todo", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["todo"],
  })),

  exact("learning-overview", "GET", "/api/learning/overview", "learning", routeOptions("learning", {
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-coin"],
  })),
  exact("learning-growth-overview", "GET", "/api/learning-growth/overview", "learning-growth", routeOptions("learning-growth", {
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-coin", "learning-program"],
  })),
  exact("learning-growth-board", "GET", "/api/learning-growth/board", "learning-growth", routeOptions("learning-growth", {
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-program", "learning-coin"],
  })),
  exact("learning-status", "GET", "/api/learning/status", "learning", routeOptions("learning", {
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-program", "learning-readiness"],
  })),
  exact("learning-programs-list", "GET", "/api/learning/programs", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-program"],
  })),
  exact("learning-programs-create", "POST", "/api/learning/programs", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-program"],
  })),
  regex("learning-program-read", "GET", /^\/api\/learning\/programs\/[^/]+$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-program"],
  })),
  exact("learning-sources-list", "GET", "/api/learning/sources", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-source"],
  })),
  exact("learning-sources-create", "POST", "/api/learning/sources", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-source"],
  })),
  exact("learning-source-directory-import", "POST", "/api/learning/source-directory/import", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-source", "learning-source-directory"],
  })),
  exact("learning-source-directory-bootstrap", "POST", "/api/learning/source-directory/bootstrap", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-source", "learning-goal", "learning-program", "learner-profile"],
  })),
  exact("learning-goals-list", "GET", "/api/learning/goals", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-goal"],
  })),
  exact("learning-goals-create", "POST", "/api/learning/goals", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-goal"],
  })),
  regex("learning-goal-update", "PATCH", /^\/api\/learning\/goals\/[^/]+$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-goal"],
  })),
  exact("learning-profile-read", "GET", "/api/learning/profile", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learner-profile", "skill-state"],
  })),
  exact("learning-profile-rebuild", "POST", "/api/learning/profile/rebuild", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learner-profile", "skill-state"],
  })),
  exact("learning-curriculum-references-list", "GET", "/api/learning/curriculum-references", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["curriculum-reference"],
  })),
  exact("learning-foundation-import", "POST", "/api/learning/foundation-import", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-source", "learning-goal", "curriculum-reference", "learner-profile"],
  })),
  exact("learning-parent-report-read", "GET", "/api/learning/reports/parent", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-report", "learning-task-card", "learning-evaluation", "learning-reward-settlement"],
  })),
  regex("learning-program-update", "PATCH", /^\/api\/learning\/programs\/[^/]+$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-program"],
  })),
  regex("learning-program-draft-plan", "POST", /^\/api\/learning\/programs\/[^/]+\/draft-plan$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-program", "learning-plan-draft"],
  })),
  regex("learning-program-rebuild-draft-plan", "POST", /^\/api\/learning\/programs\/[^/]+\/rebuild-draft-plan$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-program", "learning-plan-draft"],
  })),
  regex("learning-program-publish", "POST", /^\/api\/learning\/programs\/[^/]+\/publish$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-program", "kanban"],
  })),
  exact("learning-task-cards-list", "GET", "/api/learning/task-cards", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card"],
  })),
  exact("learning-task-execution-queue", "GET", "/api/learning/task-execution-queue", "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card"],
  })),
  exact("learning-daily-plan", "GET", "/api/learning/daily-plan", "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card", "learning-daily-plan"],
  })),
  regex("learning-task-card-read", "GET", /^\/api\/learning\/task-cards\/[^/]+$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card"],
  })),
  regex("learning-task-card-session-start", "POST", /^\/api\/learning\/task-cards\/[^/]+\/sessions$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card", "learning-interaction-session"],
  })),
  regex("learning-task-card-growth-submission", "POST", /^\/api\/learning\/task-cards\/[^/]+\/growth-submission$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card", "learning-growth-submission"],
  })),
  regex("learning-task-card-growth-submission-withdraw", "POST", /^\/api\/learning\/task-cards\/[^/]+\/growth-submission\/withdraw$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card", "learning-growth-submission"],
  })),
  regex("learning-task-card-growth-reflection", "POST", /^\/api\/learning\/task-cards\/[^/]+\/growth-reflection$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card", "learning-growth-reflection"],
  })),
  exact("learning-sessions-list", "GET", "/api/learning/sessions", "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-interaction-session"],
  })),
  regex("learning-session-advance", "POST", /^\/api\/learning\/sessions\/[^/]+\/advance$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-interaction-session"],
  })),
  regex("learning-session-evaluation-create", "POST", /^\/api\/learning\/sessions\/[^/]+\/evaluations$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-evaluation"],
  })),
  exact("learning-evaluations-list", "GET", "/api/learning/evaluations", "learning-program", routeOptions("learning-program", {
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-evaluation"],
  })),
  regex("learning-evaluation-reward-settle", "POST", /^\/api\/learning\/evaluations\/[^/]+\/reward-settlement$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-evaluation", "learning-reward-settlement", "learning-coin"],
  })),
  exact("learning-reward-settlements-list", "GET", "/api/learning/reward-settlements", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-reward-settlement"],
  })),
  regex("learning-reward-settlement-read", "GET", /^\/api\/learning\/reward-settlements\/[^/]+$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-reward-settlement"],
  })),
  exact("learning-parent-review-requests-list", "GET", "/api/learning/parent-review-requests", "learning-parent-review", routeOptions("learning-parent-review", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-parent-review"],
  })),
  regex("learning-parent-review-request-read", "GET", /^\/api\/learning\/parent-review-requests\/[^/]+$/, "learning-parent-review", routeOptions("learning-parent-review", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-parent-review"],
  })),
  regex("learning-parent-review-request-decision", "POST", /^\/api\/learning\/parent-review-requests\/[^/]+\/decision$/, "learning-parent-review", routeOptions("learning-parent-review", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-parent-review"],
  })),
  exact("learning-review-queue-list", "GET", "/api/learning/review-queue", "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-review"],
  })),
  regex("learning-review-queue-decision", "POST", /^\/api\/learning\/review-queue\/[^/]+\/decision$/, "learning-program", routeOptions("learning-program", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-review"],
  })),

  exact("learning-coins-summary", "GET", "/api/learning-coins/summary", "learning-coins", routeOptions("learning-coins", {
    workspaceScoped: true,
    resourceTypes: ["learning-coin", "reward", "redemption"],
  })),
  exact("learning-coins-ledger", "GET", "/api/learning-coins/ledger", "learning-coins", routeOptions("learning-coins", {
    workspaceScoped: true,
    resourceTypes: ["learning-coin", "ledger"],
  })),
  exact("learning-coins-rewards", "GET", "/api/learning-coins/rewards", "learning-coins", routeOptions("learning-coins", {
    resourceTypes: ["reward"],
  })),
  exact("learning-coins-grant", "POST", "/api/learning-coins/grants", "learning-coins", routeOptions("learning-coins", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["learning-coin", "ledger"],
  })),
  exact("learning-coins-reward-upsert", "POST", "/api/learning-coins/rewards", "learning-coins", routeOptions("learning-coins", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["reward"],
  })),
  exact("learning-coins-redemption-request", "POST", "/api/learning-coins/redemptions", "learning-coins", routeOptions("learning-coins", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["redemption", "reward", "learning-coin"],
  })),
  regex("learning-coins-redemption-cancel", "POST", /^\/api\/learning-coins\/redemptions\/[^/]+\/cancel$/, "learning-coins", routeOptions("learning-coins", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["redemption", "learning-coin"],
  })),
  regex("learning-coins-redemption-owner-action", "POST", /^\/api\/learning-coins\/redemptions\/[^/]+\/(?:approve|reject|settle)$/, "learning-coins", routeOptions("learning-coins", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["redemption", "learning-coin"],
  })),

  exact("kanban-cards-list", "GET", "/api/kanban/cards", "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    resourceTypes: ["kanban", "card"],
  })),
  exact("kanban-cards-create", "POST", "/api/kanban/cards", "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "card"],
  })),
  exact("kanban-cards-output", "GET", "/api/kanban/cards/output", "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    resourceTypes: ["kanban", "file"],
  })),
  exact("kanban-cards-output-preview", "GET", "/api/kanban/cards/output/preview", "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    resourceTypes: ["kanban", "file"],
  })),
  regex("kanban-card-detail", "GET", /^\/api\/kanban\/cards\/[^/]+\/detail$/, "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    resourceTypes: ["kanban", "card"],
  })),
  exact("kanban-card-document-preview", "POST", "/api/kanban/cards/document-preview", "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "file"],
  })),
  exact("kanban-card-plan", "POST", "/api/kanban/cards/plan", "kanban", routeOptions("kanban-planning", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "plan"],
  })),
  exact("kanban-card-batch", "POST", "/api/kanban/cards/batch", "kanban", routeOptions("kanban-planning", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "plan"],
  })),
  exact("kanban-card-study-plan", "POST", "/api/kanban/cards/study-plan", "kanban", routeOptions("kanban-study", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "study-plan"],
  })),
  exact("kanban-card-assessment-plan", "POST", "/api/kanban/cards/assessment-plan", "kanban", routeOptions("kanban-study", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "assessment-plan"],
  })),
  regex("kanban-reading-submission", "POST", /^\/api\/kanban\/cards\/[^/]+\/(?:reading|study)-submission$/, "kanban", routeOptions("kanban-study", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "study-plan", "submission"],
  })),
  regex("kanban-reading-quiz", ["GET", "POST"], /^\/api\/kanban\/cards\/[^/]+\/(?:reading|study)-quiz$/, "kanban", routeOptions("kanban-study", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "study-plan", "quiz"],
  })),
  regex("kanban-assessment-exam", ["GET", "POST"], /^\/api\/kanban\/cards\/[^/]+\/assessment-exam$/, "kanban", routeOptions("kanban-study", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "assessment-plan", "exam"],
  })),
  regex("kanban-card-action", "POST", /^\/api\/kanban\/cards\/[^/]+\/(?:complete|cancel|postpone|delete|block|unblock|comment|revise)$/, "kanban", routeOptions("kanban", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["kanban", "card"],
  })),

  exact("single-window", "POST", "/api/single-window", "thread", routeOptions("single-window", {
    workspaceScoped: true,
    resourceTypes: ["thread", "workspace"],
  })),
  exact("threads-list", "GET", "/api/threads", "thread", routeOptions("thread", {
    workspaceScoped: true,
    resourceTypes: ["thread"],
  })),
  exact("threads-create", "POST", "/api/threads", "thread", routeOptions("thread", {
    workspaceScoped: true,
    resourceTypes: ["thread"],
  })),
  regex("thread-read", "GET", /^\/api\/threads\/[^/]+$/, "thread", routeOptions("thread", {
    workspaceScoped: true,
    resourceTypes: ["thread"],
  })),
  regex("thread-messages-list", "GET", /^\/api\/threads\/[^/]+\/messages$/, "thread", routeOptions("thread-message", {
    workspaceScoped: true,
    resourceTypes: ["thread", "message"],
  })),
  regex("thread-uploads-create", "POST", /^\/api\/threads\/[^/]+\/uploads$/, "thread", routeOptions("thread-upload", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "artifact", "file"],
  })),
  regex("thread-group-chat-update", "PATCH", /^\/api\/threads\/[^/]+\/group-chat$/, "thread", routeOptions("group-chat", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["thread", "group-chat"],
  })),
  regex("thread-messages-create", "POST", /^\/api\/threads\/[^/]+\/messages$/, "thread", routeOptions("thread-message", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "message", "run"],
  })),
  regex("thread-message-owner-elevation", "POST", /^\/api\/threads\/[^/]+\/messages\/[^/]+\/owner-elevation$/, "thread", routeOptions("owner-elevation", {
    riskLevel: "owner",
    ownerOnly: true,
    resourceTypes: ["thread", "message", "owner-elevation"],
  })),
  regex("thread-message-revoke", "POST", /^\/api\/threads\/[^/]+\/messages\/[^/]+\/revoke$/, "thread", routeOptions("group-chat", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "message"],
  })),
  regex("thread-task-rename", "PATCH", /^\/api\/threads\/[^/]+\/tasks\/[^/]+$/, "thread", routeOptions("thread-task", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "task"],
  })),
  regex("thread-task-delete", "DELETE", /^\/api\/threads\/[^/]+\/tasks\/[^/]+$/, "thread", routeOptions("thread-task", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "task"],
  })),
  regex("thread-interrupt", "POST", /^\/api\/threads\/[^/]+\/interrupt$/, "thread", routeOptions("thread-run", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "run"],
  })),

  exact("directories-preview", "GET", "/api/directories/preview", "directory", routeOptions("directory", {
    workspaceScoped: true,
    resourceTypes: ["directory"],
  })),
  exact("directories-create", "POST", "/api/directories/create", "directory", routeOptions("directory-mutation", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["directory"],
  })),
  exact("directories-upload", "POST", "/api/directories/upload", "directory", routeOptions("directory-mutation", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["directory", "file"],
  })),
  exact("directories-share", "POST", "/api/directories/share", "directory", routeOptions("directory-share", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["directory", "share"],
  })),
  exact("directories-unshare", "POST", "/api/directories/unshare", "directory", routeOptions("directory-share", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["directory", "share"],
  })),
  exact("directories-share-update", "POST", "/api/directories/share/update", "directory", routeOptions("directory-share", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["directory", "share"],
  })),
  exact("directories-delete", "POST", "/api/directories/delete", "directory", routeOptions("directory-mutation", {
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["directory", "file"],
  })),
  exact("files-preview", "GET", "/api/files/preview", "file", routeOptions("file", {
    workspaceScoped: true,
    resourceTypes: ["file"],
  })),
  exact("files-read", "GET", "/api/files", "file", routeOptions("file", {
    workspaceScoped: true,
    resourceTypes: ["file"],
  })),
  regex("artifact-read", "GET", /^\/api\/artifacts\/[^/]+$/, "artifact", routeOptions("artifact", {
    workspaceScoped: true,
    resourceTypes: ["artifact", "file"],
  })),
  exact("events", "ALL", "/api/events", "events", routeOptions("events", {
    resourceTypes: ["event-stream"],
  })),
]);

function cloneSpec(spec) {
  return Object.assign({}, spec);
}

function listHermesMobileApiRouteSpecs() {
  return HERMES_MOBILE_API_ROUTE_SPECS.map(cloneSpec);
}

function createHermesMobileApiRouteInventory(options = {}) {
  return createApiRouteRegistry(listHermesMobileApiRouteSpecs(), Object.assign({ rejectDuplicateMatchers: true }, options));
}

function listHermesMobileApiRoutes(options = {}) {
  return listRoutes(createHermesMobileApiRouteInventory(), options);
}

function summarizeHermesMobileApiRoutes(options = {}) {
  return routeInventorySummary(createHermesMobileApiRouteInventory(), options);
}

function groupHermesMobileApiRoutes(field = "moduleKey", options = {}) {
  return groupRoutesBy(createHermesMobileApiRouteInventory(), field, options);
}

function matchHermesMobileApiRoute(request) {
  return matchRoute(createHermesMobileApiRouteInventory(), request);
}

function validateHermesMobileApiRouteInventory() {
  return validateRouteRegistry(createHermesMobileApiRouteInventory());
}

module.exports = {
  HERMES_MOBILE_API_ROUTE_SPECS,
  createHermesMobileApiRouteInventory,
  groupHermesMobileApiRoutes,
  listHermesMobileApiRouteSpecs,
  listHermesMobileApiRoutes,
  matchHermesMobileApiRoute,
  summarizeHermesMobileApiRoutes,
  validateHermesMobileApiRouteInventory,
};
