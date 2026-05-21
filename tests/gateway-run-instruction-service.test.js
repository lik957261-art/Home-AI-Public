"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunInstructionService } = require("../adapters/gateway-run-instruction-service");

function createService() {
  return createGatewayRunInstructionService({
    dedupe: (values) => Array.from(new Set((values || []).filter(Boolean))),
    normalizeSingleWindowMode: (value) => String(value || "").trim().toLowerCase(),
    createDeliveryBoundaryInstructions: (options = {}) => options.deliveryTarget
      ? `DELIVERY:${options.deliveryTarget}`
      : "",
    permissionBoundarySkillInstructions: () => "PERMISSION_BOUNDARY",
    semanticProjectRoutingInstructions: () => "SEMANTIC_ROUTE",
    isKanbanCaseTopicThread: (thread) => Boolean(thread && thread.caseTopic),
  });
}

function testPolicySummaryIncludesCallableToolHints() {
  const service = createService();
  const summary = service.formatAccessPolicyInstructionSummary({
    principal_id: "owner",
    default_workspace: "C:/workspace",
    allowed_roots: ["C:/workspace", "D:/shared"],
    allowed_toolsets: ["http", "file", "image_gen", "x_search", "cronjob", "http"],
    connector_profiles: { google: {}, outlook: {} },
  });

  assert.match(summary, /Principal: owner/);
  assert.match(summary, /Allowed roots: C:\/workspace; D:\/shared/);
  assert.match(summary, /http -> http_request/);
  assert.match(summary, /file -> read_file, write_file, patch, search_files, docx_extract_text, audio_transcribe/);
  assert.match(summary, /image_gen -> image_generate, chatgpt_image_edit, chatgpt_image_erase, image_edit, image_erase/);
  assert.match(summary, /x_search -> x_search/);
  assert.match(summary, /cronjob -> cronjob_mobile, http_request, cronjob/);
  assert.match(summary, /For HTTP\/API Program calls, use `http_request`/);
  assert.match(summary, /http_request\.file_body/);
  assert.match(summary, /http_request\.multipart_files/);
  assert.match(summary, /For Word DOCX text extraction, use `docx_extract_text`/);
  assert.match(summary, /For MP3\/M4A\/WAV\/AAC\/OGG\/OPUS\/AMR\/FLAC voice notes/);
  assert.match(summary, /use `cronjob_mobile` when available/);
  assert.match(summary, /hermes-mobile:\/\/cron/);
  assert.match(summary, /External connector profiles: google, outlook/);
}

function testSchemaOverrideInstructionsCoverOrdinaryLowTools() {
  const service = createService();
  const text = service.currentToolSchemaOverrideInstructions({
    allowed_toolsets: ["http", "file", "web", "search", "x_search", "image_gen", "cronjob"],
  });

  assert.match(text, /`http` toolset is enabled/);
  assert.match(text, /`file_body` or `multipart_files`/);
  assert.match(text, /never claim upload success after sending only a local path string/);
  assert.match(text, /Word DOCX text extraction is available as `docx_extract_text`/);
  assert.match(text, /audio transcription.*`audio_transcribe`/);
  assert.match(text, /Prefer callable function names `mobile_web_search` and `mobile_web_extract`/);
  assert.match(text, /`x_search` toolset is enabled/);
  assert.match(text, /Do not claim X was searched unless `x_search` was actually available and used/);
  assert.match(text, /`cronjob` toolset is enabled/);
  assert.match(text, /prefer `cronjob_mobile` when available/);
  assert.match(text, /hermes-mobile:\/\/cron/);
  assert.match(text, /current run Principal exactly/);
  assert.match(text, /profile-local scheduler/);
  assert.match(text, /function names include `image_generate`, `chatgpt_image_edit`, and `chatgpt_image_erase`/);
  assert.match(text, /Do not request Owner elevation merely because an ordinary current-workspace image editing tool is missing/);
}

function testGatewayConversationIdEpochForSchemaSensitiveToolsets() {
  const service = createService();
  const thread = { hermesSessionId: "session_a", singleWindow: true };
  const message = { id: "msg_1", taskGroupId: "group_1" };

  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["file"] }),
    "session_a_group_1_20260519-x-search-v1",
  );
  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["memory"] }),
    "session_a_group_1",
  );
  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["x_search"] }),
    "session_a_group_1_20260519-x-search-v1",
  );
}

function testBuildHermesInstructionsPreservesChatAndAttachmentGuidance() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s", singleWindow: true, caseTopic: true },
    {
      principal_id: "owner",
      principal_label: "Owner",
      default_workspace: "C:/workspace",
      allowed_roots: ["C:/workspace"],
      allowed_toolsets: ["file", "image_gen"],
      response_style: "concise",
      show_task_id: false,
    },
    { root: "C:/project", singleWindow: true },
    "latest request",
    { label: "Attached", path: "C:/project/data" },
    {
      singleWindowMode: "chat",
      groupChatDeliveryRoot: "C:/group-delivery",
      groupChatAttachmentCopies: [
        { name: "source.pdf", copyPathForModel: "C:/group-delivery/source.pdf", originalPath: "D:/private/source.pdf" },
      ],
    },
  );

  assert.match(text, /PERMISSION_BOUNDARY/);
  assert.match(text, /DELIVERY:the group delivery directory: C:\/group-delivery/);
  assert.match(text, /Attached task directory: Attached => C:\/project\/data/);
  assert.match(text, /single-window chat mode/);
  assert.match(text, /shared learning-plan topic chat/);
  assert.match(text, /source\.pdf: C:\/group-delivery\/source\.pdf/);
  assert.doesNotMatch(text, /SEMANTIC_ROUTE/);
  assert.match(text, /Keep final replies concise/);
  assert.match(text, /Do not surface internal task IDs/);
}

function testBuildHermesInstructionsIncludesSemanticRoutingForTaskStream() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s", singleWindow: true },
    { allowed_toolsets: ["memory"] },
    { singleWindow: true },
    "latest",
    null,
    { singleWindowMode: "task" },
  );

  assert.match(text, /single-window task stream/);
  assert.match(text, /SEMANTIC_ROUTE/);
}

testPolicySummaryIncludesCallableToolHints();
testSchemaOverrideInstructionsCoverOrdinaryLowTools();
testGatewayConversationIdEpochForSchemaSensitiveToolsets();
testBuildHermesInstructionsPreservesChatAndAttachmentGuidance();
testBuildHermesInstructionsIncludesSemanticRoutingForTaskStream();

console.log("gateway-run-instruction-service tests passed");
