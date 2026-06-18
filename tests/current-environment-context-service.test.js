"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCurrentEnvironmentContextService } = require("../adapters/current-environment-context-service");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-current-env-"));
const storagePath = path.join(tempRoot, "snapshots.json");
let now = Date.parse("2026-06-18T04:00:00.000Z");
const service = createCurrentEnvironmentContextService({ storagePath, nowMs: () => now });

const upserted = service.upsert({
  workspaceId: "owner",
  principalId: "owner",
  deviceId: "native-ios-current",
  environmentContext: {
    ok: true,
    source: "homeai_native_ios",
    cacheTtlSeconds: 900,
    location: {
      latitude: 31.2345,
      longitude: 121.4789,
      precision: "approximate",
      place: { city: "上海市", district: "浦东新区", timeZone: "Asia/Shanghai" },
    },
    weather: {
      status: "available",
      provider: "apple_weatherkit",
      current: { temperatureC: 99 },
      hourlyForecast: [{ temperatureC: 98 }],
      selected: { timestamp: "2026-06-18T04:00:00.000Z", temperatureC: 24.6, condition: "cloudy" },
      weatherKitFailure: { raw: "diagnostic" },
    },
  },
});

assert.equal(upserted.ok, true);
assert.equal(upserted.snapshot.expired, false);

const current = service.get({ workspaceId: "owner", principalId: "owner" });
assert.equal(current.ok, true);
assert.equal(current.environmentContext.location.city, "上海市");
assert.equal(current.environmentContext.location.district, "浦东新区");
assert.equal(current.environmentContext.weather.selected.temperatureC, 24.6);
assert.equal(current.environmentContext.weather.current, undefined);
assert.equal(current.environmentContext.weather.hourlyForecast, undefined);
assert.equal(current.environmentContext.weather.weatherKitFailure, undefined);

now += 901 * 1000;
const expired = service.get({ workspaceId: "owner", principalId: "owner" });
assert.equal(expired.ok, false);
assert.equal(expired.status, 410);
assert.equal(expired.reason, "snapshot_expired");

console.log("current environment context service tests passed");
