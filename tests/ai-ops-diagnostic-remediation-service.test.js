"use strict";

const assert = require("node:assert/strict");
const {
  buildDiagnosticRemediationPlan,
  evidencePacket,
  owningLayerForCase,
  remediationEligible,
} = require("../adapters/ai-ops-diagnostic-remediation-service");

function baseCase(overrides = {}) {
  return Object.assign({
    case_id: "diagcase_abc123",
    status: "card_candidate",
    severity: "H2",
    event_count: 3,
    workspace_id: "owner",
    plugin_id: "wardrobe",
    source_surface: "embedded-plugin",
    diagnostic_type: "retry_exhausted",
    category: "outfit_retry_failed",
    route: "/?view=plugin&pluginId=wardrobe&pluginRoute=outfit",
    build_id: "client-test",
    summary: "Wardrobe outfit suggestion retried three times and failed",
    latest_event_id: "diagevt_latest",
  }, overrides);
}

function event(overrides = {}) {
  return Object.assign({
    event_id: "diagevt_1",
    created_at: "2026-06-25T10:00:00.000Z",
    severity: "H2",
    confidence: 0.82,
    event_hash: "eventhash",
    privacy_class: "metadata_only",
    payload: {
      error_code: "retry_exhausted",
      status_code: "503",
      duration_bucket: "3_10s",
    },
    evidence: {
      breadcrumbs: [
        { kind: "api", code: "attempt_failed" },
        { kind: "api", code: "attempt_failed" },
        { kind: "api", code: "attempt_failed" },
      ],
      redaction: {
        raw_content_included: false,
        raw_secrets_included: false,
        raw_images_included: false,
      },
    },
  }, overrides);
}

{
  const packet = evidencePacket(baseCase(), [event()]);
  assert.equal(packet.plugin_id, "wardrobe");
  assert.equal(packet.event_count, 3);
  assert.equal(packet.event_digests[0].breadcrumb_count, 3);
  assert.equal(packet.event_digests[0].error_code, "retry_exhausted");
}

{
  const plan = buildDiagnosticRemediationPlan({
    case: baseCase(),
    events: [event()],
    sourceThreadTitle: "Home AI",
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.eligible, true);
  assert.equal(plan.status, "ready_to_dispatch");
  assert.equal(plan.owningLayer, "plugin-runtime");
  assert.equal(plan.targetKind, "plugin");
  assert.equal(plan.target.targetThreadTitle, "男装衣橱");
  assert.equal(plan.taskCard.targetWorkspace, "/Users/example/path");
  assert.equal(plan.taskCard.reasoningEffort, "xhigh");
  assert.equal(plan.dispatch.executeAutomatically, false);
  assert.equal(plan.dispatch.ownerApprovalRequired, true);
  assert.equal(plan.dispatch.policy, "owner_gated");
  assert.match(plan.taskCard.body, /Return a real task card/);
  assert.match(plan.taskCard.body, /retry_exhausted/);
  assert.doesNotMatch(plan.taskCard.body, /private wardrobe image bytes/);
}

{
  const healthGateway = baseCase({
    case_id: "diagcase_health_gateway",
    severity: "H1",
    plugin_id: "health",
    diagnostic_type: "gateway_toolset_failure",
    category: "gateway_failure",
    route: "/?view=plugin&pluginId=health&pluginRoute=report",
    summary: "Health Gateway failed before toolset execution",
  });
  assert.equal(owningLayerForCase(healthGateway), "home-ai-gateway-toolset");
  const plan = buildDiagnosticRemediationPlan({ case: healthGateway, events: [event({ severity: "H1", confidence: 0.9 })] });
  assert.equal(plan.eligible, true);
  assert.equal(plan.targetKind, "home-ai");
  assert.equal(plan.target.targetWorkspace, "/Users/example/path");
  assert.match(plan.taskCard.title, /Home AI/);
  assert.match(plan.taskCard.body, /home-ai-gateway-toolset/);
}

{
  const musicPlayback = baseCase({
    case_id: "diagcase_music_playback",
    plugin_id: "music",
    diagnostic_type: "music_playback_failed",
    category: "music_playback_failed",
    route: "/?view=plugin&pluginId=music&pluginRoute=favorites",
    summary: "Music playback failed repeatedly",
  });
  const plan = buildDiagnosticRemediationPlan({ case: musicPlayback, events: [event({ confidence: 0.88 })] });
  assert.equal(plan.eligible, true);
  assert.equal(plan.targetKind, "plugin");
  assert.equal(plan.target.targetWorkspace, "/Users/example/path");
  assert.equal(plan.taskCard.targetWorkspace, "/Users/example/path");
  assert.doesNotMatch(plan.taskCard.body, /\/Users\/xuxin\/Documents\/Music/);
}

{
  const selfCheck = baseCase({
    case_id: "diagcase_self_check",
    plugin_id: "home-ai",
    workspace_id: "owner",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_plugin_proxy",
    route: "/system/self-check",
    summary: "plugin proxy self-check failed",
  });
  const plan = buildDiagnosticRemediationPlan({
    case: selfCheck,
    events: [event({ case_id: "diagcase_self_check", confidence: 0.9 })],
  });
  assert.equal(plan.eligible, true);
  assert.equal(plan.targetKind, "home-ai");
  assert.equal(plan.dispatch.executeAutomatically, true);
  assert.equal(plan.dispatch.ownerApprovalRequired, false);
  assert.equal(plan.dispatch.policy, "auto_self_check");
}

{
  const capabilityGap = baseCase({
    case_id: "diagcase_capability_gap",
    plugin_id: "home-ai",
    workspace_id: "owner",
    source_surface: "host-conversation",
    diagnostic_type: "capability_gap",
    category: "capability_gap",
    route: "/api/plugin-conversation/actions",
    summary: "PPTX generation capability missing",
  });
  const plan = buildDiagnosticRemediationPlan({
    case: capabilityGap,
    events: [event({ case_id: "diagcase_capability_gap", confidence: 0.9 })],
  });
  assert.equal(plan.eligible, true);
  assert.equal(plan.dispatch.executeAutomatically, false);
  assert.equal(plan.dispatch.ownerApprovalRequired, true);
  assert.equal(plan.dispatch.policy, "owner_gated");
}

{
  const lowConfidence = baseCase({
    status: "inbox_waiting",
    severity: "H3",
  });
  const eligible = remediationEligible(lowConfidence, [event({ confidence: 0.4 })]);
  assert.equal(eligible.eligible, false);
  assert.ok(eligible.blockedReasons.includes("severity_below_h2"));
  assert.ok(eligible.blockedReasons.includes("confidence_below_0_7"));
}

{
  const alreadySent = baseCase({ status: "card_sent" });
  const plan = buildDiagnosticRemediationPlan({ case: alreadySent, events: [event({ confidence: 0.9 })] });
  assert.equal(plan.eligible, false);
  assert.ok(plan.blockedReasons.includes("case_terminal_status"));
}

{
  const dangerous = baseCase({
    plugin_id: "movie",
    category: "projector_power_off_failed",
    diagnostic_type: "physical_device_control",
    summary: "Projector power control failed",
  });
  const plan = buildDiagnosticRemediationPlan({ case: dangerous, events: [event({ confidence: 0.9 })] });
  assert.equal(plan.eligible, false);
  assert.ok(plan.blockedReasons.includes("requires_owner_approval_high_risk"));
}

{
  const unsafe = baseCase();
  const plan = buildDiagnosticRemediationPlan({
    case: unsafe,
    events: [
      event({
        payload: { error_code: "retry_exhausted", messageText: "private body" },
        evidence: { redaction: { raw_content_included: true } },
      }),
    ],
  });
  assert.equal(plan.eligible, false);
  assert.ok(plan.blockedReasons.includes("unsafe_privacy_markers"));
}

console.log("AI Ops diagnostic remediation service tests passed");
