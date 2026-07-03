"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAiOpsDiagnosticIntakeService, sanitizeDiagnosticValue } = require("../adapters/ai-ops-diagnostic-intake-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-ai-ops-diagnostics-"));
}

function createService() {
  return createAiOpsDiagnosticIntakeService({
    dataDir: tempDir(),
    hashSalt: "test-salt",
    nowIso: () => "2026-06-24T01:02:03.000Z",
  });
}

function sampleEvent(overrides = {}) {
  return Object.assign({
    plugin_id: "codex-mobile",
    source_surface: "shell-webview",
    diagnostic_type: "assistant_image_render_missing",
    category: "content_missing",
    severity_hint: "H2",
    evidence_confidence: 0.75,
    route: "/?view=codex-mobile&pluginRoute=single-window&token=secret-value",
    build_id: "client-v1",
    thread_id: "thread-secret-id",
    turn_id: "turn-secret-id",
    error_code: "dom_image_missing",
    user_note: "系统发的图片看不到 Bearer abcdefghijklmnopqrstuvwxyz",
    counts: {
      retry_count: 3,
      visible_count: 2,
      duplicate_count: 1,
      token: "secret-token",
    },
    context: {
      action: "render",
      route_kind: "thread_tile",
      render_mode: "tile",
      item_hash: "hash-prefix",
      cookie: "private-cookie",
      promptText: "private prompt",
    },
    breadcrumbs: [
      { kind: "api", code: "projection_loaded", fields: { token: "abc123secret", count: 1 } },
      { kind: "dom", code: "image_count", fields: { assistantImages: 0, userImages: 1 } },
    ],
    dom: {
      assistantImageElements: 0,
      userImageElements: 1,
      imageContent: "raw image should not persist",
    },
  }, overrides);
}

function musicPlaybackEvent(itemHash, overrides = {}) {
  return Object.assign({
    plugin_id: "music",
    source_surface: "embedded-plugin",
    diagnostic_type: "playback_failed",
    category: "music_playback_failed",
    severity_hint: "H2",
    evidence_confidence: 0.82,
    route: "/api/hermes-plugins/music/proxy/?workspaceId=owner&pluginRoute=collection&launch=secret",
    build_id: "music-build-v1",
    error_code: "music_collection_roon_provider_link_required",
    status_code: "",
    duration_bucket: "lt_1s",
    counts: {
      retry_count: 3,
    },
    context: {
      item_hash: itemHash,
      action: "album_play",
      route_kind: "collection",
      title: "Private Album Title",
      token: "secret-token",
    },
    breadcrumbs: [
      {
        kind: "music_playback",
        code: "album_play_failed",
        status: "failed",
        fields: {
          item_hash: itemHash,
          error_code: "music_collection_roon_provider_link_required",
          duration_bucket: "lt_1s",
          title: "Private Album Title",
          url: "https://private.example/play?token=secret",
        },
      },
    ],
  }, overrides);
}

function serialized(value) {
  return JSON.stringify(value);
}

function testSanitizeRedactsSecretsAndPrivateContent() {
  const value = sanitizeDiagnosticValue({
    cookie: "private",
    messageText: "full private message",
    nested: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz", count: 3 },
  });
  assert.equal(value.cookie, "[REDACTED]");
  assert.equal(value.messageText, "[REDACTED]");
  assert.equal(value.nested.authorization, "[REDACTED]");
  assert.equal(value.nested.count, 3);
}

function testIngestStoresBoundedEventAndCase() {
  const service = createService();
  const result = service.ingestEvent(sampleEvent(), { workspaceId: "owner" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "card_candidate");
  assert.equal(result.routing.auto_card_eligible, true);
  assert.equal(result.privacy.raw_secrets_included, false);
  assert.match(result.event_id, /^diagevt_/);
  assert.match(result.case_id, /^diagcase_/);

  const item = service.getCase(result.case_id);
  assert.equal(item.plugin_id, "codex-mobile");
  assert.equal(item.workspace_id, "owner");
  assert.equal(item.event_count, 1);
  assert.equal(item.route, "/?view=codex-mobile&pluginRoute=single-window");

  const events = service.listEvents({ case_id: result.case_id }).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].thread_id_hash.length, 24);
  assert.equal(events[0].turn_id_hash.length, 24);
  assert.equal(events[0].payload.user_note.includes("Bearer [REDACTED]"), true);
  assert.equal(events[0].payload.counts.retry_count, 3);
  assert.equal(events[0].payload.counts.visible_count, 2);
  assert.equal(events[0].payload.counts.duplicate_count, 1);
  assert.equal(events[0].payload.counts.token, "[REDACTED]");
  assert.equal(events[0].payload.context.action, "render");
  assert.equal(events[0].payload.context.route_kind, "thread_tile");
  assert.equal(events[0].payload.context.render_mode, "tile");
  assert.equal(events[0].payload.context.item_hash, "hash-prefix");
  assert.equal(events[0].payload.context.cookie, "[REDACTED]");
  assert.equal(events[0].payload.context.promptText, "[REDACTED]");
  assert.equal(events[0].evidence.dom.imageContent, "[REDACTED]");
  assert.doesNotMatch(serialized(events[0]), /thread-secret-id|turn-secret-id|abcdefghijklmnopqrstuvwxyz|raw image/);
  service.close();
}

function testDuplicateEventsRollUpIntoCase() {
  const service = createService();
  const first = service.ingestEvent(sampleEvent(), { workspaceId: "owner" });
  const second = service.ingestEvent(sampleEvent({ turn_id: "another-turn" }), { workspaceId: "owner" });
  assert.equal(second.case_id, first.case_id);
  assert.equal(second.deduped, true);
  assert.equal(second.event_count, 2);
  assert.equal(service.getCase(first.case_id).event_count, 2);
  service.close();
}

function testSelfCheckEventsRollUpAcrossBuildAndThread() {
  const service = createService();
  const first = service.ingestEvent({
    plugin_id: "home-ai",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_gateway",
    severity_hint: "H2",
    evidence_confidence: 0.82,
    route: "/system/self-check",
    build_id: "20260701-self-improving-loop-v13",
    thread_id: "thread-a",
    turn_id: "turn-a",
    error_code: "production_status_smoke_command_failed",
    breadcrumbs: [{ kind: "self_check", code: "gateway_failed" }],
  }, { workspaceId: "owner" });
  const second = service.ingestEvent({
    plugin_id: "home-ai",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_gateway",
    severity_hint: "H2",
    evidence_confidence: 0.82,
    route: "/system/self-check",
    build_id: "20260702-self-improving-loop-v14",
    thread_id: "thread-b",
    turn_id: "turn-b",
    error_code: "production_status_smoke_command_failed",
    breadcrumbs: [{ kind: "self_check", code: "gateway_failed" }],
  }, { workspaceId: "owner" });

  assert.equal(first.status, "card_candidate");
  assert.equal(second.case_id, first.case_id);
  assert.equal(second.deduped, true);
  assert.equal(second.event_count, 2);
  assert.equal(service.getCase(first.case_id).event_count, 2);
  service.close();
}

function testPluginPlaybackDifferentItemHashesCreateDifferentCases() {
  const service = createService();
  const first = service.ingestEvent(musicPlaybackEvent("6566230e3a3ce3774c1bbc7c"), { workspaceId: "owner" });
  const second = service.ingestEvent(musicPlaybackEvent("2c624232cdd221771294dfbb"), { workspaceId: "owner" });

  assert.notEqual(second.case_id, first.case_id);
  assert.equal(first.status, "card_candidate");
  assert.equal(second.status, "card_candidate");
  assert.equal(service.getCase(first.case_id).event_count, 1);
  assert.equal(service.getCase(second.case_id).event_count, 1);

  const firstEvent = service.listEvents({ case_id: first.case_id }).events[0];
  assert.equal(firstEvent.payload.context.item_hash, "6566230e3a3ce3774c1bbc7c");
  assert.equal(firstEvent.payload.error_code, "music_collection_roon_provider_link_required");
  assert.equal(firstEvent.payload.duration_bucket, "lt_1s");
  assert.doesNotMatch(serialized(firstEvent), /Private Album Title|private\.example|secret-token|launch=secret/);
  service.close();
}

function testPluginPlaybackSameItemHashRollsUp() {
  const service = createService();
  const first = service.ingestEvent(musicPlaybackEvent("6566230e3a3ce3774c1bbc7c"), { workspaceId: "owner" });
  const second = service.ingestEvent(musicPlaybackEvent("6566230e3a3ce3774c1bbc7c", {
    turn_id: "another-turn",
    status_code: 504,
  }), { workspaceId: "owner" });

  assert.equal(second.case_id, first.case_id);
  assert.equal(second.deduped, true);
  assert.equal(second.event_count, 2);
  assert.equal(service.getCase(first.case_id).event_count, 2);
  service.close();
}

function testCardSentCaseForOneItemDoesNotSuppressNewItemCase() {
  const service = createService();
  const first = service.ingestEvent(musicPlaybackEvent("6566230e3a3ce3774c1bbc7c"), { workspaceId: "owner" });
  service.updateCaseStatus({ case_id: first.case_id, status: "card_sent", reason: "owner_sent_card" });

  const repeatedFirst = service.ingestEvent(musicPlaybackEvent("6566230e3a3ce3774c1bbc7c", {
    turn_id: "repeated-item-a",
  }), { workspaceId: "owner" });
  const second = service.ingestEvent(musicPlaybackEvent("2c624232cdd221771294dfbb", {
    turn_id: "new-item-b",
  }), { workspaceId: "owner" });

  assert.equal(repeatedFirst.case_id, first.case_id);
  assert.equal(repeatedFirst.status, "card_sent");
  assert.notEqual(second.case_id, first.case_id);
  assert.equal(second.deduped, false);
  assert.equal(second.status, "card_candidate");
  assert.equal(service.getCase(second.case_id).event_count, 1);
  service.close();
}

function testCaseStatusUpdate() {
  const service = createService();
  const result = service.ingestEvent(sampleEvent({ severity_hint: "H3", breadcrumbs: [] }), { workspaceId: "owner" });
  assert.equal(result.status, "inbox_waiting");
  const updated = service.updateCaseStatus({ case_id: result.case_id, status: "closed", reason: "verified" });
  assert.equal(updated.case.status, "closed");
  const reopened = service.ingestEvent(sampleEvent({ severity_hint: "H3", breadcrumbs: [] }), { workspaceId: "owner" });
  assert.equal(reopened.status, "reopened");
  service.close();
}

testSanitizeRedactsSecretsAndPrivateContent();
testIngestStoresBoundedEventAndCase();
testDuplicateEventsRollUpIntoCase();
testSelfCheckEventsRollUpAcrossBuildAndThread();
testPluginPlaybackDifferentItemHashesCreateDifferentCases();
testPluginPlaybackSameItemHashRollsUp();
testCardSentCaseForOneItemDoesNotSuppressNewItemCase();
testCaseStatusUpdate();

console.log("AI Ops diagnostic intake service tests passed");
