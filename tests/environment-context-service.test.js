"use strict";

const assert = require("node:assert/strict");
const {
  environmentContextHasWeather,
  formatEnvironmentContextInstructions,
  normalizeEnvironmentContext,
} = require("../adapters/environment-context-service");

function testNormalizeNativePayloadKeepsOnlyCompactFields() {
  const context = normalizeEnvironmentContext({
    ok: true,
    source: "homeai_native_ios",
    cached: true,
    cacheTtlSeconds: 900,
    targetAt: "2026-06-18T09:00:00+08:00",
    purpose: "wardrobe_outfit",
    location: {
      status: "available",
      latitude: 31.23456,
      longitude: 121.47891,
      accuracyMeters: 83.2,
      precision: "approximate",
      place: {
        city: "上海市",
        district: "浦东新区",
        country: "中国",
        timeZone: "Asia/Shanghai",
      },
    },
    weather: {
      status: "available",
      provider: "apple_weatherkit",
      selectedBasis: "hourly_forecast",
      selected: {
        time: "2026-06-18T09:00:00+08:00",
        condition: "Rain",
        temperature: 26.34,
        apparentTemperature: 28.21,
        humidity: 82.4,
        precipitationChance: 0.61,
      },
      hourlyForecast: [{ private: "not persisted" }],
    },
  });

  assert.equal(context.source, "homeai_native_ios");
  assert.equal(context.purpose, "wardrobe_outfit");
  assert.equal(context.location.latitude, 31.23);
  assert.equal(context.location.longitude, 121.48);
  assert.equal(context.location.city, "上海市");
  assert.equal(context.weather.selected.temperatureC, 26.3);
  assert.equal(context.weather.selected.apparentTemperatureC, 28.2);
  assert.equal(context.weather.selected.humidity, 82);
  assert.equal(context.weather.hourlyForecast, undefined);
  assert.equal(environmentContextHasWeather(context), true);
}

function testInstructionWarnsAboutDestinationMismatch() {
  const text = formatEnvironmentContextInstructions({
    ok: true,
    source: "homeai_native_ios",
    targetAt: "2026-06-18T01:00:00.000Z",
    location: { status: "available", place: { city: "上海市", timeZone: "Asia/Shanghai" } },
    weather: {
      status: "available",
      provider: "apple_weatherkit",
      selected: { condition: "Cloudy", temperatureC: 24 },
    },
  });

  assert.match(text, /Home AI environment context/);
  assert.match(text, /Source: homeai_native_ios/);
  assert.match(text, /Current device place: 上海市/);
  assert.match(text, /temperatureC=24/);
  assert.match(text, /another city, destination/);
  assert.match(text, /full forecast arrays/);
}

testNormalizeNativePayloadKeepsOnlyCompactFields();
testInstructionWarnsAboutDestinationMismatch();

console.log("environment context service tests passed");
