export const CHAT_COMPOSER_SOURCE_MODEL_VERSION = "20260704.composer-source.v1";
export const COMPOSER_SOURCE_LOCAL = "local";

function sourceOptions(input = {}) {
  const options = Array.isArray(input.options) ? input.options : [];
  return options.length ? options : [{ source: COMPOSER_SOURCE_LOCAL, label: "Local", shortLabel: "Local" }];
}

export function normalizeComposerSearchSourceValue(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s_\-:：]+/g, "");
  if (raw === "web"
    || raw === "websearch"
    || raw === "network"
    || raw === "internet"
    || raw === "online"
    || raw === "网络"
    || raw === "网络搜索"
    || raw === "网页"
    || raw === "联网") return "web";
  if (raw === "x"
    || raw === "xsearch"
    || raw === "twitter"
    || raw === "twittersearch"
    || raw === "x搜索"
    || raw === "推特") return "x";
  return COMPOSER_SOURCE_LOCAL;
}

export function composerSearchSourceOptionPlan(input = {}) {
  const normalized = normalizeComposerSearchSourceValue(input.source);
  const options = sourceOptions(input);
  return options.find((option) => option.source === normalized) || options[0];
}

export function composerSearchSourceCommandPlan(input = {}) {
  const value = String(input.text || "").replace(/\u00a0/g, " ");
  if (!value.trim()) return null;
  const boundary = "(?=$|[\\s)\\]}\\u3000\\uff09\\uff3d\\u3011\\uff0c,.;:!?\\uFF0C\\u3002\\uFF1B\\uFF1A\\uFF01\\uFF1F\\u3001])";
  const prefix = "(^|[\\s([{\\u3000\\uff08\\uff3b\\u3010\\uff0c,.;:!?\\uFF0C\\u3002\\uFF1B\\uFF1A\\uFF01\\uFF1F\\u3001])[#\\uff03]\\s*";
  const patterns = [
    { source: "x", pattern: new RegExp(`${prefix}(?:x|twitter|\\u63a8\\u7279)\\s*(?:\\u641c\\u7d22|\\u641c|search)?${boundary}`, "i") },
    { source: "web", pattern: new RegExp(`${prefix}(?:web|internet|online|\\u7f51\\u7edc|\\u7f51\\u9875|\\u8054\\u7f51)\\s*(?:\\u641c\\u7d22|\\u641c|search)?${boundary}`, "i") },
    { source: COMPOSER_SOURCE_LOCAL, pattern: new RegExp(`${prefix}(?:local|default|\\u672c\\u5730|\\u672c\\u5730\\u6570\\u636e|\\u9ed8\\u8ba4)\\s*(?:data|\\u6570\\u636e)?${boundary}`, "i") },
  ];
  const match = patterns.find((item) => item.pattern.test(value));
  return match ? composerSearchSourceOptionPlan(Object.assign({}, input, { source: match.source })) : null;
}

export function composerSearchSourceAutoHintPlan(input = {}) {
  const value = String(input.text || "").replace(/\u00a0/g, " ");
  if (!value.trim()) return null;
  const patterns = [
    {
      source: "x",
      pattern: /(?:\b(?:on|from|search|check|look\s+up)\s+(?:x|twitter)\b|\b(?:x|twitter)\s+(?:search|posts?|discussion|thread|timeline|public)\b|(?:在|去|从)?\s*(?:X|x|Twitter|twitter|推特)\s*(?:上|里|平台)?\s*(?:搜|搜索|查|查找|找|看看|看一下)|(?:搜|搜索|查|查找|找)\s*(?:一下)?\s*(?:X|x|Twitter|twitter|推特)\s*(?:上|里|平台)?)/i,
    },
    {
      source: "web",
      pattern: /(?:\b(?:search|check|look\s+up)\s+(?:the\s+)?(?:web|internet|online)\b|\b(?:web|internet|online)\s+search\b|(?:网上|网络|网页|联网|公共网页)\s*(?:搜|搜索|查|查找|核对|找|看看|看一下)|(?:搜|搜索|查|查找|核对)\s*(?:一下)?\s*(?:网上|网络|网页|联网|公共网页))/i,
    },
  ];
  const match = patterns.find((item) => item.pattern.test(value));
  return match ? composerSearchSourceOptionPlan(Object.assign({}, input, { source: match.source })) : null;
}

export function selectedComposerSearchSourceInfoPlan(input = {}) {
  const manual = composerSearchSourceOptionPlan(Object.assign({}, input, { source: input.manualSource }));
  const manualExplicit = manual.source !== COMPOSER_SOURCE_LOCAL;
  const auto = manualExplicit
    ? null
    : (composerSearchSourceCommandPlan(input) || composerSearchSourceAutoHintPlan(input));
  const option = manualExplicit ? manual : (auto || manual);
  const autoDetected = Boolean(auto && option.source !== COMPOSER_SOURCE_LOCAL);
  return Object.assign({}, option, {
    commandExplicit: Boolean(auto),
    explicit: Boolean(manualExplicit || autoDetected),
    manualExplicit,
    autoDetected,
    sourceMode: manualExplicit ? "manual" : (autoDetected ? "auto" : COMPOSER_SOURCE_LOCAL),
  });
}

export function chooseComposerSearchSourcePlan(input = {}) {
  const normalized = normalizeComposerSearchSourceValue(input.source);
  const current = normalizeComposerSearchSourceValue(input.currentSource);
  return {
    version: CHAT_COMPOSER_SOURCE_MODEL_VERSION,
    nextSource: current === normalized ? COMPOSER_SOURCE_LOCAL : normalized,
  };
}

export function composerSourceControlPlan(input = {}) {
  const searchMode = Boolean(input.searchMode);
  const canUse = !searchMode && (input.viewMode === "single" || input.viewMode === "tasks");
  const info = input.info || {};
  return {
    version: CHAT_COMPOSER_SOURCE_MODEL_VERSION,
    hidden: searchMode,
    canUse,
    active: Boolean(info.manualExplicit),
    autoDetected: Boolean(info.autoDetected),
    title: info.autoDetected
      ? `已自动识别本句信源：${info.label || ""}`
      : `本句信源：${info.label || ""}`,
  };
}

export function composerSourceToggleButtonPlan(input = {}) {
  const source = normalizeComposerSearchSourceValue(input.source);
  const info = input.info || {};
  const option = input.option || {};
  const active = source === info.source && Boolean(info.manualExplicit);
  const autoDetected = source === info.source && Boolean(info.autoDetected);
  return {
    version: CHAT_COMPOSER_SOURCE_MODEL_VERSION,
    source,
    disabled: !input.canUse,
    active,
    autoDetected,
    ariaPressed: active ? "true" : "false",
    title: active
      ? `已选中${option.label || ""}，再点回到本地数据`
      : (autoDetected
        ? `已从文本自动识别${option.label || ""}；点击后改为手动锁定`
        : `本句使用${option.label || ""}`),
  };
}
