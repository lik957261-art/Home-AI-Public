"use strict";

const OWNER_HIGH_PRIVILEGE_SCOPE = "owner_high_privilege";

function errorMessage(err) {
  return err?.message || String(err || "");
}

function isDirectoryNotEmptyError(err) {
  const message = errorMessage(err);
  return err?.code === "ENOTEMPTY" || err?.code === "EEXIST" || /not empty|directory not empty/i.test(message);
}

function ownerElevationOnceTokenFromBody(body = {}) {
  return String(body.ownerElevationOnceToken || body.owner_elevation_once_token || "").trim();
}

function directoryDeleteElevationBody(input = {}) {
  const targetName = String(input.name || input.displayPath || input.path || "this directory").trim();
  return {
    error: "Owner high-privilege approval is required to delete a non-empty directory.",
    code: "owner_high_privilege_required",
    operatorRequired: true,
    elevationRequired: true,
    elevationScope: OWNER_HIGH_PRIVILEGE_SCOPE,
    elevationReason: `Non-empty directory delete requested for ${targetName}.`,
  };
}

function createDirectoryDeletePolicyService(options = {}) {
  const isOwnerAuth = typeof options.isOwnerAuth === "function"
    ? options.isOwnerAuth
    : ((auth) => Boolean(auth?.isOwner || auth?.role === "owner"));
  const isOwnerElevationActive = typeof options.isOwnerElevationActive === "function"
    ? options.isOwnerElevationActive
    : (() => false);
  const consumeOwnerElevationOnce = typeof options.consumeOwnerElevationOnce === "function"
    ? options.consumeOwnerElevationOnce
    : (() => false);

  function nonEmptyDirectoryDeleteAuthorization(auth, body = {}) {
    if (!isOwnerAuth(auth)) {
      return {
        allowed: false,
        status: 403,
        body: {
          error: "Owner access is required to delete a non-empty directory.",
          code: "owner_access_required",
          operatorRequired: true,
          elevationRequired: false,
          elevationScope: "",
        },
      };
    }
    const onceToken = ownerElevationOnceTokenFromBody(body);
    if (onceToken && consumeOwnerElevationOnce(auth, onceToken)) {
      return { allowed: true, recursive: true, source: "owner-elevation-once" };
    }
    if (isOwnerElevationActive(auth)) {
      return { allowed: true, recursive: true, source: "owner-elevation-active" };
    }
    return {
      allowed: false,
      status: 409,
      body: directoryDeleteElevationBody(body),
    };
  }

  function remoteDeletePayload(displayPath, options = {}) {
    const payload = { action: "delete", path: displayPath };
    if (options.recursive) payload.recursive = true;
    return payload;
  }

  return Object.freeze({
    nonEmptyDirectoryDeleteAuthorization,
    remoteDeletePayload,
  });
}

module.exports = {
  OWNER_HIGH_PRIVILEGE_SCOPE,
  createDirectoryDeletePolicyService,
  directoryDeleteElevationBody,
  isDirectoryNotEmptyError,
  ownerElevationOnceTokenFromBody,
};
