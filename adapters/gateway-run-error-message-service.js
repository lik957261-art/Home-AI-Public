"use strict";

const DEFAULT_RUN_FAILURE_MESSAGE = "Hermes run failed before producing a reply.";
const GATEWAY_PROFILE_CHECK_SUFFIX = "请稍后重试；如果连续发生，需要检查 Gateway Profile、密钥或启动权限。";

function cleanString(value) {
  return String(value || "").trim();
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedText(value, maxChars = 300) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function redactGatewayRunErrorText(value) {
  let text = cleanString(value);
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]");
  text = text.replace(/\b(?:sk|sess|eyJ)[A-Za-z0-9._~+/=-]{16,}/g, "[redacted-token]");
  text = text.replace(/\b(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|password|cookie|credential)\s*[:=]\s*([^\s,;]+)/gi, "$1=[redacted]");
  text = text.replace(/(?:[A-Za-z]:\\|\/)[^\s"'<>]*(?:secret|token|auth|credential|key)[^\s"'<>]*/gi, "[redacted-path]");
  return boundedText(text);
}

function errorCode(err) {
  return cleanString(err?.code || err?.error?.code || err?.name);
}

function errorMessage(err) {
  if (typeof err === "string") return cleanString(err);
  return cleanString(err?.message || err?.error?.message || err);
}

function errorDetails(err) {
  return objectValue(err?.details || err?.error?.details);
}

function gatewayRunCapacityReasonLabel(reason) {
  const value = cleanString(reason);
  if (value === "global_capacity") return "全局通道已满";
  if (value === "workspace_capacity") return "工作区通道已满";
  if (value === "profile_affinity") return "匹配通道暂不可用";
  return "";
}

function queueReasonFromMessage(message) {
  const match = cleanString(message).match(/Gateway worker queue timed out for\s+([a-z0-9_-]+)/i);
  return match ? match[1] : "";
}

function queueTimeoutMessage(reason) {
  const value = cleanString(reason);
  if (value === "global_capacity") {
    return "当前所有 AI 执行通道都在忙，已等待一段时间仍没有空闲通道。请稍后重试，或等待正在运行的任务完成。";
  }
  if (value === "workspace_capacity") {
    return "当前工作区的 AI 执行通道已满，已等待一段时间仍没有空闲通道。请稍后重试，或等待正在运行的任务完成。";
  }
  if (value === "profile_affinity") {
    return "当前请求需要指定的 AI 执行通道，但匹配通道暂时不可用。请稍后重试。";
  }
  return "当前 AI 执行通道暂时不可用，已等待一段时间仍没有空闲通道。请稍后重试。";
}

function gatewayRunFailureCodeLabel(code) {
  const value = cleanString(code);
  if (value === "health_check_failed") return "健康检查失败";
  if (value === "port_busy") return "端口被占用";
  if (value === "start_worker_unavailable") return "启动脚本不可用";
  return "";
}

function workerStartFailedMessage(err) {
  const details = errorDetails(err);
  const failureCode = cleanString(details.failureCode || err?.failureCode || err?.code);
  if (failureCode === "health_check_failed") {
    return `AI 执行通道启动后没有通过健康检查。${GATEWAY_PROFILE_CHECK_SUFFIX}`;
  }
  return `AI 执行通道启动失败。${GATEWAY_PROFILE_CHECK_SUFFIX}`;
}

function gatewayRunUserFacingError(err) {
  const code = errorCode(err);
  const details = errorDetails(err);
  const message = errorMessage(err);

  if (code === "gateway_elastic_queue_timeout") {
    return queueTimeoutMessage(details.reason || queueReasonFromMessage(message));
  }
  if (code === "gateway_elastic_worker_start_failed") {
    return workerStartFailedMessage(err);
  }
  if (code === "gateway_elastic_no_matching_worker"
    || code === "gateway_user_worker_unavailable"
    || code === "gateway_provider_worker_unavailable") {
    return "当前工作区没有匹配的 AI 执行通道配置。请检查该用户的 Gateway Profile。";
  }
  if (code === "gateway_user_worker_unhealthy" || code === "gateway_provider_worker_unhealthy") {
    return "当前工作区的 AI 执行通道健康检查未通过。请稍后重试，或检查该用户的 Gateway Profile。";
  }
  if (code === "gateway_user_pool_unavailable" || code === "gateway_provider_pool_unavailable") {
    return "当前没有可用的 AI 执行通道池。请检查 Gateway Pool 配置。";
  }
  if (/invalid\s+(api\s+)?key/i.test(message)) {
    return "当前 AI 通道的 API Key 无效或已过期。请检查对应 Gateway Profile 的密钥配置。";
  }
  if (/Gateway worker queue timed out/i.test(message)) {
    return queueTimeoutMessage(details.reason || queueReasonFromMessage(message));
  }
  if (/Gateway worker failed to start/i.test(message)) {
    return workerStartFailedMessage(err);
  }
  const redacted = redactGatewayRunErrorText(message);
  return redacted || DEFAULT_RUN_FAILURE_MESSAGE;
}

module.exports = {
  DEFAULT_RUN_FAILURE_MESSAGE,
  gatewayRunCapacityReasonLabel,
  gatewayRunFailureCodeLabel,
  gatewayRunUserFacingError,
  redactGatewayRunErrorText,
};
