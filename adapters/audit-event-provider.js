"use strict";

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|cookie|api[_-]?key|access[_-]?key|refresh[_-]?token|private[_-]?key)/i;
const MAX_STRING_LENGTH = 800;

function nowIso() {
  return new Date().toISOString();
}

function compactString(value, limit = MAX_STRING_LENGTH) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

function sanitizeAuditValue(value, key = "") {
  if (SECRET_KEY_PATTERN.test(String(key || ""))) return "[redacted]";
  if (value == null) return value;
  if (typeof value === "string") return compactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeAuditValue(item, key));
  if (typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      out[childKey] = sanitizeAuditValue(childValue, childKey);
    }
    return out;
  }
  return compactString(value);
}

function normalizeAuditEvent(eventType, payload = {}, options = {}) {
  const event = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { value: payload };
  const type = compactString(eventType || event.eventType || event.event_type || "event", 120) || "event";
  const normalized = {
    eventType: type,
    eventId: compactString(event.eventId || event.event_id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 160),
    timestamp: compactString(event.timestamp || event.createdAt || event.created_at || (options.nowIso || nowIso)(), 80),
    actorWorkspaceId: compactString(event.actorWorkspaceId || event.actor_workspace_id || event.workspaceId || event.workspace_id || "", 120),
    actorPrincipalId: compactString(event.actorPrincipalId || event.actor_principal_id || event.principalId || event.principal_id || "", 160),
    targetType: compactString(event.targetType || event.target_type || event.resourceType || event.resource_type || "", 120),
    targetId: compactString(event.targetId || event.target_id || event.resourceId || event.resource_id || "", 240),
    action: compactString(event.action || event.operation || type, 160),
    decision: compactString(event.decision || "", 80),
    reason: compactString(event.reason || "", 500),
    traceId: compactString(event.traceId || event.trace_id || event.requestId || event.request_id || "", 160),
  };
  const payloadCopy = Object.assign({}, event);
  for (const key of [
    "eventType", "event_type", "eventId", "event_id", "timestamp", "createdAt", "created_at",
    "actorWorkspaceId", "actor_workspace_id", "actorPrincipalId", "actor_principal_id",
    "principalId", "principal_id", "workspaceId", "workspace_id", "targetType", "target_type",
    "resourceType", "resource_type", "targetId", "target_id", "resourceId", "resource_id",
    "action", "operation", "decision", "reason", "traceId", "trace_id", "requestId", "request_id",
  ]) {
    delete payloadCopy[key];
  }
  normalized.payload = sanitizeAuditValue(payloadCopy);
  normalized.payload.eventId = normalized.eventId;
  normalized.payload.timestamp = normalized.timestamp;
  normalized.payload.action = normalized.action;
  normalized.payload.decision = normalized.decision;
  normalized.payload.reason = normalized.reason;
  if (normalized.traceId) normalized.payload.traceId = normalized.traceId;
  return normalized;
}

function createAuditEventProvider(options = {}) {
  const sink = typeof options.sink === "function" ? options.sink : () => {};
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const clock = typeof options.nowIso === "function" ? options.nowIso : nowIso;

  function audit(eventType, payload = {}) {
    const event = normalizeAuditEvent(eventType, payload, { nowIso: clock });
    try {
      sink(event.eventType, event);
    } catch (err) {
      onError(err, event);
    }
    return event;
  }

  function decision(eventType, payload = {}, allowed = false, reason = "") {
    return audit(eventType, Object.assign({}, payload, {
      decision: allowed ? "allow" : "deny",
      reason: reason || payload.reason || "",
    }));
  }

  return {
    audit,
    decision,
    normalize: (eventType, payload = {}) => normalizeAuditEvent(eventType, payload, { nowIso: clock }),
  };
}

module.exports = {
  createAuditEventProvider,
  normalizeAuditEvent,
  sanitizeAuditValue,
};
