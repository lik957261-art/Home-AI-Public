"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
}

function sourceRefFor(source = {}) {
  const explicit = cleanString(source.sourceRef);
  if (explicit) return explicit;
  const sourceType = cleanString(source.sourceType);
  const sourceId = cleanString(source.sourceId || source.id);
  return sourceType && sourceId ? `${sourceType}:${sourceId}` : "";
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function refreshProgramSourceRefs(service, scope, sourceRefs, nowIso, maxRefs) {
  if (!service || typeof service.updateProgram !== "function" || !sourceRefs.length) return { updated: [], skipped: [] };
  const programId = cleanString(scope.programId);
  let programs = [];
  if (programId && typeof service.getProgram === "function") {
    const program = service.getProgram(programId);
    if (program) programs = [program];
  } else if (typeof service.listPrograms === "function") {
    programs = asArray(service.listPrograms({
      workspaceId: scope.workspaceId,
      learnerId: scope.learnerId,
      limit: 50,
    })).filter((program) => cleanString(program.status) !== "archived");
  }
  const updated = [];
  const skipped = [];
  for (const program of programs) {
    const id = cleanString(program.programId || program.id);
    if (!id) continue;
    const nextRefs = uniqueStrings(asArray(program.sourceBasisRefs).concat(sourceRefs)).slice(0, maxRefs);
    if (nextRefs.length === asArray(program.sourceBasisRefs).length
      && nextRefs.every((ref, index) => ref === asArray(program.sourceBasisRefs)[index])) {
      skipped.push({ programId: id, reason: "source_refs_unchanged" });
      continue;
    }
    const constraints = Object.assign({}, program.constraints || {}, {
      growthProgressSignalsSyncedAt: nowIso(),
    });
    updated.push(service.updateProgram(id, { sourceBasisRefs: nextRefs, constraints }));
  }
  return { updated, skipped };
}

function createLearningGrowthProgressSyncService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const maxProgramSourceRefs = Math.max(20, Number(options.maxProgramSourceRefs || 80));

  function syncAfterMaterialization(input = {}) {
    const service = input.programService || options.programService || null;
    const card = input.card || {};
    const workspaceId = cleanString(input.workspaceId || cardField(card, "workspaceId", "workspace_id")) || "weixin_stephen";
    const learnerId = cleanString(input.learnerId || input.studentId || cardField(card, "learnerId", "studentId")) || workspaceId;
    const programId = cleanString(input.programId || cardField(card, "learningProgramId", "learning_program_id"));
    const result = {
      ok: true,
      workspaceId,
      learnerId,
      programId,
      importedSources: 0,
      sourceRefs: [],
      profileRebuilt: false,
      programsRefreshed: 0,
      skipped: [],
      errors: [],
    };
    if (!service) {
      result.ok = false;
      result.skipped.push("learning_program_service_unavailable");
      return result;
    }

    if (typeof service.importSourceDirectory === "function") {
      try {
        const sourceImport = service.importSourceDirectory({ workspaceId, learnerId });
        result.sourceImport = {
          counts: sourceImport?.counts || {},
          bindingId: cleanString(sourceImport?.binding?.bindingId),
        };
        result.importedSources = Number(sourceImport?.counts?.importedSources || sourceImport?.sources?.length || 0) || 0;
        result.sourceRefs = uniqueStrings(asArray(sourceImport?.sources).map(sourceRefFor));
      } catch (err) {
        result.errors.push({ step: "import_source_directory", message: cleanString(err.message || err) });
      }
    } else {
      result.skipped.push("import_source_directory_unavailable");
    }

    if (typeof service.rebuildLearnerProfile === "function") {
      try {
        const profile = service.rebuildLearnerProfile({ workspaceId, learnerId });
        result.profileRebuilt = Boolean(profile?.profile);
        result.profileSummary = cleanString(profile?.profile?.profileSummary);
      } catch (err) {
        result.errors.push({ step: "rebuild_learner_profile", message: cleanString(err.message || err) });
      }
    } else {
      result.skipped.push("rebuild_learner_profile_unavailable");
    }

    try {
      const refreshed = refreshProgramSourceRefs(service, {
        workspaceId,
        learnerId,
        programId,
      }, result.sourceRefs, nowIso, maxProgramSourceRefs);
      result.programsRefreshed = refreshed.updated.length;
      result.refreshedProgramIds = refreshed.updated.map((program) => cleanString(program.programId || program.id)).filter(Boolean);
      if (refreshed.skipped.length) result.skipped.push(...refreshed.skipped.map((item) => `program:${item.programId}:${item.reason}`));
    } catch (err) {
      result.errors.push({ step: "refresh_program_source_refs", message: cleanString(err.message || err) });
    }

    if (result.errors.length) result.ok = false;
    return result;
  }

  return {
    syncAfterMaterialization,
  };
}

module.exports = {
  createLearningGrowthProgressSyncService,
};
