"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function assertContains(file, pattern, message) {
  const text = read(file);
  assert.match(text, pattern, `${file}: ${message || pattern}`);
}

function assertRouteGuard(routePattern, guardPattern) {
  const server = read("server.js");
  const routeIndex = server.search(routePattern);
  assert.ok(routeIndex >= 0, `server.js route missing: ${routePattern}`);
  const windowText = server.slice(routeIndex, routeIndex + 5000);
  assert.match(windowText, guardPattern, `server.js route ${routePattern} missing guard ${guardPattern}`);
}

function main() {
  assertContains("server.js", /createPathPolicyProvider/, "path-policy provider must be wired");
  assertContains("server.js", /createEgressPolicyProvider/, "egress policy provider must be wired");
  assertContains("server.js", /createAuditEventProvider/, "audit event provider must be wired");
  assertContains("server.js", /deriveKanbanWorkflowState/, "study workflow state must be server-derived");
  assertContains("server.js", /grantId: `owner-(?:once|time)-/, "Owner elevation grants must carry stable grant ids");
  assertContains("server.js", /allowedWorkerSecurityLevel: "owner-maintenance"/, "Owner grants must name the allowed worker level");

  assertRouteGuard(/const artifactRead = url\.pathname\.match/, /resolveArtifactForRequest|artifactAccessibleToAuth/);
  assertRouteGuard(/\/api\/files\/preview/, /resolveFileForBrowserRequest/);
  assertRouteGuard(/\/api\/directories\/create/, /isSharedDirectoryWriteAllowed/);
  assertRouteGuard(/\/api\/directories\/upload/, /isSharedDirectoryWriteAllowed/);
  assertRouteGuard(/\/api\/directories\/delete/, /isSharedDirectoryWriteAllowed/);
  assertRouteGuard(/\/api\/ingress\/weixin\/outbound/, /requireWeixinIngress/);
  assertRouteGuard(/\/api\/owner-elevation\/once/, /requireOwner/);

  assertContains("public/app.js", /function todoWorkflowState\(todo\)/, "frontend must prefer server workflow state");
  assertContains("public/app.js", /workflow\.canSubmitStudy/, "study submission button must honor workflow state");
  assertContains("public/app.js", /workflow\.canStartExam/, "assessment start button must honor workflow state");
  assertContains("server.js", /egressPolicyProvider\.decide[\s\S]{0,600}operation: "manual_forward"/, "manual Weixin forwarding must use egress policy");
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
  assertContains("server.js", /const sourceFile = resolved\.file \|\| fileResultFromBridgeFileForForward/, "manual Weixin bridge files must materialize after egress policy");

  console.log("security invariants check passed");
}

main();
