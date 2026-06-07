"use strict";

function requireObject(value, name) {
  if (!value || typeof value !== "object") {
    throw new Error(`MobileRuntimeAccessPolicyFacadeService requires ${name}`);
  }
  return value;
}

function createMobileRuntimeAccessPolicyFacadeService(options = {}) {
  const accessPolicyProvider = requireObject(options.accessPolicyProvider, "accessPolicyProvider");
  const securityBoundaryProvider = requireObject(options.securityBoundaryProvider, "securityBoundaryProvider");
  if (typeof accessPolicyProvider.sanitize !== "function") {
    throw new Error("MobileRuntimeAccessPolicyFacadeService requires accessPolicyProvider.sanitize");
  }
  if (typeof securityBoundaryProvider.hardenAccessPolicy !== "function") {
    throw new Error("MobileRuntimeAccessPolicyFacadeService requires securityBoundaryProvider.hardenAccessPolicy");
  }

  function sanitizePolicy(policy, hardeningOptions = {}) {
    return securityBoundaryProvider.hardenAccessPolicy(accessPolicyProvider.sanitize(policy), hardeningOptions);
  }

  return Object.freeze({
    sanitizePolicy,
  });
}

module.exports = {
  createMobileRuntimeAccessPolicyFacadeService,
};
