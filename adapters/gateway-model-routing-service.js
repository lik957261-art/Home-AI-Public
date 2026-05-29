"use strict";

const GROK_PROVIDER = "xai-oauth";
const DEEPSEEK_PROVIDER = "deepseek";
const DEFAULT_GROK_MODEL = "grok-4.3";
const DEEPSEEK_WORKER_PROFILES = ["deepseekgw1", "deepseekgw2", "deepseekgw99", "deepseekgw5"];
const DEEPSEEK_OWNER_MAINTENANCE_WORKER_PROFILES = ["deepseekmaint1"];
const SUPPORTED_GROK_MODELS = new Set(["grok-4.3"]);
const SUPPORTED_DEEPSEEK_MODELS = new Set(["deepseek-chat", "deepseek-reasoner", "deepseek-v4-pro", "deepseek-v4-flash"]);

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeProvider(value) {
  return cleanString(value).toLowerCase();
}

function modelLooksLikeGrok(model) {
  return /^grok(?:[-_.]|\d|$)/i.test(cleanString(model));
}

function modelLooksLikeDeepSeek(model) {
  return /^deepseek(?:[-_/]|$)/i.test(cleanString(model));
}

function textRequestsGrokModel(text) {
  const raw = cleanString(text);
  if (!raw) return false;
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  if (/不要(?:使用|用)?grok|别(?:使用|用)?grok|不用grok|notusegrok|donotusegrok|don'tusegrok/.test(compact)) {
    return false;
  }
  return (
    /(?:使用|用|让|請|请|叫|給|给)grok/.test(compact)
    || /grok(?:来|來)?(?:回答|回复|回覆|处理|處理|分析|搜索|搜尋)/.test(compact)
    || /\buse\s+grok\b/i.test(raw)
    || /\bask\s+grok\b/i.test(raw)
    || /\bwith\s+grok\b/i.test(raw)
  );
}

function inputRequestsOwnerMaintenance(input = {}) {
  const routing = input.gatewayRouting || input.gateway_routing || {};
  const securityLevel = cleanString(input.securityLevel || input.security_level || routing.securityLevel || routing.security_level).toLowerCase();
  return Boolean(
    input.maintenance
    || input.allowMaintenance
    || input.allow_maintenance
    || input.maintenanceMode
    || input.maintenance_mode
    || routing.maintenance
    || routing.allowMaintenance
    || routing.allow_maintenance
    || securityLevel === "owner-maintenance"
    || securityLevel === "maintenance"
    || securityLevel === "owner"
  );
}

function errorRoute(status, code, error) {
  return {
    ok: false,
    status,
    code,
    error,
  };
}

function resolveGatewayModelRoute(input = {}) {
  const grokRequestedByText = textRequestsGrokModel(input.text || input.message || input.content || "");
  const model = grokRequestedByText
    ? DEFAULT_GROK_MODEL
    : cleanString(input.model || input.model_name || input.response_model);
  let provider = normalizeProvider(input.provider || input.modelProvider || input.model_provider);
  if (grokRequestedByText) provider = GROK_PROVIDER;
  if (!provider && modelLooksLikeGrok(model)) provider = GROK_PROVIDER;
  if (!model && !provider) return { ok: true, route: {} };

  if (provider === GROK_PROVIDER) {
    if (!model) {
      return errorRoute(400, "model_required_for_grok_provider", "Grok provider requires an explicit Grok model.");
    }
    if (!SUPPORTED_GROK_MODELS.has(model)) {
      return errorRoute(
        400,
        "unsupported_grok_model",
        `Grok model ${model} is not configured for Hermes Mobile. Refresh the app and choose @Grok.`,
      );
    }
    return {
      ok: true,
      route: {
        model,
        provider: GROK_PROVIDER,
        gatewayRouting: {
          provider: GROK_PROVIDER,
          preferred_worker_profiles: ["grokgw1"],
        },
      },
    };
  }

  if (modelLooksLikeGrok(model)) {
    return errorRoute(400, "grok_provider_required", "Grok requests must route through the xai-oauth provider.");
  }

  if (provider === DEEPSEEK_PROVIDER || modelLooksLikeDeepSeek(model)) {
    const deepseekModel = model || "deepseek-chat";
    if (!SUPPORTED_DEEPSEEK_MODELS.has(deepseekModel) && !/^deepseek-v\d+([-.].+)?$/i.test(deepseekModel)) {
      return errorRoute(
        400,
        "unsupported_deepseek_model",
        `DeepSeek model ${deepseekModel} is not configured for Hermes Mobile. Refresh the app and choose @DeepSeek.`,
      );
    }
    return {
      ok: true,
      route: {
        model: deepseekModel,
        provider: DEEPSEEK_PROVIDER,
        gatewayRouting: {
          provider: DEEPSEEK_PROVIDER,
          preferred_worker_profiles: inputRequestsOwnerMaintenance(input)
            ? DEEPSEEK_OWNER_MAINTENANCE_WORKER_PROFILES
            : DEEPSEEK_WORKER_PROFILES,
        },
      },
    };
  }

  return {
    ok: true,
    route: {
      model,
      provider,
      gatewayRouting: provider ? { provider } : {},
    },
  };
}

module.exports = {
  DEEPSEEK_OWNER_MAINTENANCE_WORKER_PROFILES,
  DEEPSEEK_PROVIDER,
  DEEPSEEK_WORKER_PROFILES,
  DEFAULT_GROK_MODEL,
  GROK_PROVIDER,
  SUPPORTED_DEEPSEEK_MODELS,
  SUPPORTED_GROK_MODELS,
  modelLooksLikeDeepSeek,
  modelLooksLikeGrok,
  inputRequestsOwnerMaintenance,
  resolveGatewayModelRoute,
  textRequestsGrokModel,
};
