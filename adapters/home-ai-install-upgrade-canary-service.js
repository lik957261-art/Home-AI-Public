"use strict";

const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");

const { summarizePublicUpgradeDailySmoke } = require("./deploy-upgrade-lane-closure-service");

const CANARY_VERSION = "20260702-install-upgrade-canary-v3";
const DEFAULT_TIMEOUT_MS = 120000;

const REQUIRED_STAGE_DEFINITIONS = Object.freeze([
  {
    id: "source_preflight",
    dimension: "availability",
    description: "Home AI and public plugin source inputs are present and source-safe before install or upgrade work begins.",
  },
  {
    id: "owner_key_bootstrap",
    dimension: "availability",
    description: "Fresh install can create or verify the initial Owner identity and bounded key storage without printing secrets.",
  },
  {
    id: "home_ai_install",
    dimension: "availability",
    description: "The Home AI host install phase is represented by executable or rehearsed installer coverage.",
  },
  {
    id: "hermes_agent_runtime",
    dimension: "availability",
    description: "The official Hermes Agent runtime and Python environment are tracked deployment dependencies.",
  },
  {
    id: "provider_ingress",
    dimension: "accuracy",
    description: "Gateway/provider ingress has an explicit validation or allowed-pending closure path.",
  },
  {
    id: "plugin_registration",
    dimension: "availability",
    description: "Maintained plugins are registered or fail closed with bounded provisioning evidence.",
  },
  {
    id: "gateway_profile_tool_schema",
    dimension: "accuracy",
    description: "Gateway profiles, workspace tool schema, and document/tool capability gates are validated.",
  },
  {
    id: "plugin_mcp_schema_smoke",
    dimension: "accuracy",
    description: "Plugin MCP/schema availability has bounded coverage before the install or upgrade is closed.",
  },
  {
    id: "public_upgrade_rehearsal",
    dimension: "autonomy",
    description: "Public upgrade rehearsal proves clone/adopt/deploy closure without hidden manual patching.",
  },
  {
    id: "production_closure_readback",
    dimension: "autonomy",
    description: "Install or upgrade closure includes final bounded production/readback gates.",
  },
]);

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function boundedStringList(values, maxItems = 12, maxLen = 120) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const value of values) {
    const text = clean(value, maxLen);
    if (!text) continue;
    if (!out.includes(text)) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function boundedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function shortHash(value) {
  const text = clean(value, 1000);
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function truthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(clean(value, 20).toLowerCase());
}

function pathLabel(value) {
  const text = clean(value, 1000);
  if (!text) return { present: false, basename: "", hash: "" };
  return {
    present: true,
    basename: clean(path.basename(text), 120),
    hash: shortHash(text),
  };
}

function summarizeCleanTargetEnvironment(input = {}, env = {}) {
  const source = input && typeof input === "object" ? input : {};
  const environment = env && typeof env === "object" ? env : {};
  const targetRoot = clean(
    source.targetRoot
      || source.cleanTargetRoot
      || environment.HOMEAI_CLEAN_TARGET_ROOT
      || environment.HOMEAI_INSTALL_CLEAN_TARGET_ROOT
      || "",
    1000,
  );
  const fixture = clean(
    source.fixturePath
      || source.fixture
      || environment.HOMEAI_CLEAN_TARGET_FIXTURE
      || environment.HOMEAI_INSTALL_CLEAN_TARGET_FIXTURE
      || "",
    1000,
  );
  const readbackFile = clean(
    source.readbackFile
      || source.cleanTargetReadbackFile
      || environment.HOMEAI_CLEAN_TARGET_READBACK_FILE
      || "",
    1000,
  );
  const isolatedDeclared = source.isolated === true
    || truthyEnv(environment.HOMEAI_CLEAN_TARGET_ISOLATED)
    || truthyEnv(environment.HOMEAI_INSTALL_CLEAN_TARGET_ISOLATED);
  const operatorPhases = source.operatorPhases === true || truthyEnv(environment.HOMEAI_INSTALL_RUN_OPERATOR_PHASES);
  const launchdApply = source.launchdApply === true || truthyEnv(environment.HOMEAI_INSTALL_LAUNCHD_APPLY);
  const workspaceAclApply = source.workspaceAclApply === true || truthyEnv(environment.HOMEAI_INSTALL_APPLY_WORKSPACE_ACL);
  const issues = [];
  if (!targetRoot) issues.push("clean_target_root_missing");
  else if (!path.isAbsolute(targetRoot)) issues.push("clean_target_root_not_absolute");
  if (!isolatedDeclared) issues.push("clean_target_isolation_not_declared");
  if (!fixture) issues.push("clean_target_fixture_missing");
  else if (!path.isAbsolute(fixture)) issues.push("clean_target_fixture_not_absolute");
  if (!readbackFile) issues.push("clean_target_readback_file_missing");
  else if (!path.isAbsolute(readbackFile)) issues.push("clean_target_readback_file_not_absolute");
  if (!operatorPhases) issues.push("operator_phases_gate_missing");
  if (!launchdApply) issues.push("launchd_apply_gate_missing");
  if (!workspaceAclApply) issues.push("workspace_acl_apply_gate_missing");
  return {
    requiredForCompletion: true,
    status: issues.length ? "blocked" : "ready",
    targetRoot: pathLabel(targetRoot),
    fixture: pathLabel(fixture),
    readbackFile: pathLabel(readbackFile),
    gates: {
      isolatedDeclared,
      operatorPhases,
      launchdApply,
      workspaceAclApply,
    },
    issueCodes: issues,
    privacy: "metadata_only_path_basename_hash_no_raw_target_paths",
  };
}

function normalizeCleanTargetCanary(readback = null) {
  const payload = readback && typeof readback === "object" ? readback : {};
  const rawStatus = clean(payload.status || payload.cleanTargetStatus || "", 40);
  const status = ["passed", "failed", "partial", "not_run"].includes(rawStatus) ? rawStatus : "not_run";
  const phases = Array.isArray(payload.phases) ? payload.phases : [];
  const normalizedPhases = phases.slice(0, 12).map((phase) => ({
    id: clean(phase.id || phase.phaseId || "", 80),
    status: clean(phase.status || "", 40),
    tempRootRemoved: phase.tempRootRemoved === true,
    productionReadback: phase.productionReadback === true,
  }));
  const readbackIssues = validateCleanTargetReadbackEvidence({
    status,
    lane: payload.lane || payload.laneId || payload.threadTitle || "",
    evidenceVersion: payload.evidenceVersion || payload.version || "",
    phases: normalizedPhases,
    issueCodes: Array.isArray(payload.issueCodes) ? payload.issueCodes : (Array.isArray(payload.issues) ? payload.issues.map((issue) => issue.code) : []),
  });
  return {
    requiredForCompletion: true,
    status,
    executionClass: "lane_only_clean_target",
    lane: clean(payload.lane || payload.laneId || payload.threadTitle || "", 120),
    evidenceVersion: clean(payload.evidenceVersion || payload.version || "", 120),
    generatedAt: clean(payload.generatedAt || payload.lastCheckedAt || "", 80),
    phaseCount: phases.length,
    phases: normalizedPhases,
    issueCodes: readbackIssues,
    noCompletionClaim: payload.noCompletionClaim === true || status !== "passed" || readbackIssues.length > 0,
  };
}

function validateCleanTargetReadbackEvidence(readback = {}) {
  const status = clean(readback.status || "", 40);
  const explicitIssues = boundedStringList(readback.issueCodes, 12, 120);
  if (status !== "passed") return explicitIssues;

  const phases = Array.isArray(readback.phases) ? readback.phases : [];
  const issues = [...explicitIssues];
  const lane = clean(readback.lane || "", 120);
  const evidenceVersion = clean(readback.evidenceVersion || "", 120);
  if (!lane) issues.push("clean_target_canary_lane_missing");
  if (!evidenceVersion) issues.push("clean_target_canary_evidence_version_missing");
  if (!phases.length) issues.push("clean_target_canary_phase_evidence_missing");
  const passedPhases = phases.filter((phase) => clean(phase.status || "", 40) === "passed");
  if (passedPhases.length !== phases.length) issues.push("clean_target_canary_phase_not_passed");
  const hasFreshInstall = phases.some((phase) => (
    /fresh|install/i.test(clean(phase.id || "", 80)) && phase.tempRootRemoved === true
  ));
  const hasUpgrade = phases.some((phase) => (
    /upgrade/i.test(clean(phase.id || "", 80)) && phase.tempRootRemoved === true
  ));
  const hasProductionReadback = phases.some((phase) => phase.productionReadback === true);
  if (!hasFreshInstall) issues.push("clean_target_canary_fresh_install_phase_missing");
  if (!hasUpgrade) issues.push("clean_target_canary_upgrade_phase_missing");
  if (!hasProductionReadback) issues.push("clean_target_canary_production_readback_missing");
  return boundedStringList(issues, 12, 120);
}

function evaluateCleanTargetCanary(cleanTargetCanary = {}, cleanTargetEnvironment = {}) {
  const issues = [];
  for (const code of boundedStringList(cleanTargetCanary.issueCodes, 12, 120)) {
    issues.push({ code, phaseId: "clean_target_canary" });
  }
  if (cleanTargetCanary.status === "failed") {
    issues.push({ code: "clean_target_canary_failed", phaseId: "clean_target_canary" });
  }
  if (cleanTargetCanary.status === "passed" && cleanTargetEnvironment.status !== "ready") {
    issues.push({ code: "clean_target_environment_not_ready", phaseId: "clean_target_environment" });
  }
  if (cleanTargetCanary.status === "passed" && cleanTargetCanary.noCompletionClaim === true) {
    issues.push({ code: "clean_target_canary_completion_claim_conflict", phaseId: "clean_target_canary" });
  }
  return issues;
}

function phaseContract(fields = {}) {
  return {
    ownerLayer: clean(fields.ownerLayer, 120),
    stageIds: boundedStringList(fields.stageIds, 12, 80),
    evidenceKeys: boundedStringList(fields.evidenceKeys, 12, 80),
    closureReadbacks: boundedStringList(fields.closureReadbacks, 12, 120),
    requiredChecks: boundedStringList(fields.requiredChecks, 12, 160),
    privacyBoundary: clean(fields.privacyBoundary || "metadata_only_no_raw_secrets_or_payloads", 160),
  };
}

function defaultPhaseDefinitions(options = {}) {
  const nodeCommand = clean(options.nodeCommand || process.execPath, 500);
  const phases = [
    {
      id: "public_install_preflight",
      category: "fresh_install",
      command: nodeCommand,
      args: ["scripts/public-install-preflight.js", "--source-only", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "Home AI public install preflight",
        stageIds: ["source_preflight", "plugin_registration"],
        evidenceKeys: ["requiredPluginCount", "requiredSourceFileCount", "issueCount"],
        closureReadbacks: ["required public source files are present", "maintained plugin source inventory is bounded"],
        requiredChecks: ["node scripts/public-install-preflight.js --source-only --json"],
      }),
    },
    {
      id: "macos_install_phase_coverage",
      category: "fresh_install",
      command: nodeCommand,
      args: ["scripts/macos-install-phase-coverage-audit.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "macOS installer phase coverage",
        stageIds: [
          "owner_key_bootstrap",
          "home_ai_install",
          "hermes_agent_runtime",
          "provider_ingress",
          "plugin_registration",
          "gateway_profile_tool_schema",
        ],
        evidenceKeys: ["phaseCount", "issueCount"],
        closureReadbacks: ["installer phases include Owner/key, Home AI, Hermes Agent, plugin, Gateway, and provider boundaries"],
        requiredChecks: ["node scripts/macos-install-phase-coverage-audit.js --json"],
      }),
    },
    {
      id: "macos_fresh_install_rehearsal",
      category: "fresh_install",
      command: nodeCommand,
      args: ["scripts/macos-fresh-install-rehearsal.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "macOS fresh install rehearsal",
        stageIds: [
          "owner_key_bootstrap",
          "home_ai_install",
          "hermes_agent_runtime",
          "provider_ingress",
          "plugin_registration",
          "gateway_profile_tool_schema",
        ],
        evidenceKeys: ["phaseCount", "issueCount", "tempRemoved"],
        closureReadbacks: ["fresh install phases are rehearsed in a temporary root", "temporary rehearsal root is removed"],
        requiredChecks: ["node scripts/macos-fresh-install-rehearsal.js --json"],
      }),
    },
    {
      id: "macos_install_verification_classification",
      category: "fresh_install",
      command: nodeCommand,
      args: ["scripts/macos-install-verification-classification.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "macOS install verification classifier",
        stageIds: ["production_closure_readback", "hermes_agent_runtime", "provider_ingress"],
        evidenceKeys: ["phaseCount", "verificationClassCount", "liveRuntimeCount", "privilegedApplyCount"],
        closureReadbacks: ["live runtime and privileged apply phases are explicitly classified"],
        requiredChecks: ["node scripts/macos-install-verification-classification.js --json"],
      }),
    },
    {
      id: "macos_install_operator_closure",
      category: "fresh_install",
      command: nodeCommand,
      args: ["scripts/macos-install-operator-closure-checklist.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "macOS install operator closure checklist",
        stageIds: ["owner_key_bootstrap", "provider_ingress", "production_closure_readback"],
        evidenceKeys: ["phaseCount", "operatorClosureCount", "itemCount"],
        closureReadbacks: ["operator-visible closure items cover credentials, provider setup, and final readback"],
        requiredChecks: ["node scripts/macos-install-operator-closure-checklist.js --json"],
      }),
    },
    {
      id: "deploy_upgrade_lane_closure",
      category: "public_upgrade",
      command: nodeCommand,
      args: ["scripts/deploy-upgrade-lane-closure-smoke.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "deploy/upgrade lane closure gate",
        stageIds: [
          "public_upgrade_rehearsal",
          "hermes_agent_runtime",
          "provider_ingress",
          "plugin_registration",
          "plugin_mcp_schema_smoke",
          "production_closure_readback",
        ],
        evidenceKeys: ["issueCount", "publicUpgradeOk", "deployCardOk"],
        closureReadbacks: ["routine deploy cards are structured requests", "upgrade daily smoke covers plugin/Hermes Agent/provider closure"],
        requiredChecks: ["node scripts/deploy-upgrade-lane-closure-smoke.js --json"],
      }),
    },
    {
      id: "public_upgrade_rehearsal_plan",
      category: "public_upgrade",
      command: nodeCommand,
      args: ["scripts/homeai-public-upgrade-rehearsal.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "public upgrade rehearsal",
        stageIds: [
          "source_preflight",
          "public_upgrade_rehearsal",
          "hermes_agent_runtime",
          "provider_ingress",
          "plugin_registration",
          "production_closure_readback",
        ],
        evidenceKeys: ["actionCount", "productionWrites", "tempRootOnly"],
        closureReadbacks: ["upgrade plan is temp-root-only", "clone/adopt/deploy/closure actions are present"],
        requiredChecks: ["node scripts/homeai-public-upgrade-rehearsal.js --json"],
      }),
    },
    {
      id: "plugin_provisioning_coverage",
      category: "plugin_provisioning",
      command: nodeCommand,
      args: ["scripts/plugin-provisioning-coverage-audit.js", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "Home AI plugin provisioning coverage",
        stageIds: ["plugin_registration", "plugin_mcp_schema_smoke"],
        evidenceKeys: ["publicPluginCount", "hostProvisionedPublicCount", "specialPublicCount", "issueCount"],
        closureReadbacks: ["public plugin provisioning coverage is bounded", "special-case plugin count is explicit"],
        requiredChecks: ["node scripts/plugin-provisioning-coverage-audit.js --json"],
      }),
    },
    {
      id: "runtime_slo_audit",
      category: "self_improving_loop",
      command: nodeCommand,
      args: ["scripts/homeai-self-improving-loop.js", "--runtime-slo-audit", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "Home AI runtime SLO audit",
        stageIds: [
          "gateway_profile_tool_schema",
          "plugin_mcp_schema_smoke",
          "production_closure_readback",
        ],
        evidenceKeys: ["modelVersion", "signalCount", "issueCount"],
        closureReadbacks: ["Runtime SLO model includes install/upgrade, Gateway, plugin, and production closure signals"],
        requiredChecks: ["node scripts/homeai-self-improving-loop.js --runtime-slo-audit --json"],
      }),
    },
  ];
  if (options.executePublicRehearsal === true) {
    phases.push({
      id: "public_upgrade_rehearsal_execute",
      category: "public_upgrade",
      command: nodeCommand,
      args: ["scripts/homeai-public-upgrade-rehearsal.js", "--execute", "--json"],
      required: true,
      contract: phaseContract({
        ownerLayer: "public upgrade rehearsal execute smoke",
        stageIds: [
          "source_preflight",
          "public_upgrade_rehearsal",
          "hermes_agent_runtime",
          "provider_ingress",
          "plugin_registration",
          "production_closure_readback",
        ],
        evidenceKeys: [
          "stepCount",
          "tempRemoved",
          "publicUpgradeDailySmokeOk",
          "cloneActionCount",
          "deployActionCount",
        ],
        closureReadbacks: ["public repository clone/adopt/deploy rehearsal passes", "temporary clone root is removed"],
        requiredChecks: ["node scripts/homeai-public-upgrade-rehearsal.js --execute --json"],
      }),
    });
  }
  return phases;
}

function defaultRunProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxBuffer || 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        status: typeof error?.code === "number" ? error.code : (!error ? 0 : 1),
        stdout: String(stdout || ""),
        stderr: clean(stderr || error?.message || "", 1200),
      });
    });
  });
}

function parseJsonOutput(result = {}) {
  const stdout = String(result.stdout || "");
  const start = stdout.search(/[\[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch (_err) {
    return null;
  }
}

function commandPreview(phase = {}) {
  return [path.basename(clean(phase.command, 500)), ...(Array.isArray(phase.args) ? phase.args : [])].join(" ");
}

function summarizePhaseContract(phase = {}) {
  const contract = phase.contract || {};
  return {
    ownerLayer: clean(contract.ownerLayer, 120),
    stageIds: boundedStringList(contract.stageIds, 12, 80),
    evidenceKeys: boundedStringList(contract.evidenceKeys, 12, 80),
    closureReadbacks: boundedStringList(contract.closureReadbacks, 12, 120),
    requiredChecks: boundedStringList(contract.requiredChecks, 12, 160),
    privacyBoundary: clean(contract.privacyBoundary || "", 160),
  };
}

function validatePhaseContract(phase = {}) {
  const issues = [];
  const contract = summarizePhaseContract(phase);
  const knownStageIds = new Set(REQUIRED_STAGE_DEFINITIONS.map((stage) => stage.id));
  if (!contract.ownerLayer) issues.push({ code: "canary_phase_contract_owner_missing", phaseId: phase.id });
  if (!contract.stageIds.length) issues.push({ code: "canary_phase_contract_stage_missing", phaseId: phase.id });
  for (const stageId of contract.stageIds) {
    if (!knownStageIds.has(stageId)) issues.push({ code: "canary_phase_contract_unknown_stage", phaseId: phase.id, stageId });
  }
  if (!contract.evidenceKeys.length) issues.push({ code: "canary_phase_contract_evidence_missing", phaseId: phase.id });
  if (!contract.closureReadbacks.length) issues.push({ code: "canary_phase_contract_readback_missing", phaseId: phase.id });
  if (!contract.requiredChecks.length) issues.push({ code: "canary_phase_contract_check_missing", phaseId: phase.id });
  if (!contract.privacyBoundary) issues.push({ code: "canary_phase_contract_privacy_missing", phaseId: phase.id });
  return issues;
}

function buildStageLedger(phases = []) {
  const phaseList = Array.isArray(phases) ? phases : [];
  const phaseContracts = phaseList.map((phase) => ({
    id: clean(phase.id, 80),
    category: clean(phase.category, 80),
    required: phase.required === true,
    command: commandPreview(phase),
    contract: summarizePhaseContract(phase),
  }));
  const issues = [];
  for (const phase of phaseList) issues.push(...validatePhaseContract(phase));
  const stages = REQUIRED_STAGE_DEFINITIONS.map((stage) => {
    const coveringPhases = phaseContracts
      .filter((phase) => phase.contract.stageIds.includes(stage.id))
      .map((phase) => phase.id);
    return {
      id: stage.id,
      dimension: stage.dimension,
      covered: coveringPhases.length > 0,
      coveringPhases,
      description: stage.description,
    };
  });
  for (const stage of stages) {
    if (!stage.covered) issues.push({ code: "canary_required_stage_missing", stageId: stage.id });
  }
  return {
    ok: issues.length === 0,
    stageCount: stages.length,
    coveredStageCount: stages.filter((stage) => stage.covered).length,
    missingStageIds: stages.filter((stage) => !stage.covered).map((stage) => stage.id),
    stages,
    phaseContracts,
    issues,
  };
}

function summarizePayload(phase = {}, payload = {}, result = {}) {
  const base = {
    ok: payload?.ok === true || result.ok === true,
    status: boundedNumber(result.status, result.ok === true ? 0 : 1),
  };
  if (phase.id === "public_install_preflight") {
    return Object.assign(base, {
      issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
      requiredPluginCount: boundedNumber(payload.requiredPluginCount),
      requiredSourceFileCount: boundedNumber(payload.requiredSourceFileCount),
    });
  }
  if (phase.id === "macos_install_phase_coverage") {
    return Object.assign(base, {
      phaseCount: boundedNumber(payload.phaseCount),
      issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
    });
  }
  if (phase.id === "macos_fresh_install_rehearsal") {
    return Object.assign(base, {
      phaseCount: boundedNumber(payload.phaseCount),
      issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
      tempRemoved: payload.tempRemoved === true,
    });
  }
  if (phase.id === "macos_install_verification_classification") {
    return Object.assign(base, {
      phaseCount: boundedNumber(payload.phaseCount),
      verificationClassCount: Array.isArray(payload.verificationClasses) ? payload.verificationClasses.length : 0,
      liveRuntimeCount: boundedNumber(payload.classCounts?.live_runtime),
      privilegedApplyCount: boundedNumber(payload.classCounts?.privileged_apply),
    });
  }
  if (phase.id === "macos_install_operator_closure") {
    return Object.assign(base, {
      phaseCount: boundedNumber(payload.phaseCount),
      operatorClosureCount: boundedNumber(payload.operatorClosureCount),
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
    });
  }
  if (phase.id === "deploy_upgrade_lane_closure") {
    return Object.assign(base, {
      issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
      publicUpgradeOk: payload.publicUpgrade?.ok === true,
      deployCardOk: payload.deployCard?.validRequestOk === true,
    });
  }
  if (phase.id === "public_upgrade_rehearsal_plan") {
    return Object.assign(base, {
      actionCount: boundedNumber(payload.actionCount),
      productionWrites: payload.policy?.productionWrites === true,
      tempRootOnly: payload.policy?.tempRootOnly === true,
    });
  }
  if (phase.id === "public_upgrade_rehearsal_execute") {
    const dailySmoke = summarizePublicUpgradeDailySmoke(payload);
    return Object.assign(base, {
      stepCount: boundedNumber(payload.stepCount),
      tempRemoved: payload.tempRemoved === true,
      publicUpgradeDailySmokeOk: dailySmoke.ok === true,
      publicUpgradeDailySmokeError: dailySmoke.error || "",
      pluginCount: boundedNumber(dailySmoke.metadata?.pluginCount),
      cloneActionCount: boundedNumber(dailySmoke.metadata?.cloneActionCount),
      deployActionCount: boundedNumber(dailySmoke.metadata?.deployActionCount),
    });
  }
  if (phase.id === "plugin_provisioning_coverage") {
    return Object.assign(base, {
      publicPluginCount: boundedNumber(payload.publicPluginCount),
      hostProvisionedPublicCount: boundedNumber(payload.hostProvisionedPublicCount),
      specialPublicCount: boundedNumber(payload.specialPublicCount),
      issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
    });
  }
  if (phase.id === "runtime_slo_audit") {
    return Object.assign(base, {
      modelVersion: clean(payload.modelVersion || payload.sloModel?.modelVersion, 120),
      signalCount: boundedNumber(payload.signalCount || payload.sloCount),
      issueCount: boundedNumber(payload.issueCount, Array.isArray(payload.issues) ? payload.issues.length : 0),
    });
  }
  return base;
}

function evaluatePhase(phase = {}, result = {}, payload = null) {
  const issues = [];
  if (result.ok !== true) {
    issues.push({ code: "canary_phase_command_failed", phaseId: phase.id, status: boundedNumber(result.status, 1) });
  }
  if (!payload || typeof payload !== "object") {
    issues.push({ code: "canary_phase_json_missing", phaseId: phase.id });
  } else if (payload.ok !== true) {
    issues.push({ code: "canary_phase_report_not_ok", phaseId: phase.id, error: clean(payload.error || payload.issues?.[0]?.code || "", 160) });
  }
  if (phase.id === "public_upgrade_rehearsal_execute") {
    const summary = summarizePublicUpgradeDailySmoke(payload || {});
    if (summary.ok !== true) issues.push({ code: summary.error || "public_upgrade_daily_smoke_failed", phaseId: phase.id });
  }
  return issues;
}

function buildPlan(options = {}) {
  const phases = defaultPhaseDefinitions(options);
  const stageLedger = buildStageLedger(phases);
  const cleanTargetEnvironment = summarizeCleanTargetEnvironment(
    options.cleanTargetEnvironment,
    options.env,
  );
  return {
    ok: stageLedger.ok === true,
    schemaVersion: 1,
    canaryVersion: CANARY_VERSION,
    mode: "plan",
    executionClass: "source_safe_plan",
    closureStatus: "partial",
    generatedAt: clean(options.nowIso || new Date().toISOString(), 80),
    phaseCount: phases.length,
    phases: phases.map((phase) => ({
      id: phase.id,
      category: phase.category,
      required: phase.required === true,
      command: commandPreview(phase),
      contract: summarizePhaseContract(phase),
    })),
    stageCoverage: {
      stageCount: stageLedger.stageCount,
      coveredStageCount: stageLedger.coveredStageCount,
      missingStageIds: stageLedger.missingStageIds,
      stages: stageLedger.stages,
    },
    issues: stageLedger.issues,
    cleanTargetEnvironment,
    cleanTargetCanary: normalizeCleanTargetCanary(options.cleanTargetReadback),
    policy: {
      defaultProductionWrites: false,
      defaultNetworkClone: false,
      executePublicRehearsalRequiresExplicitFlag: true,
      localExecuteIsSourceSafeRehearsalOnly: true,
      cleanTargetCanaryRequiredForCompletion: true,
      laneOnlyCleanTargetExecution: true,
      rawSecretsInOutput: false,
    },
  };
}

function createHomeAiInstallUpgradeCanaryService(options = {}) {
  const runProcess = options.runProcess || defaultRunProcess;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const cwd = options.cwd || process.cwd();

  async function executeCanary(executeOptions = {}) {
    if (executeOptions.execute !== true) return buildPlan(executeOptions);
    const phases = defaultPhaseDefinitions(executeOptions);
    const stageLedger = buildStageLedger(phases);
    const cleanTargetEnvironment = summarizeCleanTargetEnvironment(
      executeOptions.cleanTargetEnvironment,
      executeOptions.env,
    );
    const cleanTargetCanary = normalizeCleanTargetCanary(executeOptions.cleanTargetReadback);
    const steps = [];
    const issues = [...stageLedger.issues, ...evaluateCleanTargetCanary(cleanTargetCanary, cleanTargetEnvironment)];
    for (const phase of phases) {
      const result = await runProcess(phase.command, phase.args, {
        cwd,
        timeoutMs: executeOptions.timeoutMs || timeoutMs,
      });
      const payload = parseJsonOutput(result);
      const stepIssues = evaluatePhase(phase, result, payload);
      issues.push(...stepIssues);
      steps.push({
        id: phase.id,
        category: phase.category,
        ok: stepIssues.length === 0,
        command: commandPreview(phase),
        contract: summarizePhaseContract(phase),
        summary: summarizePayload(phase, payload || {}, result || {}),
        issueCodes: stepIssues.map((issue) => issue.code),
      });
    }
    const categories = {};
    for (const step of steps) {
      if (!categories[step.category]) categories[step.category] = { ok: true, passed: 0, failed: 0 };
      if (step.ok) categories[step.category].passed += 1;
      else {
        categories[step.category].failed += 1;
        categories[step.category].ok = false;
      }
    }
    const cleanTargetComplete = cleanTargetCanary.status === "passed"
      && cleanTargetCanary.noCompletionClaim === false
      && cleanTargetEnvironment.status === "ready"
      && issues.length === 0;
    return {
      ok: issues.length === 0,
      schemaVersion: 1,
      canaryVersion: CANARY_VERSION,
      mode: "execute",
      executionClass: "source_safe_rehearsal",
      closureStatus: cleanTargetComplete ? "complete" : "partial",
      generatedAt: clean(executeOptions.nowIso || new Date().toISOString(), 80),
      phaseCount: steps.length,
      passedPhaseCount: steps.filter((step) => step.ok).length,
      failedPhaseCount: steps.filter((step) => !step.ok).length,
      categories,
      issues,
      stageCoverage: {
        stageCount: stageLedger.stageCount,
        coveredStageCount: stageLedger.coveredStageCount,
        missingStageIds: stageLedger.missingStageIds,
        stages: stageLedger.stages,
      },
      cleanTargetEnvironment,
      cleanTargetCanary,
      steps,
      policy: {
        productionWrites: false,
        networkClone: executeOptions.executePublicRehearsal === true,
        localExecuteIsSourceSafeRehearsalOnly: true,
        cleanTargetCanaryRequiredForCompletion: true,
        laneOnlyCleanTargetExecution: true,
        rawSecretsInOutput: false,
      },
    };
  }

  return Object.freeze({
    buildPlan,
    executeCanary,
  });
}

module.exports = {
  CANARY_VERSION,
  REQUIRED_STAGE_DEFINITIONS,
  buildStageLedger,
  buildPlan,
  createHomeAiInstallUpgradeCanaryService,
  defaultPhaseDefinitions,
  evaluatePhase,
  normalizeCleanTargetCanary,
  summarizeCleanTargetEnvironment,
  summarizePhaseContract,
  summarizePayload,
  validateCleanTargetReadbackEvidence,
  validatePhaseContract,
};
