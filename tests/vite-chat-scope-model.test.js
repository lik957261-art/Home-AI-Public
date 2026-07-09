"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/chat-scope-model.mjs");

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  await test("chat-scope model stays browser-boundary free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans group chat membership and active scope", async () => {
    const model = await loadModel();
    const thread = {
      singleWindow: true,
      chatGroup: {
        enabled: true,
        memberWorkspaceIds: [" owner ", "kid", "owner"],
      },
    };
    const memberIds = model.threadGroupMemberIdsPlan(thread).memberIds;
    assert.deepEqual(memberIds, ["owner", "kid"]);
    assert.equal(model.isThreadGroupChatPlan({ thread, memberIds }).groupChat, true);
    assert.equal(model.selectedWorkspaceInThreadGroupPlan({ thread, memberIds, selectedWorkspaceId: "owner" }).selected, true);
    assert.equal(model.currentUserCanUseGroupChatThreadPlan({ thread, memberIds, selectedWorkspaceId: "other", isOwner: true }).canUse, true);
    assert.equal(model.groupChatViewPlan({ singleWindowChatView: true, groupChatOpen: true, canUseGroupChatThread: true }).groupChatView, true);
    assert.equal(model.activeChatScopePlan({ groupChatView: true }).scope, "group");
  });

  await test("plans task group ids and read storage timestamps", async () => {
    const model = await loadModel();
    assert.deepEqual(model.chatScopeTaskGroupIdPlan({
      scope: "group",
      groupTaskGroupId: "group-chat",
      chatTaskGroupId: "chat",
    }), {
      version: model.CHAT_SCOPE_MODEL_VERSION,
      scope: "group",
      taskGroupId: "group-chat",
    });
    assert.equal(model.chatScopeReadStorageKeyPlan({
      scope: "group",
      selectedWorkspaceId: "owner",
      taskGroupId: "group-chat",
    }).key, "hermesChatScopeRead:owner:group:group-chat");
    assert.equal(model.chatScopeReadAtPlan({ storedValue: "0", sessionStartedAt: 123 }).readAt, 123);
    assert.deepEqual(model.setChatScopeReadAtPlan({ key: "k", value: 456 }).storage, { key: "k", value: "456" });
  });

  await test("plans message timestamps, ownership, unread count, and members", async () => {
    const model = await loadModel();
    assert.equal(model.chatScopeMessageTimeMsPlan({ timestamp: "2026-07-05T00:00:00.000Z" }).timeMs, 1783209600000);
    assert.equal(model.latestChatScopeMessageTimeMsPlan({ messageTimes: [1, 12, 3] }).latestMs, 12);
    assert.equal(model.isOwnChatScopeMessagePlan({
      role: "user",
      ownerWorkspaceId: "owner",
      selectedWorkspaceId: "owner",
    }).own, true);
    assert.equal(model.unreadChatScopeCountPlan({
      singleWindowChatView: true,
      sourceThreadExists: true,
      readAt: 10,
      messages: [
        { timeMs: 11, own: true },
        { timeMs: 12, own: false },
        { timeMs: 8, own: false },
      ],
    }).count, 1);
    assert.deepEqual(model.groupChatMemberLabelsPlan({
      memberIds: ["owner", "kid"],
      workspaceLabelsById: { owner: "Owner", kid: "Kid" },
      assistantLabel: "Home AI",
    }).labels, ["Owner", "Kid", "Home AI"]);
    assert.deepEqual(model.groupChatMentionMembersPlan({
      memberIds: ["owner", "kid"],
      workspaceLabelsById: { owner: "Owner", kid: "Kid" },
      selectedWorkspaceId: "owner",
      assistantMember: { workspaceId: "assistant", label: "Home AI" },
    }).members, [
      { workspaceId: "assistant", label: "Home AI" },
      { workspaceId: "kid", label: "Kid" },
    ]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
