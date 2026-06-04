"use strict";

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260603-plugin-mcp-finance-health-v3";

function defaultDedupe(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
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
      file: ["read_file", "write_file", "patch", "search_files", "docx_extract_text", "audio_transcribe"],
      vision: ["vision_analyze"],
      image_gen: ["image_generate", "chatgpt_image_edit", "chatgpt_image_erase", "image_edit", "image_erase"],
      wardrobe: [
        "mcp_wardrobe_wardrobe_write_item",
        "mcp_wardrobe_wardrobe_write_history",
        "mcp_wardrobe_wardrobe_upload_photo",
        "mcp_wardrobe_wardrobe_set_primary_photo",
        "mcp_wardrobe_wardrobe_get_item",
        "mcp_wardrobe_wardrobe_search_items",
      ],
      finance: [
        "mcp_finance_list_ledgers",
        "mcp_finance_list_transactions",
        "mcp_finance_get_summary",
        "mcp_finance_get_report",
        "mcp_finance_create_transaction",
      ],
      health: [
        "mcp_health_records_get_summary",
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
      if (toolsets.includes("file")) lines.push("- For MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC voice notes or reading-retelling audio, use `audio_transcribe`; do not route audio-only files through `video_analyze` or ask the user to convert audio to video.");
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

  function explicitSearchContext(buildOptions = {}) {
    const values = [
      buildOptions.searchSource,
      buildOptions.search_source,
      buildOptions.sourceIntent,
      buildOptions.source_intent,
      buildOptions.sourceMode,
      buildOptions.source_mode,
    ].map((value) => String(value || "").trim().toLowerCase());
    const text = values.join(" ");
    return {
      explicitWeb: /\b(web|web_search|search|x|x_search)\b/.test(text),
      explicitX: /\b(x|x_search)\b/.test(text),
    };
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
        "Current tool schema override: the `file` toolset is enabled for this run. Word DOCX text extraction is available as `docx_extract_text`, and audio transcription for MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC files is available as `audio_transcribe`, when the file is inside the current allowed roots.",
        "For .docx/.docm/.dotx/.dotm files, use `docx_extract_text` if `read_file` cannot decode the Office Open XML package directly.",
        "For audio-only files such as .mp3/.m4a/.wav/.aac/.ogg/.opus/.amr/.flac, use `audio_transcribe`; `video_analyze` is for video files and should not be used as an audio transcription substitute.",
        "Do not ask the user to convert an ordinary current-workspace audio file into a blank video just to work around a missing audio transcription function.",
        "Do not request Owner elevation merely because an ordinary current-workspace DOCX extraction or audio transcription tool is missing from an older callable schema. That is a Hermes Mobile deployment/schema mismatch, not a high-privilege operation."
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
          `Do not start a ${budget + 1}th Web search call. If more search would be needed, return the best evidence-labeled partial answer or ask the user for approval to continue instead of continuing the search loop.`
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
        "Current tool schema override: the `wardrobe` toolset is enabled for this run. Callable function names normally begin with `mcp_wardrobe_`, including `mcp_wardrobe_wardrobe_write_item`, `mcp_wardrobe_wardrobe_write_history`, `mcp_wardrobe_wardrobe_upload_photo`, `mcp_wardrobe_wardrobe_set_primary_photo`, `mcp_wardrobe_wardrobe_get_item`, and `mcp_wardrobe_wardrobe_search_items`.",
        "For wardrobe ingest, writeback, photo upload, primary-photo updates, and readback verification, use the `mcp_wardrobe_*` callable functions when they are present.",
        "Do not report that the run lacks wardrobe capability solely because an older conversation turn said only file or vision tools were available. Check the current run's callable functions first.",
        "If `Enabled toolsets` includes `wardrobe` but the current callable schema still lacks `mcp_wardrobe_*`, treat that as a Gateway schema mismatch and request toolset/schema recovery instead of pretending the write completed."
      );
    }
    if (policyHasToolset(policy, "finance")) {
      lines.push(
        "Current tool schema override: the `finance` toolset is enabled for this run. Callable function names normally begin with `mcp_finance_`, including `mcp_finance_list_ledgers`, `mcp_finance_list_transactions`, `mcp_finance_get_summary`, `mcp_finance_get_report`, and `mcp_finance_create_transaction`.",
        "For ledger lookup, annual/monthly spending analysis, transaction search, reports, and Finance writeback, use the `mcp_finance_*` callable functions when they are present.",
        "Do not report that Finance MCP is unavailable solely because older conversation_history said it was missing. Check the current run's callable functions first.",
        "If `Enabled toolsets` includes `finance` but the current callable schema still lacks `mcp_finance_*`, treat that as a Gateway schema mismatch and request toolset/schema recovery instead of falling back to cleaned files as an MCP result."
      );
    }
    if (policyHasToolset(policy, "health")) {
      lines.push(
        "Current tool schema override: the `health` toolset is enabled for this run. Callable function names normally begin with `mcp_health_`, including `mcp_health_records_get_summary` when the plugin wrapper exposes local tool names correctly.",
        "If Health callables are double-prefixed such as `mcp_health_mcp_health_records_get_summary`, treat that as a plugin wrapper naming bug rather than a valid callable contract."
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
      if (!pluginId || !toolset) continue;
      lines.push(`- ${pluginId} (${label}): ${status}; toolset=${toolset}; ${summary}`);
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
      currentToolSchemaOverrideInstructions(policy, buildOptions),
      pluginTopicContextInstructions(buildOptions),
      pluginCapabilityCatalogInstructions(buildOptions),
      requiredSkillPreloadInstructions(buildOptions),
      "For current-account Kanban/Todo requests, use Hermes Mobile's Todo/Kanban capability in the current workspace. Do not run raw `hermes kanban` CLI commands or write directly under `~/.hermes/kanban`, because that can target a different local profile than the Mobile app.",
      "Prefer a concise final receipt in the mobile UI. If you create a user-facing artifact, include a MEDIA:<local_path> line so Hermes Mobile can render it as a link card.",
      "Do not send external chat/app messages unless the user explicitly asks for external delivery.",
      createDeliveryBoundaryInstructions(deliveryBoundaryOptions),
    ].filter(Boolean);
    const hasPluginTopicContext = Boolean(buildOptions.pluginTopicContext?.pluginId || buildOptions.pluginTopicContext?.plugin_id);
    if (taskDirectory?.path && !hasPluginTopicContext) {
      lines.push(`Attached task directory: ${taskDirectory.label || "Directory"} => ${taskDirectory.path}.`);
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
