"use strict";

const CANONICAL_AUTOMATION_BACKENDS = Object.freeze(["bridge", "cron", "hermes", "hermes_cron"]);
const LOCAL_AUTOMATION_BACKENDS = Object.freeze(["local", "local_json", "sqlite", "local_sqlite"]);

function normalizeBackendName(value) {
  return String(value || "").trim().toLowerCase();
}

function backendIsLocal(value, bridgeNames = []) {
  const backend = normalizeBackendName(value);
  return !bridgeNames.includes(backend);
}

function isCanonicalAutomationBackend(value) {
  return CANONICAL_AUTOMATION_BACKENDS.includes(normalizeBackendName(value));
}

function isLocalAutomationBackend(value) {
  return LOCAL_AUTOMATION_BACKENDS.includes(normalizeBackendName(value));
}

function automationBackendStatus(value) {
  const backend = normalizeBackendName(value || "hermes_cron");
  if (isCanonicalAutomationBackend(backend)) {
    return { ok: true, backend, kind: "canonical" };
  }
  if (isLocalAutomationBackend(backend)) {
    return { ok: true, backend, kind: "local" };
  }
  return {
    ok: false,
    backend,
    kind: "unknown",
    status: 503,
    error: `Unsupported Automation backend "${backend}". Use hermes_cron for the canonical scheduler or local only for explicit test/import mode.`,
  };
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
    automationBackendStatus() {
      return automationBackendStatus(automationBackend);
    },
    useLocalAutomationBackend() {
      return isLocalAutomationBackend(automationBackend);
    },
    useSqliteServiceStore() {
      return serviceStoreBackend === "sqlite";
    },
  };
}

module.exports = {
  CANONICAL_AUTOMATION_BACKENDS,
  LOCAL_AUTOMATION_BACKENDS,
  automationBackendStatus,
  backendIsLocal,
  createMobileRuntimeBackendPolicyService,
  directSettingEnabled,
  isCanonicalAutomationBackend,
  isLocalAutomationBackend,
};
