"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/message-action-panel/message-actions-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
}

function readyAction(overrides = {}) {
  return Object.assign({
    kind: "outfit_wear_intent",
    status: "ready",
    executable: true,
    intent: {
      wear_date: "2026-07-05",
      items: [{ code: "OUT-001" }, { code: "SHOE-001" }],
    },
  }, overrides);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("message actions model stays browser-boundary free", () => {
    const source = read("src/vite-islands/message-action-panel/message-actions-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans reply action controls and long-message eligibility", async () => {
    const model = await loadModel();
    const shortMessage = { id: "m1", role: "assistant", content: "short" };
    const longMessage = {
      id: "m2",
      role: "assistant",
      content: Array.from({ length: 24 }, (_, index) => `line ${index}`).join("\n"),
    };
    assert.equal(model.canUseMessageReplyActionsPlan(shortMessage), true);
    assert.equal(model.canUseMessageReplyActionsPlan({ id: "m3", role: "user" }), false);
    assert.equal(model.messageScrollEligibleByContentPlan(shortMessage).eligible, false);
    assert.equal(model.messageScrollEligibleByContentPlan(longMessage).eligible, true);
    assert.deepEqual(model.messageActionStripPlan(shortMessage, { scrollPosition: "end" }).controls, ["scroll", "copy", "image", "note"]);
    assert.deepEqual(model.messageScrollButtonPlan(shortMessage, "end"), {
      visible: true,
      messageId: "m1",
      position: "end",
      label: "Jump to reply end",
      title: "End",
      glyph: "&#8595;",
    });
  });

  await test("plans wardrobe footer action states and request bodies", async () => {
    const model = await loadModel();
    const ready = model.wardrobeOutfitWearButtonPlan({
      id: "assistant_1",
      pluginActions: { wardrobeOutfitWearIntent: readyAction() },
    });
    assert.equal(ready.visible, true);
    assert.equal(ready.htmlKind, "action");
    assert.equal(ready.label, "入库");
    assert.equal(ready.iconOnly, true);
    assert.equal(ready.disabled, false);
    assert.match(ready.title, /2026-07-05/);

    const stored = model.wardrobeOutfitWearButtonPlan({
      id: "assistant_1",
      pluginActions: {
        wardrobeOutfitWearIntent: readyAction({
          status: "stored",
          executable: false,
          outfitId: "777",
          readbackVerified: true,
        }),
      },
    });
    assert.equal(stored.disabled, true);
    assert.equal(stored.label, "已入库 #777 · 已验证");
    assert.equal(stored.iconOnly, true);

    const diagnostic = model.wardrobeOutfitWearButtonPlan({
      id: "assistant_2",
      pluginActionDiagnostics: {
        wardrobeOutfitWearIntent: { code: "intent_metadata_missing", reason: "prepare_tool_output_not_attached" },
      },
    });
    assert.equal(diagnostic.htmlKind, "diagnostic");
    assert.equal(diagnostic.status, "blocked");
    assert.equal(diagnostic.label, "需重新生成");
    assert.equal(diagnostic.iconOnly, true);

    assert.deepEqual(model.wardrobeOutfitWearActionRequestPlan({
      threadId: "thread_1",
      messageId: "assistant_1",
      workspaceId: "owner",
      confirmReplace: true,
    }), {
      path: "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent",
      method: "POST",
      body: {
        threadId: "thread_1",
        messageId: "assistant_1",
        workspaceId: "owner",
        confirmReplace: true,
        mode: "replace",
      },
    });
  });

  await test("plans scroll visibility without DOM inputs", async () => {
    const model = await loadModel();
    const plan = model.messageScrollVisibilityPlan({
      viewportHeight: 640,
      messageHeight: 900,
      hasRunProgress: false,
      wasShown: false,
      previouslyEligible: false,
      canReturnToStart: true,
      canJumpToEnd: true,
      footerVisible: true,
      isStartButton: true,
      atBottom: false,
    });
    assert.equal(plan.contentEligible, true);
    assert.equal(plan.shouldShow, true);
    assert.equal(plan.startFooterVisible, true);
    assert.equal(plan.endVisible, false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
