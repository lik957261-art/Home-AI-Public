"use strict";

const DEFAULT_PROXY_GAP_THRESHOLD_MS = 2000;

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeToken(value, defaultValue = "unknown", maxLength = 120) {
  const token = cleanString(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || defaultValue;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function countValue(...values) {
  return Math.max(0, Math.floor(numberValue(...values)));
}

function msBucket(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "unknown";
  if (number < 250) return "lt_250ms";
  if (number < 1000) return "250_999ms";
  if (number < 2000) return "1_2s";
  if (number < 5000) return "2_5s";
  return "5s_plus";
}

function rowsFrom(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.samples)) return payload.samples.map((sample) => Object.assign({}, payload, sample, {
    rows: undefined,
    samples: undefined,
  }));
  return [payload];
}

function maxNumber(values = []) {
  let out = 0;
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > out) out = number;
  }
  return out;
}

function skippedObservation(signalId, payload = {}, fallbackReason = "collector_skipped") {
  const reason = safeToken(payload.reason || payload.error || fallbackReason, fallbackReason, 120);
  return {
    signalId,
    status: "skipped",
    errorCode: reason,
    diagnosticEligible: false,
    count: 0,
    metadata: {
      skipped: true,
      reason,
    },
  };
}

function observationsFromPluginProxyLatency(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return [{
      signalId: "plugin_proxy_latency",
      status: "failed",
      errorCode: "plugin_proxy_latency_payload_missing",
      metadata: {},
    }];
  }
  if (payload.skipped === true) {
    const observation = skippedObservation("plugin_proxy_latency", payload, "plugin_proxy_latency_probe_skipped");
    observation.metadata.routeKind = safeToken(payload.routeKind || payload.route_kind || "unknown", "unknown", 80);
    return [observation];
  }
  const rows = rowsFrom(payload);
  if (!rows.length) {
    return [{
      signalId: "plugin_proxy_latency",
      status: payload.ok === false ? "failed" : "ok",
      errorCode: payload.ok === false ? safeToken(payload.error, "plugin_proxy_latency_probe_failed", 120) : "",
      metadata: {
        pluginId: safeToken(payload.pluginId || payload.plugin_id || "unknown", "unknown", 80),
        routeKind: safeToken(payload.routeKind || payload.route_kind || "unknown", "unknown", 80),
        sampleCount: 0,
        slowSampleCount: 0,
      },
    }];
  }
  const thresholdMs = Math.max(250, Number(options.gapThresholdMs ?? payload.gapThresholdMs ?? DEFAULT_PROXY_GAP_THRESHOLD_MS) || DEFAULT_PROXY_GAP_THRESHOLD_MS);
  return rows.map((row) => {
    const clientElapsedMs = numberValue(row.clientElapsedMs, row.apiElapsedMs, row.proxyElapsedMs, row.elapsedMs);
    const upstreamMs = numberValue(row.upstreamMs, row.serverMs, row.pluginServerMs, row.totalMs);
    const explicitGapMs = numberValue(row.gapMs, row.proxyGapMs, row.clientProxyGapMs);
    const gapMs = explicitGapMs || Math.max(0, clientElapsedMs - upstreamMs);
    const sampleCount = countValue(row.sampleCount, row.count, 1);
    const slowSampleCount = countValue(row.slowSampleCount, gapMs >= thresholdMs ? sampleCount : 0);
    let errorCode = "";
    if (row.ok === false || payload.ok === false) errorCode = safeToken(row.error || payload.error, "plugin_proxy_latency_probe_failed", 120);
    else if (slowSampleCount > 0) errorCode = "plugin_proxy_latency_gap_detected";
    return {
      signalId: "plugin_proxy_latency",
      status: errorCode ? "failed" : "ok",
      errorCode,
      count: slowSampleCount,
      durationBucket: msBucket(clientElapsedMs),
      metadata: {
        pluginId: safeToken(row.pluginId || row.plugin_id || payload.pluginId || payload.plugin_id || "unknown", "unknown", 80),
        routeKind: safeToken(row.routeKind || row.route_kind || payload.routeKind || payload.route_kind || "unknown", "unknown", 80),
        durationBucket: msBucket(clientElapsedMs),
        upstreamMsBucket: msBucket(upstreamMs),
        gapMsBucket: msBucket(gapMs),
        sampleCount,
        slowSampleCount,
      },
    };
  });
}

function observationsFromGatewayCapabilityAvailability(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return [{
      signalId: "gateway_document_tool_capability",
      status: "failed",
      errorCode: "gateway_document_tool_capability_payload_missing",
      metadata: {},
    }];
  }
  if (payload.skipped === true) {
    return [skippedObservation(
      "gateway_document_tool_capability",
      payload,
      "gateway_document_tool_capability_probe_skipped",
    )];
  }
  const rows = rowsFrom(payload);
  return (rows.length ? rows : [payload]).map((row) => {
    const missingTools = asArray(row.missingTools || row.missing_tools || payload.missingTools || payload.missing_tools)
      .map((item) => safeToken(item, "", 80))
      .filter(Boolean);
    const requiredTools = asArray(row.requiredTools || row.required_tools || payload.requiredTools || payload.required_tools)
      .map((item) => safeToken(item, "", 80))
      .filter(Boolean);
    const missingToolCount = countValue(row.missingToolCount, row.missing_tool_count, missingTools.length);
    const requiredToolCount = countValue(row.requiredToolCount, row.required_tool_count, requiredTools.length);
    let errorCode = "";
    if (row.ok === false || payload.ok === false) errorCode = safeToken(row.error || payload.error, "gateway_document_tool_capability_failed", 120);
    else if (missingToolCount > 0) errorCode = "gateway_document_tools_missing";
    return {
      signalId: "gateway_document_tool_capability",
      status: errorCode ? "failed" : "ok",
      errorCode,
      count: missingToolCount,
      metadata: {
        workspaceId: safeToken(row.workspaceId || row.workspace_id || payload.workspaceId || payload.workspace_id || "unknown", "unknown", 80),
        profile: safeToken(row.profile || payload.profile || "unknown", "unknown", 80),
        toolName: missingTools[0] || safeToken(row.toolName || row.tool_name || payload.toolName || payload.tool_name || "unknown", "unknown", 80),
        missingToolCount,
        requiredToolCount,
      },
    };
  });
}

function sumCounts(source = {}, keys = []) {
  return keys.reduce((sum, key) => sum + countValue(source[key]), 0);
}

function observationFromComposerRuntime(payload = {}) {
  const section = payload.composer || payload.composerRuntime || payload.composer_runtime || payload;
  const count = sumCounts(section, [
    "terminalReceiptMissingCount",
    "receiptMissingCount",
    "duplicateUserEchoCount",
    "stuckActiveRunCount",
    "scrollProtectionBypassCount",
  ]);
  if (!payload.composer && !payload.composerRuntime && !payload.composer_runtime && count === 0 && payload.ok !== false) return null;
  let errorCode = "";
  if (section.ok === false || payload.ok === false) errorCode = safeToken(section.error || payload.error, "composer_runtime_feedback_failed", 120);
  else if (countValue(section.terminalReceiptMissingCount, section.receiptMissingCount) > 0) errorCode = "composer_terminal_receipt_missing";
  else if (countValue(section.duplicateUserEchoCount) > 0) errorCode = "composer_duplicate_user_echo";
  else if (countValue(section.stuckActiveRunCount) > 0) errorCode = "composer_terminal_active_run_stuck";
  else if (countValue(section.scrollProtectionBypassCount) > 0) errorCode = "composer_scroll_protection_bypassed";
  return {
    signalId: "composer_runtime_feedback",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count,
    metadata: {
      threadRef: safeToken(section.threadRef || section.threadId || payload.threadRef || payload.threadId || "unknown", "unknown", 80),
      itemRef: safeToken(section.itemRef || section.messageId || payload.itemRef || payload.messageId || "unknown", "unknown", 80),
      runRef: safeToken(section.runRef || section.runId || payload.runRef || payload.runId || "unknown", "unknown", 80),
      duplicateCount: countValue(section.duplicateUserEchoCount),
      activeRunCount: countValue(section.stuckActiveRunCount),
      userScrollProtected: Boolean(section.userScrollProtected),
    },
  };
}

function observationFromMediaPreview(payload = {}) {
  const section = payload.mediaPreview || payload.media_preview || payload;
  const failedCount = sumCounts(section, [
    "failedCount",
    "previewFailedCount",
    "imagePreviewFailedCount",
    "documentPreviewFailedCount",
    "nativeOpenFailedCount",
  ]);
  if (!payload.mediaPreview && !payload.media_preview && failedCount === 0 && payload.ok !== false) return null;
  let errorCode = "";
  if (section.ok === false || payload.ok === false) errorCode = safeToken(section.error || payload.error, "media_preview_health_failed", 120);
  else if (countValue(section.imagePreviewFailedCount) > 0) errorCode = "generated_image_preview_failed";
  else if (countValue(section.documentPreviewFailedCount) > 0) errorCode = "document_preview_failed";
  else if (failedCount > 0) errorCode = "media_preview_failed";
  return {
    signalId: "media_preview_health",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: failedCount,
    metadata: {
      pluginId: safeToken(section.pluginId || section.plugin_id || payload.pluginId || payload.plugin_id || "unknown", "unknown", 80),
      mediaKind: safeToken(section.mediaKind || section.media_kind || "unknown", "unknown", 80),
      failureKind: safeToken(section.failureKind || section.failure_kind || errorCode || "none", "none", 80),
      sourceKind: safeToken(section.sourceKind || section.source_kind || "unknown", "unknown", 80),
      nativeBridgeMode: safeToken(section.nativeBridgeMode || section.native_bridge_mode || "unknown", "unknown", 80),
      recoveryActionAvailable: Boolean(section.recoveryActionAvailable),
      failedCount,
    },
  };
}

function observationFromNativeBridge(payload = {}) {
  const section = payload.nativeBridge || payload.native_bridge || payload;
  const unavailableCount = sumCounts(section, [
    "unavailableCount",
    "nativeBridgeUnavailableCount",
    "bridgeMissingCount",
    "sameOriginOpenFailedCount",
  ]);
  if (!payload.nativeBridge && !payload.native_bridge && unavailableCount === 0 && payload.ok !== false) return null;
  let errorCode = "";
  if (section.ok === false || payload.ok === false) errorCode = safeToken(section.error || payload.error, "native_bridge_capability_failed", 120);
  else if (unavailableCount > 0) errorCode = safeToken(section.nativeBridgeErrorCode || section.boundedError || "native_bridge_unavailable", "native_bridge_unavailable", 120);
  return {
    signalId: "native_bridge_capability",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: unavailableCount,
    metadata: {
      platform: safeToken(section.platform || payload.platform || "unknown", "unknown", 40),
      appVersion: safeToken(section.appVersion || section.app_version || payload.appVersion || payload.app_version || "unknown", "unknown", 80),
      capability: safeToken(section.capability || "unknown", "unknown", 80),
      boundedError: safeToken(errorCode || section.boundedError || "none", "none", 120),
    },
  };
}

function observationFromPluginActions(payload = {}) {
  const section = payload.pluginActions || payload.plugin_actions || payload.pluginActionMetadata || payload.plugin_action_metadata || {};
  const missingCount = sumCounts(section, [
    "missingMetadataCount",
    "pluginActionMetadataMissingCount",
    "rendererFilteredCount",
    "bridgeUnavailableCount",
  ]);
  if (!payload.pluginActions && !payload.plugin_actions && !payload.pluginActionMetadata && !payload.plugin_action_metadata) return null;
  let errorCode = "";
  if (section.ok === false) errorCode = safeToken(section.error, "plugin_action_metadata_failed", 120);
  else if (countValue(section.bridgeUnavailableCount) > 0) errorCode = "plugin_action_bridge_unavailable";
  else if (countValue(section.rendererFilteredCount) > 0) errorCode = "plugin_action_renderer_filtered";
  else if (missingCount > 0) errorCode = "plugin_action_metadata_missing";
  return {
    signalId: "plugin_action_metadata_health",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: missingCount,
    metadata: {
      pluginId: safeToken(section.pluginId || section.plugin_id || payload.pluginId || payload.plugin_id || "unknown", "unknown", 80),
      actionKind: safeToken(section.actionKind || section.action_kind || "unknown", "unknown", 80),
      missingMetadataCount: countValue(section.missingMetadataCount, section.pluginActionMetadataMissingCount),
      rendererFilteredCount: countValue(section.rendererFilteredCount),
      bridgeUnavailableCount: countValue(section.bridgeUnavailableCount),
    },
  };
}

function observationsFromUiRuntimeHealth(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return [{
      signalId: "composer_runtime_feedback",
      status: "failed",
      errorCode: "ui_runtime_health_payload_missing",
      metadata: {},
    }];
  }
  if (payload.skipped === true) {
    return [
      skippedObservation("composer_runtime_feedback", payload, "ui_runtime_health_telemetry_not_attached"),
      skippedObservation("media_preview_health", payload, "ui_runtime_health_telemetry_not_attached"),
    ];
  }
  return [
    observationFromComposerRuntime(payload),
    observationFromMediaPreview(payload),
    observationFromNativeBridge(payload),
    observationFromPluginActions(payload),
  ].filter(Boolean);
}

module.exports = {
  msBucket,
  observationsFromGatewayCapabilityAvailability,
  observationsFromPluginProxyLatency,
  observationsFromUiRuntimeHealth,
};
