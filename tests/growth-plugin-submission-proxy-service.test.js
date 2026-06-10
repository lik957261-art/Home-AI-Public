"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGrowthPluginSubmissionProxyService } = require("../adapters/growth-plugin-submission-proxy-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growth-plugin-proxy-"));
}

function writeGrowthBinding(dataDir, workspaceId = "child") {
  const root = path.join(dataDir, "drive", "users", workspaceId, ".hermes-growth");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "access-key.txt"), "workspace-secret\n", "utf8");
  fs.writeFileSync(path.join(root, "config.json"), `${JSON.stringify({
    schema_version: 1,
    api_base_url: "http://127.0.0.1:4881",
    workspace_id: `growth:${workspaceId}`,
    hermes_workspace_id: workspaceId,
    access_key_file: "access-key.txt",
  }, null, 2)}\n`, "utf8");
}

async function testSubmitTaskPostsToGrowthPlugin() {
  const dataDir = tempDir();
  writeGrowthBinding(dataDir, "child");
  const calls = [];
  const service = createGrowthPluginSubmissionProxyService({
    dataDir,
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 202,
        async json() {
          return {
            ok: true,
            source: "growth-plugin-sqlite",
            task_card_id: "ltask_1",
            submission: { submissionId: "lsub_1", taskCardId: "ltask_1", status: "submitted" },
            evaluation_job: { status: "pending" },
          };
        },
      };
    },
  });
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "kanban_card_1",
    text: "answer",
    author: "learner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.source, "growth-plugin-sqlite");
  assert.equal(result.result.taskCardId, "ltask_1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:4881/api/v1/growth/cards/kanban_card_1/submissions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer workspace-secret");
  assert.equal(calls[0].body.workspace_id, "growth:child");
  assert.equal(calls[0].body.text, "answer");
}

async function testSubmitReflectionPostsToGrowthPlugin() {
  const dataDir = tempDir();
  writeGrowthBinding(dataDir, "child");
  const calls = [];
  const service = createGrowthPluginSubmissionProxyService({
    dataDir,
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 202,
        async json() {
          return {
            ok: true,
            source: "growth-plugin-sqlite",
            task_card_id: "ltask_1",
            reflection: { reflectionId: "lrefl_1", taskCardId: "ltask_1", status: "submitted" },
          };
        },
      };
    },
  });
  const result = await service.submitReflection({
    workspaceId: "child",
    cardId: "kanban_card_1",
    transcript: "I changed my answer because I checked it.",
    author: "learner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.source, "growth-plugin-sqlite");
  assert.equal(result.result.reflectionId, "lrefl_1");
  assert.equal(calls[0].url, "http://127.0.0.1:4881/api/v1/growth/cards/kanban_card_1/reflections");
  assert.equal(calls[0].options.headers.Authorization, "Bearer workspace-secret");
  assert.equal(calls[0].body.workspace_id, "growth:child");
  assert.equal(calls[0].body.text, "I changed my answer because I checked it.");
}

async function testMissingBindingReturnsFallbackAllowed() {
  const service = createGrowthPluginSubmissionProxyService({
    dataDir: tempDir(),
    fetch: async () => {
      throw new Error("should not fetch");
    },
  });
  const result = await service.submitTask({ workspaceId: "child", cardId: "card_1", text: "answer" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, "growth_plugin_workspace_not_configured");
  assert.equal(result.fallbackAllowed, true);
}

(async () => {
  await testSubmitTaskPostsToGrowthPlugin();
  await testSubmitReflectionPostsToGrowthPlugin();
  await testMissingBindingReturnsFallbackAllowed();
  console.log("growth plugin submission proxy service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
