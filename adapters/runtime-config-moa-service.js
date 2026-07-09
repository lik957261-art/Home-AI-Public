"use strict";

const SAFE_PRESET_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const VALID_TEMPERATURE_MIN = 0;
const VALID_TEMPERATURE_MAX = 2;
const VALID_TOKEN_MAX = 200000;
const VALID_FANOUT_MAX = 16;

function cleanString(value) {
  return String(value ?? "").trim();
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  const text = cleanString(value).toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(text);
}

function optionalNumber(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === undefined || value === null || cleanString(value) === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    const err = new Error(`MoA ${name} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
    err.status = 400;
    throw err;
  }
  return integer ? Math.trunc(number) : number;
}

function modelSlot(value, fieldName) {
  const source = typeof value === "string" ? modelSlotFromText(value) : (value && typeof value === "object" ? value : {});
  const provider = cleanString(source.provider);
  const model = cleanString(source.model);
  if (!provider || !model) {
    const err = new Error(`MoA ${fieldName} requires provider and model`);
    err.status = 400;
    throw err;
  }
  if (provider.toLowerCase() === "moa") {
    const err = new Error("MoA presets cannot reference provider moa");
    err.status = 400;
    throw err;
  }
  return { provider, model };
}

function modelSlotFromText(value) {
  const text = cleanString(value);
  const index = text.indexOf(":");
  if (index <= 0 || index === text.length - 1) return {};
  return { provider: text.slice(0, index), model: text.slice(index + 1) };
}

function normalizePreset(value, fallbackName = "default") {
  const source = value && typeof value === "object" ? value : {};
  const name = cleanString(source.name || source.id || fallbackName || "default");
  if (!SAFE_PRESET_NAME.test(name)) {
    const err = new Error("MoA preset name must use letters, numbers, dots, dashes, or underscores");
    err.status = 400;
    throw err;
  }
  const referenceSource = source.referenceModels || source.reference_models || [];
  const referenceModels = (Array.isArray(referenceSource) ? referenceSource : String(referenceSource).split(/\r?\n|,/))
    .map((item) => (cleanString(item) ? modelSlot(item, "reference model") : null))
    .filter(Boolean);
  const aggregator = modelSlot(source.aggregator || {}, "aggregator");
  if (!referenceModels.length && boolValue(source.enabled ?? true)) {
    const err = new Error("Enabled MoA presets require at least one reference model");
    err.status = 400;
    throw err;
  }
  const out = {
    name,
    enabled: source.enabled === undefined ? true : boolValue(source.enabled),
    referenceModels,
    aggregator,
  };
  const referenceTemperature = optionalNumber(source.referenceTemperature ?? source.reference_temperature, "reference temperature", { min: VALID_TEMPERATURE_MIN, max: VALID_TEMPERATURE_MAX });
  const aggregatorTemperature = optionalNumber(source.aggregatorTemperature ?? source.aggregator_temperature, "aggregator temperature", { min: VALID_TEMPERATURE_MIN, max: VALID_TEMPERATURE_MAX });
  const referenceMaxTokens = optionalNumber(source.referenceMaxTokens ?? source.reference_max_tokens, "reference max tokens", { min: 0, max: VALID_TOKEN_MAX, integer: true });
  const maxTokens = optionalNumber(source.maxTokens ?? source.max_tokens, "max tokens", { min: 1, max: VALID_TOKEN_MAX, integer: true });
  const fanout = optionalNumber(source.fanout, "fanout", { min: 1, max: VALID_FANOUT_MAX, integer: true });
  if (referenceTemperature !== undefined) out.referenceTemperature = referenceTemperature;
  if (aggregatorTemperature !== undefined) out.aggregatorTemperature = aggregatorTemperature;
  if (referenceMaxTokens !== undefined) out.referenceMaxTokens = referenceMaxTokens;
  if (maxTokens !== undefined) out.maxTokens = maxTokens;
  if (fanout !== undefined) out.fanout = fanout;
  return out;
}

function normalizeMoaConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const presetsSource = source.presets && typeof source.presets === "object" ? source.presets : {};
  const presets = Array.isArray(presetsSource)
    ? presetsSource.map((item, index) => normalizePreset(item, item?.name || `preset${index + 1}`))
    : Object.entries(presetsSource).map(([name, item]) => normalizePreset(Object.assign({ name }, item), name));
  const enabled = source.enabled === undefined ? presets.some((item) => item.enabled) : boolValue(source.enabled);
  const defaultPreset = cleanString(source.defaultPreset || source.default_preset || presets[0]?.name || "default");
  const activePreset = cleanString(source.activePreset || source.active_preset || "");
  if ((defaultPreset && !SAFE_PRESET_NAME.test(defaultPreset)) || (activePreset && !SAFE_PRESET_NAME.test(activePreset))) {
    const err = new Error("MoA default or active preset name is invalid");
    err.status = 400;
    throw err;
  }
  const names = new Set(presets.map((item) => item.name));
  if (enabled && !presets.length) {
    const err = new Error("Enabled MoA config requires at least one preset");
    err.status = 400;
    throw err;
  }
  if (enabled && defaultPreset && !names.has(defaultPreset)) {
    const err = new Error("MoA default preset must match a configured preset");
    err.status = 400;
    throw err;
  }
  if (enabled && activePreset && !names.has(activePreset)) {
    const err = new Error("MoA active preset must match a configured preset");
    err.status = 400;
    throw err;
  }
  return { enabled, defaultPreset, activePreset, presets };
}

function officialPresetObject(preset) {
  const out = {
    reference_models: preset.referenceModels.map((item) => ({ provider: item.provider, model: item.model })),
    aggregator: { provider: preset.aggregator.provider, model: preset.aggregator.model },
    enabled: Boolean(preset.enabled),
  };
  if (preset.referenceTemperature !== undefined) out.reference_temperature = preset.referenceTemperature;
  if (preset.aggregatorTemperature !== undefined) out.aggregator_temperature = preset.aggregatorTemperature;
  if (preset.referenceMaxTokens !== undefined) out.reference_max_tokens = preset.referenceMaxTokens;
  if (preset.maxTokens !== undefined) out.max_tokens = preset.maxTokens;
  if (preset.fanout !== undefined) out.fanout = preset.fanout;
  return out;
}

function officialMoaConfig(config = {}) {
  const normalized = normalizeMoaConfig(config);
  const presets = {};
  for (const preset of normalized.presets) presets[preset.name] = officialPresetObject(preset);
  const out = {
    enabled: normalized.enabled,
    default_preset: normalized.defaultPreset,
    presets,
  };
  if (normalized.activePreset) out.active_preset = normalized.activePreset;
  return out;
}

function mergeMoaConfig(previous = {}, input = {}) {
  const source = input && typeof input === "object" ? input : {};
  if (source.presets === undefined && previous.presets !== undefined) source.presets = previous.presets;
  if (source.defaultPreset === undefined && source.default_preset === undefined) source.defaultPreset = previous.defaultPreset || previous.default_preset;
  if (source.activePreset === undefined && source.active_preset === undefined) source.activePreset = previous.activePreset || previous.active_preset;
  if (source.enabled === undefined) source.enabled = previous.enabled;
  return normalizeMoaConfig(source);
}

module.exports = {
  mergeMoaConfig,
  normalizeMoaConfig,
  officialMoaConfig,
};
