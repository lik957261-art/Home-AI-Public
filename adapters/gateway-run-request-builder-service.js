"use strict";

const { createPluginCapabilityActivationService } = require("./plugin-capability-activation-service");
const { createDirectoryRunScopeService } = require("./directory-run-scope-service");
const { buildGatewayRoutingForRunRequest } = require("./gateway-run-request-routing-service");

const DEFAULT_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";
const DEFAULT_SINGLE_WINDOW_PROJECT_ID = "single-window";
const DEFAULT_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const PLUGIN_TOPIC_TOOLSETS = Object.freeze({
  wardrobe: "wardrobe",
  finance: "finance",
  email: "email",
  health: "health",
});
const PLUGIN_TOPIC_CONTEXTS = Object.freeze({
  wardrobe: Object.freeze({
    pluginId: "wardrobe",
    label: "Wardrobe",
    primaryToolset: "wardrobe",
    requiredToolsets: Object.freeze(["wardrobe", "vision", "file", "skills"]),
    requiredSkills: Object.freeze(["productivity/wardrobe-style-operations"]),
  }),
});

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function defaultDedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function pluginIdForTaskGroupId(taskGroupId = "") {
  const match = cleanString(taskGroupId).match(/^plugin:([a-z0-9_-]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function pluginTopicContextForTaskGroup(taskGroupId = "") {
  const pluginId = pluginIdForTaskGroupId(taskGroupId);
  if (!pluginId) return null;
  const configured = PLUGIN_TOPIC_CONTEXTS[pluginId];
  if (configured) {
    return {
      pluginId,
      label: cleanString(configured.label, pluginId),
      primaryToolset: cleanString(configured.primaryToolset || PLUGIN_TOPIC_TOOLSETS[pluginId]),
      requiredToolsets: defaultDedupe(configured.requiredToolsets || []),
      requiredSkills: defaultDedupe(configured.requiredSkills || []),
    };
  }
  const toolset = PLUGIN_TOPIC_TOOLSETS[pluginId];
  return {
    pluginId,
    label: pluginId,
    primaryToolset: toolset || "",
    requiredToolsets: toolset ? [toolset] : [],
    requiredSkills: [],
  };
}

function pluginToolsetsForTaskGroup(taskGroupId = "") {
  const context = pluginTopicContextForTaskGroup(taskGroupId);
  return context ? context.requiredToolsets : [];
}

function mergeRequiredToolsetsIntoPolicy(policy = {}, requiredToolsets = []) {
  const required = defaultDedupe(requiredToolsets);
  if (!required.length) return policy;
  const allowed = defaultDedupe([
    ...(policy.allowed_toolsets || policy.allowedToolsets || []),
    ...required,
  ]);
  const authorized = defaultDedupe([
    ...(policy.authorized_toolsets || policy.authorizedToolsets || []),
    ...allowed,
  ]);
  const requiredCurrent = defaultDedupe([
    ...(policy.required_toolsets || policy.requiredToolsets || []),
    ...required,
  ]);
  return Object.assign({}, policy, {
    allowed_toolsets: allowed,
    authorized_toolsets: authorized,
    required_toolsets: requiredCurrent,
  });
}

function mergeRequiredSkillsIntoPolicy(policy = {}, requiredSkills = []) {
  const required = defaultDedupe(requiredSkills);
  if (!required.length) return policy;
  return Object.assign({}, policy, {
    allowed_skills: defaultDedupe([
      ...(policy.allowed_skills || policy.allowedSkills || []),
      ...required,
    ]),
    required_skills: defaultDedupe([
      ...(policy.required_skills || policy.requiredSkills || []),
      ...required,
    ]),
  });
}

function pluginDeliveryDirectoryForMessage(message = {}) {
  const route = objectValue(message.directoryRoute, null);
  if (!route) return null;
  const pathValue = cleanString(route.path || route.root);
  const root = cleanString(route.root || route.path);
  if (!pathValue && !root) return null;
  return {
    label: cleanString(route.label, "Plugin delivery directory"),
    path: pathValue || root,
    root: root || pathValue,
    projectId: cleanString(route.projectId),
    subprojectId: cleanString(route.subprojectId),
  };
}

function skillEntryForPreload(item = {}) {
  const skillPath = cleanString(item.path || item.skillPath || item.name || item.id);
  if (!skillPath || item.missing) return null;
  const parts = skillPath.split(/[\\/]+/).filter(Boolean);
  const id = cleanString(item.id || parts[parts.length - 1] || skillPath);
  const namespace = cleanString(item.namespace || (parts.length > 1 ? parts.slice(0, -1).join("/") : ""));
  return {
    id,
    label: cleanString(item.label, id || skillPath),
    path: skillPath,
    namespace,
  };
}

function mergeSkillEntries(...sources) {
  const byPath = new Map();
  for (const source of sources) {
    const list = Array.isArray(source) ? source : [source];
    for (const item of list) {
      const entry = skillEntryForPreload(item);
      if (entry && !byPath.has(entry.path)) byPath.set(entry.path, entry);
    }
  }
  return [...byPath.values()];
}

function skillPreloadRunOptionsMetadata(preloads = []) {
  return (Array.isArray(preloads) ? preloads : [])
    .map((item) => {
      const skillPath = cleanString(item?.path || item?.skillPath);
      if (!skillPath) return null;
      return {
        path: skillPath,
        id: cleanString(item.id || skillPath.split(/[\\/]+/).filter(Boolean).pop()),
        namespace: cleanString(item.namespace),
        profileId: cleanString(item.profileId),
        loadedChars: Math.max(0, Number(item.loadedChars || 0) || 0),
        totalChars: Math.max(0, Number(item.totalChars || 0) || 0),
        truncated: Boolean(item.truncated),
        missing: Boolean(item.missing),
        error: cleanString(item.error).slice(0, 160),
        source: "required_preload",
      };
    })
    .filter(Boolean);
}

function isPlainProbeMessage(text = "") {
  const value = cleanString(text);
  if (!value || value.length > 40) return false;
  return /^(?:test|testing|ping|pong|hi|hello|hey|ok|okay|\u6d4b\u8bd5|\u4f60\u597d|\u6536\u5230|\u597d|\u597d\u7684|\u8c22\u8c22)[\s.!?,\u3002\uff01\uff1f\uff0c]*$/i.test(value);
}

function expandSelectedToolsetsWithCompanions(selectedToolsets = [], policy = {}) {
  const selected = defaultDedupe(selectedToolsets);
  const routing = objectValue(policy.toolset_routing || policy.toolsetRouting, {});
  const suggested = defaultDedupe(routing.suggested_toolsets || routing.suggestedToolsets || []);
  const allowed = new Set(defaultDedupe(policy.allowed_toolsets || policy.allowedToolsets || []));
  const selectedSet = new Set(selected);
  const suggestedReason = cleanString(routing.suggested_reason || routing.suggestedReason);
  if (suggestedReason === "plain_chat_light_tools" && suggested.length && selected.length) {
    return defaultDedupe([
      ...suggested.filter((toolset) => allowed.has(toolset)),
      ...selected.filter((toolset) => allowed.has(toolset)),
    ]);
  }
  const companionGroups = [
    ["wardrobe", "vision", "file", "skills"],
    ["web", "search", "browser"],
    ["file", "vision", "image_gen"],
  ];
  let out = selected;
  for (const companions of companionGroups) {
    if (companions.includes("image_gen") && (suggested.includes("wardrobe") || out.includes("wardrobe"))) continue;
    const hasCompanionSuggestion = companions.length <= 3
      ? companions.some((toolset) => suggested.includes(toolset))
      : companions.every((toolset) => suggested.includes(toolset));
    const selectedAnyCompanion = companions.some((toolset) => selectedSet.has(toolset));
    const selectedOnlyClarify = selected.length === 1 && selectedSet.has("clarify");
    if (!hasCompanionSuggestion || (!selectedAnyCompanion && !selectedOnlyClarify)) continue;
    const companionSet = new Set(companions.filter((toolset) => allowed.has(toolset)));
    const companionSelected = companions.filter((toolset) => companionSet.has(toolset));
    const restSelected = selectedOnlyClarify ? [] : out.filter((toolset) => !companionSet.has(toolset));
    out = defaultDedupe([...companionSelected, ...restSelected]);
  }
  return out;
}

function resolveActorWorkspaceId(thread = {}, userMessage = {}, options = {}) {
  return cleanString(
    options.actorWorkspaceId || userMessage.senderWorkspaceId || thread.workspaceId || "owner",
    "owner",
  );
}

function policyThreadForRun(thread = {}, actorWorkspaceId = "owner", singleWindowProjectId = DEFAULT_SINGLE_WINDOW_PROJECT_ID) {
  const workspaceId = cleanString(actorWorkspaceId, "owner");
  if (workspaceId === cleanString(thread.workspaceId)) return thread;
  return Object.assign({}, thread, {
    workspaceId,
    projectId: singleWindowProjectId,
    subprojectId: "",
  });
}

function summarizeConversationHistory(messages = []) {
  const items = Array.isArray(messages) ? messages : [];
  return {
    messageCount: items.length,
    estimatedChars: items.reduce((sum, item) => sum + String(item?.content || "").length, 0),
  };
}

function createGatewayRunRequestBuilderService(options = {}) {
  const singleWindowProjectId = cleanString(options.singleWindowProjectId, DEFAULT_SINGLE_WINDOW_PROJECT_ID);
  const groupChatTaskGroupId = cleanString(options.groupChatTaskGroupId, DEFAULT_GROUP_CHAT_TASK_GROUP_ID);
  const toolSchemaEpoch = cleanString(options.toolSchemaEpoch, DEFAULT_TOOL_SCHEMA_EPOCH);
  const dedupe = maybeCall(options.dedupe, defaultDedupe);
  const accessPolicyHardeningOptionsForGatewayRouting = maybeCall(options.accessPolicyHardeningOptionsForGatewayRouting, () => ({}));
  const taskDirectoryAttachmentForMessage = maybeCall(options.taskDirectoryAttachmentForMessage, () => null);
  const projectForTaskDirectoryAttachment = maybeCall(options.projectForTaskDirectoryAttachment, () => ({}));
  const effectiveProjectForThread = maybeCall(options.effectiveProjectForThread, () => ({}));
  const findWorkspace = maybeCall(options.findWorkspace, () => null);
  const buildAccessPolicy = maybeCall(options.buildAccessPolicy, () => ({}));
  const sanitizePolicy = maybeCall(options.sanitizePolicy, (policy) => objectValue(policy));
  const mergeAccessPolicyOverride = maybeCall(options.mergeAccessPolicyOverride, (basePolicy, overridePolicy) => Object.assign(
    {},
    objectValue(basePolicy),
    objectValue(overridePolicy),
  ));
  const groupChatDeliveryRootForThread = maybeCall(options.groupChatDeliveryRootForThread, () => "");
  const windowsPathToWsl = maybeCall(options.windowsPathToWsl, (value) => value);
  const ensureGroupChatSharedArtifactCopies = maybeCall(options.ensureGroupChatSharedArtifactCopies, () => []);
  const mkdirSync = maybeCall(options.mkdirSync || options.fs?.mkdirSync, () => {});
  const gatewayConversationId = maybeCall(options.gatewayConversationId, () => "");
  const buildConversationHistory = maybeCall(options.buildConversationHistory, () => []);
  const buildHermesInstructions = maybeCall(options.buildHermesInstructions, () => "");
  const loadRequiredSkillPreloads = maybeCall(options.loadRequiredSkillPreloads, () => []);
  const pluginCapabilityActivationService = options.pluginCapabilityActivationService
    || createPluginCapabilityActivationService({ dedupe });
  const buildPluginCapabilityContext = maybeCall(
    options.buildPluginCapabilityContext,
    (...args) => pluginCapabilityActivationService.buildRunPluginCapabilityContext(...args),
  );
  const routeRunToolsets = maybeCall(options.routeRunToolsets, ({ policy }) => ({ policy: objectValue(policy), routing: null }));
  const gatewaySkillRoutingForWorkspace = maybeCall(options.gatewaySkillRoutingForWorkspace, () => ({}));
  const directoryRunScopeService = options.directoryRunScopeService || createDirectoryRunScopeService();
  const resolveDirectoryRunScope = maybeCall(
    options.resolveDirectoryRunScope,
    (input) => directoryRunScopeService.resolveDirectoryRunScope(input),
  );

  function buildGroupChatRunContext(thread, userMessage, policy) {
    const deliveryRoot = thread?.singleWindow && cleanString(userMessage?.taskGroupId) === groupChatTaskGroupId
      ? cleanString(groupChatDeliveryRootForThread(thread))
      : "";
    if (!deliveryRoot) {
      return {
        groupChatAttachmentCopies: [],
        groupChatDeliveryRoot: "",
        groupChatDeliveryRootForModel: "",
        policy,
      };
    }

    const deliveryRootForModel = cleanString(windowsPathToWsl(deliveryRoot));
    const attachmentCopies = ensureGroupChatSharedArtifactCopies(thread, userMessage, deliveryRoot);
    mkdirSync(deliveryRoot, { recursive: true });
    const roots = [deliveryRootForModel, deliveryRoot].filter(Boolean);
    return {
      groupChatAttachmentCopies: Array.isArray(attachmentCopies) ? attachmentCopies : [],
      groupChatDeliveryRoot: deliveryRoot,
      groupChatDeliveryRootForModel: deliveryRootForModel,
      policy: Object.assign({}, policy, {
        allowed_roots: dedupe([...(policy.allowed_roots || []), ...roots]),
        delivery_roots: dedupe([...(policy.delivery_roots || []), ...roots]),
        cache_roots: dedupe([...(policy.cache_roots || []), ...roots]),
      }),
    };
  }

  function safeLoadRequiredSkillPreloads(payload = {}, requiredSkills = []) {
    try {
      const preloads = loadRequiredSkillPreloads(payload);
      return Array.isArray(preloads) ? preloads : [];
    } catch (err) {
      const error = cleanString(err?.message || err, "required_skill_preload_failed").slice(0, 160);
      return defaultDedupe(requiredSkills).map((skill) => ({
        path: skill,
        id: skill.split(/[\\/]+/).filter(Boolean).pop() || skill,
        missing: true,
        error,
      }));
    }
  }

  function buildRunRequest(thread, userMessage, assistantMessage, runOptions = {}) {
    const actorWorkspaceId = resolveActorWorkspaceId(thread, userMessage, runOptions);
    const pluginTopicContext = pluginTopicContextForTaskGroup(userMessage?.taskGroupId);
    const requiredPluginToolsets = pluginTopicContext ? pluginTopicContext.requiredToolsets : [];
    const requiredPluginSkills = pluginTopicContext ? pluginTopicContext.requiredSkills : [];
    const pluginDeliveryDirectory = pluginTopicContext ? pluginDeliveryDirectoryForMessage(userMessage) : null;
    const requestedGatewayRouting = Object.assign({}, objectValue(runOptions.gatewayRouting));
    const policyHardeningOptions = accessPolicyHardeningOptionsForGatewayRouting(requestedGatewayRouting);
    const actorPolicyThread = policyThreadForRun(thread, actorWorkspaceId, singleWindowProjectId);
    const taskDirectory = taskDirectoryAttachmentForMessage(thread, userMessage);
    const project = taskDirectory
      ? projectForTaskDirectoryAttachment(thread, taskDirectory)
      : effectiveProjectForThread(actorPolicyThread);
    const directoryRunScope = resolveDirectoryRunScope({
      thread, userMessage, runOptions, requestedGatewayRouting, actorWorkspaceId, taskDirectory, project,
    }) || {};
    const dataWorkspaceId = cleanString(
      directoryRunScope.dataWorkspaceId || directoryRunScope.targetWorkspaceId || actorWorkspaceId,
      actorWorkspaceId,
    );
    const targetWorkspaceId = cleanString(directoryRunScope.targetWorkspaceId || dataWorkspaceId, dataWorkspaceId);
    const runScopeFields = { directoryRunScope, actorWorkspaceId, targetWorkspaceId, dataWorkspaceId };
    const policyThread = policyThreadForRun(thread, dataWorkspaceId, singleWindowProjectId);
    const requiredSkillPreloads = requiredPluginSkills.length
      ? safeLoadRequiredSkillPreloads({
        skills: requiredPluginSkills,
        workspaceId: dataWorkspaceId,
        ...runScopeFields,
        pluginTopicContext,
        userMessage,
        runOptions,
      }, requiredPluginSkills)
      : [];
    const workspace = findWorkspace(dataWorkspaceId);
    const routePolicy = workspace?.policy || workspace || {};
    let basePolicy = buildAccessPolicy(routePolicy, {}, project, policyHardeningOptions);
    const groupChat = buildGroupChatRunContext(thread, userMessage, objectValue(basePolicy));
    basePolicy = sanitizePolicy(groupChat.policy, policyHardeningOptions);
    let runPolicy = runOptions.access_policy_context && typeof runOptions.access_policy_context === "object"
      ? sanitizePolicy(mergeAccessPolicyOverride(basePolicy, runOptions.access_policy_context), policyHardeningOptions)
      : basePolicy;
    const routedPolicy = routeRunToolsets({
      policy: runPolicy,
      thread,
      policyThread,
      userMessage,
      assistantMessage,
      runOptions,
      project,
      taskDirectory,
      groupChat,
      policyHardeningOptions,
      ...runScopeFields,
    }) || {};
    runPolicy = sanitizePolicy(objectValue(routedPolicy.policy, runPolicy), policyHardeningOptions);
    runPolicy = sanitizePolicy(mergeRequiredToolsetsIntoPolicy(runPolicy, requiredPluginToolsets), policyHardeningOptions);
    runPolicy = sanitizePolicy(mergeRequiredSkillsIntoPolicy(runPolicy, requiredPluginSkills), policyHardeningOptions);
    const modelFirstSelection = objectValue(runOptions.modelFirstToolsetSelection, null);
    const rawModelFirstToolsets = dedupe(modelFirstSelection?.selectedToolsets || modelFirstSelection?.selected_toolsets || []);
    const modelFirstSelectionDisabled = Boolean(
      modelFirstSelection?.toolsetSelectionDisabled
      || modelFirstSelection?.toolset_selection_disabled
      || modelFirstSelection?.routing?.toolset_selection_disabled,
    );
    const modelFirstToolsets = modelFirstSelectionDisabled
      ? rawModelFirstToolsets
      : expandSelectedToolsetsWithCompanions(rawModelFirstToolsets, runPolicy);
    if (modelFirstToolsets.length) {
      const modelFirstRequiredToolsets = dedupe([...modelFirstToolsets, ...requiredPluginToolsets]);
      runPolicy = sanitizePolicy(Object.assign({}, runPolicy, {
        allowed_toolsets: modelFirstRequiredToolsets,
        toolset_routing: modelFirstSelection.routing || {
          mode: "model_first",
          reason: "model_selected",
          selected_toolsets: modelFirstRequiredToolsets,
        },
      }), policyHardeningOptions);
      runPolicy = sanitizePolicy(mergeRequiredToolsetsIntoPolicy(runPolicy, requiredPluginToolsets), policyHardeningOptions);
      runPolicy = sanitizePolicy(mergeRequiredSkillsIntoPolicy(runPolicy, requiredPluginSkills), policyHardeningOptions);
    }
    const pluginCapabilityResult = buildPluginCapabilityContext({
      policy: runPolicy,
      thread,
      policyThread,
      userMessage,
      assistantMessage,
      runOptions,
      project,
      taskDirectory,
      pluginTopicContext,
      requiredPluginToolsets,
      requiredPluginSkills,
      ...runScopeFields,
    }) || {};
    const pluginCapabilityContext = pluginCapabilityResult.context || null;
    runPolicy = sanitizePolicy(objectValue(pluginCapabilityResult.policy, runPolicy), policyHardeningOptions);
    const conversation = gatewayConversationId(thread, userMessage, runPolicy);
    const instructions = [
      buildHermesInstructions(
        policyThread,
        runPolicy,
        project,
        userMessage?.content,
        taskDirectory,
        Object.assign({}, runOptions, {
          groupChatDeliveryRoot: groupChat.groupChatDeliveryRootForModel,
          groupChatAttachmentCopies: groupChat.groupChatAttachmentCopies,
          pluginTopicContext: pluginTopicContext
            ? Object.assign({}, pluginTopicContext, { deliveryDirectory: pluginDeliveryDirectory })
            : null,
          pluginCapabilityContext,
          requiredSkillPreloads,
          ...runScopeFields,
        }),
      ),
      isPlainProbeMessage(userMessage?.content)
        ? "Latest-message override: the newest user message is only a ping, greeting, acknowledgement, or plain test. Answer it briefly from current state. Do not infer a previous tool/search intent from conversation history and do not call tools unless the newest message explicitly asks for a tool-backed action."
        : "",
      runOptions.instructions || "",
    ].filter(Boolean).join("\n\n");
    const conversationHistory = buildConversationHistory(thread, userMessage?.id, runPolicy);
    const body = {
      input: userMessage?.content,
      stream: true,
      store: true,
      conversation,
      conversation_history: conversationHistory,
      instructions,
      access_policy_context: runPolicy,
      enabled_toolsets: dedupe(runPolicy.allowed_toolsets || runPolicy.allowedToolsets || []),
    };
    if (runOptions.model) body.model = runOptions.model;
    if (runOptions.provider) body.provider = runOptions.provider;
    if (runOptions.reasoning_effort) body.reasoning_effort = runOptions.reasoning_effort;
    if (runOptions.reasoning && typeof runOptions.reasoning === "object") body.reasoning = runOptions.reasoning;

    const gatewayRouting = buildGatewayRoutingForRunRequest({
      requestedGatewayRouting,
      runOptions,
      userMessage,
      body,
      ...runScopeFields,
      requiredPluginToolsets,
      requiredPluginSkills,
      pluginCapabilityContext,
      dedupe,
      gatewaySkillRoutingForWorkspace,
    });

    return {
      ...runScopeFields,
      body,
      gatewayRouting,
      groupChat,
      policyHardeningOptions,
      policyThread,
      pluginTopicContext,
      pluginCapabilityContext,
      pluginDeliveryDirectory,
      requiredSkillPreloads,
      project,
      requestedGatewayRouting,
      toolsetRouting: pluginCapabilityResult.routing || runPolicy.toolset_routing || routedPolicy.routing || null,
      runPolicy,
      taskDirectory,
      toolSchemaEpoch,
      assistantMessage,
      conversationHistorySummary: summarizeConversationHistory(conversationHistory),
    };
  }

  return Object.freeze({
    buildGroupChatRunContext,
    buildRunRequest,
  });
}

module.exports = {
  cleanString,
  createGatewayRunRequestBuilderService,
  defaultDedupe,
  expandSelectedToolsetsWithCompanions,
  mergeSkillEntries,
  objectValue,
  pluginToolsetsForTaskGroup,
  policyThreadForRun,
  resolveActorWorkspaceId,
  skillPreloadRunOptionsMetadata,
};
