"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeAccessPolicyFacadeService } = require("../adapters/mobile-runtime-access-policy-facade-service");

function testComposesSanitizeThenHarden() {
  const calls = [];
  const service = createMobileRuntimeAccessPolicyFacadeService({
    accessPolicyProvider: {
      sanitize(policy) {
        calls.push(["sanitize", policy]);
        return { sanitized: true, source: policy.source };
      },
    },
    securityBoundaryProvider: {
      hardenAccessPolicy(policy, options) {
        calls.push(["harden", policy, options]);
        return { hardened: true, policy, options };
      },
    },
  });

  assert.deepEqual(service.sanitizePolicy({ source: "owner" }, { allowUnrestricted: true }), {
    hardened: true,
    policy: { sanitized: true, source: "owner" },
    options: { allowUnrestricted: true },
  });
  assert.deepEqual(calls, [
    ["sanitize", { source: "owner" }],
    ["harden", { sanitized: true, source: "owner" }, { allowUnrestricted: true }],
  ]);
}

function testDefaultHardeningOptions() {
  const service = createMobileRuntimeAccessPolicyFacadeService({
    accessPolicyProvider: { sanitize: (policy) => policy },
    securityBoundaryProvider: { hardenAccessPolicy: (_policy, options) => options },
  });

  assert.deepEqual(service.sanitizePolicy({}), {});
}

function testDependencyGuards() {
  assert.throws(
    () => createMobileRuntimeAccessPolicyFacadeService({}),
    /requires accessPolicyProvider/,
  );
  assert.throws(
    () => createMobileRuntimeAccessPolicyFacadeService({ accessPolicyProvider: {}, securityBoundaryProvider: {} }),
    /requires accessPolicyProvider\.sanitize/,
  );
  assert.throws(
    () => createMobileRuntimeAccessPolicyFacadeService({
      accessPolicyProvider: { sanitize: () => ({}) },
      securityBoundaryProvider: {},
    }),
    /requires securityBoundaryProvider\.hardenAccessPolicy/,
  );
}

testComposesSanitizeThenHarden();
testDefaultHardeningOptions();
testDependencyGuards();
console.log("mobile runtime access policy facade service tests passed");
