const MESSAGE_USAGE_MODEL_VERSION = "20260705-vite-message-usage-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function numericUsageValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function numericCostValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function uniqueUsageLabels(values = []) {
  return [...new Set(values.map((value) => cleanString(value, 240)).filter(Boolean))];
}

function normalizeUsageModelCalls(usage = {}) {
  const rows = [
    usage.api_call_model_routes,
    usage.api_call_models,
    usage.apiCallModelRoutes,
  ].find(Array.isArray) || [];
  return Object.freeze(rows
    .filter((item) => item && typeof item === "object")
    .map((item) => Object.freeze({
      model: cleanString(item.model || item.model_name || item.response_model, 240),
      reasoningEffort: cleanString(item.reasoning_effort || item.reasoningEffort || item.effort, 120),
    })));
}

function normalizeUsage(usage = {}) {
  const inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const outputDetails = usage.output_tokens_details || usage.completion_tokens_details || {};
  const input = numericUsageValue(usage.input_tokens, usage.prompt_tokens, usage.input, usage.prompt);
  const output = numericUsageValue(usage.output_tokens, usage.completion_tokens, usage.output, usage.completion);
  const total = numericUsageValue(usage.total_tokens, usage.total, (input || 0) + (output || 0));
  const explicitCachedInput = numericUsageValue(
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_read_tokens,
    usage.cached_tokens,
    inputDetails.cached_tokens,
    inputDetails.cache_read_tokens,
  );
  const cacheWriteInput = numericUsageValue(
    usage.cache_write_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_creation_tokens,
    inputDetails.cache_write_tokens,
    inputDetails.cache_creation_tokens,
  ) || 0;
  const reasoningOutput = numericUsageValue(usage.reasoning_tokens, outputDetails.reasoning_tokens);
  const cachedRemainder = total !== null
    ? Math.max(0, total - (input || 0) - (output || 0) - (reasoningOutput || 0) - cacheWriteInput)
    : 0;
  const shouldInferCachedInput = explicitCachedInput === null
    ? cachedRemainder > 0
    : (explicitCachedInput === 0 && cachedRemainder > 0);
  const inferredCachedInput = shouldInferCachedInput ? cachedRemainder : 0;
  const cachedInput = shouldInferCachedInput ? inferredCachedInput : explicitCachedInput;
  const explicitUncached = numericUsageValue(
    usage.uncached_input_tokens,
    usage.input_tokens_uncached,
    usage.uncached_tokens,
    inputDetails.uncached_tokens,
  );
  const inputIncludesCached = !shouldInferCachedInput && explicitCachedInput !== null && input !== null && input >= cachedInput;
  const uncachedInput = explicitUncached !== null
    ? explicitUncached
    : (cachedInput !== null && input !== null ? Math.max(0, inputIncludesCached ? input - cachedInput : input) : null);
  const inputTotal = explicitUncached !== null
    ? explicitUncached + cachedInput
    : (inputIncludesCached ? input : ((input || 0) + (cachedInput || 0)));
  return Object.freeze({
    input: inputTotal,
    output,
    total,
    cachedInput,
    uncachedInput,
    reasoningOutput,
  });
}

function normalizeUsageApiCalls(usage = {}) {
  const rows = [
    usage.api_call_usage_routes,
    usage.api_call_usage,
    usage.api_calls_detail,
    usage.apiCalls,
  ].find(Array.isArray) || [];
  const modelRows = normalizeUsageModelCalls(usage);
  return Object.freeze(rows
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const modelRow = modelRows[index] || {};
      const input = numericUsageValue(item.input_tokens, item.prompt_tokens, item.input, item.prompt) || 0;
      const cachedInput = numericUsageValue(
        item.cache_read_tokens,
        item.cached_input_tokens,
        item.cache_read_input_tokens,
        item.cached_tokens,
      ) || 0;
      const output = numericUsageValue(item.output_tokens, item.completion_tokens, item.output, item.completion) || 0;
      return Object.freeze({
        model: cleanString(item.model || item.model_name || modelRow.model, 240),
        reasoningEffort: cleanString(item.reasoning_effort || item.reasoningEffort || modelRow.reasoningEffort, 120),
        input,
        cachedInput,
        output,
        total: numericUsageValue(item.total_tokens, item.total, input + cachedInput + output) || 0,
      });
    }));
}

function normalizeUsageCost(usage = {}) {
  const status = cleanString(usage.cost_status || usage.billing_status, 80).toLowerCase();
  const mode = cleanString(usage.billing_mode, 80).toLowerCase();
  const actual = numericCostValue(usage.actual_cost_usd, usage.api_cost_usd, usage.cost_usd);
  const estimated = numericCostValue(usage.estimated_cost_usd, usage.estimated_api_cost_usd);
  const cost = actual !== null ? actual : estimated;
  if (status === "included" || mode === "subscription_included") return "Included";
  if (cost === null) return null;
  if (cost === 0) return "$0.00";
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`;
}

function formatTokenCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatUsageValuePlan(value) {
  if (typeof value === "string") {
    return Object.freeze({ version: MESSAGE_USAGE_MODEL_VERSION, type: "text", text: value });
  }
  return Object.freeze({ version: MESSAGE_USAGE_MODEL_VERSION, type: "number", text: formatTokenCount(value) });
}

function usageModelLabelPlan(input = {}) {
  const usage = input.usage || {};
  const message = input.message || {};
  const apiCallRows = Array.isArray(input.apiCallRows) ? input.apiCallRows : [];
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = cleanString(
    usage.model
    || usage.model_name
    || usage.response_model
    || message.model
    || message.modelName,
    240,
  );
  const models = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item?.model),
    ...modelRows.map((item) => item?.model),
  ]);
  return Object.freeze({
    version: MESSAGE_USAGE_MODEL_VERSION,
    label: models.length ? models.join(", ") : cleanString(input.defaultModelLabel, 240),
    values: Object.freeze(models),
  });
}

function usageProviderLabelPlan(input = {}) {
  const usage = input.usage || {};
  const message = input.message || {};
  const provider = cleanString(
    usage.provider
    || usage.model_provider
    || message.modelProvider
    || message.model_provider
    || message.provider
    || usage.billing_provider,
    240,
  );
  return Object.freeze({
    version: MESSAGE_USAGE_MODEL_VERSION,
    label: provider || null,
  });
}

function usageReasoningLabelPlan(input = {}) {
  const usage = input.usage || {};
  const message = input.message || {};
  const apiCallRows = Array.isArray(input.apiCallRows) ? input.apiCallRows : [];
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = cleanString(
    usage.reasoning_effort
    || usage.reasoningEffort
    || usage.reasoning
    || message.reasoningEffort
    || message.reasoning_effort,
    120,
  );
  const efforts = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item?.reasoningEffort),
    ...modelRows.map((item) => item?.reasoningEffort),
  ]);
  const tokens = efforts.length ? efforts : [cleanString(input.defaultReasoningEffort || "medium", 80) || "medium"];
  return Object.freeze({
    version: MESSAGE_USAGE_MODEL_VERSION,
    tokens: Object.freeze(tokens),
  });
}

function usageRowsPlan(input = {}) {
  const usage = input.usage || {};
  const message = input.message || {};
  const normalized = input.normalized || normalizeUsage(usage);
  const apiCallRows = Array.isArray(input.apiCallRows) ? input.apiCallRows : normalizeUsageApiCalls(usage);
  const explicitApiCallCount = numericUsageValue(usage.api_calls, usage.api_call_count);
  const apiCallCount = explicitApiCallCount !== null
    ? explicitApiCallCount
    : (apiCallRows.length ? apiCallRows.length : null);
  const apiCost = normalizeUsageCost(usage);
  const rows = [
    ["Model", usageModelLabelPlan({
      usage,
      message,
      apiCallRows,
      defaultModelLabel: input.defaultModelLabel,
    }).label],
    ["Provider", usageProviderLabelPlan({ usage, message }).label],
    ["Reasoning", input.reasoningLabel || null],
    normalized.uncachedInput !== null ? ["Uncached input", normalized.uncachedInput] : null,
    ["Cached input", normalized.cachedInput !== null ? normalized.cachedInput : "Not reported"],
    ["Input total", normalized.input],
    ["Output", normalized.output],
    ["Reasoning output", normalized.reasoningOutput],
    ["API calls", apiCallCount !== null ? apiCallCount : "Not reported"],
    apiCost !== null ? ["API cost", apiCost] : null,
    ["Total", normalized.total],
  ].filter((row) => row && row[1] !== null && row[1] !== undefined);
  return Object.freeze({
    version: MESSAGE_USAGE_MODEL_VERSION,
    rows: Object.freeze(rows.map(([label, value]) => Object.freeze({ label, value }))),
  });
}

function usageApiCallRowsPlan(usage = {}) {
  return Object.freeze({
    version: MESSAGE_USAGE_MODEL_VERSION,
    rows: normalizeUsageApiCalls(usage),
  });
}

function usageDetailsViewPlan(input = {}) {
  const usage = input.usage || {};
  const message = input.message || {};
  const normalized = normalizeUsage(usage);
  const total = normalized.total || 0;
  if (!total) {
    return Object.freeze({
      version: MESSAGE_USAGE_MODEL_VERSION,
      visible: false,
      total,
      titleTokenCount: formatTokenCount(total),
      rows: Object.freeze([]),
      apiCallRows: Object.freeze([]),
    });
  }
  const apiCallRows = normalizeUsageApiCalls(usage);
  const reasoningTokens = usageReasoningLabelPlan({
    usage,
    message,
    apiCallRows,
    defaultReasoningEffort: input.defaultReasoningEffort,
  }).tokens;
  const rows = usageRowsPlan({
    usage,
    message,
    normalized,
    apiCallRows,
    defaultModelLabel: input.defaultModelLabel,
    reasoningLabel: input.reasoningLabel || reasoningTokens.join(", "),
  }).rows;
  return Object.freeze({
    version: MESSAGE_USAGE_MODEL_VERSION,
    visible: true,
    total,
    titleTokenCount: formatTokenCount(total),
    rows,
    apiCallRows,
    reasoningTokens,
  });
}

function iconForMimePlan(mime = "") {
  const value = cleanString(mime, 240);
  if (/pdf/i.test(value)) return "PDF";
  if (/image/i.test(value)) return "IMG";
  if (/video/i.test(value)) return "VID";
  if (/audio/i.test(value)) return "AUD";
  return "FILE";
}

function artifactIconPlan(input = {}) {
  const kind = cleanString(input.artifactKind, 80);
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "DOC";
  if (kind === "markdown") return "MD";
  if (kind === "html") return "HTML";
  if (kind === "text") return "TXT";
  return iconForMimePlan(input.mime);
}

export {
  MESSAGE_USAGE_MODEL_VERSION,
  artifactIconPlan,
  formatTokenCount,
  formatUsageValuePlan,
  iconForMimePlan,
  normalizeUsage,
  normalizeUsageApiCalls,
  normalizeUsageCost,
  normalizeUsageModelCalls,
  numericCostValue,
  numericUsageValue,
  uniqueUsageLabels,
  usageApiCallRowsPlan,
  usageDetailsViewPlan,
  usageModelLabelPlan,
  usageProviderLabelPlan,
  usageReasoningLabelPlan,
  usageRowsPlan,
};
