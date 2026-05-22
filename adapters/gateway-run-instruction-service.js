"use strict";

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260519-x-search-v1";

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
      http: ["http_request", "codex_mobile"],
      weather: ["weather"],
      file: ["read_file", "write_file", "patch", "search_files", "docx_extract_text", "audio_transcribe"],
      vision: ["vision_analyze"],
      image_gen: ["image_generate", "chatgpt_image_edit", "chatgpt_image_erase", "image_edit", "image_erase"],
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
      if (toolsets.includes("http")) lines.push("- For HTTP/API Program calls, use `http_request`; for Hermes-Codex Mux coordination with Codex Mobile, use `codex_mobile`; do not look for or mention a `web_request` function.");
      if (toolsets.includes("http")) lines.push("- For Program API file uploads, pass in-scope local image bytes through `http_request.file_body` or `http_request.multipart_files`; do not put local path strings or file:// URLs inside the target API JSON body.");
      if (toolsets.includes("file")) lines.push("- For Word DOCX text extraction, use `docx_extract_text` when `read_file` cannot decode the Office Open XML package directly.");
      if (toolsets.includes("file")) lines.push("- For MP3/M4A/WAV/AAC/OGG/OPUS/AMR/FLAC voice notes or reading-retelling audio, use `audio_transcribe`; do not route audio-only files through `video_analyze` or ask the user to convert audio to video.");
      if (toolsets.includes("cronjob")) lines.push("- For Hermes Mobile automation jobs, use `cronjob_mobile` when available; if it is absent, use `http_request` with url `hermes-mobile://cron` and the automation action/job fields in `json`; raw `cronjob` may point at an empty profile-local scheduler namespace.");
    }
    if (connectorProfiles.length) lines.push(`- External connector profiles: ${connectorProfiles.join(", ")}`);
    else lines.push("- External connector profiles: none");
    return lines.join("\n");
  }

  function gatewayConversationId(thread = {}, userMessage = {}, runPolicy = {}) {
    const base = thread.singleWindow
      ? `${thread.hermesSessionId}_${userMessage.taskGroupId || userMessage.id}`
      : thread.hermesSessionId;
    const schemaSensitive = policyToolsets(runPolicy).some((name) => ["web", "search", "x_search", "http", "weather", "file", "image_gen"].includes(name));
    return schemaSensitive ? `${base}_${toolSchemaEpoch}` : base;
  }

  function currentToolSchemaOverrideInstructions(policy = {}) {
    const lines = [];
    if (policyHasToolset(policy, "http")) {
      lines.push(
        "Current tool schema override: the `http` toolset is enabled for this run, and its callable function names include `http_request` and `codex_mobile`.",
        "Ignore older assistant statements in conversation_history that claimed `http_request`, `web_request`, HTTP tools, or API Program tools were unavailable; those statements described earlier runs and are stale.",
        "Before reporting that an HTTP/API Program tool is unavailable, check the current run's actual callable functions. If `http_request` is available, use it for allowed HTTP/API Program calls; if `codex_mobile` is available, use it only for bounded Hermes-Codex Mux task/event coordination with the fixed Codex Mobile worker.",
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
      lines.push(
        "Current tool schema override: the `web`/`search` toolsets are enabled for this run. Prefer callable function names `mobile_web_search` and `mobile_web_extract`; compatibility names `web_search` and `web_extract` may also be present.",
        "For public web lookup, use `mobile_web_search` when available. For public URL text extraction, use `mobile_web_extract` when available."
      );
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
      currentToolSchemaOverrideInstructions(policy),
      permissionBoundarySkillInstructions(policy),
      "For current-account Kanban/Todo requests, use Hermes Mobile's Todo/Kanban capability in the current workspace. Do not run raw `hermes kanban` CLI commands or write directly under `~/.hermes/kanban`, because that can target a different local profile than the Mobile app.",
      "Prefer a concise final receipt in the mobile UI. If you create a user-facing artifact, include a MEDIA:<local_path> line so Hermes Mobile can render it as a link card.",
      "Do not send external chat/app messages unless the user explicitly asks for external delivery.",
      createDeliveryBoundaryInstructions(deliveryBoundaryOptions),
    ].filter(Boolean);
    if (taskDirectory?.path) {
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
    const routingInstructions = singleWindowMode === "chat" || taskDirectory?.path
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
    policyHasToolset,
    buildHermesInstructions,
    toolSchemaEpoch,
  };
}

module.exports = {
  DEFAULT_TOOL_SCHEMA_EPOCH,
  createGatewayRunInstructionService,
};
