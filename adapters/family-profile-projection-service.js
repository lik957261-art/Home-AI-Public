"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function authWorkspaceId(auth) {
  return cleanString(auth?.workspaceId || auth?.workspace_id || auth?.principal?.workspaceId || auth?.workspace?.id || "owner");
}

function defaultIsOwnerAuth(auth) {
  if (!auth) return false;
  if (auth.owner || auth.isOwner) return true;
  if (auth.role === "owner" || auth.principalRole === "owner") return true;
  if (authWorkspaceId(auth) === "owner" && cleanString(auth.principalId || auth.sub || "owner") === "owner") return true;
  return false;
}

function sharedVisibility(visibility) {
  return visibility === "household_summary" || visibility === "shared_with_members";
}

function memberCanSeeRecord(record, workspaceId) {
  if (!record || record.visibility === "owner_only") return false;
  if (sharedVisibility(record.visibility)) return true;
  return record.visibility === "member_self" && record.subjectWorkspaceId === workspaceId;
}

function memberCanSeeInsight(insight, workspaceId) {
  if (!insight || !sharedVisibility(insight.visibility)) return false;
  const affected = Array.isArray(insight.affectedWorkspaceIds) ? insight.affectedWorkspaceIds : [];
  return affected.length === 0 || affected.includes(workspaceId);
}

function createFamilyProfileProjectionService(options = {}) {
  const familyProfileService = options.familyProfileService;
  const familyProfileInsightService = options.familyProfileInsightService;
  if (!familyProfileService || typeof familyProfileService.listProfileRecords !== "function") {
    throw new Error("family profile projection service requires familyProfileService");
  }
  if (!familyProfileInsightService || typeof familyProfileInsightService.listInsights !== "function") {
    throw new Error("family profile projection service requires familyProfileInsightService");
  }
  const isOwnerAuth = typeof options.isOwnerAuth === "function" ? options.isOwnerAuth : defaultIsOwnerAuth;

  function projectRecords(input = {}) {
    const auth = input.auth || {};
    const workspaceId = cleanString(input.workspaceId) || authWorkspaceId(auth);
    const records = familyProfileService.listProfileRecords(Object.assign({}, input.filters || {}, {
      limit: input.limit || input.filters?.limit || 100,
    }));
    if (isOwnerAuth(auth)) return records;
    return records.filter((record) => memberCanSeeRecord(record, workspaceId));
  }

  function projectInsights(input = {}) {
    const auth = input.auth || {};
    const workspaceId = cleanString(input.workspaceId) || authWorkspaceId(auth);
    const insights = familyProfileInsightService.listInsights(Object.assign({}, input.filters || {}, {
      limit: input.limit || input.filters?.limit || 100,
    }));
    if (isOwnerAuth(auth)) return insights;
    return insights.filter((insight) => memberCanSeeInsight(insight, workspaceId));
  }

  function projectSelf(input = {}) {
    const auth = input.auth || {};
    const workspaceId = cleanString(input.workspaceId) || authWorkspaceId(auth);
    return {
      workspaceId,
      snapshot: familyProfileService.latestPersonalProfileSnapshot(workspaceId),
      records: projectRecords({ auth, workspaceId, filters: { subjectWorkspaceId: workspaceId, limit: input.limit || 50 } }),
      insights: projectInsights({ auth, workspaceId, filters: { limit: input.limit || 50 } }),
    };
  }

  function projectHousehold(input = {}) {
    const auth = input.auth || {};
    const workspaceId = cleanString(input.workspaceId) || authWorkspaceId(auth);
    const owner = isOwnerAuth(auth);
    const householdProfile = familyProfileService.getHouseholdProfile();
    const profileVisible = owner || sharedVisibility(householdProfile?.visibility);
    return {
      workspaceId,
      ownerView: owner,
      householdProfile: profileVisible ? householdProfile : null,
      records: projectRecords({ auth, workspaceId, filters: { limit: input.limit || 100 } }),
      insights: projectInsights({ auth, workspaceId, filters: { limit: input.limit || 100 } }),
    };
  }

  function contextForGateway(input = {}) {
    const auth = input.auth || {};
    const workspaceId = cleanString(input.workspaceId) || authWorkspaceId(auth);
    const projection = projectSelf({ auth, workspaceId, limit: input.limit || 20 });
    return {
      workspaceId,
      profileSummary: projection.snapshot?.summary || "",
      records: projection.records.map((record) => ({
        domain: record.domain,
        claimType: record.claimType,
        summary: record.summary,
        confidence: record.confidence,
      })),
      insights: projection.insights.map((insight) => ({
        title: insight.title,
        summary: insight.summary,
        domains: insight.domains,
        confidence: insight.confidence,
      })),
    };
  }

  return {
    contextForGateway,
    isOwnerAuth,
    projectHousehold,
    projectInsights,
    projectRecords,
    projectSelf,
  };
}

module.exports = {
  createFamilyProfileProjectionService,
  defaultIsOwnerAuth,
  memberCanSeeInsight,
  memberCanSeeRecord,
};
