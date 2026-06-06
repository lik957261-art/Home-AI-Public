"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const RUNTIME_COMPOSITION_FILE = "mobile-server-runtime.js";
const CORE_PROVIDERS_FILE = "adapters/mobile-runtime-core-providers.js";
const API_COMPOSITION_FILE = "server-routes/mobile-api-composition.js";
const API_DIRECTORY_COMPOSITION_FILE = "server-routes/mobile-api-directory-composition.js";
const WEIXIN_RUNTIME_FILE = "adapters/weixin-runtime-composition-service.js";
const APP_FRONTEND_FILES = [
  "public/app.js",
  "public/app-shell-ui.js",
  "public/app-task-groups-ui.js",
  "public/app-chat-composer-ui.js",
  "public/app-composer-context-ui.js",
  "public/app-run-progress-ui.js",
  "public/app-navigation-search-ui.js",
  "public/app-sidebar-task-ui.js",
  "public/app-message-actions-ui.js",
  "public/app-platform-ui.js",
  "public/app-pwa-settings-push-ui.js",
  "public/app-workspace-admin-ui.js",
  "public/app-access-key-manager-ui.js",
  "public/app-share-image-ui.js",
  "public/app-draft-thread-ui.js",
  "public/app-directory-automation-ui.js",
  "public/app-shared-directory-ui.js",
  "public/app-automation-ui.js",
  "public/app-learning-growth-controller.js",
  "public/app-automation-controller-ui.js",
  "public/app-thread-state-ui.js",
  "public/app-group-topic-ui.js",
  "public/app-kanban-core-ui.js",
  "public/app-kanban-story-core-ui.js",
  "public/app-kanban-todo-core-ui.js",
  "public/app-kanban-render-ui.js",
  "public/app-kanban-list-ui.js",
  "public/app-kanban-learning-panel-ui.js",
  "public/app-kanban-recorder-ui.js",
  "public/app-todo-detail-ui.js",
  "public/app-kanban-actions-ui.js",
  "public/app-kanban-composer-actions-ui.js",
  "public/app-kanban-card-actions-ui.js",
  "public/app-kanban-study-actions-ui.js",
  "public/app-thread-message-ui.js",
  "public/app-thread-list-ui.js",
  "public/app-thread-directory-ui.js",
  "public/app-thread-card-message-ui.js",
  "public/app-rich-text-directory-ui.js",
  "public/app-message-usage-ui.js",
  "public/app-events-composer-ui.js",
  "public/app-event-stream-ui.js",
  "public/app-upload-sidebar-ui.js",
  "public/app-composer-send-ui.js",
  "public/app-wire-start-ui.js",
  "public/app-start.js",
];

function assertContains(file, pattern, message) {
  const text = read(file);
  assert.match(text, pattern, `${file}: ${message || pattern}`);
}

function assertFrontendContains(pattern, message) {
  const text = APP_FRONTEND_FILES.map(read).join("\n");
  assert.match(text, pattern, `app frontend shell: ${message || pattern}`);
}

function assertRouteGuard(routePattern, guardPattern) {
  const server = read(RUNTIME_COMPOSITION_FILE);
  const routeIndex = server.search(routePattern);
  assert.ok(routeIndex >= 0, `${RUNTIME_COMPOSITION_FILE} route missing: ${routePattern}`);
  const windowText = server.slice(routeIndex, routeIndex + 5000);
  assert.match(windowText, guardPattern, `${RUNTIME_COMPOSITION_FILE} route ${routePattern} missing guard ${guardPattern}`);
}

function assertRouteGuardInFile(file, routePattern, guardPattern) {
  const text = read(file);
  const routeIndex = text.search(routePattern);
  assert.ok(routeIndex >= 0, `${file} route missing: ${routePattern}`);
  const windowText = text.slice(routeIndex, routeIndex + 5000);
  assert.match(windowText, guardPattern, `${file} route ${routePattern} missing guard ${guardPattern}`);
}

function main() {
  assertContains(CORE_PROVIDERS_FILE, /createPathPolicyProvider/, "path-policy provider must be wired");
  assertContains(CORE_PROVIDERS_FILE, /createEgressPolicyProvider/, "egress policy provider must be wired");
  assertContains(CORE_PROVIDERS_FILE, /createAuditEventProvider/, "audit event provider must be wired");
  assertContains(RUNTIME_COMPOSITION_FILE, /deriveKanbanWorkflowState/, "study workflow state must be server-derived");
  assertContains(RUNTIME_COMPOSITION_FILE, /createMobileRuntimeOwnerElevationFacadeService/, "Owner elevation facade must be wired");
  assertContains("adapters/mobile-runtime-owner-elevation-facade-service.js", /defaultCreateOwnerElevationGrantService/, "Owner elevation facade must retain grant service wiring");
  assertContains("adapters/mobile-runtime-owner-elevation-facade-service.js", /consumeOwnerElevationOnce[\s\S]{0,600}isOwnerElevationActive/, "Owner elevation facade must pass grant checks into routing");
  assertContains("adapters/owner-elevation-grant-service.js", /grantId: `owner-(?:once|time)-/, "Owner elevation grants must carry stable grant ids");
  assertContains("adapters/owner-elevation-grant-service.js", /allowedWorkerSecurityLevel: "owner-maintenance"/, "Owner grants must name the allowed worker level");
  assertContains("adapters/owner-elevation-grant-service.js", /delete copy\.token/, "Owner elevation status and audit projections must redact one-shot tokens");

  assertContains(API_COMPOSITION_FILE, /createMobileApiDirectoryComposition/, "Directory/file composition must be wired into the platform API aggregator");
  assertContains(API_DIRECTORY_COMPOSITION_FILE, /createFileArtifactApiRoutes[\s\S]{0,600}resolveArtifactForRequest/, "artifact read must be wired through the file artifact route module");
  assertContains(API_DIRECTORY_COMPOSITION_FILE, /createFileArtifactApiRoutes[\s\S]{0,600}resolveFileForBrowserRequest/, "file read/preview must be wired through the file artifact route module");
  assertContains("server-routes/mobile-api-dispatcher.js", /key: "fileArtifactApiRoutes"/, "file artifact routes must be installed in the API router");
  assertRouteGuardInFile("server-routes/file-artifact-api-routes.js", /artifact-read/, /resolveArtifactForRequest/);
  assertRouteGuardInFile("server-routes/file-artifact-api-routes.js", /files-preview/, /resolveFileForBrowserRequest/);
  assertRouteGuardInFile("server-routes/directory-mutation-api-routes.js", /directories-create/, /isSharedDirectoryWriteAllowed/);
  assertRouteGuardInFile("server-routes/directory-mutation-api-routes.js", /directories-upload/, /isSharedDirectoryWriteAllowed/);
  assertRouteGuardInFile("server-routes/directory-mutation-api-routes.js", /directories-delete/, /isSharedDirectoryWriteAllowed/);
  assertRouteGuardInFile("server-routes/weixin-api-routes.js", /\/api\/ingress\/weixin\/outbound/, /requireWeixinIngress/);
  assertRouteGuardInFile("server-routes/owner-elevation-api-routes.js", /\/api\/owner-elevation\/once/, /requireOwner/);

  assertFrontendContains(/function todoWorkflowState\(todo\)/, "frontend must prefer server workflow state");
  assertFrontendContains(/workflow\.canSubmitStudy/, "study submission button must honor workflow state");
  assertFrontendContains(/workflow\.canStartExam/, "assessment start button must honor workflow state");
  assertContains(WEIXIN_RUNTIME_FILE, /createWeixinFileForwardService[\s\S]{0,1200}egressPolicyProvider/, "manual Weixin file forwarding must receive the egress policy provider");
  assertContains("adapters/weixin-file-forward-service.js", /egressPolicyProvider\.decide[\s\S]{0,600}operation: "manual_forward"/, "manual Weixin forwarding must use egress policy");
  assertContains("adapters/weixin-file-forward-service.js", /explicitUserApproved: true[\s\S]{0,200}sendsFileContent: true/, "manual Weixin forwarding must declare user approval and file-content egress");
  assertContains("adapters/path-policy-provider.js", /normalizePathForBoundary/, "path policy must normalize traversal before root checks");
  assertContains("adapters/egress-policy-provider.js", /missing_actor_workspace/, "egress policy must fail closed without actor context");
  assertContains("adapters/egress-policy-provider.js", /const actorWorkspaceId = String\(input\.actorWorkspaceId/, "egress policy must require explicit actor workspace");
  assertContains("adapters/egress-policy-provider.js", /const currentWorkspaceOnly = Boolean\(actorWorkspaceId && targetWorkspaceId && targetWorkspaceId === actorWorkspaceId\)/, "egress current-workspace decision must be derived from explicit actor and target");
  assertContains("adapters/egress-policy-provider.js", /const trustedOriginReply = source === "weixin" && destination === "weixin" && operation === "origin_reply" && originReply/, "origin-reply egress must only trust real Weixin origin replies");
  assertContains("adapters/egress-policy-provider.js", /sendsFileContent && !trustedOriginReply/, "external file egress must not allow forged origin replies");
  assertContains("adapters/path-policy-provider.js", /const realCandidate = cachedRealPath\(candidate\)/, "path policy must verify canonical candidates");
  assertContains("adapters/path-policy-provider.js", /Target directory must not be a symlink or junction/, "write path boundary must reject symlink or junction parents");
  assertContains("adapters/shared-directory-provider.js", /path\.win32\.normalize/, "shared directory path helper must normalize traversal");
  assertContains("adapters/project-discovery-provider.js", /path\.win32\.normalize/, "project discovery path helper must normalize traversal");
  assertContains("adapters/weixin-file-forward-service.js", /const bridgeResult = resolved\.file \? null : fileResultFromBridgeFileForForward/, "manual Weixin bridge files must resolve only inside the forwarding service");
  assertContains("adapters/weixin-file-forward-service.js", /const sourceFile = resolved\.file \|\| bridgeResult\?\.file[\s\S]{0,400}materializeWeixinForwardFile/, "manual Weixin bridge files must materialize after egress policy");

  console.log("security invariants check passed");
}

main();
