"use strict";

const { createFamilyProfileApiRoutes } = require("./family-profile-api-routes");
const { createFamilyProfileInsightService } = require("../adapters/family-profile-insight-service");
const { createFamilyProfileProjectionService } = require("../adapters/family-profile-projection-service");
const { createFamilyProfileRepository } = require("../adapters/family-profile-repository");
const { createFamilyProfileService } = require("../adapters/family-profile-service");

function createMobileApiFamilyProfileComposition(deps = {}, options = {}) {
  const mobileStore = options.mobileStore || null;
  const familyProfileRepository = deps.familyProfileRepository || createFamilyProfileRepository({
    database: mobileStore && typeof mobileStore.open === "function" ? mobileStore.open() : undefined,
    nowIso: deps.nowIso,
  });
  const familyProfileService = deps.familyProfileService || createFamilyProfileService({
    repository: familyProfileRepository,
  });
  const familyProfileInsightService = deps.familyProfileInsightService || createFamilyProfileInsightService({
    repository: familyProfileRepository,
  });
  const familyProfileProjectionService = deps.familyProfileProjectionService || createFamilyProfileProjectionService({
    familyProfileInsightService,
    familyProfileService,
    isOwnerAuth: deps.isOwnerAuth,
  });
  const familyProfileApiRoutes = createFamilyProfileApiRoutes({
    familyProfileInsightService,
    familyProfileProjectionService,
    familyProfileService,
    isOwnerAuth: deps.isOwnerAuth,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });

  return {
    routes: { familyProfileApiRoutes },
    services: {
      familyProfileInsightService,
      familyProfileProjectionService,
      familyProfileRepository,
      familyProfileService,
    },
  };
}

module.exports = {
  createMobileApiFamilyProfileComposition,
};
