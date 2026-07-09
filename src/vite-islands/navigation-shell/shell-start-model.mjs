export const SHELL_START_MODEL_VERSION = "20260706-shell-start-model-v1";

export function classicStartInvocationPlan({ startAvailable = false } = {}) {
  return Object.freeze({
    version: SHELL_START_MODEL_VERSION,
    action: startAvailable ? "start" : "missing_start",
    shouldStart: Boolean(startAvailable),
  });
}

export function publicConfigBootstrapPlan({
  setupRequired = false,
  authRequired = false,
  hasKey = false,
  hasCookieSession = false,
} = {}) {
  if (setupRequired) {
    return Object.freeze({
      version: SHELL_START_MODEL_VERSION,
      action: "show_setup",
      shouldBootstrap: false,
    });
  }
  if (authRequired && !hasKey && !hasCookieSession) {
    return Object.freeze({
      version: SHELL_START_MODEL_VERSION,
      action: "show_login",
      shouldBootstrap: false,
    });
  }
  return Object.freeze({
    version: SHELL_START_MODEL_VERSION,
    action: "bootstrap_workspace",
    shouldBootstrap: true,
  });
}

export function startupRecoveryPlan({ errorMessage = "" } = {}) {
  const message = String(errorMessage || "");
  return Object.freeze({
    version: SHELL_START_MODEL_VERSION,
    showLogin: /unauthorized/i.test(message),
    showRecovery: !/unauthorized/i.test(message),
    errorPreview: message.slice(0, 180),
  });
}
