"use strict";

function renderArtifacts(artifacts) {
  return `<div class="artifacts">${displayArtifacts(artifacts).map((artifact) => `<div class="artifact-row">
    <a class="artifact-card doc-${escapeHtml(artifactKind(artifact))}" href="${escapeHtml(artifactHref(artifact))}" target="_self" data-task-doc data-artifact-mime="${escapeHtml(artifact?.mime || "")}" data-artifact-name="${escapeHtml(artifactDisplayName(artifact))}">
      <div class="artifact-icon">${escapeHtml(iconForArtifact(artifact))}</div>
      <div>
        <div class="artifact-name">${escapeHtml(artifactDisplayName(artifact))}</div>
        <div class="artifact-meta">${escapeHtml(`${artifact.mime || "file"} | ${formatBytes(artifact.size)}`)}</div>
      </div>
    </a>
    ${renderArtifactDirectoryButton(artifact)}
    ${renderArtifactWeixinButton(artifact)}
  </div>`).join("")}</div>`;
}

function iconForArtifact(artifact) {
  const kind = artifactKind(artifact);
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "DOC";
  if (kind === "markdown") return "MD";
  if (kind === "html") return "HTML";
  if (kind === "text") return "TXT";
  return iconForMime(artifact?.mime);
}

function iconForMime(mime) {
  if (/pdf/i.test(mime || "")) return "PDF";
  if (/image/i.test(mime || "")) return "IMG";
  if (/video/i.test(mime || "")) return "VID";
  if (/audio/i.test(mime || "")) return "AUD";
  return "FILE";
}

function uniqueUsageLabels(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeUsageModelCalls(usage = {}) {
  const rows = [
    usage.api_call_model_routes,
    usage.api_call_models,
    usage.apiCallModelRoutes,
  ].find(Array.isArray) || [];
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      model: String(item.model || item.model_name || item.response_model || "").trim(),
      reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || item.effort || "").trim(),
    }));
}

function usageModelLabel(usage = {}, message = {}, apiCallRows = []) {
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = String(
    usage.model
    || usage.model_name
    || usage.response_model
    || message.model
    || message.modelName
    || "",
  ).trim();
  const models = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item.model),
    ...modelRows.map((item) => item.model),
  ]);
  return models.length ? models.join(", ") : (state.defaultModel || state.assistantLabel || "");
}

function usageProviderLabel(usage = {}, message = {}) {
  const provider = String(
    usage.provider
    || usage.model_provider
    || message.modelProvider
    || message.model_provider
    || message.provider
    || usage.billing_provider
    || "",
  ).trim();
  return provider || null;
}

function usageReasoningLabel(usage = {}, message = {}, apiCallRows = []) {
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = String(
    usage.reasoning_effort
    || usage.reasoningEffort
    || usage.reasoning
    || message.reasoningEffort
    || message.reasoning_effort
    || "",
  ).trim();
  const efforts = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item.reasoningEffort),
    ...modelRows.map((item) => item.reasoningEffort),
  ]);
  const labels = efforts.length ? efforts : [state.defaultReasoningEffort || "medium"];
  return labels.map((item) => reasoningEffortLabel(item)).join(", ");
}

function renderUsage(usage, message = {}) {
  const normalized = normalizeUsage(usage);
  const total = normalized.total || 0;
  if (!total) return "";
  const apiCallRows = normalizeUsageApiCalls(usage);
  const explicitApiCallCount = numericUsageValue(usage.api_calls, usage.api_call_count);
  const apiCallCount = explicitApiCallCount !== null
    ? explicitApiCallCount
    : (apiCallRows.length ? apiCallRows.length : null);
  const apiCost = normalizeUsageCost(usage);
  const rows = [
    ["Model", usageModelLabel(usage, message, apiCallRows)],
    ["Provider", usageProviderLabel(usage, message)],
    ["Reasoning", usageReasoningLabel(usage, message, apiCallRows)],
    normalized.uncachedInput !== null ? ["Uncached input", normalized.uncachedInput] : null,
    ["Cached input", normalized.cachedInput !== null ? normalized.cachedInput : "Not reported"],
    ["Input total", normalized.input],
    ["Output", normalized.output],
    ["Reasoning output", normalized.reasoningOutput],
    ["API calls", apiCallCount !== null ? apiCallCount : "Not reported"],
    apiCost !== null ? ["API cost", apiCost] : null,
    ["Total", normalized.total],
  ].filter((row) => row && row[1] !== null && row[1] !== undefined);
  const detailRows = rows.map(([label, value]) => `<div class="usage-row"><span>${escapeHtml(label)}</span><strong>${formatUsageValue(value)}</strong></div>`).join("");
  const apiDetails = apiCallRows.length ? `<div class="usage-api-calls">
    <div class="usage-api-title">API calls</div>
    ${apiCallRows.map((call, index) => `<div class="usage-api-row">
      <div class="usage-api-main">#${index + 1} ${escapeHtml([call.model, call.reasoningEffort].filter(Boolean).join(" / ") || "API call")}</div>
      <div class="usage-api-meta">
        <span>in ${formatTokenCount(call.input)}</span>
        <span>cached ${formatTokenCount(call.cachedInput)}</span>
        <span>out ${formatTokenCount(call.output)}</span>
        <span>total ${formatTokenCount(call.total)}</span>
      </div>
    </div>`).join("")}
  </div>` : "";
  return `<details class="usage" title="Usage: ${formatTokenCount(total)} tokens"><summary aria-label="Usage: ${formatTokenCount(total)} tokens">Usage</summary><div class="usage-details">${detailRows}${apiDetails}</div></details>`;
}

function numericUsageValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
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
  return {
    input: inputTotal,
    output,
    total,
    cachedInput,
    uncachedInput,
    reasoningOutput,
  };
}

function normalizeUsageApiCalls(usage = {}) {
  const rows = [
    usage.api_call_usage_routes,
    usage.api_call_usage,
    usage.api_calls_detail,
    usage.apiCalls,
  ].find(Array.isArray) || [];
  const modelRows = normalizeUsageModelCalls(usage);
  return rows
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
      return {
        model: String(item.model || item.model_name || modelRow.model || "").trim(),
        reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || modelRow.reasoningEffort || "").trim(),
        input,
        cachedInput,
        output,
        total: numericUsageValue(item.total_tokens, item.total, input + cachedInput + output) || 0,
      };
    });
}

function normalizeUsageCost(usage = {}) {
  const status = String(usage.cost_status || usage.billing_status || "").trim().toLowerCase();
  const mode = String(usage.billing_mode || "").trim().toLowerCase();
  const actual = numericCostValue(usage.actual_cost_usd, usage.api_cost_usd, usage.cost_usd);
  const estimated = numericCostValue(usage.estimated_cost_usd, usage.estimated_api_cost_usd);
  const cost = actual !== null ? actual : estimated;
  if (status === "included" || mode === "subscription_included") return "Included";
  if (cost === null) return null;
  if (cost === 0) return "$0.00";
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`;
}

function numericCostValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function formatTokenCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatUsageValue(value) {
  if (typeof value === "string") return escapeHtml(value);
  return formatTokenCount(value);
}
