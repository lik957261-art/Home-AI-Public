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

assert.match(accessKeyManagerUi, /WORKSPACE_ONBOARDING_PLUGIN_OPTIONS/);
for (const pluginId of ["wardrobe", "health", "finance", "email", "note"]) {
  assert.ok(accessKeyManagerUi.includes(`id: "${pluginId}"`), `${pluginId} plugin option must be selectable`);
}

assert.match(accessKeyManagerUi, /data-workspace-onboarding-plan/);
assert.match(accessKeyManagerUi, /data-workspace-onboarding-apply/);
assert.match(accessKeyManagerUi, /\/api\/workspace-onboarding\/plan/);
assert.match(accessKeyManagerUi, /\/api\/workspace-onboarding\/apply/);
assert.match(accessKeyManagerUi, /runSmokes: true/);
assert.match(accessKeyManagerUi, /请先预览当前工作区的开通计划/);
assert.match(accessKeyManagerUi, /workspaceOnboardingPlanMatchesPayload/);

assert.match(accessKeyManagerUi, /redactedWorkspaceOnboardingResult\(result = \{\}\)/);
assert.match(accessKeyManagerUi, /homeAiAccessKey: Boolean\(safe\.credentials\.homeAiAccessKey\)/);
assert.match(accessKeyManagerUi, /const oneTimeKey = result\?\.credentials\?\.homeAiAccessKey \|\| ""/);
assert.match(accessKeyManagerUi, /state\.workspaceOnboardingResult = redactedWorkspaceOnboardingResult\(result\)/);
assert.match(accessKeyManagerUi, /state\.generatedAccessKey = \{[\s\S]*key: oneTimeKey/);
assert.doesNotMatch(accessKeyManagerUi, /console\.(log|info|warn|error)\([^)]*homeAiAccessKey/);

assert.match(stylesCss, /\.workspace-onboarding-section/);
assert.match(stylesCss, /\.workspace-onboarding-plugins/);
assert.match(stylesCss, /\.workspace-onboarding-status\.ok/);
assert.match(stylesCss, /\.workspace-onboarding-step/);

console.log("workspace onboarding UI harness passed");
