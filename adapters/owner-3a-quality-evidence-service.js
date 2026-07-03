"use strict";

const fs = require("node:fs");
const path = require("node:path");

const OWNER_3A_QUALITY_EVIDENCE_VERSION = "20260701-owner-3a-quality-evidence-v2";
const DEFAULT_OWNER_3A_QUALITY_EVIDENCE_BASENAME = "owner-3a-quality-evidence.json";
const DEFAULT_OWNER_3A_QUALITY_EVIDENCE_MAX_AGE_MS = 26 * 60 * 60 * 1000;

const STATUS_RANK = Object.freeze({
  ok: 0,
  partial: 1,
  warning: 2,
  degraded: 3,
  blocked: 4,
  stale: 5,
  unknown: 6,
});

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeToken(value, fallback = "unknown", maxLength = 120) {
  const token = cleanString(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function normalizeStatus(value, fallback = "unknown") {
  const status = safeToken(value, fallback, 40).toLowerCase();
  if (Object.hasOwn(STATUS_RANK, status)) return status;
  if (["healthy", "ready", "covered", "passed", "pass", "available", "success"].includes(status)) return "ok";
  if (["failed", "failure", "error", "unhealthy"].includes(status)) return "degraded";
  if (["not_collected", "missing", "skipped"].includes(status)) return "partial";
  return fallback;
}

function worstStatus(values = []) {
  return values.reduce((worst, value) => (
    STATUS_RANK[normalizeStatus(value)] > STATUS_RANK[normalizeStatus(worst)] ? normalizeStatus(value) : worst
  ), "ok");
}

function boundedEvidence(value = {}) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, raw] of Object.entries(value).slice(0, 24)) {
    const safeKey = safeToken(key, "", 80);
    if (!safeKey) continue;
    const isSafeCompletionClaim = /^cleanTargetNoCompletionClaim$/i.test(safeKey)
      || /^noCompletionClaim$/i.test(safeKey);
    if (/authorization|cookie|password|secret|token|access.?key|launch.?key|oauth|bearer/i.test(safeKey)) {
      out[safeKey] = "[REDACTED]";
    } else if (/path|url|body|content|message|prompt|transcript|screenshot|image|payload/i.test(safeKey)
      || (/completion/i.test(safeKey) && !isSafeCompletionClaim)) {
      out[safeKey] = "[REDACTED]";
    } else if (raw == null) {
      out[safeKey] = null;
    } else if (typeof raw === "number") {
      out[safeKey] = Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : 0;
    } else if (typeof raw === "boolean") {
      out[safeKey] = raw;
    } else if (Array.isArray(raw)) {
      out[safeKey] = raw.slice(0, 12).map((item) => safeToken(item, "", 120)).filter(Boolean);
    } else if (typeof raw === "object") {
      out[safeKey] = boundedEvidence(raw);
    } else {
      out[safeKey] = cleanString(raw, 180);
    }
  }
  return out;
}

function numberField(value = {}, key) {
  const parsed = Number(value && typeof value === "object" ? value[key] : undefined);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolField(value = {}, key) {
  return Boolean(value && typeof value === "object" && value[key] === true);
}

function categoryOk(report = {}, category) {
  const categories = report && typeof report === "object" && report.categories && typeof report.categories === "object"
    ? report.categories
    : {};
  return categories[category]?.ok === true || report?.[`${category.replace(/_([a-z])/g, (_, char) => char.toUpperCase())}Passed`] === true;
}

function observationList(productionCollection = {}) {
  if (!productionCollection || typeof productionCollection !== "object") return [];
  if (Array.isArray(productionCollection.observations)) return productionCollection.observations;
  if (Array.isArray(productionCollection.signals)) return productionCollection.signals;
  return [];
}

function findObservation(productionCollection = {}, signalId = "") {
  const wanted = safeToken(signalId, "", 120);
  return observationList(productionCollection).find((item) => (
    safeToken(item?.signalId || item?.signal_id || "", "", 120) === wanted
  )) || null;
}

function statusFromObservation(observation = null) {
  if (!observation) return "";
  return normalizeStatus(observation.status || observation.state, "unknown");
}

function summarizeInstallUpgradeCanary(report = null, observation = null) {
  const hasReport = report && typeof report === "object";
  let status = "";
  if (hasReport) {
    const mode = safeToken(report.mode || "", "", 40);
    const canary = report.cleanTargetCanary && typeof report.cleanTargetCanary === "object"
      ? report.cleanTargetCanary
      : {};
    const cleanTargetClosed = normalizeStatus(canary.status || canary.cleanTargetStatus || "", "") === "ok"
      && canary.noCompletionClaim === false;
    if (report.skipped || mode === "plan") status = "partial";
    else if (report.ok === true && numberField(report, "failedPhaseCount") === 0 && cleanTargetClosed) status = "ok";
    else if (report.ok === true && numberField(report, "failedPhaseCount") === 0) status = "partial";
    else status = "degraded";
  } else if (observation) {
    status = statusFromObservation(observation);
  }
  if (!status) status = "unknown";
  const bounded = hasReport
    ? boundedEvidence({
      mode: report.mode || "",
      phaseCount: numberField(report, "phaseCount"),
      passedPhaseCount: numberField(report, "passedPhaseCount"),
      failedPhaseCount: numberField(report, "failedPhaseCount"),
      freshInstallPassed: categoryOk(report, "fresh_install"),
      publicUpgradePassed: categoryOk(report, "public_upgrade"),
      pluginProvisioningPassed: categoryOk(report, "plugin_provisioning"),
      selfImprovingLoopPassed: categoryOk(report, "self_improving_loop"),
      cleanTargetCanaryStatus: report.cleanTargetCanary?.status || "",
      cleanTargetEnvironmentStatus: report.cleanTargetEnvironment?.status || "",
      issueCount: Array.isArray(report.issues) ? report.issues.length : numberField(report, "issueCount"),
      source: "homeai-install-upgrade-canary",
    })
    : boundedEvidence({
      signalId: observation?.signalId || observation?.signal_id || "install_upgrade_canary",
      status: observation?.status || "",
      errorCode: observation?.errorCode || observation?.error_code || "",
      source: "production-observation",
    });
  return {
    id: "install_upgrade_canary_observed",
    status,
    boundedEvidence: bounded,
  };
}

function stepById(report = {}, id = "") {
  const steps = Array.isArray(report?.steps) ? report.steps : [];
  return steps.find((step) => safeToken(step?.id, "", 120) === id) || null;
}

function stepOk(step = null) {
  return Boolean(step && step.ok === true);
}

function summarizeCleanTargetCanary(report = null) {
  const hasReport = report && typeof report === "object";
  const steps = hasReport && Array.isArray(report.steps) ? report.steps : [];
  if (!hasReport) {
    return {
      id: "clean_target_live_canary",
      status: "unknown",
      boundedEvidence: {},
    };
  }

  const mode = safeToken(report.mode || "", "", 40);
  if (report.skipped === true) {
    const reason = safeToken(report.reason || report.error || "clean_target_canary_skipped", "", 120);
    return {
      id: "clean_target_live_canary",
      status: "partial",
      boundedEvidence: boundedEvidence({
        mode,
        skipped: true,
        reason,
        source: "homeai-install-upgrade-canary",
      }),
    };
  }
  if (mode === "plan") {
    return {
      id: "clean_target_live_canary",
      status: "unknown",
      boundedEvidence: {},
    };
  }

  const canary = report.cleanTargetCanary && typeof report.cleanTargetCanary === "object"
    ? report.cleanTargetCanary
    : {};
  const environment = report.cleanTargetEnvironment && typeof report.cleanTargetEnvironment === "object"
    ? report.cleanTargetEnvironment
    : {};
  const canaryStatus = normalizeStatus(canary.status || canary.cleanTargetStatus || "", "");
  const canaryNoCompletionClaim = Boolean(canary.noCompletionClaim ?? true);
  const fresh = stepById(report, "macos_fresh_install_rehearsal");
  const upgradePlan = stepById(report, "public_upgrade_rehearsal_plan");
  const upgradeExecute = stepById(report, "public_upgrade_rehearsal_execute");
  const freshTempRemoved = Boolean(fresh?.summary?.tempRemoved);
  const planTempRootOnly = Boolean(upgradePlan?.summary?.tempRootOnly);
  const planProductionWrites = upgradePlan?.summary?.productionWrites === true;
  const executeTempRemoved = Boolean(upgradeExecute?.summary?.tempRemoved);
  const executeDailySmokeOk = Boolean(upgradeExecute?.summary?.publicUpgradeDailySmokeOk);
  const publicUpgradeClean = (stepOk(upgradePlan) && planTempRootOnly && !planProductionWrites)
    || (stepOk(upgradeExecute) && executeTempRemoved && executeDailySmokeOk);
  const noProductionWrites = report.policy?.productionWrites === false;
  const executeMode = mode === "execute";
  const failedPhaseCount = numberField(report, "failedPhaseCount");
  const sourceSafeRehearsalOk = report.ok === true
    && executeMode
    && stepOk(fresh)
    && freshTempRemoved
    && publicUpgradeClean
    && noProductionWrites
    && failedPhaseCount === 0;
  let status = "unknown";
  if (canaryStatus === "degraded") status = "degraded";
  else if (report.ok === false || failedPhaseCount > 0) status = "degraded";
  else if (canaryStatus === "ok" && canaryNoCompletionClaim === false) status = "ok";
  else if (executeMode || steps.length || canaryStatus) status = "partial";
  const bounded = boundedEvidence({
    mode,
    phaseCount: numberField(report, "phaseCount"),
    failedPhaseCount,
    sourceSafeRehearsalOk,
    freshInstallRehearsalOk: stepOk(fresh),
    freshInstallTempRemoved: freshTempRemoved,
    publicUpgradePlanOk: stepOk(upgradePlan),
    publicUpgradePlanTempRootOnly: planTempRootOnly,
    publicUpgradeExecuteOk: stepOk(upgradeExecute),
    publicUpgradeExecuteTempRemoved: executeTempRemoved,
    publicUpgradeDailySmokeOk: executeDailySmokeOk,
    productionWrites: report.policy?.productionWrites === true,
    networkClone: report.policy?.networkClone === true,
    cleanTargetCanaryStatus: canary.status || "",
    cleanTargetNoCompletionClaim: canaryNoCompletionClaim,
    cleanTargetLane: canary.lane || "",
    cleanTargetEvidenceVersion: canary.evidenceVersion || "",
    cleanTargetPhaseCount: numberField(canary, "phaseCount"),
    cleanTargetIssueCodes: Array.isArray(canary.issueCodes) ? canary.issueCodes : [],
    cleanTargetEnvironmentStatus: environment.status || "",
    cleanTargetEnvironmentIssues: Array.isArray(environment.issueCodes) ? environment.issueCodes : [],
    cleanTargetEnvironmentGates: environment.gates || {},
    source: "homeai-install-upgrade-canary",
  });
  return {
    id: "clean_target_live_canary",
    status,
    boundedEvidence: bounded,
  };
}

function summarizePluginActionReference(report = null, observation = null) {
  const hasReport = report && typeof report === "object";
  let status = "";
  const reference = hasReport && report.reference && typeof report.reference === "object" ? report.reference : {};
  const families = hasReport && Array.isArray(report.actionFamilies) ? report.actionFamilies : [];
  const wardrobeFamily = families.find((family) => (
    safeToken(family?.pluginId || family?.reference?.pluginId || "", "", 80) === "wardrobe"
      && safeToken(family?.actionKind || family?.reference?.actionKind || "", "", 120) === "wardrobeOutfitWearIntent"
  )) || null;
  const metadata = observation && typeof observation === "object" && observation.metadata && typeof observation.metadata === "object"
    ? observation.metadata
    : {};
  const pluginId = safeToken(wardrobeFamily?.pluginId || reference.pluginId || metadata.pluginId || "", "", 80);
  const actionKind = safeToken(wardrobeFamily?.actionKind || reference.actionKind || metadata.actionKind || "", "", 120);
  const isWardrobeReference = pluginId === "wardrobe" && actionKind === "wardrobeOutfitWearIntent";
  if (hasReport) {
    const wardrobeFailed = wardrobeFamily && Number(wardrobeFamily.failedStageCount || 0) > 0;
    if (report.skipped) status = "partial";
    else if (report.ok === true && numberField(report, "failedStageCount") === 0 && isWardrobeReference && !wardrobeFailed) status = "ok";
    else if (report.ok === true && numberField(report, "failedStageCount") === 0) status = "partial";
    else status = "degraded";
  } else if (observation) {
    status = statusFromObservation(observation) === "ok" ? "partial" : statusFromObservation(observation);
  }
  if (!status) status = "unknown";
  const bounded = hasReport
    ? boundedEvidence({
      pluginId,
      actionKind,
      modelVersion: report.modelVersion || "",
      stageCount: numberField(report, "stageCount"),
      passedStageCount: numberField(report, "passedStageCount"),
      failedStageCount: numberField(report, "failedStageCount"),
      failedStages: Array.isArray(report.failedStages) ? report.failedStages : [],
      actionFamilyCount: numberField(report, "actionFamilyCount") || numberField(report, "familyCount"),
      source: "plugin-action-metadata-closure-smoke",
    })
    : boundedEvidence({
      signalId: observation?.signalId || observation?.signal_id || "plugin_action_metadata_health",
      status: observation?.status || "",
      errorCode: observation?.errorCode || observation?.error_code || "",
      source: "production-observation",
    });
  return {
    id: "wardrobe_reference_action_contract",
    status,
    boundedEvidence: bounded,
  };
}

function summarizeDeterministicActionGeneralization(report = null, observation = null) {
  const hasReport = report && typeof report === "object";
  let status = "";
  const families = hasReport && Array.isArray(report.actionFamilies) ? report.actionFamilies : [];
  const familyCount = numberField(report || {}, "actionFamilyCount") || numberField(report || {}, "familyCount") || families.length;
  const generalizedFamilyCount = numberField(report || {}, "generalizedActionFamilyCount");
  const actionClassCount = numberField(report || {}, "actionClassCount") || new Set(families.map((family) => safeToken(family?.actionClass, "", 80)).filter(Boolean)).size;
  const failedStageCount = numberField(report || {}, "failedStageCount");
  if (hasReport) {
    if (report.skipped) status = "partial";
    else if (report.ok === true && failedStageCount === 0 && familyCount >= 2 && generalizedFamilyCount >= 1 && actionClassCount >= 2) status = "ok";
    else if (report.ok === true && failedStageCount === 0) status = "partial";
    else status = "degraded";
  } else if (observation) {
    const observedStatus = statusFromObservation(observation);
    status = observedStatus === "ok" ? "partial" : observedStatus;
  }
  if (!status) status = "unknown";
  const bounded = hasReport
    ? boundedEvidence({
      modelVersion: report.modelVersion || "",
      actionFamilyCount: familyCount,
      generalizedActionFamilyCount: generalizedFamilyCount,
      actionClassCount,
      actionClasses: Array.isArray(report.actionClasses) ? report.actionClasses : [],
      failedStageCount,
      failedStages: Array.isArray(report.failedStages) ? report.failedStages : [],
      source: "plugin-action-metadata-closure-smoke",
    })
    : boundedEvidence({
      signalId: observation?.signalId || observation?.signal_id || "plugin_action_metadata_health",
      status: observation?.status || "",
      errorCode: observation?.errorCode || observation?.error_code || "",
      source: "production-observation",
    });
  return {
    id: "deterministic_action_generalization",
    status,
    boundedEvidence: bounded,
  };
}

function explicitStatus(input = {}, key) {
  if (!input || typeof input !== "object") return "";
  return normalizeStatus(input[key] || input.extraEvidence?.[key] || "", "");
}

function buildOwner3AQualityEvidence(input = {}) {
  const generatedAt = typeof input.nowIso === "function" ? input.nowIso() : (input.generatedAt || new Date().toISOString());
  const productionCollection = input.productionCollection && typeof input.productionCollection === "object"
    ? input.productionCollection
    : {};
  let install = summarizeInstallUpgradeCanary(
    input.installUpgradeCanary || input.installUpgradeCanaryReport || null,
    findObservation(productionCollection, "install_upgrade_canary"),
  );
  let action = summarizePluginActionReference(
    input.pluginActionMetadataClosure || input.pluginActionMetadataClosureReport || null,
    findObservation(productionCollection, "plugin_action_metadata_health"),
  );
  let deterministicAction = summarizeDeterministicActionGeneralization(
    input.pluginActionMetadataClosure || input.pluginActionMetadataClosureReport || null,
    findObservation(productionCollection, "plugin_action_metadata_health"),
  );
  const explicitInstallStatus = explicitStatus(input, "installUpgradeCanaryObservedStatus");
  if (install.status === "unknown" && explicitInstallStatus) {
    install = {
      id: "install_upgrade_canary_observed",
      status: explicitInstallStatus,
      boundedEvidence: boundedEvidence(input.extraEvidence?.installUpgradeCanary || { source: "explicit_quality_evidence" }),
    };
  }
  const explicitWardrobeActionStatus = explicitStatus(input, "wardrobeReferenceActionStatus");
  if (action.status === "unknown" && explicitWardrobeActionStatus) {
    action = {
      id: "wardrobe_reference_action_contract",
      status: explicitWardrobeActionStatus,
      boundedEvidence: boundedEvidence(input.extraEvidence?.pluginActionReference || { source: "explicit_quality_evidence" }),
    };
  }
  const cleanTarget = summarizeCleanTargetCanary(
    input.cleanTargetCanary || input.cleanInstallCanary || input.installUpgradeCanary || input.installUpgradeCanaryReport || null,
  );
  const explicitCleanInstallStatus = explicitStatus(input, "cleanInstallCanaryStatus");
  const cleanInstallStatus = explicitCleanInstallStatus || (cleanTarget.status !== "unknown" ? cleanTarget.status : "");
  const explicitDeterministicActionStatus = explicitStatus(input, "deterministicActionGeneralizationStatus");
  if (deterministicAction.status === "unknown" && explicitDeterministicActionStatus) {
    deterministicAction = {
      id: "deterministic_action_generalization",
      status: explicitDeterministicActionStatus,
      boundedEvidence: boundedEvidence(input.extraEvidence?.deterministicActionGeneralization || { source: "explicit_quality_evidence" }),
    };
  }
  const signals = [install, cleanTarget, action, deterministicAction].filter((item) => item.status !== "unknown");
  const status = signals.length ? worstStatus(signals.map((item) => item.status)) : "unknown";
  const extraEvidence = {};
  if (install.status !== "unknown") {
    extraEvidence.installUpgradeCanaryObservedStatus = install.status;
    extraEvidence.installUpgradeCanary = install.boundedEvidence;
  }
  if (action.status !== "unknown") {
    extraEvidence.wardrobeReferenceActionStatus = action.status;
    extraEvidence.pluginActionReference = action.boundedEvidence;
  }
  if (cleanInstallStatus) {
    extraEvidence.cleanInstallCanaryStatus = cleanInstallStatus;
    if (cleanTarget.status !== "unknown") extraEvidence.cleanTargetCanary = cleanTarget.boundedEvidence;
  }
  if (deterministicAction.status !== "unknown") {
    extraEvidence.deterministicActionGeneralizationStatus = deterministicAction.status;
    extraEvidence.deterministicActionGeneralization = deterministicAction.boundedEvidence;
  }
  const cleanInstallClosed = normalizeStatus(cleanInstallStatus, "unknown") === "ok";
  const deterministicActionClosed = normalizeStatus(deterministicAction.status, "unknown") === "ok";
  return {
    ok: status === "ok",
    schemaVersion: 1,
    evidenceVersion: OWNER_3A_QUALITY_EVIDENCE_VERSION,
    generatedAt,
    status,
    signalCount: signals.length,
    signals,
    extraEvidence,
    policy: {
      ownerOnly: true,
      readOnly: true,
      boundedMetadataOnly: true,
      noCompletionClaim: !cleanInstallClosed || !deterministicActionClosed || status !== "ok",
    },
  };
}

function defaultEvidenceFile(env = process.env) {
  if (env.HERMES_OWNER_3A_QUALITY_EVIDENCE_FILE) return env.HERMES_OWNER_3A_QUALITY_EVIDENCE_FILE;
  if (env.HERMES_SELF_LOOP_QUALITY_EVIDENCE_OUTPUT) return env.HERMES_SELF_LOOP_QUALITY_EVIDENCE_OUTPUT;
  const dataRoot = env.HERMES_WEB_DATA_DIR || env.HERMES_MOBILE_DATA_DIR || path.join(env.HERMES_MOBILE_ROOT || "/Users/example/path", "data");
  return path.join(dataRoot, "hermes-home", "self-improving-loop", DEFAULT_OWNER_3A_QUALITY_EVIDENCE_BASENAME);
}

function sanitizeOwner3AQualityEvidence(raw = {}) {
  if (!raw || typeof raw !== "object") return buildOwner3AQualityEvidence({});
  if (raw.evidenceVersion !== OWNER_3A_QUALITY_EVIDENCE_VERSION || !raw.extraEvidence) {
    return buildOwner3AQualityEvidence(raw);
  }
  const signals = Array.isArray(raw.signals)
    ? raw.signals.slice(0, 8).map((item) => ({
      id: safeToken(item?.id, "signal", 120),
      status: normalizeStatus(item?.status, "unknown"),
      boundedEvidence: boundedEvidence(item?.boundedEvidence || {}),
    }))
    : [];
  const status = normalizeStatus(raw.status || worstStatus(signals.map((item) => item.status)), signals.length ? "ok" : "unknown");
  return {
    ok: status === "ok",
    schemaVersion: 1,
    evidenceVersion: OWNER_3A_QUALITY_EVIDENCE_VERSION,
    generatedAt: cleanString(raw.generatedAt || "", 80),
    status,
    signalCount: Number(raw.signalCount ?? signals.length) || signals.length,
    signals,
    extraEvidence: boundedEvidence(raw.extraEvidence || {}),
    policy: {
      ownerOnly: true,
      readOnly: true,
      boundedMetadataOnly: true,
      noCompletionClaim: Boolean(raw.policy?.noCompletionClaim ?? true),
    },
  };
}

function staleEvidence(generatedAt, nowMs, maxAgeMs) {
  const parsed = Date.parse(generatedAt || "");
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed > maxAgeMs;
}

function createOwner3AQualityEvidenceService(options = {}) {
  const evidenceFile = options.evidenceFile || defaultEvidenceFile(options.env || process.env);
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
    ? Number(options.maxAgeMs)
    : DEFAULT_OWNER_3A_QUALITY_EVIDENCE_MAX_AGE_MS;

  async function collect() {
    if (typeof options.collectEvidence === "function") {
      return sanitizeOwner3AQualityEvidence(await options.collectEvidence());
    }
    if (options.evidence && typeof options.evidence === "object") {
      return sanitizeOwner3AQualityEvidence(options.evidence);
    }
    try {
      const text = fs.readFileSync(evidenceFile, "utf8");
      const parsed = JSON.parse(text);
      const sanitized = sanitizeOwner3AQualityEvidence(parsed);
      if (staleEvidence(sanitized.generatedAt, nowMs(), maxAgeMs)) {
        return Object.assign({}, sanitized, {
          ok: false,
          status: "stale",
          signals: sanitized.signals.map((item) => Object.assign({}, item, { status: item.status === "ok" ? "stale" : item.status })),
          extraEvidence: Object.assign({}, sanitized.extraEvidence, {
            evidenceFreshnessStatus: "stale",
          }),
        });
      }
      return sanitized;
    } catch (err) {
      return {
        ok: false,
        schemaVersion: 1,
        evidenceVersion: OWNER_3A_QUALITY_EVIDENCE_VERSION,
        generatedAt: new Date(nowMs()).toISOString(),
        status: "unknown",
        signalCount: 0,
        signals: [],
        extraEvidence: {},
        reason: err && err.code === "ENOENT" ? "quality_evidence_file_missing" : "quality_evidence_file_unreadable",
        policy: {
          ownerOnly: true,
          readOnly: true,
          boundedMetadataOnly: true,
          noCompletionClaim: true,
        },
      };
    }
  }

  return {
    collect,
    evidenceFile,
  };
}

module.exports = {
  DEFAULT_OWNER_3A_QUALITY_EVIDENCE_BASENAME,
  OWNER_3A_QUALITY_EVIDENCE_VERSION,
  buildOwner3AQualityEvidence,
  createOwner3AQualityEvidenceService,
  defaultEvidenceFile,
  normalizeStatus,
  sanitizeOwner3AQualityEvidence,
};
