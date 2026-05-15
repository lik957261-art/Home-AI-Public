"use strict";

const crypto = require("node:crypto");

function defaultIsOwnerAuth(auth) {
  return Boolean(auth?.isOwner || auth?.role === "owner");
}

function boolOption(value) {
  if (typeof value === "function") return Boolean(value());
  return Boolean(value);
}

function makeError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function principalForAuth(auth) {
  return String(auth?.principalId || auth?.workspaceId || "owner");
}

function workspaceForAuth(auth) {
  return String(auth?.workspaceId || "owner");
}

function publicGrant(grant) {
  if (!grant || typeof grant !== "object") return null;
  const copy = Object.assign({}, grant);
  delete copy.token;
  return copy;
}

function createOwnerElevationGrantService(options = {}) {
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : defaultIsOwnerAuth;
  const maintenanceRunsEnabled = Object.hasOwn(options, "maintenanceRunsEnabled")
    ? options.maintenanceRunsEnabled
    : true;
  const durationOptionsMinutes = (Array.isArray(options.durationOptionsMinutes) && options.durationOptionsMinutes.length
    ? options.durationOptionsMinutes
    : [5, 15, 30, 60])
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const defaultDurationMinutes = durationOptionsMinutes.includes(Number(options.defaultDurationMinutes))
    ? Number(options.defaultDurationMinutes)
    : durationOptionsMinutes[0];
  const onceTtlMs = Math.max(30_000, Number(options.onceTtlMs || 120_000) || 120_000);
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const randomBytes = typeof options.randomBytes === "function"
    ? options.randomBytes
    : ((size) => crypto.randomBytes(size));
  const audit = typeof options.audit === "function" ? options.audit : (() => {});

  let ownerElevationGrant = null;
  const ownerElevationOnceGrants = new Map();

  function enabled() {
    return boolOption(maintenanceRunsEnabled);
  }

  function randomHex(bytes) {
    return randomBytes(bytes).toString("hex");
  }

  function randomToken(bytes) {
    return randomBytes(bytes).toString("base64url");
  }

  function assertOwner(auth) {
    if (!isOwnerAuth(auth)) throw makeError("Owner access is required", 403);
  }

  function assertMaintenanceEnabled() {
    if (!enabled()) throw makeError("Owner maintenance runs are disabled by server configuration", 409);
  }

  function currentGrant(now = nowMs()) {
    if (!enabled()) {
      ownerElevationGrant = null;
      return null;
    }
    if (!ownerElevationGrant || !ownerElevationGrant.expiresAtMs || ownerElevationGrant.expiresAtMs <= now) {
      ownerElevationGrant = null;
      return null;
    }
    return ownerElevationGrant;
  }

  function isActive(auth) {
    return Boolean(isOwnerAuth(auth) && currentGrant());
  }

  function pruneOnceGrants(now = nowMs()) {
    for (const [token, grant] of ownerElevationOnceGrants.entries()) {
      if (!grant?.expiresAtMs || grant.expiresAtMs <= now) ownerElevationOnceGrants.delete(token);
    }
  }

  function grantOnce(auth) {
    assertOwner(auth);
    assertMaintenanceEnabled();
    pruneOnceGrants();
    const token = randomToken(24);
    const grantedAtMs = nowMs();
    const grant = {
      grantId: `owner-once-${grantedAtMs}-${randomHex(3)}`,
      token,
      grantedAt: new Date(grantedAtMs).toISOString(),
      expiresAt: new Date(grantedAtMs + onceTtlMs).toISOString(),
      expiresAtMs: grantedAtMs + onceTtlMs,
      grantedBy: principalForAuth(auth),
      allowedWorkerSecurityLevel: "owner-maintenance",
      allowedOperations: ["single_run"],
      maxInvocations: 1,
    };
    ownerElevationOnceGrants.set(token, grant);
    audit("owner_elevation_once_granted", {
      actorWorkspaceId: workspaceForAuth(auth),
      actorPrincipalId: principalForAuth(auth),
      targetType: "owner_elevation",
      targetId: grant.grantId,
      action: "grant_once",
      decision: "allow",
      grant: publicGrant(grant),
    });
    return grant;
  }

  function consumeOnce(auth, token) {
    if (!isOwnerAuth(auth) || !enabled()) return false;
    const normalized = String(token || "").trim();
    if (!normalized) return false;
    pruneOnceGrants();
    const grant = ownerElevationOnceGrants.get(normalized);
    if (!grant) return false;
    const principal = principalForAuth(auth);
    if (grant.grantedBy && grant.grantedBy !== principal) return false;
    ownerElevationOnceGrants.delete(normalized);
    audit("owner_elevation_once_consumed", {
      actorWorkspaceId: workspaceForAuth(auth),
      actorPrincipalId: principal,
      targetType: "owner_elevation",
      targetId: grant.grantId || "owner-once",
      action: "consume_once",
      decision: "allow",
      grant: publicGrant(grant),
    });
    return true;
  }

  function publicStatus(auth) {
    const owner = isOwnerAuth(auth);
    const grant = owner ? currentGrant() : null;
    const remainingMs = grant ? Math.max(0, grant.expiresAtMs - nowMs()) : 0;
    return {
      available: Boolean(owner && enabled()),
      active: Boolean(grant),
      currentPermission: grant ? "owner-maintenance" : "standard",
      grantId: grant?.grantId || "",
      allowedWorkerSecurityLevel: grant?.allowedWorkerSecurityLevel || "",
      allowedOperations: Array.isArray(grant?.allowedOperations) ? grant.allowedOperations.slice() : [],
      maxInvocations: Number(grant?.maxInvocations || 0) || 0,
      label: grant ? "\u9ad8\u6743\u9650\u8fd0\u884c" : "\u666e\u901a\u6743\u9650",
      expiresAt: grant?.expiresAt || "",
      grantedAt: grant?.grantedAt || "",
      remainingMs,
      durationOptionsMinutes: durationOptionsMinutes.slice(),
      defaultDurationMinutes,
      reason: !owner
        ? "Owner access is required"
        : (enabled() ? "" : "Owner maintenance runs are disabled by server configuration"),
    };
  }

  function grantTimed(auth, durationMinutes) {
    assertOwner(auth);
    assertMaintenanceEnabled();
    const requested = Math.round(Number(durationMinutes || defaultDurationMinutes));
    if (!durationOptionsMinutes.includes(requested)) {
      throw makeError("Unsupported owner elevation duration", 400);
    }
    const grantedAtMs = nowMs();
    const expiresAtMs = grantedAtMs + requested * 60 * 1000;
    ownerElevationGrant = {
      grantId: `owner-time-${grantedAtMs}-${randomHex(3)}`,
      grantedAt: new Date(grantedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      durationMinutes: requested,
      grantedBy: principalForAuth(auth),
      allowedWorkerSecurityLevel: "owner-maintenance",
      allowedOperations: ["maintenance_run"],
      maxInvocations: 0,
    };
    audit("owner_elevation_granted", {
      actorWorkspaceId: workspaceForAuth(auth),
      actorPrincipalId: principalForAuth(auth),
      targetType: "owner_elevation",
      targetId: ownerElevationGrant.grantId,
      action: "grant_timed",
      decision: "allow",
      durationMinutes: requested,
      grant: publicGrant(ownerElevationGrant),
    });
    return ownerElevationGrant;
  }

  function revoke(auth) {
    assertOwner(auth);
    const previousGrant = ownerElevationGrant;
    ownerElevationGrant = null;
    audit("owner_elevation_revoked", {
      actorWorkspaceId: workspaceForAuth(auth),
      actorPrincipalId: principalForAuth(auth),
      targetType: "owner_elevation",
      targetId: previousGrant?.grantId || "owner-time",
      action: "revoke",
      decision: "allow",
    });
    return true;
  }

  function onceGrantCount() {
    pruneOnceGrants();
    return ownerElevationOnceGrants.size;
  }

  return Object.freeze({
    consumeOnce,
    currentGrant,
    grantOnce,
    grantTimed,
    isActive,
    onceGrantCount,
    pruneOnceGrants,
    publicStatus,
    revoke,
  });
}

module.exports = {
  createOwnerElevationGrantService,
  publicGrant,
};
