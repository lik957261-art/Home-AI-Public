const CHAT_COMPOSER_MODEL_SELECTION_MODEL_VERSION = "20260704-vite-chat-composer-model-selection-model-v1";
const DEFAULT_COMPOSER_MODEL_SELECTION_ID = "runtime-default";

function cleanComposerModelSelectionString(value, maxLength = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxLength) || 4000));
}

function normalizeMentionSearchValue(value) {
  return cleanComposerModelSelectionString(value, 4000).replace(/\s+/g, "").toLowerCase();
}

function reasoningCompactLabelPlan(value) {
  const effort = cleanComposerModelSelectionString(value, 80).toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "Xhigh";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function normalizeReasoningOptionsPlan(input = {}) {
  const source = Array.isArray(input.items) && input.items.length
    ? input.items
    : (Array.isArray(input.defaultItems) ? input.defaultItems.filter((item) => item?.value) : []);
  const seen = new Set();
  return Object.freeze(source
    .map((item) => {
      const value = cleanComposerModelSelectionString(item?.value || "", 80).toLowerCase();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      const label = cleanComposerModelSelectionString(item?.label || item?.value || "", 120) || value;
      return Object.freeze({
        value,
        label,
        shortLabel: cleanComposerModelSelectionString(item?.shortLabel || item?.short_label || reasoningCompactLabelPlan(value), 40),
      });
    })
    .filter(Boolean));
}

function assistantDisplayLabelPlan(input = {}) {
  const label = cleanComposerModelSelectionString(
    input.assistantLabel || input.modelProvider || input.defaultModel || input.virtualLabel || "AI",
    120,
  );
  return label || "AI";
}

function normalizeComposerModelOption(option = {}) {
  const aliases = Array.isArray(option.aliases)
    ? option.aliases.map((alias) => cleanComposerModelSelectionString(alias, 120)).filter(Boolean)
    : [];
  return Object.freeze(Object.assign({}, option, {
    id: cleanComposerModelSelectionString(option.id || "", 120),
    label: cleanComposerModelSelectionString(option.label || "", 120),
    model: cleanComposerModelSelectionString(option.model || "", 180),
    provider: cleanComposerModelSelectionString(option.provider || "", 120),
    mentionText: cleanComposerModelSelectionString(option.mentionText || "", 120),
    aliases: Object.freeze(aliases),
    description: cleanComposerModelSelectionString(option.description || "", 240),
  }));
}

function composerModelOptionsPlan(input = {}) {
  const options = Array.isArray(input.options) ? input.options : [];
  const defaultId = cleanComposerModelSelectionString(input.defaultId || DEFAULT_COMPOSER_MODEL_SELECTION_ID, 120);
  const label = assistantDisplayLabelPlan(input);
  const modelLabel = cleanComposerModelSelectionString(input.defaultModel || label, 180);
  return Object.freeze(options.map((rawOption) => {
    const option = normalizeComposerModelOption(rawOption);
    if (option.id !== defaultId) return option;
    const aliases = [
      ...(Array.isArray(option.aliases) ? option.aliases : []),
      label,
      input.defaultModel,
      input.modelProvider,
    ].map((alias) => cleanComposerModelSelectionString(alias, 120)).filter(Boolean);
    return Object.freeze(Object.assign({}, option, {
      label,
      mentionText: `@${label}`,
      description: [modelLabel, "\u8fd0\u884c\u65f6\u9ed8\u8ba4"].filter(Boolean).join(" / "),
      aliases: Object.freeze([...new Set(aliases)]),
    }));
  }));
}

function composerModelMentionAliasesPlan(option = {}) {
  return new Set([
    option.id,
    option.label,
    option.model,
    option.provider,
    option.mentionText,
    ...(Array.isArray(option.aliases) ? option.aliases : []),
  ].map(normalizeMentionSearchValue).filter(Boolean));
}

function chatGptProMentionOptionPlan() {
  return Object.freeze({
    id: "chatgpt-pro",
    workspaceId: "assistant-chatgpt-pro",
    label: "ChatGPT Pro",
    virtual: true,
    mentionText: "@ChatGPT Pro",
    aliases: Object.freeze(["chatgptpro", "chatgpt-pro", "pro"]),
    description: "Owner approval / maintenance Gateway",
    model: "",
    provider: "openai-codex",
    modelExplicit: true,
    chatGptPro: true,
    ownerElevationRequired: true,
  });
}

function moaMentionOptionPlan() {
  return Object.freeze({
    id: "moa",
    workspaceId: "assistant-moa",
    label: "MOA",
    virtual: true,
    mentionText: "@MOA",
    aliases: Object.freeze(["moa", "mixtureofagents", "mixture-of-agents", "mixture of agents"]),
    description: "Owner approval / Hermes Agent MoA",
    model: "default",
    provider: "moa",
    modelExplicit: true,
    moa: true,
    ownerElevationRequired: true,
  });
}

function composerModelOptionForMentionPlan(input = {}) {
  const primaryKey = normalizeMentionSearchValue(input.primary);
  const secondaryKey = normalizeMentionSearchValue(input.secondary);
  if (!primaryKey) return null;
  const options = Array.isArray(input.options) ? input.options.map(normalizeComposerModelOption) : [];
  const specialOptions = [chatGptProMentionOptionPlan(), moaMentionOptionPlan()];
  if (secondaryKey) {
    const combinedKey = `${primaryKey}${secondaryKey}`;
    const combinedSpecial = specialOptions.find((option) => composerModelMentionAliasesPlan(option).has(combinedKey));
    if (combinedSpecial) return combinedSpecial;
  }
  const special = specialOptions.find((option) => composerModelMentionAliasesPlan(option).has(primaryKey));
  if (special) return special;
  if (secondaryKey) {
    const combinedKey = `${primaryKey}${secondaryKey}`;
    const combined = options.find((option) => composerModelMentionAliasesPlan(option).has(combinedKey));
    if (combined) return combined;
  }
  return options.find((option) => composerModelMentionAliasesPlan(option).has(primaryKey)) || null;
}

function composerAiMentionOptionsPlan(input = {}) {
  const label = "ChatGPT";
  const options = Array.isArray(input.options) ? input.options.map(normalizeComposerModelOption) : [];
  const defaultId = cleanComposerModelSelectionString(input.defaultId || DEFAULT_COMPOSER_MODEL_SELECTION_ID, 120);
  const modelLabel = cleanComposerModelSelectionString(input.defaultModel || label, 180);
  const defaultModelOption = options[0] || {};
  const chatGptXhigh = Object.freeze({
    workspaceId: "assistant-xhigh",
    label: `${label} X high`,
    virtual: true,
    mentionText: `@${label} X high`,
    description: [modelLabel, "X high"].filter(Boolean).join(" / "),
    reasoningEffort: "xhigh",
    model: defaultModelOption.model || "",
    provider: defaultModelOption.provider || "",
    modelExplicit: true,
  });
  const modelOptions = options
    .filter((option) => option.id !== defaultId)
    .map((option) => Object.freeze({
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
  return Object.freeze([chatGptProMentionOptionPlan(), moaMentionOptionPlan(), chatGptXhigh, ...modelOptions].slice(0, 4));
}

function reasoningEffortFromAiAliasPlan(input = {}) {
  const alias = normalizeMentionSearchValue(input.value).replace(/[-_:\uFF1A]/g, "");
  if (!alias) return "";
  const options = normalizeReasoningOptionsPlan({
    items: input.reasoningOptions,
    defaultItems: input.defaultReasoningOptions,
  });
  for (const option of options) {
    const aliases = [
      option.value,
      option.label,
      option.shortLabel,
    ].map((item) => normalizeMentionSearchValue(item).replace(/[-_:\uFF1A]/g, "")).filter(Boolean);
    if (aliases.includes(alias)) return option.value;
  }
  if (alias === "low" || alias === "\u4f4e" || alias === "\u4f4e\u63a8\u7406") return "low";
  if (alias === "medium" || alias === "med" || alias === "mid" || alias === "standard" || alias === "\u4e2d" || alias === "\u4e2d\u63a8\u7406" || alias === "\u9ed8\u8ba4" || alias === "\u6807\u51c6" || alias === "\u6a19\u6e96") return "medium";
  if (alias === "high" || alias === "\u9ad8" || alias === "\u9ad8\u63a8\u7406") return "high";
  if (alias === "xhi" || alias === "xhigh" || alias === "highest" || alias === "max" || alias === "maximum" || alias === "\u6781\u9ad8" || alias === "\u6975\u9ad8" || alias === "\u6700\u9ad8" || alias === "\u6700\u9ad8\u63a8\u7406") return "xhigh";
  return "";
}

function composerAiMentionInfoPlan(input = {}) {
  const normalized = cleanComposerModelSelectionString(input.text || "", 240000).replace(/\u00a0/g, " ");
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
    const modelOption = composerModelOptionForMentionPlan({
      primary: match[2],
      secondary: match[3] || "",
      options: input.options,
    });
    if (!modelOption) continue;
    mentionsAi = true;
    model = modelOption.model || "";
    provider = modelOption.provider || "";
    modelExplicit = true;
    chatGptPro = Boolean(modelOption.chatGptPro);
    moa = Boolean(modelOption.moa);
    ownerElevationRequired = Boolean(modelOption.ownerElevationRequired);
    const effort = reasoningEffortFromAiAliasPlan({
      value: match[3] || "",
      reasoningOptions: input.reasoningOptions,
      defaultReasoningOptions: input.defaultReasoningOptions,
    });
    if (effort) reasoningEffort = effort;
  }
  return Object.freeze({ mentionsAi, reasoningEffort, model, provider, modelExplicit, chatGptPro, moa, ownerElevationRequired });
}

function selectedDefaultComposerModelOptionPlan(input = {}) {
  const options = Array.isArray(input.options) ? input.options : [];
  const id = cleanComposerModelSelectionString(input.value || input.defaultId || DEFAULT_COMPOSER_MODEL_SELECTION_ID, 120);
  return normalizeComposerModelOption(options.find((option) => option?.id === id) || options[0] || {});
}

function selectedComposerModelPlan(input = {}) {
  const mentionInfo = composerAiMentionInfoPlan(input);
  if (mentionInfo.modelExplicit) return mentionInfo.model || "";
  return selectedDefaultComposerModelOptionPlan(input).model || "";
}

function selectedComposerProviderPlan(input = {}) {
  const mentionInfo = composerAiMentionInfoPlan(input);
  if (mentionInfo.modelExplicit) return mentionInfo.provider || "";
  return selectedDefaultComposerModelOptionPlan(input).provider || "";
}

export {
  CHAT_COMPOSER_MODEL_SELECTION_MODEL_VERSION,
  DEFAULT_COMPOSER_MODEL_SELECTION_ID,
  assistantDisplayLabelPlan,
  chatGptProMentionOptionPlan,
  cleanComposerModelSelectionString,
  composerAiMentionInfoPlan,
  composerAiMentionOptionsPlan,
  composerModelMentionAliasesPlan,
  composerModelOptionForMentionPlan,
  composerModelOptionsPlan,
  moaMentionOptionPlan,
  normalizeMentionSearchValue,
  normalizeReasoningOptionsPlan,
  reasoningCompactLabelPlan,
  reasoningEffortFromAiAliasPlan,
  selectedComposerModelPlan,
  selectedComposerProviderPlan,
  selectedDefaultComposerModelOptionPlan,
};
