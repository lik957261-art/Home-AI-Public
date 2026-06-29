"use strict";

const SEVERITY_RANK = Object.freeze({ info: 0, H4: 1, H3: 2, H2: 3, H1: 4 });

const APP_WORKSPACE = "/Users/example/path";
const HOME_AI_TASK_INTAKE_THREAD_TITLE = "Home AI Task Intake";

const DEFAULT_PLUGIN_TARGETS = Object.freeze({
  finance: Object.freeze({
    label: "Finance",
    targetThreadTitle: "记账",
    targetWorkspace: "/Users/example/path",
  }),
  wardrobe: Object.freeze({
    label: "Wardrobe",
    targetThreadTitle: "男装衣橱",
    targetWorkspace: "/Users/example/path",
  }),
  note: Object.freeze({
    label: "Note",
    targetThreadTitle: "Note",
    targetWorkspace: "/Users/example/path",
  }),
  music: Object.freeze({
    label: "Music",
    targetThreadId: "019ef42b-2cb8-7332-ab17-033ec5b48947",
    targetThreadTitle: "Music 06-23",
    targetWorkspace: "/Users/example/path",
  }),
  growth: Object.freeze({
    label: "Growth",
    targetThreadId: "019eda10-3b92-7d81-92f4-5e5cf578f52b",
    targetThreadTitle: "成长 06-18",
    targetWorkspace: "/Users/example/path",
  }),
  health: Object.freeze({
    label: "Health",
    targetThreadId: "019ea9d5-8f99-7d92-90a2-e9ae094a7977",
    targetThreadTitle: "健康",
    targetWorkspace: "/Users/example/path",
  }),
  healthy: Object.freeze({
    label: "Health",
    targetThreadId: "019ea9d5-8f99-7d92-90a2-e9ae094a7977",
    targetThreadTitle: "健康",
    targetWorkspace: "/Users/example/path",
  }),
  email: Object.freeze({
    label: "Email",
    targetThreadTitle: "Email",
    targetWorkspace: "/Users/example/path",
  }),
  moira: Object.freeze({
    label: "Moira",
    targetThreadId: "019ec3c0-86d2-7852-a9ea-e4c703262cdc",
    targetThreadTitle: "星盘 06-14",
    targetWorkspace: "/Users/example/path",
  }),
  movie: Object.freeze({
    label: "Movie",
    targetThreadId: "019efca1-ea69-7292-87b7-025ba023ca87",
    targetThreadTitle: "Movie",
    targetWorkspace: "/Users/example/path",
  }),
  "home-ai": Object.freeze({
    label: "Home AI",
    sourceThreadTitle: HOME_AI_TASK_INTAKE_THREAD_TITLE,
    sourceThreadTitlePrefix: HOME_AI_TASK_INTAKE_THREAD_TITLE,
    targetThreadTitlePrefix: "Home AI",
    targetWorkspace: APP_WORKSPACE,
  }),
  homeai: Object.freeze({
    label: "Home AI",
    sourceThreadTitle: HOME_AI_TASK_INTAKE_THREAD_TITLE,
    sourceThreadTitlePrefix: HOME_AI_TASK_INTAKE_THREAD_TITLE,
    targetThreadTitlePrefix: "Home AI",
    targetWorkspace: APP_WORKSPACE,
  }),
  "codex-mobile": Object.freeze({
    label: "Codex Mobile Web",
    targetThreadId: "019eee6c-a6f5-7b20-bfb4-f96ccb6431b3",
    targetThreadTitle: "codex mobile 06-22",
    targetWorkspace: "/Users/example/path",
  }),
});

const HOME_AI_TARGET = Object.freeze({
  label: "Home AI",
  sourceThreadTitle: HOME_AI_TASK_INTAKE_THREAD_TITLE,
  sourceThreadTitlePrefix: HOME_AI_TASK_INTAKE_THREAD_TITLE,
  targetThreadTitlePrefix: "Home AI",
  targetWorkspace: APP_WORKSPACE,
});

const HOME_AI_OWNED_RE = /gateway|toolset|mcp|schema|workspace.?binding|grant|provision|host.?proxy|same.?origin|launch.?token|plugin.?manifest|static.?cache|service.?worker|embedded.?shell|iframe.?host|authorization|permission/i;
const HIGH_RISK_RE = /physical|device.?control|projector|shutter|power.?off|delete|destructive|migration|payment|credential|secret|key.?rotation/i;

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeToken(value, fallback = "unknown", maxLength = 100) {
  const text = cleanString(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
}

function normalizeSeverity(value) {
  const raw = cleanString(value || "H3", 20).toUpperCase();
  if (raw === "H1" || raw === "H2" || raw === "H3" || raw === "H4") return raw;
  if (raw === "INFO") return "info";
  return "H3";
}

function severityRank(value) {
  return SEVERITY_RANK[normalizeSeverity(value)] || 0;
}

function isCaseClosed(status) {
  return ["card_sent", "closed", "suppressed", "expired"].includes(cleanString(status, 80));
}

function compactJson(value, maxLength = 1200) {
  const text = JSON.stringify(value || {});
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 20)}...[truncated]`;
}

function publicEventDigest(event) {
  return {
    event_id: cleanString(event?.event_id, 120),
    created_at: cleanString(event?.created_at, 80),
    severity: normalizeSeverity(event?.severity),
    confidence: Number(event?.confidence || 0),
    event_hash: cleanString(event?.event_hash, 80),
    privacy_class: cleanString(event?.privacy_class, 80),
    error_code: cleanString(event?.payload?.error_code, 120),
    status_code: cleanString(event?.payload?.status_code, 80),
    duration_bucket: cleanString(event?.payload?.duration_bucket, 80),
    breadcrumb_count: Array.isArray(event?.evidence?.breadcrumbs) ? event.evidence.breadcrumbs.length : 0,
  };
}

function caseConfidence(caseRecord, events) {
  const values = (events || []).map((event) => Number(event?.confidence || 0)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : Number(caseRecord?.routing?.confidence || 0);
}

function privacyLooksUnsafe(caseRecord, events) {
  const raw = JSON.stringify({ caseRecord, events });
  const privateKeyBlock = new RegExp(["BEGIN OPENSSH", "PRIVATE KEY"].join(" "), "i");
  return privateKeyBlock.test(raw) || /Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,}|raw_content_included"\s*:\s*true|raw_secrets_included"\s*:\s*true|raw_images_included"\s*:\s*true/i.test(raw);
}

function normalizedPluginId(caseRecord) {
  const pluginId = safeToken(caseRecord?.plugin_id || caseRecord?.pluginId || "home-ai", "home-ai", 80);
  if (pluginId === "healthy") return "health";
  return pluginId;
}

function isSelfCheckDiagnosticCase(caseRecord = {}) {
  return normalizedPluginId(caseRecord) === "home-ai"
    && cleanString(caseRecord?.source_surface || caseRecord?.sourceSurface, 120) === "home-ai-self-check"
    && cleanString(caseRecord?.diagnostic_type || caseRecord?.diagnosticType, 160) === "self_check_signal_failed"
    && cleanString(caseRecord?.category, 160).startsWith("self_check_");
}

function owningLayerForCase(caseRecord) {
  const pluginId = normalizedPluginId(caseRecord);
  const haystack = [
    caseRecord?.diagnostic_type,
    caseRecord?.category,
    caseRecord?.summary,
    caseRecord?.route,
  ].map((item) => cleanString(item, 240)).join(" ");
  if (pluginId === "home-ai" || HOME_AI_OWNED_RE.test(haystack)) {
    if (/gateway|toolset|mcp|schema/i.test(haystack)) return "home-ai-gateway-toolset";
    if (/host.?proxy|same.?origin|iframe.?host|embedded.?shell|manifest|launch.?token|authorization|permission/i.test(haystack)) {
      return "home-ai-plugin-host";
    }
    return "home-ai-platform";
  }
  return "plugin-runtime";
}

function targetForLayer(caseRecord, targets = {}) {
  const pluginId = normalizedPluginId(caseRecord);
  const layer = owningLayerForCase(caseRecord);
  if (layer.startsWith("home-ai")) {
    return { kind: "home-ai", pluginId, owningLayer: layer, target: HOME_AI_TARGET };
  }
  const target = Object.assign({}, DEFAULT_PLUGIN_TARGETS, targets)[pluginId];
  return { kind: "plugin", pluginId, owningLayer: layer, target: target || null };
}

function evidencePacket(caseRecord, events) {
  const confidence = caseConfidence(caseRecord, events);
  return {
    case_id: cleanString(caseRecord?.case_id || caseRecord?.caseId, 120),
    status: cleanString(caseRecord?.status, 80),
    severity: normalizeSeverity(caseRecord?.severity),
    confidence,
    event_count: Number(caseRecord?.event_count || 0),
    workspace_id: cleanString(caseRecord?.workspace_id || caseRecord?.workspaceId, 120),
    plugin_id: normalizedPluginId(caseRecord),
    source_surface: cleanString(caseRecord?.source_surface || caseRecord?.sourceSurface, 100),
    diagnostic_type: cleanString(caseRecord?.diagnostic_type || caseRecord?.diagnosticType, 140),
    category: cleanString(caseRecord?.category, 140),
    route: cleanString(caseRecord?.route, 240),
    build_id: cleanString(caseRecord?.build_id || caseRecord?.buildId, 180),
    summary: cleanString(caseRecord?.summary, 200),
    latest_event_id: cleanString(caseRecord?.latest_event_id || caseRecord?.latestEventId, 120),
    event_digests: (events || []).slice(0, 6).map(publicEventDigest),
  };
}

function remediationEligible(caseRecord, events) {
  const reasons = [];
  const confidence = caseConfidence(caseRecord, events);
  const severity = normalizeSeverity(caseRecord?.severity);
  const categoryText = [
    caseRecord?.diagnostic_type,
    caseRecord?.category,
    caseRecord?.summary,
  ].join(" ");
  if (isCaseClosed(caseRecord?.status)) reasons.push("case_terminal_status");
  if (severityRank(severity) < severityRank("H2")) reasons.push("severity_below_h2");
  if (confidence < 0.7 && cleanString(caseRecord?.status) !== "card_candidate") reasons.push("confidence_below_0_7");
  if (privacyLooksUnsafe(caseRecord, events)) reasons.push("unsafe_privacy_markers");
  if (HIGH_RISK_RE.test(categoryText)) reasons.push("requires_owner_approval_high_risk");
  const target = targetForLayer(caseRecord);
  if (!target.target) reasons.push("target_workspace_unknown");
  return {
    eligible: reasons.length === 0,
    blockedReasons: reasons,
  };
}

function taskTitle(packet, targetInfo) {
  const label = targetInfo.target?.label || packet.plugin_id || "Home AI";
  const category = packet.category || packet.diagnostic_type || "diagnostic";
  return `Repair ${label} diagnostic ${category}`;
}

function taskSummary(packet, targetInfo) {
  return cleanString(`${packet.plugin_id} ${packet.category || packet.diagnostic_type} ${packet.severity} case ${packet.case_id}`, 360);
}

function taskBody(packet, targetInfo, options = {}) {
  const target = targetInfo.target || {};
  const sourceThread = cleanString(options.sourceThreadTitle || "Home AI diagnostic remediation", 160);
  const evidence = compactJson(packet, 2200);
  return [
    "# AI Ops Diagnostic Remediation Task",
    "",
    `Source: ${sourceThread}`,
    `Diagnostic case: \`${packet.case_id}\``,
    `Owning layer hypothesis: \`${targetInfo.owningLayer}\``,
    `Target workspace: \`${target.targetWorkspace || ""}\``,
    "",
    "## Bounded Evidence",
    "",
    "```json",
    evidence,
    "```",
    "",
    "## Required Work",
    "",
    "1. Reproduce or invalidate the diagnostic using bounded local evidence only.",
    "2. Inspect only the logs needed for this case and summarize them; do not paste raw logs.",
    "3. Identify the failing layer, violated invariant, and root cause or strongest hypothesis.",
    "4. Fix the owning layer rather than adding a silent fallback.",
    "5. Add or update focused tests/harnesses for the repaired path.",
    "6. If runtime behavior changed, deploy through the established central/plugin deployment contract and include production readback.",
    "7. Return a real task card to the source with completed, blocked, redirected, rejected, or partially_completed status.",
    "",
    "## Validation Required",
    "",
    "- Focused source tests for the repaired layer.",
    "- `git diff --check`.",
    "- Fallback governance classification for H1/H2 or incident work.",
    "- Production host/proxy/runtime readback if deployment is performed.",
    "- Explicit privacy confirmation.",
    "",
    "## Privacy Boundary",
    "",
    "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private records, email bodies, health records, wardrobe images, attachment bytes, screenshots with private data, database rows, full prompts, or long logs in the return card.",
  ].join("\n");
}

function buildDiagnosticRemediationPlan(input = {}) {
  const caseRecord = input.case || input.caseRecord || {};
  const events = Array.isArray(input.events) ? input.events : [];
  const packet = evidencePacket(caseRecord, events);
  const targetInfo = targetForLayer(caseRecord, input.targets || {});
  const eligibility = remediationEligible(caseRecord, events);
  const reasoningEffort = severityRank(packet.severity) >= severityRank("H2") ? "xhigh" : "high";
  const autoDispatchEligible = eligibility.eligible && isSelfCheckDiagnosticCase(caseRecord);
  const taskCard = targetInfo.target ? {
    title: taskTitle(packet, targetInfo),
    summary: taskSummary(packet, targetInfo),
    body: taskBody(packet, targetInfo, input),
    sourceThreadTitle: targetInfo.target.sourceThreadTitle,
    sourceThreadTitlePrefix: targetInfo.target.sourceThreadTitlePrefix,
    targetThreadId: targetInfo.target.targetThreadId,
    targetThreadTitle: targetInfo.target.targetThreadTitle,
    targetThreadTitlePrefix: targetInfo.target.targetThreadTitlePrefix,
    targetWorkspace: targetInfo.target.targetWorkspace,
    workflowMode: "autonomous",
    reasoningEffort,
    requestId: `diag-remediation-${packet.case_id || packet.latest_event_id || "unknown"}`,
  } : null;
  return {
    ok: true,
    eligible: eligibility.eligible,
    status: eligibility.eligible ? "ready_to_dispatch" : "blocked",
    blockedReasons: eligibility.blockedReasons,
    case_id: packet.case_id,
    plugin_id: packet.plugin_id,
    owningLayer: targetInfo.owningLayer,
    targetKind: targetInfo.kind,
    target: targetInfo.target,
    evidence: packet,
    taskCard,
    dispatch: taskCard ? {
      interface: "codex_mobile_task_card",
      returnCardRequired: true,
      executeAutomatically: autoDispatchEligible,
      ownerApprovalRequired: !autoDispatchEligible,
      policy: autoDispatchEligible ? "auto_self_check" : "owner_gated",
    } : null,
  };
}

module.exports = {
  DEFAULT_PLUGIN_TARGETS,
  HOME_AI_TARGET,
  buildDiagnosticRemediationPlan,
  evidencePacket,
  isSelfCheckDiagnosticCase,
  owningLayerForCase,
  remediationEligible,
  targetForLayer,
};
