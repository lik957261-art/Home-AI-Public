"use strict";

function normalizeMentionSearch(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function fallbackReasoningCompactLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "Xhigh";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function normalizeReasoningOptions(items) {
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
  const primaryKey = normalizeMentionSearch(primary);
  const secondaryKey = normalizeMentionSearch(secondary);
  if (!primaryKey) return null;
  const proOption = chatGptProMentionOption();
  const specialOptions = [proOption];
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

function composerAiMentionOptions() {
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
  return [chatGptProMentionOption(), chatGptXhigh, ...grokOptions].slice(0, 4);
}

function assistantMentionAliases() {
  const aliases = new Set();
  composerModelOptions().forEach((option) => {
    composerModelMentionAliases(option).forEach((alias) => aliases.add(alias));
  });
  return aliases;
}

function reasoningEffortFromAiAlias(value) {
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
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const pattern = /(^|[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])[@\uff20]\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+)(?:\s*[-_:\uFF1A]?\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+(?:\s+[A-Za-z0-9_.\-\u4e00-\u9fff]+)?))?(?=$|[\s)\]}\u3000\uff09\uff3d\u3011\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/ig;
  let mentionsAi = false;
  let reasoningEffort = "";
  let model = "";
  let provider = "";
  let modelExplicit = false;
  let chatGptPro = false;
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
    ownerElevationRequired = Boolean(modelOption.ownerElevationRequired);
    const effort = reasoningEffortFromAiAlias(match[3] || "");
    if (effort) reasoningEffort = effort;
  }
  return { mentionsAi, reasoningEffort, model, provider, modelExplicit, chatGptPro, ownerElevationRequired };
}

function selectedComposerModel(text = getComposerText()) {
  const mentionInfo = composerAiMentionInfo(text);
  if (mentionInfo.modelExplicit) return mentionInfo.model || "";
  return selectedDefaultComposerModelOption().model || "";
}

function selectedComposerProvider(text = getComposerText()) {
  const mentionInfo = composerAiMentionInfo(text);
  if (mentionInfo.modelExplicit) return mentionInfo.provider || "";
  return selectedDefaultComposerModelOption().provider || "";
}

function groupChatMentionsAi(text) {
  return composerAiMentionInfo(text).mentionsAi;
}
