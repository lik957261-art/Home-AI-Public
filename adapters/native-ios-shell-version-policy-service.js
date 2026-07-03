"use strict";

const DEFAULT_IOS_SHELL_MINIMUM_BUILD = 35;
const DEFAULT_IOS_SHELL_LATEST_BUILD = 35;
const DEFAULT_TESTFLIGHT_URL = "https://testflight.apple.com/join/MTdEfYEt";
const DEFAULT_UPDATE_MESSAGE = "当前 Home AI 原生壳版本过旧，请更新 TestFlight 版本后继续使用。";

const ENV_KEYS = Object.freeze({
  minimumBuild: "HOMEAI_NATIVE_IOS_MINIMUM_BUILD",
  latestBuild: "HOMEAI_NATIVE_IOS_LATEST_BUILD",
  testFlightUrl: "HOMEAI_NATIVE_IOS_TESTFLIGHT_URL",
  updateMessage: "HOMEAI_NATIVE_IOS_UPDATE_MESSAGE",
});

function clean(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parsePositiveInteger(value) {
  const text = clean(value, 40);
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0) return null;
  return number;
}

function buildFromConfig(value, fallback) {
  const parsed = parsePositiveInteger(value);
  return parsed == null ? fallback : parsed;
}

function safeTestFlightUrl(value) {
  const text = clean(value, 600);
  if (!text) return DEFAULT_TESTFLIGHT_URL;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return DEFAULT_TESTFLIGHT_URL;
    if (url.hostname !== "testflight.apple.com") return DEFAULT_TESTFLIGHT_URL;
    if (!/^\/join\/[A-Za-z0-9_-]+$/.test(url.pathname)) return DEFAULT_TESTFLIGHT_URL;
    if (url.search || url.hash || url.username || url.password) return DEFAULT_TESTFLIGHT_URL;
    return url.toString();
  } catch {
    return DEFAULT_TESTFLIGHT_URL;
  }
}

function normalizePolicy(options = {}) {
  const env = options.env || {};
  const configuredMinimum = options.minimumBuild ?? env[ENV_KEYS.minimumBuild];
  const configuredLatest = options.latestBuild ?? env[ENV_KEYS.latestBuild];
  const minimumBuild = buildFromConfig(configuredMinimum, DEFAULT_IOS_SHELL_MINIMUM_BUILD);
  const latestBuild = Math.max(minimumBuild, buildFromConfig(configuredLatest, DEFAULT_IOS_SHELL_LATEST_BUILD));
  const testFlightUrl = safeTestFlightUrl(options.testFlightUrl ?? env[ENV_KEYS.testFlightUrl]);
  const updateMessage = clean(
    options.updateMessage ?? env[ENV_KEYS.updateMessage] ?? DEFAULT_UPDATE_MESSAGE,
    300,
  ) || DEFAULT_UPDATE_MESSAGE;
  return {
    platform: "ios",
    minimumBuild,
    latestBuild,
    testFlightUrl,
    updateMessage,
  };
}

function errorResult(code, status, policy, extra = {}) {
  return Object.assign({
    ok: false,
    code,
    error: code,
    status,
    platform: policy.platform,
    minimumBuild: policy.minimumBuild,
    latestBuild: policy.latestBuild,
    updateRequired: true,
    testFlightUrl: policy.testFlightUrl,
    message: policy.updateMessage,
  }, extra);
}

function createNativeIosShellVersionPolicyService(options = {}) {
  const policy = normalizePolicy(Object.assign({}, options, { env: options.env || process.env }));

  function evaluate(input = {}) {
    const platform = clean(input.platform || "ios", 40).toLowerCase() || "ios";
    if (platform !== "ios") {
      return errorResult("ios_shell_platform_unsupported", 400, policy, { platform });
    }

    const currentBuild = parsePositiveInteger(input.buildNumber ?? input.build ?? input.currentBuild);
    if (currentBuild == null) {
      return errorResult("ios_shell_build_invalid", 400, policy);
    }

    const updateRequired = currentBuild < policy.minimumBuild;
    return {
      ok: true,
      platform: "ios",
      minimumBuild: policy.minimumBuild,
      latestBuild: policy.latestBuild,
      currentBuild,
      version: clean(input.version || input.marketingVersion || "", 80),
      updateRequired,
      testFlightUrl: policy.testFlightUrl,
      message: updateRequired ? policy.updateMessage : "",
    };
  }

  function policySummary() {
    return Object.assign({}, policy);
  }

  return {
    evaluate,
    policySummary,
  };
}

module.exports = {
  DEFAULT_IOS_SHELL_LATEST_BUILD,
  DEFAULT_IOS_SHELL_MINIMUM_BUILD,
  DEFAULT_TESTFLIGHT_URL,
  DEFAULT_UPDATE_MESSAGE,
  ENV_KEYS,
  createNativeIosShellVersionPolicyService,
  normalizePolicy,
  parsePositiveInteger,
  safeTestFlightUrl,
};
