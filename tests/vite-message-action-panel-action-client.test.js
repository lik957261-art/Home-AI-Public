"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadActionClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/message-action-panel/action-client.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function readyMessage(overrides = {}) {
  return Object.assign({
    id: "assistant_ready",
    role: "assistant",
    content: "建议穿 OUT-001 和 SHOE-001。",
    pluginActions: {
      wardrobeOutfitWearIntent: {
        kind: "outfit_wear_intent",
        status: "ready",
        executable: true,
        intent: {
          wear_date: "2026-07-02",
          items: [
            { role: "Outer", code: "OUT-001" },
            { role: "Footwear", code: "SHOE-001" },
          ],
        },
      },
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
  await test("action client uses runtime api and avoids browser-owned boundaries", async () => {
    const source = read("src/vite-islands/message-action-panel/action-client.mjs");
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /window\.confirm|globalThis\.confirm/);
    assert.match(source, /runtime\?\.\api/);
  });

  await test("request body matches classic wardrobe action route contract", async () => {
    const client = await loadActionClient();
    const body = client.buildWardrobeOutfitWearRequestBody({
      threadId: "thread_1",
      workspaceId: "owner",
      message: readyMessage(),
    });
    assert.deepEqual(body, {
      threadId: "thread_1",
      messageId: "assistant_ready",
      workspaceId: "owner",
      confirmReplace: false,
      mode: "create_only",
    });
    const replace = client.buildWardrobeOutfitWearRequestBody({
      threadId: "thread_1",
      workspaceId: "owner",
      messageId: "assistant_ready",
      confirmReplace: true,
    });
    assert.equal(replace.mode, "replace");
    assert.equal(replace.confirmReplace, true);
  });

  await test("single execution posts through runtime api and applies readback action state", async () => {
    const client = await loadActionClient();
    const calls = [];
    const runtime = {
      api: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          actionState: {
            kind: "outfit_wear_intent",
            status: "stored",
            executable: false,
            outfitId: "777",
            readbackVerified: true,
          },
          message: {
            id: "assistant_ready",
            pluginActions: {
              wardrobeOutfitWearIntent: {
                kind: "outfit_wear_intent",
                status: "stored",
                executable: false,
                outfitId: "777",
                readbackVerified: true,
              },
            },
          },
          thread: { id: "thread_1", workspaceId: "owner" },
        };
      },
    };
    const result = await client.executeWardrobeOutfitWearAction({
      runtime,
      threadId: "thread_1",
      workspaceId: "owner",
      message: readyMessage(),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, client.WARDROBE_OUTFIT_WEAR_ACTION_ENDPOINT);
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      threadId: "thread_1",
      messageId: "assistant_ready",
      workspaceId: "owner",
      confirmReplace: false,
      mode: "create_only",
    });
    assert.equal(result.message.pluginActions.wardrobeOutfitWearIntent.status, "stored");
    assert.equal(result.message.pluginActions.wardrobeOutfitWearIntent.readbackVerified, true);
  });

  await test("workflow mirrors classic needs-confirmation then replace retry", async () => {
    const client = await loadActionClient();
    const calls = [];
    const runtime = {
      api: async (url, options) => {
        calls.push({ url, options: Object.assign({}, options) });
        const body = JSON.parse(options.body);
        if (!body.confirmReplace) {
          return {
            ok: true,
            actionState: {
              kind: "outfit_wear_intent",
              status: "needs_confirmation",
              executable: true,
              existingOutfitId: "321",
              intent: readyMessage().pluginActions.wardrobeOutfitWearIntent.intent,
            },
            message: {
              id: "assistant_ready",
              pluginActions: {
                wardrobeOutfitWearIntent: {
                  kind: "outfit_wear_intent",
                  status: "needs_confirmation",
                  executable: true,
                  existingOutfitId: "321",
                  intent: readyMessage().pluginActions.wardrobeOutfitWearIntent.intent,
                },
              },
            },
          };
        }
        return {
          ok: true,
          actionState: {
            kind: "outfit_wear_intent",
            status: "stored",
            executable: false,
            outfitId: "777",
            readbackVerified: true,
          },
          message: {
            id: "assistant_ready",
            pluginActions: {
              wardrobeOutfitWearIntent: {
                kind: "outfit_wear_intent",
                status: "stored",
                executable: false,
                outfitId: "777",
                readbackVerified: true,
              },
            },
          },
        };
      },
    };
    const result = await client.executeWardrobeOutfitWearActionWorkflow({
      runtime,
      threadId: "thread_1",
      workspaceId: "owner",
      message: readyMessage(),
      confirm: async () => true,
    });
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[0].options.body).mode, "create_only");
    assert.equal(JSON.parse(calls[1].options.body).mode, "replace");
    assert.equal(JSON.parse(calls[1].options.body).confirmReplace, true);
    assert.equal(result.actionState.status, "stored");
    assert.equal(result.actionState.readbackVerified, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
