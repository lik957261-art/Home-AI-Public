"use strict";

function requireFunction(options, name) {
  const value = options[name];
  if (typeof value !== "function") {
    throw new Error(`MobileRuntimeAuthFacadeService requires ${name}`);
  }
  return value;
}

function createMobileRuntimeAuthFacadeService(options = {}) {
  const authProvider = requireFunction(options, "authProvider");

  function providerMethod(methodName) {
    return (...args) => {
      const provider = authProvider();
      const method = provider && provider[methodName];
      if (typeof method !== "function") {
        throw new Error(`MobileRuntimeAuthFacadeService requires authProvider.${methodName}`);
      }
      return method(...args);
    };
  }

  return Object.freeze({
    authenticateRequest: providerMethod("authenticateRequest"),
    authCanAccessWorkspace: providerMethod("authCanAccessWorkspace"),
    isOwnerAuth: providerMethod("isOwnerAuth"),
  });
}

module.exports = {
  createMobileRuntimeAuthFacadeService,
};
