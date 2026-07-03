"use strict";

const assert = require("node:assert/strict");
const { createNativeSecureSecretBrokerService } = require("../adapters/native-secure-secret-broker-service");

function ownerAuth(workspaceId = "owner") {
  return {
    ok: true,
    role: workspaceId === "owner" ? "owner" : "workspace",
    workspaceId,
    principalId: workspaceId,
    isOwner: workspaceId === "owner",
  };
}

function assertThrowsCode(fn, code, status) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code);
    if (status) assert.equal(err.status, status);
    return true;
  });
}

function createTestService(nowState = { value: 1_000_000 }) {
  let counter = 0;
  return createNativeSecureSecretBrokerService({
    nowMs: () => nowState.value,
    randomBytes(size) {
      counter += 1;
      return Buffer.alloc(size, counter);
    },
  });
}

function testCreateReturnsOnlyMetadata() {
  const service = createTestService();
  const secret = "not-a-real-password";
  const result = service.createSecret({
    auth: ownerAuth(),
    input: {
      source: "ios_clipboard",
      targetPlugin: "codex",
      purpose: "current_task",
      ttlSeconds: 600,
      value: secret,
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.secretRef, /^sec_/);
  assert.equal(result.source, "ios_clipboard");
  assert.equal(result.targetPlugin, "codex");
  assert.equal(result.purpose, "current_task");
  assert.equal(result.workspaceId, "owner");
  assert.equal(result.valueBytes, Buffer.byteLength(secret));
  assert.equal(result.remainingUses, 1);
  assert.equal(Object.hasOwn(result, "value"), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
}

function testOneTimeResolveClearsSecretValue() {
  const service = createTestService();
  const secret = "fake-secret-for-test";
  const created = service.createSecret({
    auth: ownerAuth(),
    input: {
      source: "ios_clipboard",
      targetPlugin: "codex",
      purpose: "current_task",
      value: secret,
    },
  });

  const resolved = service.resolveSecret({
    auth: ownerAuth(),
    secretRef: created.secretRef,
    targetPlugin: "codex",
    purpose: "current_task",
  });

  assert.equal(resolved.value, secret);
  assert.equal(resolved.remainingUses, 0);
  assertThrowsCode(
    () => service.resolveSecret({ auth: ownerAuth(), secretRef: created.secretRef, targetPlugin: "codex" }),
    "secure_secret_used_up",
    410,
  );
  const snapshot = service._unsafeSnapshotForTest();
  assert.equal(snapshot[0].value, "");
}

function testWorkspaceAndTargetScope() {
  const service = createTestService();
  const created = service.createSecret({
    auth: ownerAuth("mk"),
    input: {
      source: "ios_clipboard",
      targetPlugin: "codex",
      purpose: "current_task",
      value: "fake-secret-for-scope-test",
    },
  });

  assertThrowsCode(
    () => service.resolveSecret({ auth: ownerAuth("owner"), secretRef: created.secretRef, targetPlugin: "codex" }),
    "secure_secret_workspace_denied",
    403,
  );
  assertThrowsCode(
    () => service.resolveSecret({ auth: ownerAuth("mk"), secretRef: created.secretRef, targetPlugin: "finance" }),
    "secure_secret_target_mismatch",
    403,
  );
}

function testExpiryAndReadonlyAuth() {
  const nowState = { value: 10_000 };
  const service = createTestService(nowState);
  const created = service.createSecret({
    auth: ownerAuth(),
    input: {
      source: "ios_clipboard",
      targetPlugin: "codex",
      purpose: "current_task",
      ttlSeconds: 30,
      value: "fake-expiring-secret",
    },
  });

  nowState.value += 31_000;
  assertThrowsCode(
    () => service.resolveSecret({ auth: ownerAuth(), secretRef: created.secretRef, targetPlugin: "codex" }),
    "secure_secret_expired",
    410,
  );

  assertThrowsCode(
    () => service.createSecret({
      auth: Object.assign(ownerAuth(), { auditReadOnly: true, keySource: "audit_owner_readonly" }),
      input: {
        source: "ios_clipboard",
        targetPlugin: "codex",
        purpose: "current_task",
        value: "fake-readonly-secret",
      },
    }),
    "secure_secret_readonly_key_denied",
    403,
  );
}

function testValidation() {
  const service = createTestService();
  assertThrowsCode(
    () => service.createSecret({
      auth: ownerAuth(),
      input: {
        source: "browser_clipboard",
        targetPlugin: "codex",
        purpose: "current_task",
        value: "fake",
      },
    }),
    "secure_secret_source_not_allowed",
    400,
  );
  assertThrowsCode(
    () => service.createSecret({
      auth: ownerAuth(),
      input: {
        source: "ios_clipboard",
        targetPlugin: "email",
        purpose: "current_task",
        value: "fake",
      },
    }),
    "secure_secret_target_not_allowed",
    400,
  );
}

function run() {
  testCreateReturnsOnlyMetadata();
  testOneTimeResolveClearsSecretValue();
  testWorkspaceAndTargetScope();
  testExpiryAndReadonlyAuth();
  testValidation();
  console.log("native secure secret broker service tests passed");
}

run();
