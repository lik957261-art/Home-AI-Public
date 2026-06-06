"use strict";

function backendIsLocal(value, bridgeNames = []) {
  const backend = String(value || "").trim().toLowerCase();
  return !bridgeNames.includes(backend);
}

function directSettingEnabled(value) {
  const setting = String(value || "");
  if (/^(0|false|no|off)$/i.test(setting)) return false;
  if (/^(1|true|yes|on)$/i.test(setting)) return true;
  return true;
}

function createMobileRuntimeBackendPolicyService(options = {}) {
  const todoBackend = String(options.todoBackend || "");
  const automationBackend = String(options.automationBackend || "");
  const serviceStoreBackend = String(options.serviceStoreBackend || "");
  const directTodoCreateSetting = String(options.directTodoCreateSetting || "");

  return {
    useLocalTodoBackend() {
      return backendIsLocal(todoBackend, ["bridge", "plugin", "hermes", "hermes_todos", "kanban", "hermes_kanban"]);
    },
    useKanbanTodoBackend() {
      return ["kanban", "hermes_kanban"].includes(todoBackend);
    },
    directTodoCreateEnabled() {
      return directSettingEnabled(directTodoCreateSetting);
    },
    useLocalAutomationBackend() {
      return backendIsLocal(automationBackend, ["bridge", "cron", "hermes", "hermes_cron"]);
    },
    useSqliteServiceStore() {
      return serviceStoreBackend === "sqlite";
    },
  };
}

module.exports = {
  backendIsLocal,
  createMobileRuntimeBackendPolicyService,
  directSettingEnabled,
};
