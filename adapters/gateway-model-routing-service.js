"use strict";

const GROK_PROVIDER = "xai-oauth";
const SUPPORTED_GROK_MODELS = new Set(["grok-4.3"]);

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeProvider(value) {
  return cleanString(value).toLowerCase();
}

function modelLooksLikeGrok(model) {
  return /^grok(?:[-_.]|\d|$)/i.test(cleanString(model));
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
  const model = cleanString(input.model || input.model_name || input.response_model);
  let provider = normalizeProvider(input.provider || input.modelProvider || input.model_provider);
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
  GROK_PROVIDER,
  SUPPORTED_GROK_MODELS,
  modelLooksLikeGrok,
  resolveGatewayModelRoute,
};
