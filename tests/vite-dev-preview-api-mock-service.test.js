"use strict";

const assert = require("node:assert/strict");
const {
  CHAT_RUNTIME_PREVIEW_CLIENT_VERSION,
  CHAT_RUNTIME_PREVIEW_THREAD_ID,
  DEV_PREVIEW_API_MOCK_VERSION,
  MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
  NAVIGATION_SHELL_PREVIEW_THREAD_ID,
  PLUGIN_HOST_PREVIEW_PLUGIN_IDS,
  WARDROBE_OUTFIT_WEAR_ACTION_PATH,
  chatRuntimeComposerInterruptPayload,
  chatRuntimeComposerSendPayload,
  chatRuntimeEventStreamRecords,
  chatRuntimeServerFileAttachmentPayload,
  chatRuntimeThreadReadPayload,
  chatRuntimeUploadPayload,
  messageActionPanelWardrobeExecutePayload,
  navigationShellThreadReadPayload,
  ownerConsoleOverview,
  ownerConsoleSystemStatus,
  pluginHostManifestPayload,
  viteDevPreviewApiMockRouteApplies,
  viteDevPreviewApiMockResponse,
  viteDevPreviewEventStreamPayload,
  viteDevPreviewEventStreamRouteApplies,
} = require("../adapters/vite-dev-preview-api-mock-service");

const fixedNow = new Date("2026-07-02T08:00:00.000Z");

function request(url, method = "GET") {
  return { url, method };
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

test("overview mock returns bounded Owner console payload shape", () => {
  const payload = ownerConsoleOverview({ now: fixedNow });
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.mockVersion, DEV_PREVIEW_API_MOCK_VERSION);
  assert.equal(payload.console.generatedAt, fixedNow.toISOString());
  assert.equal(payload.console.overallStatus, "ok");
  assert.equal(payload.console.policy.readOnlyMvp, true);
  assert.equal(payload.console.policy.actionExecutionEnabled, false);
  assert.equal(payload.console.dimensions.length, 3);
  assert.ok(payload.console.dimensions.every((signal) => signal.signalId && signal.status && signal.summary));
});

test("system-status mock returns resource metrics and normalized signals", () => {
  const payload = ownerConsoleSystemStatus({ now: fixedNow });
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.systemStatus.collectedAt, fixedNow.toISOString());
  assert.equal(payload.systemStatus.cpu.status, "ok");
  assert.equal(payload.systemStatus.memory.status, "ok");
  assert.equal(payload.systemStatus.disks[0].status, "ok");
  assert.ok(payload.systemStatus.signals.some((signal) => signal.category === "service"));
  assert.ok(payload.systemStatus.signals.every((signal) => signal.source === "vite_dev_preview_mock"));
});

test("navigation shell thread mock returns bounded task/topic root payload", () => {
  const payload = navigationShellThreadReadPayload({
    now: fixedNow,
    taskGroupId: "topic_directory_docs",
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.mockVersion, DEV_PREVIEW_API_MOCK_VERSION);
  assert.equal(payload.thread.id, NAVIGATION_SHELL_PREVIEW_THREAD_ID);
  assert.equal(payload.thread.messagesPage.mode, "tasks");
  assert.equal(payload.thread.messagesPage.taskGroupId, "topic_directory_docs");
  assert.equal(payload.thread.messagesPage.total, 2);
  assert.equal(payload.thread.messagesPage.loaded, 2);
  assert.equal(payload.thread.messagesPage.hasMoreBefore, false);
  assert.equal(payload.thread.messagesPage.oldestMessageId, "msg_topic_directory_docs_user_preview");
  assert.equal(payload.thread.messagesPage.newestMessageId, "msg_topic_directory_docs_assistant_preview");
  assert.equal(payload.thread.messagesPage.items.length, 2);
  assert.equal(payload.thread.messagesPage.items[0].role, "user");
  assert.equal(payload.thread.messagesPage.items[1].role, "assistant");
  assert.equal(payload.thread.messagesPage.items[1].artifacts.length, 1);
  assert.equal(payload.thread.taskGroups.length, 2);
  assert.ok(payload.thread.taskGroups.some((topic) => topic.directoryRoute));
  assert.equal(payload.thread.taskGroups.find((topic) => topic.id === "topic_directory_docs").directoryRoute.root, "/home-ai-dev/docs");
  assert.equal(payload.thread.pluginTopicGroups[0].pluginId, "wardrobe");
});

test("middleware response handles Owner console and navigation thread preview API paths", () => {
  assert.equal(viteDevPreviewApiMockResponse(request("/api/other")), null);
  const overview = viteDevPreviewApiMockResponse(request("/api/owner/system-console"), { now: fixedNow });
  assert.equal(overview.statusCode, 200);
  assert.equal(overview.headers["X-HomeAI-Vite-Dev-Mock"], DEV_PREVIEW_API_MOCK_VERSION);
  assert.equal(overview.body.console.generatedAt, fixedNow.toISOString());

  const status = viteDevPreviewApiMockResponse(request("/api/owner/system-console/system-status"), { now: fixedNow });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.systemStatus.collectedAt, fixedNow.toISOString());

  const threadRead = viteDevPreviewApiMockResponse(
    request(`/api/threads/${NAVIGATION_SHELL_PREVIEW_THREAD_ID}?messageMode=tasks&taskGroupId=topic_daily_ops`),
    { now: fixedNow },
  );
  assert.equal(threadRead.statusCode, 200);
  assert.equal(threadRead.body.thread.id, NAVIGATION_SHELL_PREVIEW_THREAD_ID);
  assert.equal(threadRead.body.thread.messagesPage.taskGroupId, "topic_daily_ops");
  assert.equal(threadRead.body.thread.messagesPage.total, 2);
  assert.equal(threadRead.body.thread.messagesPage.loaded, 2);
  assert.equal(threadRead.body.thread.messagesPage.items.length, 2);
});

test("plugin host manifest mock returns bounded manifest metadata without launch token", () => {
  const payload = pluginHostManifestPayload({
    pluginId: "finance",
    workspaceId: "owner",
    now: fixedNow,
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.mockVersion, DEV_PREVIEW_API_MOCK_VERSION);
  assert.equal(payload.id, "finance");
  assert.equal(payload.kind, "embedded_app");
  assert.equal(payload.available, true);
  assert.equal(payload.workspaceId, "owner");
  assert.equal(payload.embed.tokenStatus, "not_required");
  assert.equal(payload.embed.refreshOnVersionChange, true);
  assert.equal(payload.entry.url.includes("launch="), false);
  assert.ok(PLUGIN_HOST_PREVIEW_PLUGIN_IDS.includes("finance"));
});

test("middleware response handles plugin host manifest GET only for preview plugins", () => {
  assert.equal(viteDevPreviewApiMockRouteApplies(request("/api/hermes-plugins/finance/manifest?workspaceId=owner")), true);
  const manifest = viteDevPreviewApiMockResponse(
    request("/api/hermes-plugins/finance/manifest?workspaceId=owner"),
    { now: fixedNow },
  );
  assert.equal(manifest.statusCode, 200);
  assert.equal(manifest.body.id, "finance");
  assert.equal(manifest.body.version, "vite-dev-plugin-host-finance-v1");

  const missing = viteDevPreviewApiMockResponse(
    request("/api/hermes-plugins/unknown/manifest?workspaceId=owner"),
    { now: fixedNow },
  );
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error, "vite_dev_preview_plugin_not_found");

  const wrongMethod = viteDevPreviewApiMockResponse(
    request("/api/hermes-plugins/finance/manifest?workspaceId=owner", "POST"),
    { now: fixedNow },
  );
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.body.error, "method_not_allowed");
});

test("wardrobe message action mock returns confirmation then stored readback", () => {
  const first = messageActionPanelWardrobeExecutePayload({
    now: fixedNow,
    body: {
      threadId: MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
      messageId: "assistant_ready",
      workspaceId: "owner",
      mode: "create_only",
      confirmReplace: false,
    },
  });
  assert.equal(first.ok, true);
  assert.equal(first.source, "vite_dev_preview_mock");
  assert.equal(first.actionState.status, "needs_confirmation");
  assert.equal(first.actionState.existingOutfitId, "vite-dev-existing");
  assert.equal(first.message.pluginActions.wardrobeOutfitWearIntent.status, "needs_confirmation");
  assert.equal(first.requestEcho.mode, "create_only");

  const second = messageActionPanelWardrobeExecutePayload({
    now: fixedNow,
    body: {
      threadId: MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
      messageId: "assistant_ready",
      workspaceId: "owner",
      mode: "replace",
      confirmReplace: true,
    },
  });
  assert.equal(second.ok, true);
  assert.equal(second.actionState.status, "stored");
  assert.equal(second.actionState.outfitId, "vite-dev-777");
  assert.equal(second.actionState.readbackVerified, true);
  assert.equal(second.requestEcho.mode, "replace");
});

test("middleware response handles wardrobe message action POST only for bounded preview scope", () => {
  assert.equal(viteDevPreviewApiMockRouteApplies(request(WARDROBE_OUTFIT_WEAR_ACTION_PATH, "POST")), true);
  const first = viteDevPreviewApiMockResponse({
    url: WARDROBE_OUTFIT_WEAR_ACTION_PATH,
    method: "POST",
    body: {
      threadId: MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
      messageId: "assistant_ready",
      workspaceId: "owner",
      mode: "create_only",
    },
  }, { now: fixedNow });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.actionState.status, "needs_confirmation");

  const missing = viteDevPreviewApiMockResponse({
    url: WARDROBE_OUTFIT_WEAR_ACTION_PATH,
    method: "POST",
    body: { messageId: "assistant_ready" },
  }, { now: fixedNow });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.error, "thread_and_message_required");

  const wrongMethod = viteDevPreviewApiMockResponse(request(WARDROBE_OUTFIT_WEAR_ACTION_PATH, "GET"), { now: fixedNow });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.body.error, "method_not_allowed");
});

test("chat runtime composer send mock returns bounded thread and run readback", () => {
  const payload = chatRuntimeComposerSendPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
    body: {
      text: "继续完善",
      workspaceId: "owner",
      notificationChannel: "web_push",
      singleWindowMode: "task",
    },
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.run.run_id, "run_vite_composer_preview");
  assert.equal(payload.thread.id, CHAT_RUNTIME_PREVIEW_THREAD_ID);
  assert.equal(payload.thread.status, "running");
  assert.deepEqual(payload.thread.activeRunIds, ["run_vite_composer_preview"]);
  assert.equal(payload.thread.messages.length, 2);
  assert.equal(payload.thread.messages[0].content, "继续完善");
  assert.equal(payload.thread.messages[1].status, "queued");
  assert.equal(payload.requestEcho.textLength, 4);
});

test("chat runtime composer interrupt mock returns bounded stopped run readback", () => {
  const payload = chatRuntimeComposerInterruptPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.thread.id, CHAT_RUNTIME_PREVIEW_THREAD_ID);
  assert.equal(payload.thread.status, "idle");
  assert.deepEqual(payload.runIds, ["run_vite_composer_preview"]);
  assert.deepEqual(payload.stoppedRunIds, ["run_vite_composer_preview"]);
  assert.equal(payload.thread.messages[0].status, "cancelled");
});

test("chat runtime thread read mock returns bounded final thread readback", () => {
  const payload = chatRuntimeThreadReadPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.thread.id, CHAT_RUNTIME_PREVIEW_THREAD_ID);
  assert.equal(payload.thread.status, "done");
  assert.deepEqual(payload.thread.activeRunIds, []);
  assert.equal(payload.thread.messages.length, 2);
  assert.equal(payload.thread.messages[1].status, "done");
  assert.equal(payload.messagesPage.total, 2);

  const wrong = chatRuntimeThreadReadPayload({
    now: fixedNow,
    threadId: "private_thread",
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, "vite_dev_preview_thread_not_found");
});

test("middleware response handles composer send and interrupt POST for preview thread only", () => {
  const send = viteDevPreviewApiMockResponse({
    url: `/api/threads/${CHAT_RUNTIME_PREVIEW_THREAD_ID}/messages`,
    method: "POST",
    body: { text: "发送到 dev mock", workspaceId: "owner" },
  }, { now: fixedNow });
  assert.equal(send.statusCode, 200);
  assert.equal(send.body.thread.id, CHAT_RUNTIME_PREVIEW_THREAD_ID);
  assert.equal(send.body.run.run_id, "run_vite_composer_preview");

  const interrupt = viteDevPreviewApiMockResponse({
    url: `/api/threads/${CHAT_RUNTIME_PREVIEW_THREAD_ID}/interrupt`,
    method: "POST",
    body: {},
  }, { now: fixedNow });
  assert.equal(interrupt.statusCode, 200);
  assert.equal(interrupt.body.thread.status, "idle");

  const wrongThread = viteDevPreviewApiMockResponse({
    url: "/api/threads/private_thread/messages",
    method: "POST",
    body: { text: "blocked", workspaceId: "owner" },
  }, { now: fixedNow });
  assert.equal(wrongThread.statusCode, 400);
  assert.equal(wrongThread.body.error, "vite_dev_preview_composer_scope_mismatch");
});

test("middleware response handles chat runtime thread read only for preview thread", () => {
  const readback = viteDevPreviewApiMockResponse(
    request(`/api/threads/${CHAT_RUNTIME_PREVIEW_THREAD_ID}`),
    { now: fixedNow },
  );
  assert.equal(readback.statusCode, 200);
  assert.equal(readback.body.thread.id, CHAT_RUNTIME_PREVIEW_THREAD_ID);
  assert.equal(readback.body.thread.status, "done");
  assert.equal(readback.body.messagesPage.loaded, 2);
});

test("chat runtime upload mock returns bounded artifact without echoing file bytes", () => {
  const payload = chatRuntimeUploadPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
    body: {
      filename: "fixture.md",
      type: "text/markdown",
      dataBase64: "SGVsbG8=",
      workspaceId: "owner",
    },
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.artifact.id, "artifact_vite_upload_fixture.md");
  assert.equal(payload.artifact.name, "fixture.md");
  assert.equal(payload.artifact.size, 5);
  assert.equal(payload.requestEcho.dataBase64Length, 8);
  assert.equal(JSON.stringify(payload).includes("SGVsbG8="), false);

  const missingBytes = chatRuntimeUploadPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
    body: { filename: "fixture.md", workspaceId: "owner" },
  });
  assert.equal(missingBytes.ok, false);
  assert.equal(missingBytes.error, "data_base64_required");
});

test("middleware response handles upload POST for preview thread only", () => {
  const upload = viteDevPreviewApiMockResponse({
    url: `/api/threads/${CHAT_RUNTIME_PREVIEW_THREAD_ID}/uploads`,
    method: "POST",
    body: {
      filename: "dev.txt",
      type: "text/plain",
      dataBase64: "ZGV2",
      workspaceId: "owner",
    },
  }, { now: fixedNow });
  assert.equal(upload.statusCode, 200);
  assert.equal(upload.body.artifact.id, "artifact_vite_upload_dev.txt");
  assert.equal(upload.body.requestEcho.byteLength, 3);

  const wrongThread = viteDevPreviewApiMockResponse({
    url: "/api/threads/private_thread/uploads",
    method: "POST",
    body: {
      filename: "dev.txt",
      dataBase64: "ZGV2",
      workspaceId: "owner",
    },
  }, { now: fixedNow });
  assert.equal(wrongThread.statusCode, 400);
  assert.equal(wrongThread.body.error, "vite_dev_preview_upload_scope_mismatch");
});

test("chat runtime server-file attachment mock returns bounded artifact metadata", () => {
  const payload = chatRuntimeServerFileAttachmentPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
    body: {
      path: "/系统分享/HomeAI/dev.pdf",
      filename: "dev.pdf",
      workspaceId: "owner",
    },
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.artifact.id, "artifact_vite_server_file_dev.pdf");
  assert.equal(payload.artifact.name, "dev.pdf");
  assert.equal(payload.artifact.source, "server_file");
  assert.equal(payload.requestEcho.pathPresent, true);
  assert.equal(JSON.stringify(payload).includes("/系统分享/HomeAI/dev.pdf"), false);

  const remote = chatRuntimeServerFileAttachmentPayload({
    now: fixedNow,
    threadId: CHAT_RUNTIME_PREVIEW_THREAD_ID,
    body: { path: "https://example.test/file.pdf", filename: "file.pdf", workspaceId: "owner" },
  });
  assert.equal(remote.ok, false);
  assert.equal(remote.error, "remote_server_files_not_attachable");
});

test("middleware response handles server-file attachment POST for preview thread only", () => {
  const attached = viteDevPreviewApiMockResponse({
    url: `/api/threads/${CHAT_RUNTIME_PREVIEW_THREAD_ID}/server-file-attachments`,
    method: "POST",
    body: {
      path: "/系统分享/HomeAI/dev.pdf",
      filename: "dev.pdf",
      workspaceId: "owner",
    },
  }, { now: fixedNow });
  assert.equal(attached.statusCode, 200);
  assert.equal(attached.body.artifact.id, "artifact_vite_server_file_dev.pdf");
  assert.equal(attached.body.requestEcho.pathPresent, true);

  const wrongThread = viteDevPreviewApiMockResponse({
    url: "/api/threads/private_thread/server-file-attachments",
    method: "POST",
    body: {
      path: "/系统分享/HomeAI/dev.pdf",
      filename: "dev.pdf",
      workspaceId: "owner",
    },
  }, { now: fixedNow });
  assert.equal(wrongThread.statusCode, 400);
  assert.equal(wrongThread.body.error, "vite_dev_preview_server_file_scope_mismatch");
});

test("chat runtime event stream mock returns bounded SSE frames", () => {
  const records = chatRuntimeEventStreamRecords({ now: fixedNow });
  assert.equal(records.length, 3);
  assert.ok(records.every((record) => record.event === "message"));
  assert.ok(records.every((record) => record.serialized.startsWith("data: ")));
  assert.ok(records.every((record) => record.serialized.endsWith("\n\n")));
  assert.ok(records.some((record) => record.data.includes("message.delta")));
  assert.ok(records.some((record) => record.data.includes("thread")));
  assert.equal(JSON.stringify(records).includes("X-Hermes-Web-Key"), false);
});

test("event stream route applies only for the Vite chat preview client version", () => {
  const eventUrl = `/api/events?clientVersion=${encodeURIComponent(CHAT_RUNTIME_PREVIEW_CLIENT_VERSION)}&key=dev`;
  assert.equal(viteDevPreviewEventStreamRouteApplies(request(eventUrl)), true);
  assert.equal(viteDevPreviewEventStreamRouteApplies(request("/api/events?clientVersion=classic")), false);
  assert.equal(viteDevPreviewEventStreamRouteApplies(request("/api/events")), false);

  const payload = viteDevPreviewEventStreamPayload(request(eventUrl), { now: fixedNow });
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "vite_dev_preview_mock");
  assert.equal(payload.mockVersion, DEV_PREVIEW_API_MOCK_VERSION);
  assert.equal(payload.clientVersion, CHAT_RUNTIME_PREVIEW_CLIENT_VERSION);
  assert.equal(payload.keyPresent, true);
  assert.equal(payload.frames.length, 3);
  assert.equal(JSON.stringify(payload).includes("key=dev"), false);

  const wrongMethod = viteDevPreviewEventStreamPayload(request(eventUrl, "POST"), { now: fixedNow });
  assert.equal(wrongMethod.ok, false);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.error, "method_not_allowed");
});

test("middleware response stays bounded for wrong method or unknown child route", () => {
  const wrongMethod = viteDevPreviewApiMockResponse(request("/api/owner/system-console", "POST"), { now: fixedNow });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.body.error, "method_not_allowed");

  const missing = viteDevPreviewApiMockResponse(request("/api/owner/system-console/other"), { now: fixedNow });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error, "vite_dev_preview_mock_route_not_found");

  const missingThread = viteDevPreviewApiMockResponse(request("/api/threads/thread_private"));
  assert.equal(missingThread.statusCode, 404);
  assert.equal(missingThread.body.error, "vite_dev_preview_thread_not_found");
});

if (process.exitCode) process.exit(process.exitCode);
