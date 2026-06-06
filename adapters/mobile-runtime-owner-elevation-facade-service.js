"use strict";

const { createOwnerElevationGrantService: defaultCreateOwnerElevationGrantService } = require("./owner-elevation-grant-service");
const { createOwnerElevationRoutingService: defaultCreateOwnerElevationRoutingService } = require("./owner-elevation-routing-service");

function requiredFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeOwnerElevationFacadeService requires ${name}`);
}

function createMobileRuntimeOwnerElevationFacadeService(options = {}) {
  const createOwnerElevationGrantService = options.createOwnerElevationGrantService || defaultCreateOwnerElevationGrantService;
  const createOwnerElevationRoutingService = options.createOwnerElevationRoutingService || defaultCreateOwnerElevationRoutingService;
  const audit = requiredFunction(options, "audit");
  const compactText = requiredFunction(options, "compactText");
  const isOwnerAuth = requiredFunction(options, "isOwnerAuth");
  const loadCatalog = requiredFunction(options, "loadCatalog");

  let ownerElevationGrantService = null;
  let ownerElevationRoutingService = null;

  function getOwnerElevationGrantService() {
    if (!ownerElevationGrantService) {
      ownerElevationGrantService = createOwnerElevationGrantService({
        audit,
        defaultDurationMinutes: options.defaultDurationMinutes,
        durationOptionsMinutes: options.durationOptionsMinutes,
        isOwnerAuth,
        maintenanceRunsEnabled: options.maintenanceRunsEnabled,
        onceTtlMs: options.onceTtlMs,
      });
    }
    return ownerElevationGrantService;
  }

  function getOwnerElevationRoutingService() {
    if (!ownerElevationRoutingService) {
      ownerElevationRoutingService = createOwnerElevationRoutingService({
        compactText,
        consumeOwnerElevationOnce,
        gatewaySkillProfileRouting: options.gatewaySkillProfileRouting,
        isOwnerAuth,
        isOwnerElevationActive,
        loadCatalog,
        permissionApprovalMarker: options.permissionApprovalMarker,
        securityBoundaryProvider: options.securityBoundaryProvider,
      });
    }
    return ownerElevationRoutingService;
  }

  function callGrant(methodName, args) {
    return getOwnerElevationGrantService()[methodName](...args);
  }

  function callRouting(methodName, args) {
    return getOwnerElevationRoutingService()[methodName](...args);
  }

  function isOwnerElevationActive(...args) {
    return callGrant("isActive", args);
  }

  function grantOwnerElevationOnce(...args) {
    return callGrant("grantOnce", args);
  }

  function consumeOwnerElevationOnce(...args) {
    return callGrant("consumeOnce", args);
  }

  return Object.freeze({
    accessPolicyHardeningOptionsForGatewayRouting: (...args) => callRouting("accessPolicyHardeningOptionsForGatewayRouting", args),
    consumeOwnerElevationOnce,
    gatewayRoutingForModelRun: (...args) => callRouting("gatewayRoutingForModelRun", args),
    gatewaySkillRoutingForWorkspace: (...args) => callRouting("gatewaySkillRoutingForWorkspace", args),
    getOwnerElevationGrantService,
    getOwnerElevationRoutingService,
    grantOwnerElevation: (...args) => callGrant("grantTimed", args),
    grantOwnerElevationOnce,
    isOwnerElevationActive,
    modelPermissionApprovalRequest: (...args) => callRouting("modelPermissionApprovalRequest", args),
    ownerElevationInstructions: (...args) => callRouting("ownerElevationInstructions", args),
    precedingUserMessageForAssistant: (...args) => callRouting("precedingUserMessageForAssistant", args),
    publicOwnerElevationStatus: (...args) => callGrant("publicStatus", args),
    revokeOwnerElevation: (...args) => callGrant("revoke", args),
    sanitizeElevationScope: (...args) => callRouting("sanitizeElevationScope", args),
    stripPermissionApprovalMarkers: (...args) => callRouting("stripPermissionApprovalMarkers", args),
  });
}

module.exports = {
  createMobileRuntimeOwnerElevationFacadeService,
};
