"use strict";

const assert = require("node:assert/strict");
const { createAuditEventProvider, sanitizeAuditValue } = require("../adapters/audit-event-provider");

function run() {
  const events = [];
  const provider = createAuditEventProvider({
    nowIso: () => "2026-05-14T00:00:00.000Z",
    sink: (eventType, event) => events.push({ eventType, event }),
  });

  const event = provider.audit("owner_elevation_granted", {
    actorWorkspaceId: "owner",
    actorPrincipalId: "owner",
    targetType: "owner_elevation",
    targetId: "grant-one",
    decision: "allow",
    token: "raw-token",
    nested: { apiKey: "secret-value", path: "C:/work/file.md" },
  });

  assert.equal(event.eventType, "owner_elevation_granted");
  assert.equal(event.timestamp, "2026-05-14T00:00:00.000Z");
  assert.equal(event.actorWorkspaceId, "owner");
  assert.equal(event.targetType, "owner_elevation");
  assert.equal(event.payload.token, "[redacted]");
  assert.equal(event.payload.nested.apiKey, "[redacted]");
  assert.equal(event.payload.nested.path, "C:/work/file.md");
  assert.equal(event.payload.timestamp, "2026-05-14T00:00:00.000Z");
  assert.equal(event.payload.action, "owner_elevation_granted");
  assert.equal(event.payload.decision, "allow");
  assert.equal(events.length, 1);

  const denied = provider.decision("path_read_decision", { targetId: "file-one" }, false, "protected_path");
  assert.equal(denied.decision, "deny");
  assert.equal(denied.reason, "protected_path");

  assert.equal(sanitizeAuditValue("abc", "password"), "[redacted]");
  console.log("audit-event-provider tests passed");
}

run();
