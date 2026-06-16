"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunInstructionService } = require("../adapters/gateway-run-instruction-service");

function createService(options = {}) {
  return createGatewayRunInstructionService({
    dedupe: (values) => Array.from(new Set((values || []).filter(Boolean))),
    explicitWebSearchMaxCalls: options.explicitWebSearchMaxCalls ?? 20,
    webSearchMaxCalls: options.webSearchMaxCalls ?? 12,
    normalizeSingleWindowMode: (value) => String(value || "").trim().toLowerCase(),
    createDeliveryBoundaryInstructions: (options = {}) => options.deliveryTarget
      ? `DELIVERY:${options.deliveryTarget}`
      : "",
    permissionBoundarySkillInstructions: () => [
      "Use Skill: productivity/hermes-mobile-permission-boundary-check as the model-side permission check before tool use.",
      "When the decision is Needs elevation, emit HERMES_PERMISSION_APPROVAL_REQUIRED.",
    ].join("\n"),
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
    allowed_toolsets: ["http", "file", "image_gen", "x_search", "cronjob", "wardrobe", "finance", "health", "moira", "email", "http"],
    allowed_skills: ["productivity/wardrobe-style-operations"],
    required_skills: ["productivity/wardrobe-style-operations"],
    connector_profiles: { google: {}, outlook: {} },
  });

  assert.match(summary, /Principal: owner/);
  assert.match(summary, /Allowed roots: C:\/workspace; D:\/shared/);
  assert.match(summary, /http -> http_request/);
  assert.match(summary, /file -> read_file, write_file, patch, search_files, docx_extract_text, audio_transcribe/);
  assert.match(summary, /image_gen -> image_generate, chatgpt_image_edit, chatgpt_image_erase, image_edit, image_erase/);
  assert.match(summary, /x_search -> x_search/);
  assert.match(summary, /cronjob -> cronjob_mobile, http_request, cronjob/);
  assert.match(summary, /wardrobe -> mcp_wardrobe_wardrobe_write_item, mcp_wardrobe_wardrobe_write_history, mcp_wardrobe_wardrobe_upload_photo, mcp_wardrobe_wardrobe_set_primary_photo, mcp_wardrobe_wardrobe_get_item, mcp_wardrobe_wardrobe_search_items/);
  assert.match(summary, /finance -> mcp_finance_list_ledgers, mcp_finance_list_transactions, mcp_finance_get_summary, mcp_finance_get_report, mcp_finance_create_transaction, mcp_finance_add_transaction_attachment, mcp_finance_reference_object_types, mcp_finance_reference_get, mcp_finance_reference_summarize, mcp_finance_get_owner_asset_summary, mcp_finance_list_owner_asset_snapshots, mcp_finance_upsert_owner_asset_snapshot, mcp_finance_get_owner_stock_summary, mcp_finance_list_owner_stock_snapshots, mcp_finance_apply_owner_stock_position_delta/);
  assert.match(summary, /health -> mcp_health_records_get_summary/);
  assert.match(summary, /moira -> mcp_moira_list_records, mcp_moira_get_chart_evidence, mcp_moira_get_interpretation_context, mcp_moira_get_year_forecast_evidence, mcp_moira_get_current_progression_evidence, mcp_moira_get_pick_day_evidence, mcp_moira_get_monthly_selection_evidence, mcp_moira_get_transit_event_evidence, mcp_moira_get_eclipse_event_evidence, mcp_moira_get_aspect_evidence, mcp_moira_get_pick_change_position_evidence, mcp_moira_get_fixed_star_change_position_evidence, mcp_moira_get_rule_migration_status, mcp_moira_get_rule_commentary_readiness, mcp_moira_get_functional_coverage_status/);
  assert.match(summary, /email -> mcp_email_list_accounts, mcp_email_list_mailboxes, mcp_email_search_messages, mcp_email_get_message, mcp_email_get_message_body, mcp_email_get_digest, mcp_email_list_attachments, mcp_email_get_attachment_content, mcp_email_sync_account, mcp_email_apply_mail_action, mcp_email_delete_local_by_search, mcp_email_apply_mail_action_bulk/);
  assert.match(summary, /For HTTP\/API Program calls, use `http_request`/);
  assert.match(summary, /http_request\.file_body/);
  assert.match(summary, /http_request\.multipart_files/);
  assert.match(summary, /For Word DOCX text extraction, use `docx_extract_text`/);
  assert.match(summary, /For MP3\/M4A\/WAV\/AAC\/OGG\/OPUS\/AMR\/FLAC voice notes/);
  assert.match(summary, /use `cronjob_mobile` when available/);
  assert.match(summary, /hermes-mobile:\/\/cron/);
  assert.match(summary, /Allowed Skills: productivity\/wardrobe-style-operations/);
  assert.match(summary, /Required Skills: productivity\/wardrobe-style-operations/);
  assert.match(summary, /External connector profiles: google, outlook/);
}

function testSchemaOverrideInstructionsCoverOrdinaryLowTools() {
  const service = createService();
  const text = service.currentToolSchemaOverrideInstructions({
    allowed_toolsets: ["http", "file", "web", "search", "x_search", "image_gen", "cronjob", "wardrobe", "finance", "health", "moira"],
  });

  assert.match(text, /`http` toolset is enabled/);
  assert.match(text, /`http_request`/);
  assert.match(text, /`file_body` or `multipart_files`/);
  assert.match(text, /never claim upload success after sending only a local path string/);
  assert.match(text, /Word DOCX text extraction is available as `docx_extract_text`/);
  assert.match(text, /audio transcription.*`audio_transcribe`/);
  assert.match(text, /Prefer callable function names `mobile_web_search` and `mobile_web_extract`/);
  assert.match(text, /Run Web-search budget: use at most 12 total Web search calls/);
  assert.match(text, /Do not start a 13th Web search call/);
  assert.match(text, /`x_search` toolset is enabled/);
  assert.match(text, /Do not claim X was searched unless `x_search` was actually available and used/);
  assert.match(text, /`cronjob` toolset is enabled/);
  assert.match(text, /prefer `cronjob_mobile` when available/);
  assert.match(text, /hermes-mobile:\/\/cron/);
  assert.match(text, /current run Principal exactly/);
  assert.match(text, /profile-local scheduler/);
  assert.match(text, /function names include `image_generate`, `chatgpt_image_edit`, and `chatgpt_image_erase`/);
  assert.match(text, /Do not request Owner elevation merely because an ordinary current-workspace image editing tool is missing/);
  assert.match(text, /`wardrobe` toolset is enabled/);
  assert.match(text, /`mcp_wardrobe_wardrobe_write_item`/);
  assert.match(text, /`mcp_wardrobe_wardrobe_write_history`/);
  assert.match(text, /`finance` toolset is enabled/);
  assert.match(text, /`mcp_finance_list_ledgers`/);
  assert.match(text, /`mcp_finance_add_transaction_attachment`/);
  assert.match(text, /`mcp_finance_reference_get`/);
  assert.match(text, /`mcp_finance_get_owner_asset_summary`/);
  assert.match(text, /`mcp_finance_get_owner_stock_summary`/);
  assert.match(text, /`mcp_finance_apply_owner_stock_position_delta`/);
  assert.match(text, /Owner-only asset lookups/);
  assert.match(text, /stock holding valuation/);
  assert.match(text, /stable Finance object references/);
  assert.match(text, /adding image\/file attachments to an existing transaction/);
  assert.match(text, /with `transaction_id` and `file_path` set to that server-local upload path/);
  assert.match(text, /`upload_path` is an accepted alias/);
  assert.match(text, /Do not put a local path, `MEDIA:<path>`, or `file:\/\/` URL into `data_url`/);
  assert.match(text, /without one attachment source field: `file_path`, `upload_path`, `data_url`, or `data_base64`/);
  assert.match(text, /falling back to cleaned files as an MCP result/);
  assert.match(text, /`health` toolset is enabled/);
  assert.match(text, /double-prefixed/);
  assert.match(text, /`moira` toolset is enabled/);
  assert.match(text, /`mcp_moira_get_chart_evidence`/);
  assert.match(text, /`mcp_moira_get_interpretation_context`/);
  assert.match(text, /`mcp_moira_get_pick_day_evidence`/);
  assert.match(text, /`mcp_moira_get_monthly_selection_evidence`/);
  assert.match(text, /`mcp_moira_get_current_progression_evidence`/);
  assert.match(text, /`mcp_moira_get_aspect_evidence`/);
  assert.match(text, /`mcp_moira_get_rule_migration_status`/);
  assert.match(text, /read-only evidence source/);
  assert.match(text, /PICK\/择日 candidate evidence/);
  assert.match(text, /status-only PICK\/month evidence/);
  assert.match(text, /prefer `mcp_moira_get_interpretation_context` first/);
  assert.match(text, /do not claim Moira generated a complete fortune narrative/);
  assert.match(text, /Do not pass `workspace_id` or `workspaceId`/);
  assert.match(text, /Gateway schema mismatch/);
}

function testExplicitWebSearchPrioritizesQualityAndUsesLargerBudget() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s" },
    { allowed_toolsets: ["web", "search"] },
    { root: "C:/workspace" },
    "请联网搜索这件事",
    null,
    { searchSource: "web", sourceIntent: "web_search", sourceMode: "auto" },
  );

  assert.match(text, /explicitly asks for web\/search-backed information/);
  assert.match(text, /Optimize for source quality, meaningful coverage, and verifiable evidence/);
  assert.match(text, /Use several focused query refinements when needed/);
  assert.match(text, /Run Web-search budget: use at most 20 total Web search calls/);
  assert.match(text, /Do not start a 21st Web search call/);
}

function testWebSearchBudgetInstructionCanBeDisabled() {
  const service = createService({ webSearchMaxCalls: 0 });
  const text = service.currentToolSchemaOverrideInstructions({
    allowed_toolsets: ["web"],
  });

  assert.match(text, /Prefer callable function names `mobile_web_search` and `mobile_web_extract`/);
  assert.doesNotMatch(text, /Run Web-search budget/);
}

function testChineseCurrentPriceRequestUsesExplicitSearchInstruction() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s" },
    { allowed_toolsets: ["web", "search"] },
    { root: "C:/workspace" },
    "\u518d\u67e5\u4e00\u4e0b\u5f53\u524d\u9ec4\u91d1\u548c\u6bd4\u7279\u5e01\u7684\u4ef7\u683c\u3002",
  );

  assert.match(text, /explicitly asks for web\/search-backed information/);
  assert.match(text, /Run Web-search budget: use at most 20 total Web search calls/);
}


function testGatewayConversationIdEpochForSchemaSensitiveToolsets() {
  const service = createService();
  const thread = { hermesSessionId: "session_a", singleWindow: true };
  const message = { id: "msg_1", taskGroupId: "group_1" };

  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["file"] }),
    "session_a_group_1_20260616-moira-interpretation-context-mcp-v1_file",
  );
  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["memory"] }),
    "session_a_group_1_20260616-moira-interpretation-context-mcp-v1_memory",
  );
  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["x_search"] }),
    "session_a_group_1_20260616-moira-interpretation-context-mcp-v1_x_search",
  );
  assert.equal(
    service.gatewayConversationId(thread, message, { allowed_toolsets: ["vision", "wardrobe", "file"] }),
    "session_a_group_1_20260616-moira-interpretation-context-mcp-v1_file-vision-wardrobe",
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

  assert.match(text, /hermes-mobile-permission-boundary-check/);
  assert.match(text, /HERMES_PERMISSION_APPROVAL_REQUIRED/);
  assert.match(text, /DELIVERY:the group delivery directory: C:\/group-delivery/);
  assert.match(text, /Attached task directory: Attached => C:\/project\/data/);
  assert.match(text, /single-window chat mode/);
  assert.match(text, /shared learning-plan topic chat/);
  assert.match(text, /source\.pdf: C:\/group-delivery\/source\.pdf/);
  assert.doesNotMatch(text, /SEMANTIC_ROUTE/);
  assert.match(text, /Keep final replies concise/);
  assert.match(text, /Do not surface internal task IDs/);
}

function testBuiltInNoteReceiptMetadataInstruction() {
  const service = createService();
  const direct = service.noteReceiptMetadataInstructions();
  assert.match(direct, /homeai-note/);
  assert.match(direct, /title: short readable Note title/);
  assert.match(direct, /save-to-Note action/);
  assert.match(direct, /For every final assistant reply/);
  assert.match(direct, /still include the comment/);

  const text = service.buildHermesInstructions(
    { hermesSessionId: "s" },
    { allowed_toolsets: ["file"] },
    { root: "C:/workspace" },
    "生成一份修复报告",
  );
  assert.match(text, /For every final assistant reply/);
  assert.match(text, /<!-- homeai-note/);
  assert.match(text, /Do not include secrets, access keys, private paths/);
}

function testDirectoryRunScopeInstructionPinsPluginDataWorkspace() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s", workspaceId: "li_yushuang" },
    {
      principal_id: "li_yushuang",
      principal_label: "Li",
      default_workspace: "C:/workspace/li",
      allowed_roots: ["C:/workspace/li/health"],
      allowed_toolsets: ["file", "health"],
    },
    { id: "li-health", root: "C:/workspace/li/health", workspaceId: "li_yushuang" },
    "summarize health content",
    { label: "Li health", path: "C:/workspace/li/health" },
    {
      directoryRunScope: {
        actorWorkspaceId: "owner",
        targetWorkspaceId: "li_yushuang",
        dataWorkspaceId: "li_yushuang",
        directoryScoped: true,
        scopeSource: "directory_binding",
      },
    },
  );

  assert.match(text, /Attached task directory: Li health => C:\/workspace\/li\/health/);
  assert.match(text, /Directory-bound data scope: target workspace li_yushuang; actor workspace owner/);
  assert.match(text, /Plugin and MCP calls for this directory-bound topic must use the target workspace data/);
  assert.doesNotMatch(text, /SEMANTIC_ROUTE/);
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

function testWardrobePluginTopicContextForcesSkillMcpAndSkipsDirectoryCleaning() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s", singleWindow: true },
    {
      principal_id: "owner",
      allowed_roots: ["C:/workspace"],
      allowed_toolsets: ["wardrobe", "vision", "file", "skills"],
      allowed_skills: ["productivity/wardrobe-style-operations"],
      required_skills: ["productivity/wardrobe-style-operations"],
    },
    { root: "C:/workspace", singleWindow: true },
    "Style these items",
    { label: "Plugin delivery", path: "C:/workspace/plugins/wardrobe" },
    {
      singleWindowMode: "task",
      pluginTopicContext: {
        pluginId: "wardrobe",
        requiredToolsets: ["wardrobe", "vision", "file", "skills"],
        requiredSkills: ["productivity/wardrobe-style-operations"],
        deliveryDirectory: {
          label: "Wardrobe",
          path: "C:/workspace/plugins/wardrobe",
        },
      },
      requiredSkillPreloads: [
        {
          path: "productivity/wardrobe-style-operations",
          profileId: "owner-full",
          content: "Wardrobe Skill body: call Wardrobe MCP before facts and write real Markdown deliverables.",
          loadedChars: 86,
          totalChars: 86,
        },
      ],
    },
  );

  assert.match(text, /Plugin topic context: wardrobe/);
  assert.match(text, /Required plugin MCP\/toolsets.*wardrobe, vision, file, skills/);
  assert.match(text, /Required plugin Skill path\(s\): productivity\/wardrobe-style-operations/);
  assert.match(text, /Server-side required Skill preload/);
  assert.match(text, /BEGIN REQUIRED SKILL: productivity\/wardrobe-style-operations/);
  assert.match(text, /Wardrobe Skill body: call Wardrobe MCP before facts/);
  assert.match(text, /END REQUIRED SKILL: productivity\/wardrobe-style-operations/);
  assert.match(text, /Wardrobe plugin source of truth/);
  assert.match(text, /Before giving a wardrobe answer about concrete items, call Wardrobe MCP/);
  assert.match(text, /write a real `\.md` file under the plugin delivery directory/);
  assert.doesNotMatch(text, /Attached task directory/);
  assert.doesNotMatch(text, /Use Skill: productivity\/directory-context-cleaning/);
  assert.doesNotMatch(text, /SEMANTIC_ROUTE/);
}

function testPluginCapabilityCatalogInstructionsSeparateActiveAndCatalogOnlyPlugins() {
  const service = createService();
  const text = service.buildHermesInstructions(
    { hermesSessionId: "s", singleWindow: true },
    {
      principal_id: "owner",
      allowed_roots: ["C:/workspace"],
      allowed_toolsets: ["file", "web", "wardrobe", "vision", "skills"],
      authorized_toolsets: ["file", "web", "wardrobe", "vision", "skills", "finance", "note"],
    },
    { root: "C:/workspace", singleWindow: true },
    "Style these items",
    null,
    {
      singleWindowMode: "chat",
      pluginCapabilityContext: {
        activeSchemaSet: {
          active_toolsets: ["file", "web", "wardrobe", "vision", "skills"],
          active_plugin_toolsets: ["wardrobe"],
          omitted_plugin_toolsets: ["finance", "note"],
        },
        activePluginToolsets: ["wardrobe"],
        omittedPluginToolsets: ["finance", "note"],
        catalog: [
          { pluginId: "wardrobe", label: "Wardrobe", toolset: "wardrobe", status: "active", summary: "Inspect wardrobe state." },
          { pluginId: "finance", label: "Finance", toolset: "finance", status: "unavailable", diagnostic: "gateway_worker_missing_toolset", summary: "Inspect ledgers." },
          { pluginId: "note", label: "Notes", toolset: "note", status: "catalog_only", summary: "Inspect notes." },
        ],
      },
    },
  );

  assert.match(text, /Plugin capability catalog/);
  assert.match(text, /Active plugin MCP\/toolsets: wardrobe/);
  assert.match(text, /Catalog-only plugin MCP\/toolsets: finance, note/);
  assert.match(text, /HERMES_TOOLSET_ESCALATION_REQUIRED/);
  assert.match(text, /finance \(Finance\): unavailable; toolset=finance/);
  assert.match(text, /Diagnostic: gateway_worker_missing_toolset/);
  assert.doesNotMatch(text, /`finance` toolset is enabled/);
  assert.doesNotMatch(text, /mcp_finance_list_ledgers/);
}

testPolicySummaryIncludesCallableToolHints();
testSchemaOverrideInstructionsCoverOrdinaryLowTools();
testExplicitWebSearchPrioritizesQualityAndUsesLargerBudget();
testWebSearchBudgetInstructionCanBeDisabled();
testChineseCurrentPriceRequestUsesExplicitSearchInstruction();
testGatewayConversationIdEpochForSchemaSensitiveToolsets();
testBuildHermesInstructionsPreservesChatAndAttachmentGuidance();
testBuiltInNoteReceiptMetadataInstruction();
testDirectoryRunScopeInstructionPinsPluginDataWorkspace();
testBuildHermesInstructionsIncludesSemanticRoutingForTaskStream();
testWardrobePluginTopicContextForcesSkillMcpAndSkipsDirectoryCleaning();
testPluginCapabilityCatalogInstructionsSeparateActiveAndCatalogOnlyPlugins();

console.log("gateway-run-instruction-service tests passed");
