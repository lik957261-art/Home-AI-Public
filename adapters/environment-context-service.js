"use strict";

const MAX_TEXT = 160;

function cleanString(value, max = MAX_TEXT) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function boolValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedNumber(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function firstValue(source = {}, keys = []) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return "";
}

function normalizeIso(value = "") {
  const text = cleanString(value, 80);
  if (!text) return "";
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : text;
}

function normalizeLocation(raw = {}) {
  const location = objectValue(raw);
  const place = objectValue(location.place);
  const latitude = roundedNumber(location.latitude ?? location.lat, 2);
  const longitude = roundedNumber(location.longitude ?? location.lon ?? location.lng, 2);
  const out = {
    status: cleanString(location.status || (latitude !== null && longitude !== null ? "available" : ""), 40),
    city: cleanString(firstValue(place, ["city", "locality", "name"]), 80),
    district: cleanString(firstValue(place, ["district", "subLocality", "subAdministrativeArea"]), 80),
    country: cleanString(firstValue(place, ["country", "countryCode"]), 80),
    timeZone: cleanString(firstValue(place, ["timeZone", "timezone", "time_zone"]) || location.timeZone || location.timezone, 80),
    coordinatePrecision: cleanString(location.precision || location.coordinatePrecision || "approximate", 40),
    accuracyMeters: roundedNumber(location.accuracyMeters ?? location.horizontalAccuracy, 0),
    latitude,
    longitude,
    timestamp: normalizeIso(location.timestamp),
  };
  Object.keys(out).forEach((key) => {
    if (out[key] === "" || out[key] === null || out[key] === undefined) delete out[key];
  });
  return out;
}

function normalizeWeatherValue(raw = {}) {
  const source = objectValue(raw);
  const temperatureC = roundedNumber(firstValue(source, [
    "temperatureC",
    "temperature_c",
    "temperature",
    "temperature_2m",
  ]), 1);
  const apparentTemperatureC = roundedNumber(firstValue(source, [
    "apparentTemperatureC",
    "apparent_temperature_c",
    "apparentTemperature",
    "feelsLikeC",
    "feels_like_c",
  ]), 1);
  const humidity = roundedNumber(firstValue(source, ["humidity", "relativeHumidity", "relative_humidity_2m"]), 0);
  const precipitationChance = roundedNumber(firstValue(source, [
    "precipitationChance",
    "precipitation_chance",
    "precipitationProbability",
    "precipitation_probability",
  ]), 2);
  const out = {
    time: normalizeIso(firstValue(source, ["time", "date", "timestamp", "forecastStart"])),
    condition: cleanString(firstValue(source, ["condition", "conditionText", "symbolName", "weather", "summary", "shortForecast"]), 80),
    temperatureC,
    apparentTemperatureC,
    humidity,
    precipitationChance,
    precipitationAmountMm: roundedNumber(firstValue(source, ["precipitationAmountMm", "precipitation_amount_mm", "precipitationAmount"]), 1),
    windSpeed: cleanString(firstValue(source, ["windSpeed", "wind_speed", "windSpeedKph"]), 40),
    windDirection: cleanString(firstValue(source, ["windDirection", "wind_direction", "windCompassDirection"]), 40),
    uvIndex: roundedNumber(firstValue(source, ["uvIndex", "uv_index"]), 0),
  };
  Object.keys(out).forEach((key) => {
    if (out[key] === "" || out[key] === null || out[key] === undefined) delete out[key];
  });
  return out;
}

function normalizeWeather(raw = {}) {
  const weather = objectValue(raw);
  const selected = objectValue(weather.selected || weather.current || weather);
  const out = {
    status: cleanString(weather.status || (selected && Object.keys(selected).length ? "available" : ""), 40),
    provider: cleanString(weather.provider, 80),
    selectedBasis: cleanString(weather.selectedBasis || weather.selected_basis || "", 80),
    selected: normalizeWeatherValue(selected),
    reason: cleanString(weather.reason || weather.error, 120),
  };
  Object.keys(out).forEach((key) => {
    if (key === "selected" && !Object.keys(out.selected || {}).length) delete out.selected;
    else if (out[key] === "" || out[key] === null || out[key] === undefined) delete out[key];
  });
  return out;
}

function normalizeEnvironmentContext(input = {}) {
  const raw = objectValue(input);
  const location = normalizeLocation(raw.location);
  const weather = normalizeWeather(raw.weather);
  const source = cleanString(raw.source || "unknown", 80);
  const out = {
    available: boolValue(raw.ok) || location.status === "available" || weather.status === "available",
    source,
    purpose: cleanString(raw.purpose || raw.useCase || raw.use_case, 80),
    targetAt: normalizeIso(raw.targetAt || raw.target_at || raw.targetDate || raw.date),
    timestamp: normalizeIso(raw.timestamp || raw.createdAt || raw.created_at),
    cached: boolValue(raw.cached),
    cacheTtlSeconds: Math.max(0, Math.min(3600, Math.floor(Number(raw.cacheTtlSeconds || raw.cache_ttl_seconds || 0) || 0))),
    location,
    weather,
    error: cleanString(raw.error || raw.reason, 120),
  };
  if (!Object.keys(location).length) delete out.location;
  if (!Object.keys(weather).length) delete out.weather;
  Object.keys(out).forEach((key) => {
    if (out[key] === "" || out[key] === null || out[key] === undefined) delete out[key];
    if (key === "cacheTtlSeconds" && out[key] === 0) delete out[key];
    if (key === "cached" && out[key] === false) delete out[key];
  });
  return out.available || out.error ? out : null;
}

function environmentContextHasWeather(context = {}) {
  const normalized = normalizeEnvironmentContext(context);
  if (!normalized) return false;
  return normalized.weather?.status === "available" && Boolean(Object.keys(normalized.weather.selected || {}).length);
}

function formatEnvironmentContextInstructions(context = {}) {
  const normalized = normalizeEnvironmentContext(context);
  if (!normalized) return "";
  const lines = [
    "Home AI environment context: privacy-bounded client environment context is available for this run.",
    `- Source: ${normalized.source || "unknown"}${normalized.cached ? " (cached)" : ""}.`,
  ];
  if (normalized.purpose) lines.push(`- Purpose: ${normalized.purpose}.`);
  if (normalized.targetAt) lines.push(`- Target time: ${normalized.targetAt}.`);
  const loc = normalized.location || {};
  const place = [loc.city, loc.district, loc.country].filter(Boolean).join(", ");
  if (place) lines.push(`- Current device place: ${place}.`);
  if (loc.timeZone) lines.push(`- Time zone: ${loc.timeZone}.`);
  if (loc.latitude !== undefined && loc.longitude !== undefined) {
    lines.push(`- Approximate coordinate: ${loc.latitude}, ${loc.longitude} (${loc.coordinatePrecision || "approximate"}).`);
  }
  const weather = normalized.weather || {};
  if (weather.status === "available") {
    const selected = weather.selected || {};
    const details = [];
    if (selected.condition) details.push(`condition=${selected.condition}`);
    if (selected.temperatureC !== undefined) details.push(`temperatureC=${selected.temperatureC}`);
    if (selected.apparentTemperatureC !== undefined) details.push(`apparentTemperatureC=${selected.apparentTemperatureC}`);
    if (selected.humidity !== undefined) details.push(`humidity=${selected.humidity}`);
    if (selected.precipitationChance !== undefined) details.push(`precipitationChance=${selected.precipitationChance}`);
    if (selected.windSpeed) details.push(`wind=${[selected.windSpeed, selected.windDirection].filter(Boolean).join(" ")}`);
    lines.push(`- Weather: ${details.join("; ") || "available"}${weather.selectedBasis ? `; basis=${weather.selectedBasis}` : ""}.`);
  } else if (weather.reason || normalized.error) {
    lines.push(`- Weather unavailable: ${weather.reason || normalized.error}.`);
  }
  lines.push("Use this context only for the user's current-device location. If the user asks about another city, destination, or a time not covered by this context, use the normal weather/location tools or ask a bounded follow-up instead of treating device GPS as the requested place.");
  lines.push("Do not expose raw native payloads, access keys, or full forecast arrays in the final answer.");
  return lines.join("\n");
}

module.exports = {
  environmentContextHasWeather,
  formatEnvironmentContextInstructions,
  normalizeEnvironmentContext,
};
