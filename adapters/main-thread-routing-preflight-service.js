"use strict";

const {
  validateThreadDispatchTarget,
} = require("./worker-lane-scheduler-service");

const PREFLIGHT_VERSION = "20260704-main-thread-routing-preflight-v1";

const HOME_AI_WORKSPACE = "/Users/example/path";

const PLUGIN_HINTS = [
  "codex mobile",
  "codex-mobile",
  "movie",
  "music",
  "finance",
  "wardrobe",
  "note",
  "email",
  "growth",
  "healthy",
  "health",
  "chatgpt pro",
  "插件",
];

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function lower(value, max = 1000) {
  return clean(value, max).toLowerCase();
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function boolValue(value, fallback = false) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function issue(code, detail = "") {
  return {
    code: clean(code, 120),
    detail: clean(detail, 300),
  };
}

function reason(code, detail = "") {
  return {
    code: clean(code, 120),
    detail: clean(detail, 320),
  };
}

function normalizedChangedFiles(input = {}) {
  return arrayValue(input.changedFiles || input.changedFile || input.changed_file)
    .flatMap((item) => String(item || "").split(","))
    .map((item) => clean(item, 600))
    .filter(Boolean)
    .slice(0, 40);
}

function hasSourceFile(files = []) {
  return files.some((file) => {
    const value = lower(file, 600);
    if (!value) return false;
    if (/\.(md|markdown|txt)$/.test(value)) return false;
    return /\.(js|mjs|cjs|ts|tsx|jsx|json|sh|ps1|py|swift|html|css)$/.test(value);
  });
}

function hasPluginChangedFile(files = []) {
  return files.some((file) => /(^|\/)(plugins|Movie)(\/|$)/i.test(file));
}

function hasHomeAiChangedFile(files = []) {
  return files.some((file) => file === HOME_AI_WORKSPACE || file.startsWith(`${HOME_AI_WORKSPACE}/`) || /^adapters\/|^server-routes\/|^scripts\/|^tests\/|^docs\//.test(file));
}

function textIncludesAny(text, values = []) {
  return values.some((value) => text.includes(value));
}

function isSimpleStatusOrAnswer(text, files = []) {
  if (files.length) return false;
  if (!text) return false;
  if (/(修复|实现|修改|新增|删除|部署|发卡|dispatch|implement|repair|fix|change|edit|deploy|restart|install|test|run|commit|push)/i.test(text)) {
    return false;
  }
  return /(status|what is|why|explain|question|answer|summary|current state|进度|状态|说明|解释|问题|回答|现在怎么样)/i.test(text);
}

function isFinalMergeOrVerification(text) {
  return /(worker|return card|任务卡返回|worker 返回|merge returned|合并返回|final merge|source merge|最终合并|verification after worker|return evidence)/i.test(text);
}

function isCoordinatorOnly(text, files = []) {
  if (hasSourceFile(files)) return false;
  return /(route card|routing decision|handoff only|coordinator[- ]only|scheduler only|dispatch only|只发卡|只路由|只更新 handoff|仅协调|协调状态|返回来源线程)/i.test(text);
}

function cannotSafelyDelegate(text) {
  return /(cannot safely delegate|must stay inline|local-only secret boundary|无法安全委派|不能委派|必须在主线程)/i.test(text);
}

function isDeployRequest(text) {
  return /(routine plugin deploy|plugin deployment|deploy lane|deploy\/readback|deploy and readback|production deploy|restart launchd|部署读回|部署 lane|插件部署|生产部署|上线|重启)/i.test(text);
}

function isExplicitPluginLoop(text) {
  if (/(不是|非|不要|不用)\s*(?:@?loop|循环)|普通卡|normal card/i.test(text)) return false;
  return /@loop|\bloop\s*(?:card|task|workflow)\b|loop\s*卡|loop\s*任务|循环任务|循环卡|三线程|three[- ]role|role loop|发\s*loop/i.test(text);
}

function isExplicitPluginMain(text) {
  return /(plugin main|plugin source|插件主线程|插件源线程|requirements|需求分析|需求设计|普通卡|normal card|发卡给.*插件|send .*card.*plugin)/i.test(text);
}

function isPluginOwned(text, files = []) {
  if (hasPluginChangedFile(files)) return true;
  return textIncludesAny(text, PLUGIN_HINTS);
}

function isNonTrivialImplementation(text, files = []) {
  if (hasSourceFile(files)) return true;
  return /(implement|repair|fix|change|edit|add|create|remove|refactor|test|harness|source|module|approval should auto-dispatch|auto-dispatch|修复|实现|修改|新增|重构|模块|源码|审批.*自动发卡|自动发卡)/i.test(text);
}

function targetAvailability(input = {}, key) {
  const targets = input.targets && typeof input.targets === "object" ? input.targets : {};
  const value = input[`${key}TargetAvailable`] ?? input[`${key}_target_available`] ?? targets[key];
  return boolValue(value, true);
}

function requiredFieldsFor(classification) {
  if (classification === "worker") {
    return [
      "sourceThreadId",
      "targetThreadId",
      "targetWorkspace",
      "allowedFilesOrBoundary",
      "expectedValidation",
      "terminalReturnRequired",
      "terminalReturnLanguageZhCn",
      "taskCardHeartbeatRequired",
      "taskCardWatchdogTimeoutMs",
      "taskCardWatchdogBatchLimit",
      "taskCardWatchdogMaxAutoResume",
      "reasoningEffort",
      "privacyBoundary",
      "conflictRule",
    ];
  }
  if (classification === "plugin_worker") {
    return [
      "sourceThreadId",
      "targetThreadId",
      "targetWorkspace",
      "pluginId",
      "allowedFilesOrBoundary",
      "expectedValidation",
      "terminalReturnRequired",
      "terminalReturnLanguageZhCn",
      "taskCardHeartbeatRequired",
      "taskCardWatchdogTimeoutMs",
      "taskCardWatchdogBatchLimit",
      "taskCardWatchdogMaxAutoResume",
      "reasoningEffort",
      "privacyBoundary",
      "conflictRule",
    ];
  }
  if (classification === "plugin_main" || classification === "plugin_loop") {
    return [
      "sourceThreadId",
      "pluginId",
      "pluginSourceThreadId",
      "targetWorkspace",
      "cardKind",
      "requirementsBoundary",
      "terminalReturnRequired",
      "privacyBoundary",
    ];
  }
  if (classification === "deploy_lane") {
    return [
      "sourceThreadId",
      "deployLaneThreadId",
      "pluginId",
      "sourceRefOrCommit",
      "deployPlan",
      "healthReadback",
      "terminalReturnRequired",
      "privacyBoundary",
    ];
  }
  return [];
}

function baseOutput(input = {}) {
  const task = clean(input.task || input.text || input.objective, 1200);
  const changedFiles = normalizedChangedFiles(input);
  const mode = lower(input.mode || "classify", 40) || "classify";
  return {
    ok: true,
    schemaVersion: 1,
    version: PREFLIGHT_VERSION,
    source: "main_thread_routing_preflight_service",
    advisoryOnly: true,
    runtimeEnforced: false,
    mode,
    taskPreview: clean(task, 240),
    changedFiles,
    classification: "",
    reasonCode: "",
    inlineAllowed: false,
    implementationMayProceedInline: false,
    routingDecisionRequiredBeforeImplementation: true,
    requiredCardFields: [],
    issues: [],
    reasons: [],
    policy: {
      boundedMetadataOnly: true,
      noInlineForIndependentSourceChanges: true,
      completedLatestTurnIsNotNonDeliverable: true,
    },
  };
}

function finalize(output, classification, reasonCode, detail = "") {
  output.classification = classification;
  output.reasonCode = reasonCode;
  output.inlineAllowed = classification === "inline";
  output.implementationMayProceedInline = classification === "inline";
  output.routingDecisionRequiredBeforeImplementation = classification !== "inline";
  output.requiredCardFields = requiredFieldsFor(classification);
  output.reasons.push(reason(reasonCode, detail));
  if (classification === "blocked") {
    output.ok = false;
    output.implementationMayProceedInline = false;
  }
  return output;
}

function applyEnforcement(output, input = {}) {
  const mode = lower(output.mode, 40);
  const decisionRecorded = boolValue(input.routingDecisionRecorded ?? input.routing_decision_recorded, false);
  if (mode !== "enforce") return output;
  if (output.classification === "inline" || output.classification === "blocked") return output;
  if (decisionRecorded) {
    const validation = validateThreadDispatchTarget({
      sourceThreadId: input.sourceThreadId || input.source_thread_id,
      targetThreadId: input.targetThreadId || input.target_thread_id,
      targetThreadTitle: input.targetThreadTitle || input.target_thread_title,
      targetCwd: input.targetCwd || input.target_cwd || input.targetWorkspace || input.target_workspace,
      targetThreadPurpose: input.targetThreadPurpose || input.target_thread_purpose,
      targetThreadRole: input.targetThreadRole || input.target_thread_role,
      targetThreadStatus: input.targetThreadStatus || input.target_thread_status,
      targetThreadVisible: input.targetThreadVisible ?? input.target_thread_visible,
      targetThreadDeliverable: input.targetThreadDeliverable ?? input.target_thread_deliverable,
      targetThreadCanReceiveTaskCards: input.targetThreadCanReceiveTaskCards ?? input.target_thread_can_receive_task_cards,
      targetThreadArchived: input.targetThreadArchived ?? input.target_thread_archived,
      targetThreadDeleted: input.targetThreadDeleted ?? input.target_thread_deleted,
      targetThreadClosed: input.targetThreadClosed ?? input.target_thread_closed,
      targetThreadHidden: input.targetThreadHidden ?? input.target_thread_hidden,
      dispatchKind: input.dispatchKind || input.dispatch_kind || dispatchKindForClassification(output.classification),
    });
    output.routingTargetValidation = validation;
    if (validation.ok) return output;
    output.ok = false;
    output.implementationMayProceedInline = false;
    output.issues.push(issue(validation.code || "routing_target_invalid", validation.detail || "Routing target is not valid for this task."));
    return output;
  }
  output.ok = false;
  output.implementationMayProceedInline = false;
  output.issues.push(issue(
    "routing_decision_missing_before_implementation",
    "This task requires a Worker/plugin/deploy routing decision before implementation edits.",
  ));
  return output;
}

function dispatchKindForClassification(classification = "") {
  if (classification === "worker") return "home_ai_worker";
  if (classification === "plugin_worker") return "plugin_worker";
  if (classification === "deploy_lane") return "plugin_deployment";
  if (classification === "plugin_main") return "plugin_requirements";
  if (classification === "plugin_loop") return "loop_implementation";
  return classification;
}

function buildMainThreadRoutingPreflight(input = {}) {
  const output = baseOutput(input);
  const task = clean(input.task || input.text || input.objective, 1200);
  const text = lower(task, 1200);
  const files = output.changedFiles;
  const sourceThreadRole = lower(input.sourceThreadRole || input.source_thread_role || "", 120);
  const pluginMainSource = /(^|[_\s-])plugin[_\s-]?main($|[_\s-])|plugin[_\s-]?source|workspace[_\s-]?implementation/.test(sourceThreadRole);

  if (!text && !files.length) {
    return applyEnforcement(finalize(
      output,
      "blocked",
      "task_missing",
      "A main-thread routing preflight requires task text or a changed-file hint.",
    ), input);
  }

  if (isDeployRequest(text)) {
    const next = targetAvailability(input, "deployLane")
      ? finalize(output, "deploy_lane", "routine_plugin_deploy_lane_required", "Routine plugin deployment, restart, or production readback belongs to a deploy lane.")
      : finalize(output, "blocked", "deploy_lane_target_unavailable", "A deploy-lane task was detected but no deploy lane target is available.");
    return applyEnforcement(next, input);
  }

  const pluginOwned = isPluginOwned(text, files);
  if (pluginMainSource && pluginOwned && isNonTrivialImplementation(text, files) && !isExplicitPluginLoop(text)) {
    const next = targetAvailability(input, "pluginWorker")
      ? finalize(output, "plugin_worker", "plugin_worker_required", "Plugin main-thread source repair, investigation, review, or harness work requires a bounded plugin Worker routing decision before implementation edits.")
      : finalize(output, "blocked", "plugin_worker_target_unavailable", "Plugin main-thread source work requires a plugin Worker target; Task Intake, deploy, audit, Loop, and inline implementation are forbidden replacement targets.");
    return applyEnforcement(next, input);
  }

  if (pluginOwned && isExplicitPluginLoop(text)) {
    const next = targetAvailability(input, "pluginLoop")
      ? finalize(output, "plugin_loop", "plugin_loop_required", "Explicit plugin Loop requests route to the plugin source thread and Codex Mobile Loop runtime.")
      : finalize(output, "blocked", "plugin_loop_target_unavailable", "A plugin Loop request was detected but no plugin Loop/source target is available.");
    return applyEnforcement(next, input);
  }

  if (pluginOwned && isExplicitPluginMain(text)) {
    const next = targetAvailability(input, "pluginMain")
      ? finalize(output, "plugin_main", "plugin_main_requirements_required", "Explicit normal plugin cards route to the plugin main/source thread for requirements analysis.")
      : finalize(output, "blocked", "plugin_main_target_unavailable", "A plugin main/source request was detected but no plugin source target is available.");
    return applyEnforcement(next, input);
  }

  if (isSimpleStatusOrAnswer(text, files)) {
    return applyEnforcement(finalize(output, "inline", "simple_status_or_answer", "Status, explanation, and simple answer tasks may stay inline."), input);
  }

  if (isFinalMergeOrVerification(text) && !hasSourceFile(files)) {
    return applyEnforcement(finalize(output, "inline", "final_merge_or_verification_after_worker_return", "Final merge or verification after a Worker return may stay in the coordinator thread."), input);
  }

  if (cannotSafelyDelegate(text)) {
    return applyEnforcement(finalize(output, "inline", "cannot_safely_delegate", "The task states a safety or authority reason to keep the work inline."), input);
  }

  if (isCoordinatorOnly(text, files)) {
    return applyEnforcement(finalize(output, "inline", "coordinator_only_work", "Coordinator-only routing, handoff, or return-card work may stay inline."), input);
  }

  if (isNonTrivialImplementation(text, files) || hasHomeAiChangedFile(files)) {
    const next = targetAvailability(input, "worker")
      ? finalize(output, "worker", "home_ai_worker_required", "Independent or non-trivial source/module changes require a bounded Worker routing decision before implementation edits.")
      : finalize(output, "blocked", "worker_required_target_unavailable", "Independent or non-trivial source/module work requires a Worker target; do not fall back to inline.");
    return applyEnforcement(next, input);
  }

  return applyEnforcement(finalize(output, "inline", "small_coordinator_or_answer", "No independent source change, plugin, Loop, or deployment signal was detected."), input);
}

module.exports = {
  PREFLIGHT_VERSION,
  buildMainThreadRoutingPreflight,
};
