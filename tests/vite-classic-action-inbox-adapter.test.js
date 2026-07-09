"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const source = read("public/app-action-inbox-ui.js");

test("classic action inbox imports the Vite ESM owner model", () => {
  assert.match(source, /ACTION_INBOX_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/action-inbox-model\/action-inbox-model\.js/);
  assert.match(source, /function importActionInboxModel/);
  assert.match(source, /function currentActionInboxModel/);
  assert.match(source, /function actionInboxModelFunction/);
  assert.match(source, /__homeAiImportActionInboxModel/);
});

test("classic action inbox delegates pure plans before fallback logic", () => {
  for (const marker of [
    "actionInboxValidAuditTargetIdPlan",
    "actionInboxTaskCardDispatchKeyPlan",
    "actionInboxErrorMessagePlan",
    "actionInboxTaskCardFailureCategoryPlan",
    "actionInboxStatusLabelPlan",
    "actionInboxPluginLabelPlan",
    "actionInboxTypeLabelPlan",
    "actionInboxStatusTonePlan",
    "actionInboxTodoDueAtPlan",
    "actionInboxDisplayTitlePlan",
    "actionInboxFilterQueryPlan",
    "actionInboxItemsForActiveFilterPlan",
    "actionInboxPrimaryDeliverablePlan",
    "actionInboxIsAutonomousDeliveryRepairRequestPlan",
    "actionInboxDeliverableKindPlan",
    "actionInboxShouldShowLoadingPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

if (process.exitCode) process.exit(process.exitCode);
