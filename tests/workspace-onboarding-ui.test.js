"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const accessKeyManagerUi = fs.readFileSync(path.join(repoRoot, "public", "app-access-key-manager-ui.js"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(appJs, /workspaceOnboardingPlan: null/);
assert.match(appJs, /workspaceOnboardingResult: null/);
assert.match(appJs, /workspaceOnboardingLoading: false/);
assert.match(appJs, /workspaceOnboardingError: ""/);
assert.match(appJs, /workspaceOnboardingDraft: null/);
assert.match(appJs, /workspaceOnboardingRun: null/);

assert.match(accessKeyManagerUi, /WORKSPACE_ONBOARDING_PLUGIN_OPTIONS/);
for (const pluginId of ["wardrobe", "health", "finance", "email", "note", "growth"]) {
  assert.ok(accessKeyManagerUi.includes(`id: "${pluginId}"`), `${pluginId} plugin option must be selectable`);
}

assert.match(accessKeyManagerUi, /data-workspace-onboarding-plan/);
assert.match(accessKeyManagerUi, /data-workspace-onboarding-apply/);
assert.match(accessKeyManagerUi, /\/api\/workspace-onboarding\/plan/);
assert.match(accessKeyManagerUi, /\/api\/workspace-onboarding\/apply/);
assert.match(accessKeyManagerUi, /runSmokes: true/);
assert.match(accessKeyManagerUi, /workspaceOnboardingPlanMatchesPayload/);
assert.match(accessKeyManagerUi, /async function requestWorkspaceOnboardingPlan\(payload = \{\}\)/);
assert.match(accessKeyManagerUi, /await requestWorkspaceOnboardingPlan\(payload\)/);
assert.doesNotMatch(accessKeyManagerUi, /请先预览当前工作区的开通计划/);
assert.match(accessKeyManagerUi, /function slugWorkspaceOnboardingId\(value = ""\)/);
assert.match(accessKeyManagerUi, /const rawWorkspaceId = inputs\.workspaceId\?\.value\?\.trim\(\) \|\| ""/);
assert.match(accessKeyManagerUi, /const workspaceId = slugWorkspaceOnboardingId\(rawWorkspaceId\)/);
assert.match(accessKeyManagerUi, /const displayName = inputs\.displayName\?\.value\?\.trim\(\) \|\| rawWorkspaceId \|\| workspaceId/);
assert.match(accessKeyManagerUi, /\.toLowerCase\(\)/);
assert.match(accessKeyManagerUi, /createWorkspaceOnboardingRunState\(state\.workspaceOnboardingPlan \|\| \{\}, payload\)/);
assert.match(accessKeyManagerUi, /workspaceOnboardingPlanMatchesPayload\(state\.workspaceOnboardingPlan, payload\)[\s\S]*?await requestWorkspaceOnboardingPlan\(payload\)/);
assert.match(accessKeyManagerUi, /state\.workspaceOnboardingRun = createWorkspaceOnboardingRunState\(plan, payload\)/);
assert.match(accessKeyManagerUi, /state\.workspaceOnboardingResult \|\| state\.workspaceOnboardingRun \|\| state\.workspaceOnboardingPlan/);
assert.match(accessKeyManagerUi, /progressMessage: "请求已发送/);
assert.match(accessKeyManagerUi, /progressHint: index === 0 \? "已开始" : "等待后端回执"/);
assert.match(accessKeyManagerUi, /failWorkspaceOnboardingRunState/);
const applyFunctionMatch = accessKeyManagerUi.match(/async function applyWorkspaceOnboardingFromAccessKeyManager\(\) \{[\s\S]*?\n\}/);
assert.ok(applyFunctionMatch, "apply function must exist");
assert.doesNotMatch(applyFunctionMatch[0], /window\.confirm/);

assert.match(accessKeyManagerUi, /redactedWorkspaceOnboardingResult\(result = \{\}\)/);
assert.match(accessKeyManagerUi, /homeAiAccessKey: Boolean\(safe\.credentials\.homeAiAccessKey\)/);
assert.match(accessKeyManagerUi, /const oneTimeKey = result\?\.credentials\?\.homeAiAccessKey \|\| ""/);
assert.match(accessKeyManagerUi, /state\.workspaceOnboardingResult = redactedWorkspaceOnboardingResult\(result\)/);
assert.match(accessKeyManagerUi, /state\.generatedAccessKey = \{[\s\S]*key: oneTimeKey/);
assert.doesNotMatch(accessKeyManagerUi, /console\.(log|info|warn|error)\([^)]*homeAiAccessKey/);

assert.match(stylesCss, /\.workspace-onboarding-section/);
assert.match(stylesCss, /\.workspace-onboarding-plugins/);
assert.match(stylesCss, /\.workspace-onboarding-status\.ok/);
assert.match(stylesCss, /\.workspace-onboarding-status\.running/);
assert.match(stylesCss, /\.workspace-onboarding-progress/);
assert.match(stylesCss, /\.workspace-onboarding-step/);
assert.match(stylesCss, /\.workspace-onboarding-step small/);

console.log("workspace onboarding UI harness passed");
