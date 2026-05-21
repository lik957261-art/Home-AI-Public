"use strict";

const assert = require("node:assert/strict");
const { createOwnerElevationGrantService } = require("../adapters/owner-elevation-grant-service");

const OWNER = { isOwner: true, workspaceId: "owner", principalId: "owner-principal" };
const OTHER_OWNER = { isOwner: true, workspaceId: "owner", principalId: "other-owner" };
const USER = { workspaceId: "child", principalId: "child-principal" };

function makeRandomBytes() {
  let counter = 0;
  return (size) => {
    counter += 1;
    return Buffer.alloc(size, counter);
  };
}

function makeService(overrides = {}) {
  let now = overrides.now ?? Date.UTC(2026, 4, 15, 1, 0, 0);
  const audits = [];
  let enabled = Object.hasOwn(overrides, "enabled") ? Boolean(overrides.enabled) : true;
  const service = createOwnerElevationGrantService({
    isOwnerAuth: (auth) => Boolean(auth?.isOwner),
    maintenanceRunsEnabled: () => enabled,
    durationOptionsMinutes: [5, 15, 30],
    defaultDurationMinutes: 15,
    onceTtlMs: overrides.onceTtlMs ?? 120_000,
    nowMs: () => now,
    randomBytes: makeRandomBytes(),
    audit: (eventType, payload) => audits.push({ eventType, payload }),
  });
  return {
    audits,
    service,
    advance(ms) {
      now += ms;
    },
    setEnabled(value) {
      enabled = Boolean(value);
    },
  };
}

function assertStatusDoesNotExposeToken(status) {
  assert.equal(JSON.stringify(status).includes("token"), false);
}

function assertAuditDoesNotExposeToken(audits) {
  assert.equal(JSON.stringify(audits).includes("token"), false);
}

function testOwnerOnlyAndDisabledFailures() {
  const { service } = makeService();
  assert.throws(() => service.grantOnce(USER), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.message, "Owner access is required");
    return true;
  });
  assert.throws(() => service.grantTimed(USER, 15), (err) => err.status === 403);
  assert.throws(() => service.revoke(USER), (err) => err.status === 403);

  const disabled = makeService({ enabled: false });
  assert.throws(() => disabled.service.grantOnce(OWNER), (err) => {
    assert.equal(err.status, 409);
    assert.equal(err.message, "Owner maintenance runs are disabled by server configuration");
    return true;
  });
  assert.throws(() => disabled.service.grantTimed(OWNER, 15), (err) => err.status === 409);
  assert.equal(disabled.service.consumeOnce(OWNER, "token"), false);
  assert.deepEqual(disabled.service.publicStatus(OWNER), {
    available: false,
    active: false,
    currentPermission: "standard",
    grantId: "",
    allowedWorkerSecurityLevel: "",
    allowedOperations: [],
    maxInvocations: 0,
    label: "\u666e\u901a\u6743\u9650",
    expiresAt: "",
    grantedAt: "",
    remainingMs: 0,
    durationOptionsMinutes: [5, 15, 30],
    defaultDurationMinutes: 15,
    reason: "Owner maintenance runs are disabled by server configuration",
  });
}

function testTimedGrantStatusExpiryAndRevoke() {
  const { audits, service, advance } = makeService();
  assert.equal(service.isActive(OWNER), false);
  assert.throws(() => service.grantTimed(OWNER, 99), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.message, "Unsupported owner elevation duration");
    return true;
  });

  const grant = service.grantTimed(OWNER);
  assert.match(grant.grantId, /^owner-time-/);
  assert.equal(grant.durationMinutes, 15);
  assert.equal(grant.allowedWorkerSecurityLevel, "owner-maintenance");
  assert.deepEqual(grant.allowedOperations, ["maintenance_run"]);
  assert.equal(service.isActive(OWNER), true);
  assert.equal(service.isActive(USER), false);

  const active = service.publicStatus(OWNER);
  assert.equal(active.available, true);
  assert.equal(active.active, true);
  assert.equal(active.currentPermission, "owner-maintenance");
  assert.equal(active.remainingMs, 15 * 60 * 1000);
  assertStatusDoesNotExposeToken(active);

  advance(15 * 60 * 1000 + 1);
  assert.equal(service.currentGrant(), null);
  assert.equal(service.isActive(OWNER), false);

  const second = service.grantTimed(OWNER, 5);
  assert.equal(second.durationMinutes, 5);
  assert.equal(service.revoke(OWNER), true);
  assert.equal(service.publicStatus(OWNER).active, false);
  assert.deepEqual(audits.map((item) => item.eventType), [
    "owner_elevation_granted",
    "owner_elevation_granted",
    "owner_elevation_revoked",
  ]);
  assertAuditDoesNotExposeToken(audits);
}

function testOneShotGrantConsumeAndPrune() {
  const { audits, service, advance } = makeService({ onceTtlMs: 10 });
  const grant = service.grantOnce(OWNER);
  assert.match(grant.grantId, /^owner-once-/);
  assert.ok(grant.token);
  assert.equal(service.onceGrantCount(), 1);
  assert.equal(service.consumeOnce(USER, grant.token), false);
  assert.equal(service.consumeOnce(OTHER_OWNER, grant.token), false);
  assert.equal(service.onceGrantCount(), 1);
  assert.equal(service.consumeOnce(OWNER, grant.token), true);
  assert.equal(service.consumeOnce(OWNER, grant.token), false);
  assert.equal(service.onceGrantCount(), 0);
  assert.deepEqual(audits.map((item) => item.eventType), [
    "owner_elevation_once_granted",
    "owner_elevation_once_consumed",
  ]);
  assertAuditDoesNotExposeToken(audits);

  const expiring = service.grantOnce(OWNER);
  advance(30_001);
  assert.equal(service.consumeOnce(OWNER, expiring.token), false);
  assert.equal(service.onceGrantCount(), 0);
}

function testStatusForNonOwnerDoesNotLeakGrant() {
  const { service } = makeService();
  service.grantTimed(OWNER, 5);
  const status = service.publicStatus(USER);
  assert.equal(status.available, false);
  assert.equal(status.active, false);
  assert.equal(status.currentPermission, "standard");
  assert.equal(status.grantId, "");
  assert.equal(status.reason, "Owner access is required");
  assertStatusDoesNotExposeToken(status);
}

testOwnerOnlyAndDisabledFailures();
testTimedGrantStatusExpiryAndRevoke();
testOneShotGrantConsumeAndPrune();
testStatusForNonOwnerDoesNotLeakGrant();

console.log("owner elevation grant service tests passed");
