"use strict";

function defaultCompactText(value, maxChars = 240) {
  const text = String(value || "");
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function createOwnerElevationRoutingService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const loadCatalog = typeof options.loadCatalog === "function" ? options.loadCatalog : (() => ({ workspaces: [] }));
  const securityBoundaryProvider = options.securityBoundaryProvider || {};
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : (() => false);
  const consumeOwnerElevationOnce = typeof options.consumeOwnerElevationOnce === "function"
    ? options.consumeOwnerElevationOnce
    : (() => false);
  const isOwnerElevationActive = typeof options.isOwnerElevationActive === "function"
    ? options.isOwnerElevationActive
    : (() => false);
  const gatewaySkillProfileRouting = String(options.gatewaySkillProfileRouting || "auto").trim().toLowerCase() || "auto";
  const permissionApprovalMarker = String(options.permissionApprovalMarker || "HERMES_PERMISSION_APPROVAL_REQUIRED");
  const chatGptProProfiles = Array.isArray(options.chatGptProProfiles) && options.chatGptProProfiles.length
    ? options.chatGptProProfiles.map((item) => String(item || "").trim()).filter(Boolean)
    : ["officialclean1", "officialclean2"];

  function routeRequestsChatGptPro(routeOptions = {}) {
    return Boolean(
      routeOptions.chatGptProGenerate
      || routeOptions.chatgpt_pro_generate
      || routeOptions.chatgptProGenerate
      || routeOptions.chatgpt_pro
      || routeOptions.requiredTool === "chatgpt_pro_generate"
      || routeOptions.required_tool === "chatgpt_pro_generate"
      || routeOptions.elevationScope === "chatgpt_pro_generate"
      || routeOptions.elevation_scope === "chatgpt_pro_generate"
    );
  }

  function mentionSearchText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function textRequestsChatGptPro(text) {
    const compact = mentionSearchText(text);
    if (!compact) return false;
    return compact.includes("@chatgptpro")
      || compact.includes("chatgptpro")
      || String(text || "").toLowerCase().includes("chatgpt-pro");
  }

  function workspaceMentionCandidates(workspace = {}) {
    const policy = workspace.policy && typeof workspace.policy === "object" ? workspace.policy : {};
    return [...new Set([
      workspace.id,
      workspace.workspaceId,
      workspace.label,
      workspace.name,
      workspace.displayName,
      workspace.principalId,
      policy.principal_id,
      policy.principal_label,
      ...(Array.isArray(workspace.aliases) ? workspace.aliases : []),
    ].map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function mentionedWorkspaceIdsInText(text) {
    const haystack = mentionSearchText(text);
    if (!haystack) return [];
    const matches = [];
    for (const workspace of loadCatalog().workspaces || []) {
      const workspaceId = String(workspace?.id || "").trim();
      if (!workspaceId) continue;
      for (const candidate of workspaceMentionCandidates(workspace)) {
        const needle = mentionSearchText(candidate);
        if (needle.length < 2) continue;
        if (haystack.includes(needle)) {
          matches.push(workspaceId);
          break;
        }
      }
    }
    return [...new Set(matches)];
  }

  function textLooksLikeAutomationWrite(text) {
    const raw = String(text || "").trim();
    if (!raw) return false;
    const mentionsAutomation = (
      /automation|cron|scheduled?\s+(?:job|task)|timer\s+job/i.test(raw)
      || /\u81ea\u52a8\u5316|\u81ea\u52a8\u4efb\u52a1|\u5b9a\u65f6\u4efb\u52a1|\u5b9a\u65f6|\u89e6\u53d1\u65f6\u95f4|\u8ba1\u5212\u4efb\u52a1/.test(raw)
    );
    const hasWriteAction = (
      /create|add|update|modify|edit|change|delete|remove|pause|resume|enable|disable|reschedule|set/i.test(raw)
      || /\u521b\u5efa|\u65b0\u589e|\u66f4\u65b0|\u4fee\u6539|\u7f16\u8f91|\u6539\u4e3a|\u8c03\u6574|\u5220\u9664|\u79fb\u9664|\u6682\u505c|\u6062\u590d|\u542f\u7528|\u7981\u7528|\u8bbe\u7f6e|\u6539\u5230|\u6539\u6210/.test(raw)
    );
    return mentionsAutomation && hasWriteAction;
  }

  function classifyAutomationAdminIntentForRun(text, routeOptions = {}) {
    const actorWorkspaceId = String(routeOptions.actorWorkspaceId || routeOptions.actor_workspace_id || "").trim();
    let mentionedWorkspaceIds = [];
    if (textLooksLikeAutomationWrite(text)) {
      mentionedWorkspaceIds = mentionedWorkspaceIdsInText(text);
      if (mentionedWorkspaceIds.some((workspaceId) => workspaceId && workspaceId !== actorWorkspaceId)) {
        return {
          category: "automation_admin_write",
          elevationRequired: true,
          elevationScope: "automation_admin_write",
          message: "This looks like a cross-account automation management request. Confirm elevation to route this one run to an Owner maintenance Gateway.",
        };
      }
    }
    const classification = securityBoundaryProvider.classifyAutomationAdminWriteIntent?.(text);
    if (!classification) return null;
    if (mentionedWorkspaceIds.length && !mentionedWorkspaceIds.some((workspaceId) => workspaceId !== actorWorkspaceId)) return null;
    return classification;
  }

  function gatewayRoutingForModelRun(auth, text, routeOptions = {}) {
    const explicitMaintenance = Boolean(routeOptions.maintenanceMode || routeOptions.maintenance_mode);
    if (explicitMaintenance) {
      const onceToken = routeOptions.ownerElevationOnceToken || routeOptions.owner_elevation_once_token || "";
      if (consumeOwnerElevationOnce(auth, onceToken) || isOwnerElevationActive(auth)) {
        const chatGptPro = routeRequestsChatGptPro(routeOptions) || textRequestsChatGptPro(text);
        return {
          securityLevel: "owner-maintenance",
          maintenance: true,
          maintenanceCategory: chatGptPro ? "chatgpt_pro_generate" : (routeOptions.elevationScope || routeOptions.elevation_scope || "owner_high_privilege"),
          ...(chatGptPro ? {
            preferred_worker_profiles: chatGptProProfiles,
            requiredTool: "chatgpt_pro_generate",
          } : {}),
        };
      }
      const err = new Error("Owner high-privilege authorization is not active. Use the Owner navigation permission control before running this request.");
      err.status = isOwnerAuth(auth) ? 409 : 403;
      err.code = "owner_high_privilege_required";
      err.operatorRequired = true;
      err.elevationRequired = Boolean(isOwnerAuth(auth));
      err.elevationScope = routeOptions.elevationScope || routeOptions.elevation_scope || "owner_high_privilege";
      throw err;
    }
    return { securityLevel: "user", maintenance: false };
  }

  function sharedSkillElevationInstructions(routeOptions = {}) {
    const scope = String(routeOptions.elevationScope || routeOptions.elevation_scope || "").trim();
    if (scope !== "shared_skill_write") return "";
    return [
      "APPROVED OWNER ELEVATION: this run is allowed to create or update a shared/system Skill only.",
      "If a Skill should be available to all workspaces, place it in the shared Skill namespace, for example `shared/<skill-id>/SKILL.md`, through the current official Hermes Skill store.",
      "Do not modify unrelated Skills, runtime secrets, product source, worker manifests, or user-private workspace files.",
      "If the requested Skill is actually private to one workspace, do not use this elevated shared scope.",
    ].join("\n");
  }

  function ownerElevationInstructions(routeOptions = {}) {
    const scope = String(routeOptions.elevationScope || routeOptions.elevation_scope || "").trim();
    if (routeRequestsChatGptPro(routeOptions)) {
      return [
        "APPROVED CHATGPT PRO TOOL RUN: this run is routed to an Owner maintenance Gateway because the Owner explicitly authorized ChatGPT Pro tool execution for the latest message.",
        "Use `chatgpt_pro_generate` when the user asks for ChatGPT Pro generation, document drafting, rewriting, or Pro-model synthesis. Do not claim ChatGPT Pro succeeded unless the tool returns ok=true.",
        "Keep the tool request narrow: pass the current user requirement, bounded source summary, language, output format, and delivery mode. Do not pass secrets, raw local paths, browser cookies, or unrelated conversation history.",
        "If the tool returns ok=false or is unavailable, report the failure clearly instead of falling back to an ordinary model answer and presenting it as ChatGPT Pro output.",
      ].join("\n");
    }
    if (scope === "owner_high_privilege") {
      return [
        "APPROVED OWNER HIGH-PRIVILEGE RUN: this run is routed to an Owner maintenance Gateway because the Owner explicitly authorized high-privilege execution in Hermes Mobile.",
        "Use elevated tools only for the latest user request. Do not make unrelated changes, expose raw secrets, print keys/tokens, or modify worker manifests/runtime configuration unless the user explicitly requested that exact maintenance action.",
        "Image editing, object removal, background cleanup, P image requests, and erase/inpainting requests inside the current workspace are ordinary user work, not maintenance work. Even in an elevated run, use ChatGPT Image 2 image editing tools when available; do not use local PIL/OpenCV/rembg/SAM/ffmpeg/terminal/code image repair unless the user explicitly asks for local image processing.",
        "If the requested target is ambiguous, stop and ask for clarification instead of guessing.",
      ].join("\n");
    }
    if (scope === "shared_skill_write") return sharedSkillElevationInstructions(routeOptions);
    if (scope === "automation_admin_write") {
      return [
        "APPROVED OWNER ELEVATION: this run is allowed to inspect and update the Automation/CRON job explicitly requested in the latest user message.",
        "Limit the operation to the named target account/workspace and named automation job. Do not modify unrelated jobs, Access Keys, runtime secrets, worker manifests, product source, or user-private files.",
        "If the exact target job is ambiguous, stop and ask for clarification instead of guessing.",
        "Report the old schedule and new schedule in the final receipt.",
      ].join("\n");
    }
    return "";
  }

  function sanitizeElevationScope(value) {
    const scope = String(value || "").trim();
    if (/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(scope)) return scope;
    return "owner_high_privilege";
  }

  function parsePermissionApprovalMarker(text) {
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
      const markerIndex = line.indexOf(permissionApprovalMarker);
      if (markerIndex < 0) continue;
      const trailing = line.slice(markerIndex + permissionApprovalMarker.length).trim();
      let parsed = {};
      if (trailing.startsWith("{")) {
        try {
          parsed = JSON.parse(trailing);
        } catch (_) {
          parsed = {};
        }
      }
      return {
        elevationRequired: true,
        elevationScope: sanitizeElevationScope(parsed.scope || parsed.elevationScope || "owner_high_privilege"),
        elevationReason: compactText(parsed.reason || parsed.message || "Model permission boundary requested Owner approval.", 240),
        elevationSource: "model_permission_boundary",
      };
    }
    return null;
  }

  function stripPermissionApprovalMarkers(text) {
    return String(text || "")
      .split(/\r?\n/)
      .filter((line) => !line.includes(permissionApprovalMarker))
      .join("\n")
      .trim();
  }

  function inferPermissionApprovalRequest(text) {
    const raw = String(text || "");
    if (!raw.trim()) return null;
    const permissionDenied = (
      /outside\s+(?:the\s+)?current\s+(?:workspace\/Gateway\s+)?permission\s+scope/i.test(raw)
      || /permission\s+boundary|access_policy_context|current\s+Gateway\s+permission/i.test(raw)
      || /褰撳墠.*鏉冮檺|鏉冮檺鑼冨洿|鏉冮檺杈圭晫|瓒呭嚭.*鏉冮檺|涓嶅湪.*鏉冮檺|鏃犳硶璁块棶.*璺緞/.test(raw)
    );
    const elevationHint = (
      /Owner|approval|approve|elevation|maintenance|high[-_\s]?privilege/i.test(raw)
      || /鎻愭潈|楂樻潈闄恷鎵瑰噯|鎺堟潈|Owner/.test(raw)
    );
    if (!permissionDenied || !elevationHint) return null;
    return {
      elevationRequired: true,
      elevationScope: "owner_high_privilege",
      elevationReason: compactText(raw.replace(/\s+/g, " ").trim(), 240),
      elevationSource: "model_permission_boundary_heuristic",
    };
  }

  function modelPermissionApprovalRequest(text, message = {}) {
    const routing = message.runOptions?.gatewayRouting || {};
    if (routing.maintenance || routing.allowMaintenance || routing.allow_maintenance) return null;
    const markerRequest = parsePermissionApprovalMarker(text);
    return markerRequest || inferPermissionApprovalRequest(text);
  }

  function precedingUserMessageForAssistant(thread, assistantMessage) {
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    const index = messages.findIndex((item) => String(item.id || "") === String(assistantMessage?.id || ""));
    for (let i = (index >= 0 ? index - 1 : messages.length - 1); i >= 0; i -= 1) {
      const candidate = messages[i];
      if (!candidate || candidate.role !== "user") continue;
      if (assistantMessage?.taskGroupId && candidate.taskGroupId !== assistantMessage.taskGroupId) continue;
      return candidate;
    }
    return null;
  }

  function gatewaySkillRoutingForWorkspace(workspaceId, routing = {}) {
    if (gatewaySkillProfileRouting === "off") return {};
    const securityLevel = String(routing.securityLevel || routing.security_level || "user").trim();
    const maintenance = Boolean(routing.maintenance || routing.allowMaintenance || routing.allow_maintenance);
    if (maintenance || /^owner[-_]maintenance$/i.test(securityLevel)) return {};
    const skillWorkspaceId = String(workspaceId || "").trim();
    if (!skillWorkspaceId) return {};
    const hints = { skillWorkspaceId };
    if (gatewaySkillProfileRouting === "on") hints.requireSkillProfile = true;
    return hints;
  }

  function isOwnerMaintenanceGatewayRouting(routing = {}) {
    const securityLevel = String(routing.securityLevel || routing.security_level || "").trim();
    return Boolean(routing.maintenance || routing.allowMaintenance || routing.allow_maintenance || /^owner[-_]maintenance$/i.test(securityLevel));
  }

  function accessPolicyHardeningOptionsForGatewayRouting(routing = {}) {
    const allowMaintenanceTools = isOwnerMaintenanceGatewayRouting(routing);
    return {
      allowUnrestricted: allowMaintenanceTools,
      allowDeveloperToolsets: allowMaintenanceTools,
    };
  }

  return {
    accessPolicyHardeningOptionsForGatewayRouting,
    classifyAutomationAdminIntentForRun,
    gatewayRoutingForModelRun,
    gatewaySkillRoutingForWorkspace,
    inferPermissionApprovalRequest,
    isOwnerMaintenanceGatewayRouting,
    mentionSearchText,
    mentionedWorkspaceIdsInText,
    modelPermissionApprovalRequest,
    ownerElevationInstructions,
    parsePermissionApprovalMarker,
    precedingUserMessageForAssistant,
    sanitizeElevationScope,
    sharedSkillElevationInstructions,
    routeRequestsChatGptPro,
    textRequestsChatGptPro,
    stripPermissionApprovalMarkers,
    textLooksLikeAutomationWrite,
    workspaceMentionCandidates,
  };
}

module.exports = {
  createOwnerElevationRoutingService,
};
