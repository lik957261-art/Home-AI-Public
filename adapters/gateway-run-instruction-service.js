"use strict";

const { explicitSearchContext } = require("./gateway-run-search-budget-service");
const { formatEnvironmentContextInstructions } = require("./environment-context-service");

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260629-wardrobe-wear-intent-v970";
const MOVIE_MCP_CALLABLES = Object.freeze([
  "mcp_movie_search_sources",
  "mcp_movie_recommend_sources",
  "mcp_movie_get_source_detail",
  "mcp_movie_get_catalog_stats",
  "mcp_movie_record_source_interaction",
  "mcp_movie_update_source_list",
  "mcp_movie_list_source_state",
]);

function defaultDedupe(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function ordinalNumber(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  const lastTwo = number % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${number}th`;
  const last = number % 10;
  if (last === 1) return `${number}st`;
  if (last === 2) return `${number}nd`;
  if (last === 3) return `${number}rd`;
  return `${number}th`;
}

function createGatewayRunInstructionService(options = {}) {
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const toolSchemaEpoch = String(options.toolSchemaEpoch || DEFAULT_TOOL_SCHEMA_EPOCH);
  const normalizeSingleWindowMode = typeof options.normalizeSingleWindowMode === "function"
    ? options.normalizeSingleWindowMode
    : ((value) => String(value || "").trim());
  const createDeliveryBoundaryInstructions = typeof options.createDeliveryBoundaryInstructions === "function"
    ? options.createDeliveryBoundaryInstructions
    : (() => "");
  const permissionBoundarySkillInstructions = typeof options.permissionBoundarySkillInstructions === "function"
    ? options.permissionBoundarySkillInstructions
    : (() => "");
  const semanticProjectRoutingInstructions = typeof options.semanticProjectRoutingInstructions === "function"
    ? options.semanticProjectRoutingInstructions
    : (() => "");
  const isKanbanCaseTopicThread = typeof options.isKanbanCaseTopicThread === "function"
    ? options.isKanbanCaseTopicThread
    : (() => false);
  const webSearchMaxCalls = Math.max(0, Math.floor(Number(options.webSearchMaxCalls) || 0));
  const explicitWebSearchMaxCalls = Math.max(0, Math.floor(Number(options.explicitWebSearchMaxCalls) || 0));

  function policyToolsets(policy = {}) {
    return dedupe(policy.allowed_toolsets || policy.allowedToolsets || []);
  }

  function policyHasToolset(policy = {}, toolset = "") {
    const target = String(toolset || "").trim();
    if (!target) return false;
    return policyToolsets(policy).includes(target);
  }

  function callableFunctionHintsForToolsets(toolsets = []) {
    const hintsByToolset = {
      web: ["mobile_web_search", "mobile_web_extract", "web_search", "web_extract"],
      search: ["mobile_web_search", "mobile_web_extract", "web_search", "web_extract"],
      x_search: ["x_search"],
      http: ["http_request"],
      weather: ["weather"],
      file: ["read_file", "write_file", "patch", "search_files", "docx_create", "docx_extract_text", "office_extract_text", "pptx_create", "pptx_validate", "pdf_create", "pdf_extract_text", "pdf_render_pages", "audio_transcribe", "archive_list", "archive_extract_safe"],
      vision: ["vision_analyze"],
      image_gen: ["image_generate", "chatgpt_image_edit", "chatgpt_image_erase", "image_edit", "image_erase"],
      wardrobe: [
        "mcp_wardrobe_wardrobe_write_item",
        "mcp_wardrobe_wardrobe_write_history",
        "mcp_wardrobe_wardrobe_upload_photo",
        "mcp_wardrobe_wardrobe_set_primary_photo",
        "mcp_wardrobe_wardrobe_get_item",
        "mcp_wardrobe_wardrobe_search_items",
        "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent",
        "mcp_wardrobe_wardrobe_execute_outfit_wear_intent",
      ],
      finance: [
        "mcp_finance_list_ledgers",
        "mcp_finance_list_transactions",
        "mcp_finance_get_summary",
        "mcp_finance_get_report",
        "mcp_finance_create_transaction",
        "mcp_finance_add_transaction_attachment",
        "mcp_finance_reference_object_types",
        "mcp_finance_reference_get",
        "mcp_finance_reference_summarize",
        "mcp_finance_get_owner_asset_summary",
        "mcp_finance_list_owner_asset_snapshots",
        "mcp_finance_upsert_owner_asset_snapshot",
        "mcp_finance_get_owner_stock_summary",
        "mcp_finance_list_owner_stock_snapshots",
        "mcp_finance_apply_owner_stock_position_delta",
      ],
      health: [
        "mcp_health_records_get_summary",
        "mcp_health_sleep_records_list",
        "mcp_health_recovery_sleep_list",
        "mcp_health_apple_sleep_records_list",
        "mcp_health_apple_ecg_records_list",
        "mcp_health_apple_ecg_record_get",
        "mcp_health_apple_daily_summaries_list",
        "mcp_health_apple_workouts_list",
      ],
      moira: [
        "mcp_moira_list_records",
        "mcp_moira_get_chart_evidence",
        "mcp_moira_get_interpretation_context",
        "mcp_moira_get_analysis_evidence_bundle",
        "mcp_moira_get_rule_evidence_bundle",
        "mcp_moira_get_year_forecast_evidence",
        "mcp_moira_get_current_progression_evidence",
        "mcp_moira_get_pick_day_evidence",
        "mcp_moira_get_monthly_selection_evidence",
        "mcp_moira_get_transit_event_evidence",
        "mcp_moira_get_eclipse_event_evidence",
        "mcp_moira_get_aspect_evidence",
        "mcp_moira_get_pick_change_position_evidence",
        "mcp_moira_get_fixed_star_change_position_evidence",
        "mcp_moira_get_rule_migration_status",
        "mcp_moira_get_rule_commentary_readiness",
        "mcp_moira_get_functional_coverage_status",
      ],
      music: [
        "mcp_music_music_search_library",
        "mcp_music_music_get_now_playing",
        "mcp_music_music_roon_status",
        "mcp_music_music_roon_listening_summary",
        "mcp_music_music_get_taste_profile",
        "mcp_music_music_get_recommendation_context",
        "mcp_music_music_get_favorites",
        "mcp_music_music_collection_items",
        "mcp_music_music_collection_item_detail",
        "mcp_music_music_collection_add",
        "mcp_music_music_collection_add_batch",
        "mcp_music_music_collection_remove",
        "mcp_music_music_collection_promote_ai",
        "mcp_music_music_collection_item_volume_calibrate",
        "mcp_music_music_tidal_auth_status",
        "mcp_music_music_tidal_search",
        "mcp_music_music_tidal_collection_items",
        "mcp_music_music_tidal_collection_sync",
        "mcp_music_music_tidal_normalization_status",
        "mcp_music_music_tidal_album_normalization_analyze",
        "mcp_music_music_tidal_collection_normalization_analyze",
        "mcp_music_music_tidal_track_normalization",
        "mcp_music_music_roon_browse",
        "mcp_music_music_resolve_roon_item",
        "mcp_music_music_roon_recent_listening",
        "mcp_music_music_play_collection_item_on_zone",
        "mcp_music_music_play_collection_album_on_zone",
        "mcp_music_music_play_local_track_on_zone",
        "mcp_music_music_demo_save_plan",
        "mcp_music_music_demo_list_plans",
        "mcp_music_music_demo_get_plan",
        "mcp_music_music_demo_delete_plan",
        "mcp_music_music_demo_set_active_plan",
        "mcp_music_music_demo_current_state",
        "mcp_music_music_demo_match_now_playing",
        "mcp_music_music_demo_advance_to_track",
        "mcp_music_music_demo_rebind_plan",
        "mcp_music_music_demo_generate_narrations",
        "mcp_music_music_demo_prepare_narrations_for_playback",
        "mcp_music_music_demo_narration_job_status",
        "mcp_music_music_demo_attach_narrations",
        "mcp_music_music_demo_stage_narrations_for_roon",
        "mcp_music_music_demo_map_narrations_from_roon",
        "mcp_music_music_demo_cleanup_narrations",
        "mcp_music_music_get_album_tags",
        "mcp_music_music_get_album_volume_tag",
        "mcp_music_music_local_library_overview",
        "mcp_music_music_local_albums",
        "mcp_music_music_local_album_detail",
        "mcp_music_music_local_album_volume_calibrate",
        "mcp_music_music_local_track_volume_calibrate",
        "mcp_music_music_management_capabilities",
        "mcp_music_music_hifi_profile_get",
        "mcp_music_music_hifi_profile_update",
        "mcp_music_music_tags_list",
        "mcp_music_music_tag_create",
        "mcp_music_music_album_tags_apply",
        "mcp_music_music_album_tags_remove",
        "mcp_music_music_ai_tag_suggestions",
        "mcp_music_music_album_find_duplicates",
        "mcp_music_music_album_merge_plan",
        "mcp_music_music_album_mark_deleted",
        "mcp_music_music_album_restore",
        "mcp_music_music_album_set_primary_version",
        "mcp_music_music_album_cover_status",
        "mcp_music_music_cover_batch_plan",
        "mcp_music_music_album_cover_replace_plan",
        "mcp_music_music_album_cover_replace_apply",
        "mcp_music_music_album_cover_restore",
        "mcp_music_music_playlist_generate_plan",
        "mcp_music_music_loudness_status",
        "mcp_music_music_track_quality_analyze",
        "mcp_music_music_album_quality_analyze",
        "mcp_music_music_plan_playlist",
        "mcp_music_music_map_device_volume",
        "mcp_music_music_loudness_analyze_missing",
        "mcp_music_music_tracks_query_by_format",
        "mcp_music_music_tracks_query_by_loudness",
        "mcp_music_music_tracks_query_by_quality",
        "mcp_music_music_playback_zones",
        "mcp_music_music_now_playing",
        "mcp_music_music_playback_control",
        "mcp_music_music_set_volume",
        "mcp_music_music_boulder_status",
        "mcp_music_music_boulder_set_master_volume",
        "mcp_music_music_volume_policy_preview",
        "mcp_music_music_play_tracks_with_volume_policy",
        "mcp_music_music_playback_volume_offset_set",
        "mcp_music_music_browse_action_on_zone",
        "mcp_music_music_play_album_on_zone",
        "mcp_music_music_play_track_on_zone",
        "mcp_music_music_play_playlist_on_zone",
      ],
      movie: MOVIE_MCP_CALLABLES,
      email: [
        "mcp_email_list_accounts",
        "mcp_email_list_mailboxes",
        "mcp_email_search_messages",
        "mcp_email_get_message",
        "mcp_email_get_message_body",
        "mcp_email_get_digest",
        "mcp_email_list_attachments",
        "mcp_email_get_attachment_content",
        "mcp_email_sync_account",
        "mcp_email_apply_mail_action",
        "mcp_email_delete_local_by_search",
        "mcp_email_apply_mail_action_bulk",
      ],
      messaging: ["send_message"],
      tts: ["text_to_speech"],
      skills: ["skills_list", "skill_view", "skill_manage"],
      todo: ["todo"],
      kanban: ["kanban_show", "kanban_complete", "kanban_block", "kanban_heartbeat", "kanban_comment", "kanban_create", "kanban_link"],
      cronjob: ["cronjob_mobile", "http_request", "cronjob"],
      memory: ["memory"],
      session_search: ["session_search"],
      clarify: ["clarify"],
    };
    return dedupe(toolsets)
      .filter((name) => Array.isArray(hintsByToolset[name]) && hintsByToolset[name].length)
      .map((name) => `${name} -> ${hintsByToolset[name].join(", ")}`);
  }

  function formatAccessPolicyInstructionSummary(policy = {}) {
    const lines = [
      "Current run access policy summary (authoritative; supersedes older permission statements in conversation_history):",
    ];
    const principal = String(policy.principal_id || policy.principalId || "").trim();
    const accessMode = String(policy.access_mode || policy.accessMode || "restricted").trim() || "restricted";
    const roots = dedupe([
      policy.default_workspace || policy.defaultWorkspace || "",
      ...(policy.allowed_roots || policy.allowedRoots || []),
    ].filter(Boolean));
    const toolsets = policyToolsets(policy);
    const allowedSkills = dedupe(policy.allowed_skills || policy.allowedSkills || []);
    const requiredSkills = dedupe(policy.required_skills || policy.requiredSkills || []);
    const connectorProfiles = policy.connector_profiles && typeof policy.connector_profiles === "object"
      ? Object.keys(policy.connector_profiles).sort()
      : [];
    if (principal) lines.push(`- Principal: ${principal}`);
    lines.push(`- Access mode: ${accessMode}`);
    if (roots.length) lines.push(`- Allowed roots: ${roots.join("; ")}`);
    if (toolsets.length) lines.push(`- Enabled toolsets: ${toolsets.join(", ")}`);
    const callableHints = callableFunctionHintsForToolsets(toolsets);
    if (callableHints.length) {
      lines.push(`- Callable function names for enabled toolsets: ${callableHints.join("; ")}`);
      if (toolsets.includes("http")) lines.push("- For HTTP/API Program calls, use `http_request`; do not look for or mention a `web_request` function.");
      if (toolsets.includes("http")) lines.push("- For Program API file uploads, pass in-scope local image bytes through `http_request.file_body` or `http_request.multipart_files`; do not put local path strings or file:// URLs inside the target API JSON body.");
      if (toolsets.includes("file")) lines.push("- For Word DOCX text extraction, use `docx_extract_text` when `read_file` cannot decode the Office Open XML package directly.");
      if (toolsets.includes("file")) lines.push("- For explicit Word/DOCX generation requests, use `docx_create` to write a real `.docx` file inside allowed roots and include its returned `MEDIA:<path>` line in the final answer.");
      if (toolsets.includes("file")) lines.push("- For PowerPoint PPTX/PPTM and Excel XLSX/XLSM text extraction, use `office_extract_text` when `read_file` cannot decode the Office Open XML package directly.");
      if (toolsets.includes("file")) lines.push("- For explicit PowerPoint deck generation requests, use `pptx_create` to write a real `.pptx` file inside allowed roots; it must pass compatibility validation before it returns a `MEDIA:<path>` line. Use `pptx_validate` to re-check existing in-scope decks when compatibility is in doubt.");
      if (toolsets.includes("file")) lines.push("- For explicit PDF generation requests, use `pdf_create` to write a real `.pdf` file inside allowed roots and include its returned `MEDIA:<path>` line in the final answer.");
      if (toolsets.includes("file")) lines.push("- For PDF reports, use `pdf_extract_text` first; if the PDF has no text layer or text is empty, use `pdf_render_pages` and pass the rendered page images to the vision/OCR tool. Do not ask the user to export PDF pages manually.");
      if (toolsets.includes("file")) lines.push("- For MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC voice notes or reading-retelling audio, use `audio_transcribe`; do not route audio-only files through `video_analyze` or ask the user to convert audio to video.");
      if (toolsets.includes("file")) lines.push("- For ZIP archives inside allowed roots, use `archive_list` to inspect entries and `archive_extract_safe` to extract safely; do not ask for Owner elevation or shell merely to unzip an in-scope archive.");
      if (toolsets.includes("cronjob")) lines.push("- For Hermes Mobile automation jobs, use `cronjob_mobile` when available; if it is absent, use `http_request` with url `hermes-mobile://cron` and the automation action/job fields in `json`; raw `cronjob` may point at an empty profile-local scheduler namespace.");
    }
    if (allowedSkills.length) lines.push(`- Allowed Skills: ${allowedSkills.join(", ")}`);
    if (requiredSkills.length) lines.push(`- Required Skills: ${requiredSkills.join(", ")}`);
    if (connectorProfiles.length) lines.push(`- External connector profiles: ${connectorProfiles.join(", ")}`);
    else lines.push("- External connector profiles: none");
    return lines.join("\n");
  }

  function gatewayConversationId(thread = {}, userMessage = {}, runPolicy = {}) {
    const base = thread.singleWindow
      ? `${thread.hermesSessionId}_${userMessage.taskGroupId || userMessage.id}`
      : thread.hermesSessionId;
    const toolsets = policyToolsets(runPolicy);
    if (!toolsets.length) return base;
    const signature = toolsets.slice().sort().join("-");
    return `${base}_${toolSchemaEpoch}_${signature}`;
  }

  function webSearchBudgetForOptions(buildOptions = {}) {
    const context = explicitSearchContext(buildOptions);
    if ((context.explicitWeb || context.explicitX) && explicitWebSearchMaxCalls > 0) {
      return explicitWebSearchMaxCalls;
    }
    return webSearchMaxCalls;
  }

  function currentToolSchemaOverrideInstructions(policy = {}, buildOptions = {}) {
    const lines = [];
    if (policyHasToolset(policy, "http")) {
      lines.push(
        "Current tool schema override: the `http` toolset is enabled for this run, and its callable function names include `http_request`.",
        "Ignore older assistant statements in conversation_history that claimed `http_request`, `web_request`, HTTP tools, or API Program tools were unavailable; those statements described earlier runs and are stale.",
        "Before reporting that an HTTP/API Program tool is unavailable, check the current run's actual callable functions. If `http_request` is available, use it for allowed HTTP/API Program calls.",
        "For allowed Program API image uploads, `http_request` can send in-scope local JPG/JPEG/PNG-style file bytes through `file_body` or `multipart_files`; never claim upload success after sending only a local path string."
      );
    }
    if (policyHasToolset(policy, "file")) {
      lines.push(
        "Current tool schema override: the `file` toolset is enabled for this run. Word DOCX generation is available as `docx_create`; Word DOCX text extraction is available as `docx_extract_text`; PowerPoint PPTX/PPTM and Excel XLSX/XLSM text extraction is available as `office_extract_text`; real PowerPoint PPTX generation is available as `pptx_create`; PowerPoint compatibility validation is available as `pptx_validate`; PDF generation is available as `pdf_create`; PDF text extraction and page rendering are available as `pdf_extract_text` / `pdf_render_pages`; audio transcription for MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC files is available as `audio_transcribe`; and ZIP listing/safe extraction is available as `archive_list` / `archive_extract_safe`, when the file is inside the current allowed roots.",
        "For .docx/.docm/.dotx/.dotm files, use `docx_extract_text` if `read_file` cannot decode the Office Open XML package directly.",
        "When the user explicitly asks for Word/DOCX, use `docx_create` rather than producing only Markdown, HTML, or a renamed pseudo-DOCX. Write the `.docx` under an allowed delivery/workspace root and include the returned `MEDIA:<path>` line.",
        "For .pptx/.pptm/.potx/.potm/.ppsx/.ppsm/.xlsx/.xlsm/.xltx/.xltm files, use `office_extract_text` if `read_file` cannot decode the Office Open XML package directly.",
        "When the user explicitly asks for a PowerPoint/PPTX deck, use `pptx_create` rather than producing only Markdown, HTML, or a renamed pseudo-PPT. Write the `.pptx` under an allowed delivery/workspace root and include the returned `MEDIA:<path>` line only after compatibility validation succeeds; call `pptx_validate` on existing in-scope decks when the user reports PowerPoint open failures.",
        "When the user explicitly asks for PDF, use `pdf_create` rather than producing only Markdown, HTML, or a renamed pseudo-PDF. Write the `.pdf` under an allowed delivery/workspace root and include the returned `MEDIA:<path>` line.",
        "For .pdf files, use `pdf_extract_text` first. If hasTextLayer is false or the extracted text is empty, use `pdf_render_pages` and then use the rendered image paths with vision/OCR. Do not tell the user to export PDF pages manually.",
        "For audio-only files such as .mp3/.m4a/.wav/.aac/.ogg/.opus/.amr/.flac, use `audio_transcribe`; `video_analyze` is for video files and should not be used as an audio transcription substitute.",
        "For .zip files, use `archive_list` first when the contents are unknown, then `archive_extract_safe` when extraction is needed; do not ask the user to unzip the archive manually.",
        "Do not ask the user to convert an ordinary current-workspace audio file into a blank video just to work around a missing audio transcription function.",
        "Do not request Owner elevation merely because an ordinary current-workspace DOCX/Office/PPTX/PDF extraction or generation, ZIP extraction, or audio transcription tool is missing from an older callable schema. That is a Hermes Mobile deployment/schema mismatch, not a high-privilege operation."
      );
    }
    if (policyHasToolset(policy, "web") || policyHasToolset(policy, "search")) {
      const budget = webSearchBudgetForOptions(buildOptions);
      const searchContext = explicitSearchContext(buildOptions);
      lines.push(
        "Current tool schema override: the `web`/`search` toolsets are enabled for this run. Prefer callable function names `mobile_web_search` and `mobile_web_extract`; compatibility names `web_search` and `web_extract` may also be present.",
        "For public web lookup, use `mobile_web_search` when available. For public URL text extraction, use `mobile_web_extract` when available."
      );
      if (searchContext.explicitWeb) {
        lines.push(
          "The newest user request explicitly asks for web/search-backed information. Optimize for source quality, meaningful coverage, and verifiable evidence over saving a small amount of time or tokens.",
          "Use several focused query refinements when needed, compare independent sources, extract the most relevant pages, and clearly state evidence limits. Do not stop after a shallow first result when the task depends on current or hard-to-find public information."
        );
      }
      if (budget > 0) {
        lines.push(
          `Run Web-search budget: use at most ${budget} total Web search calls in this run across \`mobile_web_search\`, \`web_search\`, and hosted \`web_search_call\`.`,
          "Plan search queries before calling tools, combine related terms, use `mobile_web_extract` for known URLs instead of starting another search, and stop searching once enough evidence is available.",
          `Do not start a ${ordinalNumber(budget + 1)} Web search call. If more search would be needed, return the best evidence-labeled partial answer or ask the user for approval to continue instead of continuing the search loop.`
        );
      }
    }
    if (policyHasToolset(policy, "x_search")) {
      lines.push(
        "Current tool schema override: the `x_search` toolset is enabled for this run, and its callable function name is `x_search` when available. In ordinary ChatGPT Gateway profiles, `x_search` may be a Hermes Mobile proxy that queries the dedicated Grok Gateway and returns bounded search findings to this run.",
        "For X/Twitter lookup, use `x_search` when available. Do not claim X was searched unless `x_search` was actually available and used."
      );
    }
    if (policyHasToolset(policy, "cronjob")) {
      lines.push(
        "Current tool schema override: the `cronjob` toolset is enabled for this run. For Hermes Mobile automations, prefer `cronjob_mobile` when available; if it is absent, use `http_request` with url `hermes-mobile://cron` and a JSON body containing the automation action/job fields. Both paths talk to the live Mobile automation bridge and scope list/create/update/pause/resume/delete by `owner_principal_id`.",
        "Set `owner_principal_id` to the current run Principal exactly. Do not use `cronjob_mobile` or `http_request` with `hermes-mobile://cron` to inspect or mutate another principal's jobs unless the current run is explicitly Owner-authorized for that target.",
        "If raw `cronjob list` returns zero jobs, do not treat that as proof Hermes Mobile has no automations; raw `cronjob` may be connected to the Gateway profile-local scheduler rather than the Mobile live automation store."
      );
    }
    if (policyHasToolset(policy, "image_gen")) {
      lines.push(
        "Current tool schema override: the `image_gen` toolset is enabled for this run, and its callable function names include `image_generate`, `chatgpt_image_edit`, and `chatgpt_image_erase`; compatibility names `image_edit` and `image_erase` may also be present.",
        "For existing-image retouching, object removal, background cleanup, P image requests, or erase/inpainting requests, prefer `chatgpt_image_edit` or `chatgpt_image_erase` when available; `image_edit` and `image_erase` are compatibility names, and `image_generate` is only for creating a new image.",
        "Do not request Owner elevation merely because an ordinary current-workspace image editing tool is missing from the current callable schema. That is a Hermes Mobile deployment/schema mismatch, not a high-privilege operation.",
        "Ignore older assistant statements in conversation_history that claimed image editing, image erasing, `chatgpt_image_edit`, `chatgpt_image_erase`, `image_edit`, or `image_erase` tools were unavailable; those statements described earlier runs and are stale.",
        "Before reporting that image editing or image erasing is unavailable, check the current run's actual callable functions. If `chatgpt_image_edit`, `chatgpt_image_erase`, `image_edit`, or `image_erase` is available, use it for allowed current-account image edits."
      );
    }
    if (policyHasToolset(policy, "wardrobe")) {
      lines.push(
        "Current tool schema override: the `wardrobe` toolset is enabled for this run. Callable function names normally begin with `mcp_wardrobe_`, including `mcp_wardrobe_wardrobe_write_item`, `mcp_wardrobe_wardrobe_write_history`, `mcp_wardrobe_wardrobe_upload_photo`, `mcp_wardrobe_wardrobe_set_primary_photo`, `mcp_wardrobe_wardrobe_get_item`, `mcp_wardrobe_wardrobe_search_items`, `mcp_wardrobe_wardrobe_prepare_outfit_wear_intent`, and `mcp_wardrobe_wardrobe_execute_outfit_wear_intent`.",
        "For wardrobe ingest, writeback, photo upload, primary-photo updates, outfit wear-intent preparation/execution, and readback verification, use the `mcp_wardrobe_*` callable functions when they are present.",
        "Do not report that the run lacks wardrobe capability solely because an older conversation turn said only file or vision tools were available. Check the current run's callable functions first.",
        "If `Enabled toolsets` includes `wardrobe` but the current callable schema still lacks `mcp_wardrobe_*`, treat that as a Gateway schema mismatch and request toolset/schema recovery instead of pretending the write completed."
      );
    }
    if (policyHasToolset(policy, "finance")) {
      lines.push(
        "Current tool schema override: the `finance` toolset is enabled for this run. Callable function names normally begin with `mcp_finance_`, including `mcp_finance_list_ledgers`, `mcp_finance_list_transactions`, `mcp_finance_get_summary`, `mcp_finance_get_report`, `mcp_finance_create_transaction`, `mcp_finance_add_transaction_attachment`, `mcp_finance_reference_object_types`, `mcp_finance_reference_get`, `mcp_finance_reference_summarize`, `mcp_finance_get_owner_asset_summary`, `mcp_finance_list_owner_asset_snapshots`, `mcp_finance_upsert_owner_asset_snapshot`, `mcp_finance_get_owner_stock_summary`, `mcp_finance_list_owner_stock_snapshots`, and `mcp_finance_apply_owner_stock_position_delta`.",
        "For ledger lookup, annual/monthly spending analysis, transaction search, reports, Finance writeback, create-time attachments, adding image/file attachments to an existing transaction, resolving stable Finance object references for Note/Reference Graph links, and Owner-only asset summaries, use the `mcp_finance_*` callable functions when they are present.",
        "For Owner-only asset lookups, call `mcp_finance_get_owner_asset_summary` or `mcp_finance_list_owner_asset_snapshots` when present. If the current principal is not Owner or the callable schema lacks these names, report the bounded permission/schema issue instead of inventing a generic asset interface.",
        "For stock holding valuation, call `mcp_finance_get_owner_stock_summary` when present; it should use live stock prices and FX. For natural-language buy/sell/adjust updates, call `mcp_finance_apply_owner_stock_position_delta` instead of asking the user to provide live market prices or exchange rates.",
        "For an existing Finance transaction attachment backed by a Hermes upload/local server path, call `mcp_finance_add_transaction_attachment` with `transaction_id` and `file_path` set to that server-local upload path; `upload_path` is an accepted alias. Do not put a local path, `MEDIA:<path>`, or `file://` URL into `data_url`; `data_url` must be a real base64 data URL.",
        "Do not call `mcp_finance_add_transaction_attachment` without one attachment source field: `file_path`, `upload_path`, `data_url`, or `data_base64`. If the current run lacks all four fields in the callable schema, report a Gateway schema mismatch instead of attempting an empty attachment call.",
        "Do not report that Finance MCP is unavailable solely because older conversation_history said it was missing. Check the current run's callable functions first.",
        "If `Enabled toolsets` includes `finance` but the current callable schema still lacks `mcp_finance_*`, treat that as a Gateway schema mismatch and request toolset/schema recovery instead of falling back to cleaned files as an MCP result."
      );
    }
    if (policyHasToolset(policy, "health")) {
      lines.push(
        "Current tool schema override: the `health` toolset is enabled for this run. Callable function names normally begin with `mcp_health_`, including `mcp_health_records_get_summary`, `mcp_health_sleep_records_list`, `mcp_health_apple_ecg_records_list`, and `mcp_health_apple_ecg_record_get` when the plugin wrapper exposes local tool names correctly.",
        "For sleep questions, prefer `mcp_health_sleep_records_list`; it merges Apple Health sleepAnalysis with recovery sleep records. `mcp_health_recovery_sleep_list` is backward-compatible and should also return Apple Health rows when `sourceType` is Apple Health. For Apple Watch ECG waveform analysis, list records with `mcp_health_apple_ecg_records_list` and fetch one waveform with `mcp_health_apple_ecg_record_get`.",
        "If Health callables are double-prefixed such as `mcp_health_mcp_health_records_get_summary`, treat that as a plugin wrapper naming bug rather than a valid callable contract."
      );
    }
    if (policyHasToolset(policy, "moira")) {
      lines.push(
        "Current tool schema override: the `moira` toolset is enabled for this run. Callable function names normally begin with `mcp_moira_`, including `mcp_moira_list_records`, `mcp_moira_get_chart_evidence`, `mcp_moira_get_interpretation_context`, `mcp_moira_get_analysis_evidence_bundle`, `mcp_moira_get_rule_evidence_bundle`, `mcp_moira_get_year_forecast_evidence`, `mcp_moira_get_current_progression_evidence`, `mcp_moira_get_pick_day_evidence`, `mcp_moira_get_monthly_selection_evidence`, `mcp_moira_get_transit_event_evidence`, `mcp_moira_get_eclipse_event_evidence`, `mcp_moira_get_aspect_evidence`, `mcp_moira_get_pick_change_position_evidence`, `mcp_moira_get_fixed_star_change_position_evidence`, `mcp_moira_get_rule_migration_status`, `mcp_moira_get_rule_commentary_readiness`, and `mcp_moira_get_functional_coverage_status`.",
        "Use Moira MCP only as a read-only evidence source for saved chart records, birth chart structure, annual-flow evidence, current/progression evidence, PICK/择日 candidate evidence, 择月 candidate evidence, transit/aspect/eclipse/change-position evidence, and rule/coverage readiness facts. The model owns final interpretation; do not claim Moira generated a complete fortune narrative.",
        "When starting a broad Moira chart analysis, prefer `mcp_moira_get_analysis_evidence_bundle` first when present; it returns the bounded chart, annual/current, aspect, transit, eclipse and optional PICK/month evidence sections without generating a final fortune narrative. For rule-focused analysis, use `mcp_moira_get_rule_evidence_bundle` to get bounded full/current/PICK readiness, verdict bridges and open migration boundaries. Use `mcp_moira_get_interpretation_context` when only routing/completeness guidance is needed.",
        "Moira PICK/择日吉凶 verdicts are not authoritative unless the returned evidence explicitly includes promoted rule commentary. Treat status-only PICK/month evidence as calculation facts, not as a complete auspicious/inauspicious judgment.",
        "Do not pass `workspace_id` or `workspaceId` to Moira MCP calls. The Gateway profile is already bound to one Moira workspace/key; if the callable schema lacks `mcp_moira_*` while `Enabled toolsets` includes `moira`, report a Gateway schema mismatch instead of inventing astrology evidence."
      );
    }
    if (policyHasToolset(policy, "music")) {
      lines.push(
        "Current tool schema override: the `music` toolset is enabled for this run. Callable function names normally begin with `mcp_music_music_`, including `mcp_music_music_local_library_overview`, `mcp_music_music_local_albums`, `mcp_music_music_local_album_detail`, `mcp_music_music_local_album_volume_calibrate`, `mcp_music_music_local_track_volume_calibrate`, `mcp_music_music_get_album_volume_tag`, `mcp_music_music_collection_items`, `mcp_music_music_collection_item_detail`, `mcp_music_music_collection_add`, `mcp_music_music_collection_add_batch`, `mcp_music_music_collection_remove`, `mcp_music_music_collection_promote_ai`, `mcp_music_music_collection_item_volume_calibrate`, `mcp_music_music_tidal_auth_status`, `mcp_music_music_tidal_search`, `mcp_music_music_tidal_collection_items`, `mcp_music_music_tidal_collection_sync`, `mcp_music_music_tidal_normalization_status`, `mcp_music_music_tidal_album_normalization_analyze`, `mcp_music_music_tidal_collection_normalization_analyze`, `mcp_music_music_tidal_track_normalization`, `mcp_music_music_roon_browse`, `mcp_music_music_resolve_roon_item`, `mcp_music_music_roon_recent_listening`, `mcp_music_music_play_collection_item_on_zone`, `mcp_music_music_play_collection_album_on_zone`, `mcp_music_music_play_local_track_on_zone`, `mcp_music_music_demo_save_plan`, `mcp_music_music_demo_list_plans`, `mcp_music_music_demo_get_plan`, `mcp_music_music_demo_delete_plan`, `mcp_music_music_demo_set_active_plan`, `mcp_music_music_demo_current_state`, `mcp_music_music_demo_match_now_playing`, `mcp_music_music_demo_advance_to_track`, `mcp_music_music_demo_rebind_plan`, `mcp_music_music_demo_generate_narrations`, `mcp_music_music_demo_prepare_narrations_for_playback`, `mcp_music_music_demo_narration_job_status`, `mcp_music_music_demo_attach_narrations`, `mcp_music_music_demo_stage_narrations_for_roon`, `mcp_music_music_demo_map_narrations_from_roon`, `mcp_music_music_demo_cleanup_narrations`, `mcp_music_music_management_capabilities`, `mcp_music_music_hifi_profile_get`, `mcp_music_music_hifi_profile_update`, `mcp_music_music_tags_list`, `mcp_music_music_album_find_duplicates`, `mcp_music_music_album_cover_replace_plan`, `mcp_music_music_album_cover_replace_apply`, `mcp_music_music_album_cover_restore`, `mcp_music_music_playlist_generate_plan`, `mcp_music_music_plan_playlist`, `mcp_music_music_loudness_status`, `mcp_music_music_track_quality_analyze`, `mcp_music_music_album_quality_analyze`, `mcp_music_music_tracks_query_by_quality`, `mcp_music_music_map_device_volume`, `mcp_music_music_now_playing`, `mcp_music_music_playback_zones`, `mcp_music_music_playback_control`, `mcp_music_music_set_volume`, `mcp_music_music_boulder_status`, `mcp_music_music_boulder_set_master_volume`, `mcp_music_music_volume_policy_preview`, `mcp_music_music_play_tracks_with_volume_policy`, `mcp_music_music_playback_volume_offset_set`, `mcp_music_music_play_album_on_zone`, `mcp_music_music_play_track_on_zone`, `mcp_music_music_play_playlist_on_zone`, `mcp_music_music_get_taste_profile`, `mcp_music_music_get_recommendation_context`, `mcp_music_music_roon_listening_summary`, and `mcp_music_music_get_favorites`.",
        "Use Music MCP as the source of truth for local album statistics, sampled loudness and waveform status, Roon-observed listening summaries, favorites cache, HIFI equipment recommendation context, album tags, duplicate-album plans, playlist plans, and volume-tag recommendation context.",
        "For Music HiFi demo narration, use `mcp_music_music_demo_generate_narrations`, `mcp_music_music_demo_prepare_narrations_for_playback`, `mcp_music_music_demo_narration_job_status`, `mcp_music_music_demo_attach_narrations`, `mcp_music_music_demo_stage_narrations_for_roon`, `mcp_music_music_demo_map_narrations_from_roon`, and `mcp_music_music_demo_cleanup_narrations` when present; use `mcp_music_music_demo_rebind_plan` when a saved demo plan needs to be rebound to verified playback refs.",
        "Music MCP is Owner-only and reads the shared Music SQLite database through the selected Gateway profile. Do not pass a workspace override, and do not infer local catalog counts, volume tags, favorites, tags, duplicate state, playlist plans, or loudness status from the visible plugin UI alone.",
        "For Music management writes, prefer dry-run plan tools first. Soft-delete means metadata states such as hidden, duplicate, deprecated, or tombstoned; physical file deletion is not implemented. Cover search and candidate selection belong to the agent; Music MCP writes an explicitly selected local image/base64 or allowed direct cover `image_url` into the cover cache with backup/rollback. If only `source_url` is available and no image bytes are provided, Music MCP treats it as the candidate image URL. Do not use generic `http_request` to download cover art for Music writes. Playback control requires explicit confirmation/safety limits. For grouped Roon zones with multiple Devialet outputs, pass `output_ids` or a matching `output_name_contains` so Music applies volume to every selected output. For Music-managed volume-policy playback, AI may provide playlist items and an overall offset only; Music computes per-track absolute volume from Music-owned manual tags and explicit fallback policy. Predicted tags may be displayed as predictions, but main dCS/Boulder physical-volume automation uses only Music manual local/collection tags or the safe fallback.",
        "If `Enabled toolsets` includes `music` but the current callable schema still lacks `mcp_music_music_*`, treat that as a Gateway schema mismatch and request toolset/schema recovery instead of inventing music-library facts."
      );
    }
    if (policyHasToolset(policy, "movie")) {
      lines.push(
        `Current tool schema override: the \`movie\` toolset is enabled for this run. Callable function names normally begin with \`mcp_movie_\`, including ${MOVIE_MCP_CALLABLES.map((name) => `\`${name}\``).join(", ")}.`,
        "Movie MCP is Owner-only. Use it for Movie source catalog search, source recommendations, source detail readback, catalog stats, and local Movie preference/list state only. It must not be granted to non-Owner workspaces.",
        "`mcp_movie_search_sources` supports bounded library search over local and 115/CloudDrive2 indexed sources, including `source_category=115`, `actor`, `total_count`, `has_more`, pagination, and facets including `actor`. `mcp_movie_recommend_sources` may use taste hints, `actor`, `preferred_actors`, and local Movie preference/list state.",
        "`mcp_movie_record_source_interaction`, `mcp_movie_update_source_list`, and `mcp_movie_list_source_state` are limited to local Movie preference/list state. They must not play media, create stream URLs, mutate NAS files, switch projector/profile state, change subtitles/audio, poll devices, or control devices.",
        "Do not use Movie MCP to play media, create stream URLs, switch projector/profile state, change subtitles/audio, control devices, mutate NAS files, or expose private source paths unless the callable result explicitly returns bounded metadata for the current Owner run.",
        "If `Enabled toolsets` includes `movie` but the current callable schema still lacks `mcp_movie_*`, treat that as a Gateway schema mismatch and request toolset/schema recovery instead of inventing Movie source facts."
      );
    }
    return lines.join("\n");
  }

  function pluginTopicContextInstructions(buildOptions = {}) {
    const context = buildOptions.pluginTopicContext && typeof buildOptions.pluginTopicContext === "object"
      ? buildOptions.pluginTopicContext
      : null;
    const pluginId = String(context?.pluginId || "").trim().toLowerCase();
    if (!pluginId) return "";
    const requiredToolsets = dedupe(context.requiredToolsets || context.required_toolsets || []);
    const requiredSkills = dedupe(context.requiredSkills || context.required_skills || []);
    const deliveryDirectory = context.deliveryDirectory && typeof context.deliveryDirectory === "object"
      ? context.deliveryDirectory
      : null;
    const deliveryPath = String(deliveryDirectory?.path || deliveryDirectory?.root || "").trim();
    const deliveryLabel = String(deliveryDirectory?.label || "Plugin delivery directory").trim();
    const lines = [
      `Plugin topic context: ${pluginId}. Fixed plugin topics are separate from ordinary directory-bound topics.`,
      "Do not treat a plugin delivery directory as the plugin database or as cleaned source data. Do not run `productivity/directory-context-cleaning` for routine plugin-topic tasks unless the newest user message explicitly asks to clean/analyze files inside that delivery directory.",
    ];
    if (requiredToolsets.length) {
      lines.push(`Required plugin MCP/toolsets for this run: ${requiredToolsets.join(", ")}. Check the current callable schema and use the plugin MCP callables when present.`);
    }
    if (requiredSkills.length) {
      lines.push(`Required plugin Skill path(s): ${requiredSkills.join(", ")}. Load these exact Skill paths before plugin analysis or the final answer; do not substitute shorter or older Skill names.`);
    }
    if (deliveryPath) {
      lines.push(`Plugin delivery directory: ${deliveryLabel} => ${deliveryPath}. Use it only for user-facing outputs, curated receipts, and final Markdown artifacts; include MEDIA:<path> for files written there.`);
    }
    if (pluginId === "wardrobe") {
      lines.push(
        "Wardrobe plugin source of truth: use `productivity/wardrobe-style-operations` plus the `mcp_wardrobe_*` callable functions for item lookup, material/color/size facts, wardrobe history, photo checks, outfit reasoning, writeback, and readback verification.",
        "Before giving a wardrobe answer about concrete items, call Wardrobe MCP lookups/searches for the referenced items. Do not infer SKU, fabric, color, ownership state, or styling constraints from memory, generic fashion knowledge, or an empty delivery folder.",
        "If the `skills` toolset is enabled but `skill_view` cannot load `productivity/wardrobe-style-operations`, or the `wardrobe` toolset is enabled but `mcp_wardrobe_*` functions are absent, report that schema/profile mismatch instead of fabricating item facts.",
        "For Wardrobe Markdown deliverables, write a real `.md` file under the plugin delivery directory when available and return a MEDIA:<path> line. Do not provide only a non-resolvable placeholder link."
      );
    }
    return lines.join("\n");
  }

  function pluginCapabilityCatalogInstructions(buildOptions = {}) {
    const context = buildOptions.pluginCapabilityContext && typeof buildOptions.pluginCapabilityContext === "object"
      ? buildOptions.pluginCapabilityContext
      : null;
    const catalog = Array.isArray(context?.catalog) ? context.catalog : [];
    if (!catalog.length) return "";
    const activeToolsets = dedupe(context.activeSchemaSet?.active_toolsets || []);
    const activePluginToolsets = dedupe(context.activePluginToolsets || context.activeSchemaSet?.active_plugin_toolsets || []);
    const omittedPluginToolsets = dedupe(context.omittedPluginToolsets || context.activeSchemaSet?.omitted_plugin_toolsets || []);
    const lines = [
      "Plugin capability catalog: this is a compact catalog of authorized plugin capabilities for this workspace, not proof that their MCP schemas or data have been loaded in the current run.",
    ];
    if (activeToolsets.length) lines.push(`Active schema toolsets for this run: ${activeToolsets.join(", ")}.`);
    if (activePluginToolsets.length) lines.push(`Active plugin MCP/toolsets: ${activePluginToolsets.join(", ")}.`);
    if (omittedPluginToolsets.length) {
      lines.push(`Catalog-only plugin MCP/toolsets: ${omittedPluginToolsets.join(", ")}.`);
      lines.push("If the newest task genuinely needs a catalog-only plugin MCP/toolset, stop and emit HERMES_TOOLSET_ESCALATION_REQUIRED with compact JSON like {\"toolsets\":[\"finance\"],\"reason\":\"short reason\"}. Do not claim plugin facts from a catalog-only plugin before the escalation run activates that toolset and the callable schema is present.");
    }
    for (const entry of catalog.slice(0, 12)) {
      const pluginId = String(entry.pluginId || entry.plugin_id || "").trim();
      const label = String(entry.label || pluginId).trim();
      const toolset = String(entry.toolset || entry.primaryToolset || entry.primary_toolset || "").trim();
      const status = String(entry.status || "catalog_only").trim();
      const summary = String(entry.summary || "Authorized plugin capability.").trim();
      const diagnostic = String(entry.diagnostic || "").trim();
      if (!pluginId || !toolset) continue;
      lines.push(`- ${pluginId} (${label}): ${status}; toolset=${toolset}; ${summary}${diagnostic ? ` Diagnostic: ${diagnostic}` : ""}`);
    }
    return lines.join("\n");
  }

  function requiredSkillPreloadInstructions(buildOptions = {}) {
    const preloads = Array.isArray(buildOptions.requiredSkillPreloads)
      ? buildOptions.requiredSkillPreloads
      : [];
    if (!preloads.length) return "";
    const lines = [
      "Server-side required Skill preload: the following required Skill content has already been loaded into this run. Treat it as authoritative workflow context for this run; do not ignore it merely because no model-side `skill_view` call appears in the current turn.",
    ];
    for (const item of preloads) {
      const skillPath = String(item?.path || item?.skillPath || "").trim();
      if (!skillPath) continue;
      if (item.missing || !item.content) {
        lines.push(
          `Required Skill preload failed: ${skillPath}. Error: ${String(item.error || "required_skill_missing").slice(0, 160)}.`,
          "For plugin work that depends on this Skill, stop and report the missing Skill/schema problem instead of continuing from generic knowledge."
        );
        continue;
      }
      const loadedChars = Math.max(0, Number(item.loadedChars || String(item.content || "").length) || 0);
      const totalChars = Math.max(0, Number(item.totalChars || loadedChars) || 0);
      lines.push(
        `BEGIN REQUIRED SKILL: ${skillPath} (${loadedChars}/${totalChars} chars${item.truncated ? ", truncated" : ""})`,
        String(item.content || ""),
        `END REQUIRED SKILL: ${skillPath}`
      );
    }
    return lines.join("\n");
  }

  function noteReceiptMetadataInstructions() {
    return [
      "For every final assistant reply, append one hidden Markdown HTML comment at the very end so Home AI can later save a readable Note title without another model call:",
      "<!-- homeai-note",
      "title: short readable Note title",
      "tags: optional, comma-separated, non-sensitive tags",
      "-->",
      "This hidden metadata is only for Home AI's save-to-Note action. Do not display or explain it in visible prose. Keep the title concise and useful for a notes list. Do not include secrets, access keys, private paths, raw endpoints, or long user content in the metadata. For casual chat, acknowledgements, questions, or ordinary short replies, still include the comment, but keep the title short and leave tags empty unless a safe category is obvious.",
    ].join("\n");
  }

  function pluginConversationActionBridgeInstructions() {
    return [
      "Plugin conversation repair-request truth rule: an implementation repair card is not submitted unless Home AI returns a real Action Inbox id (`ainb_*`) or Codex task-card id (`ttc_*`). Do not invent `t_*`, `ainb_*`, or `ttc_*` ids, and do not say a card was submitted from ordinary prose, a Todo/Kanban item, or `homeai-note` metadata.",
      "`kanban_create` and legacy `t_*` ids are not Home AI repair-card transport. Never use a Kanban/Todo card as a substitute for an Owner-gated implementation repair request; for repair/capability gaps use the hidden request marker below or report that no real `ainb_*`/`ttc_*` was returned.",
      "When a host-side plugin conversation identifies a plugin-owned implementation gap, prepare a bounded Owner-gated repair request instead of pretending to call the plugin thread. Append one hidden Markdown HTML comment with exact JSON:",
      "<!-- homeai-plugin-conversation-action",
      "{\"pluginId\":\"plugin-id\",\"requestType\":\"catalog_missing\",\"severity\":\"H2\",\"title\":\"short title\",\"summary\":\"bounded problem summary\",\"suggestedChange\":\"bounded requested change\",\"acceptance\":\"focused acceptance checks\",\"evidence\":{\"catalog\":\"bounded catalog\",\"missingKey\":\"bounded_key\"}}",
      "-->",
      "When an ordinary chat, directory-bound topic, or low-permission Gateway identifies a Home AI platform/Gateway capability gap, prepare the same Owner-gated approval for the Home AI app thread. Append one hidden Markdown HTML comment with exact JSON:",
      "<!-- homeai-owner-task-request",
      "{\"pluginId\":\"home-ai\",\"requestType\":\"capability_gap\",\"severity\":\"H2\",\"title\":\"short title\",\"summary\":\"bounded platform problem summary\",\"suggestedChange\":\"bounded requested Home AI change\",\"acceptance\":\"focused acceptance checks\",\"evidence\":{\"capability\":\"bounded_capability\",\"affectedSurface\":\"directory-bound chat\"}}",
      "-->",
      "For Home AI platform requests, use `pluginId:\"home-ai\"`; do not route them to a plugin implementation workspace merely because the request was discovered while discussing a plugin or directory.",
      "Visible prose may say that a repair request has been prepared for Home AI Owner approval. It must not claim successful submission, dispatch, or thread delivery unless a real host/tool response with `ainb_*` or `ttc_*` is available in the current run.",
      "Never put raw health records, private plugin records, raw conversation transcripts, provider payloads, file paths, URLs with secrets, cookies, access keys, launch tokens, screenshots, uploads, full prompts, or long logs in the hidden repair request.",
    ].join("\n");
  }

  function buildHermesInstructions(thread, policy, project, latestText = "", taskDirectory = null, buildOptions = {}) {
    const singleWindowMode = normalizeSingleWindowMode(buildOptions.singleWindowMode || buildOptions.single_window_mode || "");
    const groupChatDeliveryRoot = String(buildOptions.groupChatDeliveryRoot || buildOptions.group_chat_delivery_root || "").trim();
    const groupChatAttachmentCopies = Array.isArray(buildOptions.groupChatAttachmentCopies)
      ? buildOptions.groupChatAttachmentCopies
      : [];
    const deliveryBoundaryOptions = groupChatDeliveryRoot
      ? { deliveryTarget: `the group delivery directory: ${groupChatDeliveryRoot}` }
      : {};
    const lines = [
      "You are serving a Hermes Mobile app request.",
      "Use the selected account/workspace/project as the operational boundary.",
      "Do not access, write, summarize, or expose files outside the allowed roots unless the account is unrestricted.",
      formatAccessPolicyInstructionSummary(policy),
      permissionBoundarySkillInstructions(policy),
      currentToolSchemaOverrideInstructions(policy, Object.assign({ latestText }, buildOptions)),
      pluginTopicContextInstructions(buildOptions),
      pluginCapabilityCatalogInstructions(buildOptions),
      formatEnvironmentContextInstructions(buildOptions.environmentContext),
      requiredSkillPreloadInstructions(buildOptions),
      pluginConversationActionBridgeInstructions(),
      noteReceiptMetadataInstructions(),
      "For current-account Kanban/Todo requests, use Hermes Mobile's Todo/Kanban capability in the current workspace. Do not run raw `hermes kanban` CLI commands or write directly under `~/.hermes/kanban`, because that can target a different local profile than the Mobile app.",
      "Prefer a concise final receipt in the mobile UI. If you create a user-facing artifact, include a MEDIA:<local_path> line so Hermes Mobile can render it as a link card.",
      "Do not send external chat/app messages unless the user explicitly asks for external delivery.",
      createDeliveryBoundaryInstructions(deliveryBoundaryOptions),
    ].filter(Boolean);
    const hasPluginTopicContext = Boolean(buildOptions.pluginTopicContext?.pluginId || buildOptions.pluginTopicContext?.plugin_id);
    if (taskDirectory?.path && !hasPluginTopicContext) {
      lines.push(`Attached task directory: ${taskDirectory.label || "Directory"} => ${taskDirectory.path}.`);
      if (buildOptions.directoryRunScope?.directoryScoped) {
        lines.push(`Directory-bound data scope: target workspace ${buildOptions.directoryRunScope.targetWorkspaceId}; actor workspace ${buildOptions.directoryRunScope.actorWorkspaceId}. Plugin and MCP calls for this directory-bound topic must use the target workspace data, not the actor workspace fallback.`);
      }
      lines.push("For this task group, the attached task directory is the frozen working directory. Do not switch the task to a later semantic project match, delivery folder, or unrelated path mentioned in follow-up text unless the user starts a new task from that directory.");
      lines.push("Base this task on the cleaned/normalized data in the attached directory first; use broader allowed roots only when the user request clearly requires it.");
      lines.push("Use Skill: productivity/directory-context-cleaning before analysis: clean new or changed files in the attached directory, update `.hermes-cleaned/summary.md` / indexes, then answer from summary-first cleaned context and open detailed cleaned Markdown only when needed.");
      lines.push("Keep the attached data directory separate from delivery folders. Write final document deliverables as Markdown by default and expose them with MEDIA:<path>. Generate PDF/Word copies only when explicitly requested for external forwarding, printing, editable Office, or another required format. Do not use the legacy Hermes sync folder for Hermes Mobile preview delivery.");
    }
    if (thread.singleWindow || project?.singleWindow) {
      if (singleWindowMode === "chat") {
        lines.push("This request comes from the Hermes Mobile single-window chat mode. Treat the latest user message as part of one continuous chat task.");
        lines.push("Use the supplied same-task conversation_history as normal chat context, while still respecting the selected workspace and access policy.");
        if (groupChatDeliveryRoot) {
          lines.push(`This is a group-chat AI request. Final user-facing document deliverables for this group turn should be Markdown by default and must be written under the group delivery directory: ${groupChatDeliveryRoot}.`);
          lines.push("Do not place group-chat deliverables only in the sender's private delivery directory. Include a MEDIA:<path> line that points to the group delivery file so every group member can preview it in Hermes Mobile.");
        }
        if (isKanbanCaseTopicThread(thread)) {
          lines.push("This is a shared learning-plan topic chat. Members may exchange ordinary chat messages in the topic; this AI run exists only because the latest message explicitly mentioned ChatGPT/AI.");
          lines.push("Use the bound learning-plan topic directory as context when attached, but do not treat ordinary member chat as permission to modify the plan, delete cards, or change shared-topic membership.");
        }
        if (groupChatAttachmentCopies.length) {
          lines.push("Group-chat shared attachments authorized for this run are available as readable copies below. If a shared attachment's original path is outside the current access policy or returns permission denied, read the accessible copy path instead:");
          for (const item of groupChatAttachmentCopies.slice(0, 20)) {
            lines.push(`- ${item.name || item.id || "attachment"}: ${item.copyPathForModel || item.copyPath} (original shared path: ${item.originalPath || ""})`);
          }
        }
        lines.push("Do not inherit, emit, or display prior directory bindings or `\u76ee\u5f55\u522b\u540d\uff1a\u5f53\u524d\u7ed1\u5b9a\u76ee\u5f55...` from older chat turns. Only an explicit directory attachment on the latest message is a current directory binding.");
      } else {
        lines.push("This request comes from the Hermes Mobile single-window task stream. Treat the latest user message as a new stateless task, similar to the single-window task flow.");
        lines.push("Do not use prior stream turns as context unless the latest user message explicitly quotes or names a Task ID, file, prior result, or asks for a follow-up.");
      }
      lines.push("When the user does not preselect a project, use semantic routing and the project directory map to choose the right workspace/files.");
    }
    if (policy.principal_id) lines.push(`Principal: ${policy.principal_id} (${policy.principal_label || ""}).`);
    if (project?.root) lines.push(`Primary project root: ${project.root}.`);
    if (policy.default_workspace) lines.push(`Default workspace: ${policy.default_workspace}.`);
    if (Array.isArray(policy.allowed_roots) && policy.allowed_roots.length) {
      lines.push(`Allowed roots: ${policy.allowed_roots.join("; ")}.`);
    }
    const routingInstructions = singleWindowMode === "chat" || taskDirectory?.path || hasPluginTopicContext
      ? ""
      : semanticProjectRoutingInstructions(thread, latestText);
    if (routingInstructions) lines.push(routingInstructions);
    if (policy.response_style === "concise") lines.push("Keep final replies concise unless the user asks for a detailed report.");
    if (policy.show_task_id === false) lines.push("Do not surface internal task IDs in the final user-facing prose unless needed for troubleshooting.");
    return lines.join("\n");
  }

  return {
    callableFunctionHintsForToolsets,
    currentToolSchemaOverrideInstructions,
    formatAccessPolicyInstructionSummary,
    gatewayConversationId,
    noteReceiptMetadataInstructions,
    pluginConversationActionBridgeInstructions,
    pluginCapabilityCatalogInstructions,
    policyHasToolset,
    buildHermesInstructions,
    toolSchemaEpoch,
  };
}

module.exports = {
  DEFAULT_TOOL_SCHEMA_EPOCH,
  createGatewayRunInstructionService,
};
