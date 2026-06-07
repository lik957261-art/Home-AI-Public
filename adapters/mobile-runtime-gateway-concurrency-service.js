"use strict";

function requiredObject(options, name) {
  const value = options[name];
  if (value && typeof value === "object") return value;
  throw new Error(`MobileRuntimeGatewayConcurrencyService requires ${name}`);
}

function optionFunction(options, name, fallback) {
  const value = options[name];
  if (typeof value === "function") return value;
  if (value !== undefined) return () => value;
  return fallback;
}

function createMobileRuntimeGatewayConcurrencyService(options = {}) {
  const runConcurrencyPolicy = requiredObject(options, "runConcurrencyPolicy");
  const state = optionFunction(options, "state", () => ({ threads: [] }));

  function threads() {
    return state()?.threads || [];
  }

  function runConcurrencySnapshot() {
    return runConcurrencyPolicy.snapshot(threads());
  }

  function runConcurrencyError(workspaceId) {
    return runConcurrencyPolicy.limitError(threads(), workspaceId);
  }

  function assertRunConcurrencyCapacity(workspaceId) {
    const error = runConcurrencyError(workspaceId);
    if (!error) return;
    const err = new Error(error.message);
    err.status = error.status || 429;
    err.code = error.code;
    err.details = error;
    throw err;
  }

  return Object.freeze({
    assertRunConcurrencyCapacity,
    runConcurrencyError,
    runConcurrencySnapshot,
  });
}

module.exports = {
  createMobileRuntimeGatewayConcurrencyService,
};
