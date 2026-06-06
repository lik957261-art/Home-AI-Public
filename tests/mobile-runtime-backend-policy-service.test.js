"use strict";

const assert = require("node:assert/strict");
const {
  backendIsLocal,
  createMobileRuntimeBackendPolicyService,
  directSettingEnabled,
} = require("../adapters/mobile-runtime-backend-policy-service");

assert.equal(backendIsLocal(" local "), true);
assert.equal(backendIsLocal("Bridge", ["bridge"]), false);
assert.equal(backendIsLocal("KANBAN", ["kanban"]), false);

for (const value of ["0", "false", "no", "off", "FALSE", "OFF"]) {
  assert.equal(directSettingEnabled(value), false, value);
}
for (const value of ["", "1", "true", "yes", "on", "unexpected"]) {
  assert.equal(directSettingEnabled(value), true, value);
}

{
  const service = createMobileRuntimeBackendPolicyService({
    todoBackend: "local",
    automationBackend: "local",
    serviceStoreBackend: "sqlite",
    directTodoCreateSetting: "off",
  });
  assert.equal(service.useLocalTodoBackend(), true);
  assert.equal(service.useKanbanTodoBackend(), false);
  assert.equal(service.useLocalAutomationBackend(), true);
  assert.equal(service.useSqliteServiceStore(), true);
  assert.equal(service.directTodoCreateEnabled(), false);
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
