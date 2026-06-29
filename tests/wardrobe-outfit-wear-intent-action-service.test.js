"use strict";

const assert = require("node:assert/strict");
const {
  ACTION_KEY,
  LOCAL_EXECUTE_TOOL,
  attachPreparedIntentToMessage,
  createWardrobeOutfitWearIntentActionService,
  extractPreparedIntentFromCompletedResponse,
  publicActionState,
  validateIntentForExecution,
} = require("../adapters/wardrobe-outfit-wear-intent-action-service");

function readyIntent(overrides = {}) {
  return Object.assign({
    type: "outfit_wear_intent",
    schema_version: 1,
    plugin_id: "wardrobe",
    principal_id: "owner",
    workspace_id: "owner",
    wear_date: "2026-06-29",
    timezone: "Asia/Shanghai",
    items: [
      { role: "Outer", code: "OUT-001" },
      { role: "Footwear", code: "SHOE-001" },
    ],
    source_message: { message_id: "assistant_1", thread_id: "thread_1" },
    idempotency_key: "wardrobe:outfit_wear_intent:test",
    expires_at: "2026-06-30T00:00:00Z",
    action: {
      mcp_tool: "wardrobe.execute_outfit_wear_intent",
      default_mode: "create_only",
      confirm_mode: "replace",
    },
  }, overrides);
}

function makeHarness(options = {}) {
  const calls = { mcp: [], saves: [], broadcasts: [] };
  const thread = {
    id: "thread_1",
    workspaceId: "owner",
    messages: [
      {
        id: "assistant_1",
        role: "assistant",
        senderPrincipalId: "owner",
        pluginActions: {
          [ACTION_KEY]: {
            status: "ready",
            executable: true,
            intent: readyIntent(),
          },
        },
      },
    ],
  };
  const responses = options.responses || [
    { ok: true, result: { structuredContent: { ok: true, status: "needs_confirmation", needs_confirmation: true, confirm_mode: "replace", existing_outfit_id: 321 } } },
    { ok: true, result: { structuredContent: { ok: true, status: "stored", outfit_id: 777, readback_verified: true } } },
  ];
  const service = createWardrobeOutfitWearIntentActionService({
    nowIso: () => "2026-06-29T01:00:00.000Z",
    compactMessage: (message) => ({ id: message.id, pluginActions: message.pluginActions }),
    threadSummary: (item) => ({ id: item.id, updatedAt: item.updatedAt || "" }),
    saveState: (_state, saveOptions) => calls.saves.push(saveOptions),
    broadcast: (event) => calls.broadcasts.push(event),
    async callWardrobeMcpTool(name, args) {
      calls.mcp.push({ name, args });
      return responses[Math.min(calls.mcp.length - 1, responses.length - 1)];
    },
  });
  return { calls, message: thread.messages[0], service, thread };
}

function testValidationRejectsUnsafeIntents() {
  assert.equal(validateIntentForExecution(readyIntent(), {
    workspaceId: "owner",
    principalId: "owner",
    nowIso: "2026-06-29T01:00:00Z",
  }).ok, true);
  assert.equal(validateIntentForExecution(readyIntent({ workspace_id: "weixin_wuping" }), {
    workspaceId: "owner",
    principalId: "owner",
    nowIso: "2026-06-29T01:00:00Z",
  }).error, "workspace_mismatch");
  assert.equal(validateIntentForExecution(readyIntent({ items: [{ role: "Outer", code: "" }] }), {
    workspaceId: "owner",
    principalId: "owner",
    nowIso: "2026-06-29T01:00:00Z",
  }).error, "item_codes_not_locked");
  assert.equal(validateIntentForExecution(readyIntent({ expires_at: "2026-06-28T00:00:00Z" }), {
    workspaceId: "owner",
    principalId: "owner",
    nowIso: "2026-06-29T01:00:00Z",
  }).status, "expired");
}

function testCompletedResponseExtractsPreparedIntent() {
  const intent = readyIntent();
  const event = {
    response: {
      output: [
        { type: "function_call", name: "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent", call_id: "call_1" },
        { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ structuredContent: { intent } }) },
      ],
    },
  };
  assert.deepEqual(extractPreparedIntentFromCompletedResponse(event), intent);
  const message = { id: "assistant_1" };
  const action = attachPreparedIntentToMessage(message, intent, { updatedAt: "2026-06-29T01:00:00.000Z" });
  assert.equal(action.status, "ready");
  assert.equal(message.pluginActions[ACTION_KEY].intent.idempotency_key, intent.idempotency_key);
}

async function testExecuteNeedsConfirmationThenStoresAfterConfirm() {
  const { calls, message, service, thread } = makeHarness();
  const first = await service.execute({ thread, message, workspaceId: "owner", principalId: "owner" });
  assert.equal(first.ok, true);
  assert.equal(first.actionState.status, "needs_confirmation");
  assert.equal(calls.mcp[0].name, LOCAL_EXECUTE_TOOL);
  assert.equal(calls.mcp[0].args.confirm_replace, false);
  assert.equal(calls.mcp[0].args.mode, "create_only");
  assert.equal(message.pluginActions[ACTION_KEY].existingOutfitId, "321");

  const second = await service.execute({ thread, message, workspaceId: "owner", principalId: "owner", confirmReplace: true });
  assert.equal(second.ok, true);
  assert.equal(second.actionState.status, "stored");
  assert.equal(second.actionState.outfitId, "777");
  assert.equal(calls.mcp[1].args.confirm_replace, true);
  assert.equal(calls.mcp[1].args.mode, "replace");
  assert.ok(calls.saves.length >= 4);
  assert.ok(calls.broadcasts.some((event) => event.type === "message.updated"));
}

async function testMcpUnavailableBecomesVisibleErrorState() {
  const { message, service, thread } = makeHarness({
    responses: [{ ok: false, error: "wardrobe_mcp_schema_unavailable" }],
  });
  const result = await service.execute({ thread, message, workspaceId: "owner", principalId: "owner" });
  assert.equal(result.ok, false);
  assert.equal(result.actionState.status, "error");
  assert.equal(result.actionState.error, "wardrobe_mcp_schema_unavailable");
  assert.equal(publicActionState(result.actionState, { workspaceId: "owner", principalId: "owner" }).status, "error");
}

async function run() {
  testValidationRejectsUnsafeIntents();
  testCompletedResponseExtractsPreparedIntent();
  await testExecuteNeedsConfirmationThenStoresAfterConfirm();
  await testMcpUnavailableBecomesVisibleErrorState();
  console.log("wardrobe outfit wear intent action service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
