"use strict";

const assert = require("node:assert/strict");
const {
  automationBackendStatus,
  backendIsLocal,
  createMobileRuntimeBackendPolicyService,
  directSettingEnabled,
  isCanonicalAutomationBackend,
  isLocalAutomationBackend,
} = require("../adapters/mobile-runtime-backend-policy-service");

assert.equal(backendIsLocal(" local "), true);
assert.equal(backendIsLocal("Bridge", ["bridge"]), false);
assert.equal(backendIsLocal("KANBAN", ["kanban"]), false);
assert.equal(isCanonicalAutomationBackend("hermes_cron"), true);
assert.equal(isCanonicalAutomationBackend("cron"), true);
assert.equal(isLocalAutomationBackend("local"), true);
assert.equal(isLocalAutomationBackend("custom"), false);
assert.deepEqual(automationBackendStatus("local"), { ok: true, backend: "local", kind: "local" });
assert.deepEqual(automationBackendStatus("hermes_cron"), { ok: true, backend: "hermes_cron", kind: "canonical" });
assert.equal(automationBackendStatus("custom").ok, false);

for (const value of ["0", "false", "no", "off", "FALSE", "OFF"]) {
  assert.equal(directSettingEnabled(value), false, value);
}
for (const value of ["", "1", "true", "yes", "on", "unexpected"]) {
  assert.equal(directSettingEnabled(value), true, value);
}

{
  const service = createMobileRuntimeBackendPolicyService({
    todoBackend: "local",
    automationBackend: "custom",
    serviceStoreBackend: "sqlite",
    directTodoCreateSetting: "off",
  });
  assert.equal(service.useLocalTodoBackend(), true);
  assert.equal(service.useKanbanTodoBackend(), false);
  assert.equal(service.useLocalAutomationBackend(), false);
  assert.equal(service.automationBackendStatus().ok, false);
  assert.equal(service.useSqliteServiceStore(), true);
  assert.equal(service.directTodoCreateEnabled(), false);
}

{
  const service = createMobileRuntimeBackendPolicyService({
    automationBackend: "local",
  });
  assert.equal(service.useLocalAutomationBackend(), true);
  assert.deepEqual(service.automationBackendStatus(), { ok: true, backend: "local", kind: "local" });
}

{
  const service = createMobileRuntimeBackendPolicyService({
    todoBackend: "kanban",
    automationBackend: "cron",
    serviceStoreBackend: "json",
    directTodoCreateSetting: "on",
  });
  assert.equal(service.useLocalTodoBackend(), false);
  assert.equal(service.useKanbanTodoBackend(), true);
  assert.equal(service.useLocalAutomationBackend(), false);
  assert.equal(service.useSqliteServiceStore(), false);
  assert.equal(service.directTodoCreateEnabled(), true);
}

{
  const service = createMobileRuntimeBackendPolicyService({
    todoBackend: "KANBAN",
    serviceStoreBackend: "SQLite",
  });
  assert.equal(service.useLocalTodoBackend(), false);
  assert.equal(service.useKanbanTodoBackend(), false);
  assert.equal(service.useSqliteServiceStore(), false);
}

console.log("mobile runtime backend policy service tests passed");
