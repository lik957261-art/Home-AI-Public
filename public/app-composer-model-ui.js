"use strict";

const CHAT_COMPOSER_MODEL_SELECTION_MODEL_ESM_PATH = "/vite-islands/chat-composer-model-selection-model/chat-composer-model-selection-model.js";
let chatComposerModelSelectionModel = null;
let chatComposerModelSelectionModelPromise = null;

function importChatComposerModelSelectionModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerModelSelectionModel) return Promise.resolve(chatComposerModelSelectionModel);
  if (!chatComposerModelSelectionModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerModelSelectionModel === "function"
      ? rootRef.__homeAiImportChatComposerModelSelectionModel
      : (path) => import(path);
    chatComposerModelSelectionModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_MODEL_SELECTION_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerModelSelectionModel = model || null;
        return chatComposerModelSelectionModel;
      })
      .catch((error) => {
        chatComposerModelSelectionModelPromise = null;
        throw error;
      });
  }
  return chatComposerModelSelectionModelPromise;
}

function currentChatComposerModelSelectionModel() {
  return chatComposerModelSelectionModel;
}

if (typeof window !== "undefined") {
  importChatComposerModelSelectionModel().catch(() => null);
}

function composerModelSelectionPlanInput(extra = {}) {
  return Object.assign({
    assistantLabel: state.assistantLabel || "",
    modelProvider: state.modelProvider || "",
    defaultModel: state.defaultModel || "",
    virtualLabel: VIRTUAL_GROUP_AI_MEMBER.label || "AI",
    options: COMPOSER_MODEL_OPTIONS,
    defaultId: DEFAULT_COMPOSER_MODEL_ID,
    value: state.defaultComposerModelId || DEFAULT_COMPOSER_MODEL_ID,
    reasoningOptions: state.reasoningOptions,
    defaultReasoningOptions: TASK_REASONING_OPTIONS,
  }, extra);
}

function normalizeMentionSearch(value) {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.normalizeMentionSearchValue === "function") {
    return model.normalizeMentionSearchValue(value);
  }
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function fallbackReasoningCompactLabel(value) {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.reasoningCompactLabelPlan === "function") {
    return model.reasoningCompactLabelPlan(value);
  }
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "Xhigh";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function normalizeReasoningOptions(items) {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.normalizeReasoningOptionsPlan === "function") {
    return model.normalizeReasoningOptionsPlan(composerModelSelectionPlanInput({ items }));
  }
  const source = Array.isArray(items) && items.length
    ? items
    : TASK_REASONING_OPTIONS.filter((item) => item.value);
  const seen = new Set();
  return source
    .map((item) => {
      const value = String(item?.value || "").trim().toLowerCase();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      const label = String(item?.label || item?.value || "").trim() || value;
      return {
        value,
        label,
        shortLabel: String(item?.shortLabel || item?.short_label || fallbackReasoningCompactLabel(value)).trim(),
      };
    })
    .filter(Boolean);
}

function configuredReasoningOptions() {
  return normalizeReasoningOptions(state.reasoningOptions);
}

function assistantDisplayLabel() {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.assistantDisplayLabelPlan === "function") {
    return model.assistantDisplayLabelPlan(composerModelSelectionPlanInput());
  }
  return String(state.assistantLabel || state.modelProvider || state.defaultModel || VIRTUAL_GROUP_AI_MEMBER.label || "AI").trim() || "AI";
}

function virtualAssistantMember() {
  const label = assistantDisplayLabel();
  return Object.assign({}, VIRTUAL_GROUP_AI_MEMBER, {
    label,
    mentionText: `@${label}`,
    description: [state.defaultModel, defaultReasoningLabel()].filter(Boolean).join(" / ") || "\u9ed8\u8ba4\u63a8\u7406",
  });
}

function composerModelOptions() {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.composerModelOptionsPlan === "function") {
    return model.composerModelOptionsPlan(composerModelSelectionPlanInput());
  }
  const label = assistantDisplayLabel();
  const modelLabel = state.defaultModel || label;
  return COMPOSER_MODEL_OPTIONS.map((option) => {
    if (option.id !== DEFAULT_COMPOSER_MODEL_ID) return option;
    return Object.assign({}, option, {
      label,
      mentionText: `@${label}`,
      description: [modelLabel, "\u8fd0\u884c\u65f6\u9ed8\u8ba4"].filter(Boolean).join(" / "),
      aliases: [...new Set([...(option.aliases || []), label, state.defaultModel, state.modelProvider].filter(Boolean))],
    });
  });
}

function composerModelOption(value) {
  const id = String(value || "").trim();
  return composerModelOptions().find((option) => option.id === id) || composerModelOptions()[0];
}

function selectedDefaultComposerModelOption() {
  return composerModelOption(state.defaultComposerModelId || DEFAULT_COMPOSER_MODEL_ID);
}

function composerModelMentionAliases(option = {}) {
  return new Set([
    option.id,
    option.label,
    option.model,
    option.provider,
    option.mentionText,
    ...(Array.isArray(option.aliases) ? option.aliases : []),
  ].map(normalizeMentionSearch).filter(Boolean));
}

function composerModelOptionForMention(primary, secondary = "") {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.composerModelOptionForMentionPlan === "function") {
    return model.composerModelOptionForMentionPlan(composerModelSelectionPlanInput({
      primary,
      secondary,
      options: composerModelOptions(),
    }));
  }
  const primaryKey = normalizeMentionSearch(primary);
  const secondaryKey = normalizeMentionSearch(secondary);
  if (!primaryKey) return null;
  const proOption = chatGptProMentionOption();
  const moaOption = moaMentionOption();
  const specialOptions = [proOption, moaOption];
  if (secondaryKey) {
    const combinedKey = `${primaryKey}${secondaryKey}`;
    const combinedSpecial = specialOptions.find((option) => composerModelMentionAliases(option).has(combinedKey));
    if (combinedSpecial) return combinedSpecial;
  }
  const special = specialOptions.find((option) => composerModelMentionAliases(option).has(primaryKey));
  if (special) return special;
  const options = composerModelOptions();
  if (secondaryKey) {
    const combinedKey = `${primaryKey}${secondaryKey}`;
    const combined = options.find((option) => composerModelMentionAliases(option).has(combinedKey));
    if (combined) return combined;
  }
  return options.find((option) => composerModelMentionAliases(option).has(primaryKey)) || null;
}

function chatGptProMentionOption() {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.chatGptProMentionOptionPlan === "function") {
    return model.chatGptProMentionOptionPlan();
  }
  return {
    id: "chatgpt-pro",
    workspaceId: "assistant-chatgpt-pro",
    label: "ChatGPT Pro",
    virtual: true,
    mentionText: "@ChatGPT Pro",
    aliases: ["chatgptpro", "chatgpt-pro", "pro"],
    description: "Owner approval / maintenance Gateway",
    model: "",
    provider: "openai-codex",
    modelExplicit: true,
    chatGptPro: true,
    ownerElevationRequired: true,
  };
}

function moaMentionOption() {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.moaMentionOptionPlan === "function") {
    return model.moaMentionOptionPlan();
  }
  return {
    id: "moa",
    workspaceId: "assistant-moa",
    label: "MOA",
    virtual: true,
    mentionText: "@MOA",
    aliases: ["moa", "mixtureofagents", "mixture-of-agents", "mixture of agents"],
    description: "Owner approval / Hermes Agent MoA",
    model: "default",
    provider: "moa",
    modelExplicit: true,
    moa: true,
    ownerElevationRequired: true,
  };
}

function composerAiMentionOptions() {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.composerAiMentionOptionsPlan === "function") {
    return model.composerAiMentionOptionsPlan(composerModelSelectionPlanInput({
      options: composerModelOptions(),
    }));
  }
  const label = "ChatGPT";
  const modelLabel = state.defaultModel || label;
  const defaultModelOption = composerModelOptions()[0];
  const chatGptXhigh = {
    workspaceId: "assistant-xhigh",
    label: `${label} X high`,
    virtual: true,
    mentionText: `@${label} X high`,
    description: [modelLabel, "X high"].filter(Boolean).join(" / "),
    reasoningEffort: "xhigh",
    model: defaultModelOption.model || "",
    provider: defaultModelOption.provider || "",
    modelExplicit: true,
  };
  const grokOptions = composerModelOptions()
    .filter((option) => option.id !== DEFAULT_COMPOSER_MODEL_ID)
    .map((option) => ({
      workspaceId: `assistant-model-${option.id}`,
      label: option.label,
      virtual: true,
      mentionText: option.mentionText || `@${option.label}`,
      description: [option.model, option.description].filter(Boolean).join(" / "),
      reasoningEffort: "",
      model: option.model || "",
      provider: option.provider || "",
      modelExplicit: true,
    }));
  return [chatGptProMentionOption(), moaMentionOption(), chatGptXhigh, ...grokOptions].slice(0, 4);
}

function assistantMentionAliases() {
  const aliases = new Set();
  composerModelOptions().forEach((option) => {
    composerModelMentionAliases(option).forEach((alias) => aliases.add(alias));
  });
  return aliases;
}

function reasoningEffortFromAiAlias(value) {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.reasoningEffortFromAiAliasPlan === "function") {
    return model.reasoningEffortFromAiAliasPlan(composerModelSelectionPlanInput({ value }));
  }
  const alias = normalizeMentionSearch(value).replace(/[-_:\uFF1A]/g, "");
  if (!alias) return "";
  for (const option of configuredReasoningOptions()) {
    const aliases = [
      option.value,
      option.label,
      option.shortLabel,
    ].map((item) => normalizeMentionSearch(item).replace(/[-_:\uFF1A]/g, "")).filter(Boolean);
    if (aliases.includes(alias)) return option.value;
  }
  if (alias === "low" || alias === "\u4f4e" || alias === "\u4f4e\u63a8\u7406") return "low";
  if (alias === "medium" || alias === "med" || alias === "mid" || alias === "standard" || alias === "\u4e2d" || alias === "\u4e2d\u63a8\u7406" || alias === "\u9ed8\u8ba4" || alias === "\u6807\u51c6" || alias === "\u6a19\u6e96") return "medium";
  if (alias === "high" || alias === "\u9ad8" || alias === "\u9ad8\u63a8\u7406") return "high";
  if (alias === "xhi" || alias === "xhigh" || alias === "highest" || alias === "max" || alias === "maximum" || alias === "\u6781\u9ad8" || alias === "\u6975\u9ad8" || alias === "\u6700\u9ad8" || alias === "\u6700\u9ad8\u63a8\u7406") return "xhigh";
  return "";
}

function composerAiMentionInfo(text) {
  const selectionModel = currentChatComposerModelSelectionModel();
  if (typeof selectionModel?.composerAiMentionInfoPlan === "function") {
    return selectionModel.composerAiMentionInfoPlan(composerModelSelectionPlanInput({
      text,
      options: composerModelOptions(),
    }));
  }
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const pattern = /(^|[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])[@\uff20]\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+)(?:\s*[-_:\uFF1A]?\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+(?:\s+[A-Za-z0-9_.\-\u4e00-\u9fff]+)?))?(?=$|[\s)\]}\u3000\uff09\uff3d\u3011\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/ig;
  let mentionsAi = false;
  let reasoningEffort = "";
  let model = "";
  let provider = "";
  let modelExplicit = false;
  let chatGptPro = false;
  let moa = false;
  let ownerElevationRequired = false;
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const modelOption = composerModelOptionForMention(match[2], match[3] || "");
    if (!modelOption) continue;
    mentionsAi = true;
    model = modelOption.model || "";
    provider = modelOption.provider || "";
    modelExplicit = true;
    chatGptPro = Boolean(modelOption.chatGptPro);
    moa = Boolean(modelOption.moa);
    ownerElevationRequired = Boolean(modelOption.ownerElevationRequired);
    const effort = reasoningEffortFromAiAlias(match[3] || "");
    if (effort) reasoningEffort = effort;
  }
  return { mentionsAi, reasoningEffort, model, provider, modelExplicit, chatGptPro, moa, ownerElevationRequired };
}

function selectedComposerModel(text = getComposerText()) {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.selectedComposerModelPlan === "function") {
    return model.selectedComposerModelPlan(composerModelSelectionPlanInput({
      text,
      options: composerModelOptions(),
    }));
  }
  const mentionInfo = composerAiMentionInfo(text);
  if (mentionInfo.modelExplicit) return mentionInfo.model || "";
  return selectedDefaultComposerModelOption().model || "";
}

function selectedComposerProvider(text = getComposerText()) {
  const model = currentChatComposerModelSelectionModel();
  if (typeof model?.selectedComposerProviderPlan === "function") {
    return model.selectedComposerProviderPlan(composerModelSelectionPlanInput({
      text,
      options: composerModelOptions(),
    }));
  }
  const mentionInfo = composerAiMentionInfo(text);
  if (mentionInfo.modelExplicit) return mentionInfo.provider || "";
  return selectedDefaultComposerModelOption().provider || "";
}

function groupChatMentionsAi(text) {
  return composerAiMentionInfo(text).mentionsAi;
}
