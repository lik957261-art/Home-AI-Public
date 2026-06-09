"use strict";

const DEFAULT_PLUGIN_IDS = Object.freeze([]);

function stringValue(value) {
  return String(value || "").trim();
}

function boundedError(value, fallback = "workspace_onboarding_failed") {
  return stringValue(value).replace(/\s+/g, " ").slice(0, 180) || fallback;
}

function slugWorkspaceId(value = "") {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function macUserForWorkspaceId(workspaceId = "") {
  const suffix = stringValue(workspaceId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return suffix ? `hm-${suffix}` : "";
}

function normalizePluginIds(value, fallback = DEFAULT_PLUGIN_IDS) {
  const raw = Array.isArray(value) ? value : fallback;
  const out = [];
  const seen = new Set();
  for (const item of raw || []) {
    const id = stringValue(typeof item === "object" ? item.id || item.pluginId : item).toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function defaultLiveRoot(input = {}, options = {}) {
  return stringValue(input.liveRoot || input.live_root || options.liveRoot)
    || "/Users/hermes-host/HermesMobile";
}

function workspacePaths(input = {}, options = {}) {
  const liveRoot = defaultLiveRoot(input, options);
  const workspaceId = stringValue(input.workspaceId);
  const macUser = stringValue(input.macUser) || macUserForWorkspaceId(workspaceId);
  return {
    liveRoot,
    dataRoot: `${liveRoot}/data`,
    driveRoot: `${liveRoot}/data/drive`,
    workspaceDataRoot: `${liveRoot}/data/drive/users/${workspaceId}`,
    workerHome: `/Users/${macUser}`,
    workerWorkspaceRoot: `/Users/${macUser}/HermesWorkspace`,
  };
}

function normalizeRequest(input = {}, options = {}) {
  const rawWorkspaceId = input.workspaceId || input.workspace_id || input.id || input.username || input.userName;
  const workspaceId = slugWorkspaceId(rawWorkspaceId);
  const label = stringValue(input.label || input.displayName || input.display_name || input.name || workspaceId);
  const pluginIds = normalizePluginIds(
    input.pluginIds || input.plugin_ids || input.plugins,
    options.defaultPluginIds || DEFAULT_PLUGIN_IDS,
  );
  const macUser = stringValue(input.macUser || input.mac_user) || macUserForWorkspaceId(workspaceId);
  const normalized = {
    workspaceId,
    label,
    displayName: stringValue(input.displayName || input.display_name || label || workspaceId),
    username: stringValue(input.username || input.userName || workspaceId),
    macUser,
    pluginIds,
    createAccessKey: input.createAccessKey === false || input.create_access_key === false ? false : true,
    runSmokes: input.runSmokes === false || input.run_smokes === false ? false : true,
    allowPluginFailures: input.allowPluginFailures === true || input.allow_plugin_failures === true,
    allowManualSystemSteps: input.allowManualSystemSteps === true || input.allow_manual_system_steps === true,
  };
  Object.assign(normalized, workspacePaths(normalized, options));
  return normalized;
}

function systemStep(id, title, action) {
  return {
    id,
    title,
    action,
    category: "mac-system",
    required: true,
    status: "planned",
  };
}

function buildPlan(normalized = {}) {
  const steps = [
    {
      id: "workspace.record",
      title: "Create or update Home AI workspace record",
      category: "workspace",
      required: true,
      status: "planned",
    },
  ];
  if (normalized.createAccessKey) {
    steps.push({
      id: "home_ai.access_key",
      title: "Generate one-time Home AI workspace Access Key response",
      category: "access-key",
      required: true,
      status: "planned",
    });
  }
  steps.push(
    systemStep("mac.user", "Ensure macOS workspace user", "ensure_mac_user"),
    systemStep("mac.roots", "Ensure private workspace roots", "ensure_workspace_roots"),
    systemStep("mac.acl", "Repair private workspace ACL", "repair_workspace_acl"),
    {
      id: "gateway.profiles",
      title: "Ensure Gateway candidate profiles and Skill Store",
      category: "gateway",
      required: true,
      status: "planned",
    },
  );
  for (const pluginId of normalized.pluginIds || []) {
    steps.push({
      id: `plugin.${pluginId}`,
      title: `Provision plugin workspace binding for ${pluginId}`,
      category: "plugin",
      pluginId,
      required: !normalized.allowPluginFailures,
      status: "planned",
    });
  }
  steps.push(systemStep("mac.launchd", "Ensure workspace Gateway LaunchDaemons", "ensure_launchd_services"));
  if (normalized.runSmokes) {
    steps.push({
      id: "validation.smokes",
      title: "Run workspace onboarding smoke checks",
      action: "run_workspace_onboarding_smokes",
      category: "validation",
      required: true,
      status: "planned",
    });
  }
  return steps;
}

function publicPlan(input = {}, options = {}) {
  const normalized = normalizeRequest(input, options);
  return {
    ok: Boolean(normalized.workspaceId),
    status: normalized.workspaceId ? "planned" : "invalid",
    error: normalized.workspaceId ? "" : "workspace_id_required",
    workspaceId: normalized.workspaceId,
    label: normalized.label,
    displayName: normalized.displayName,
    macUser: normalized.macUser,
    paths: {
      liveRoot: normalized.liveRoot,
      workspaceDataRoot: normalized.workspaceDataRoot,
      workerWorkspaceRoot: normalized.workerWorkspaceRoot,
    },
    pluginIds: normalized.pluginIds,
    createAccessKey: normalized.createAccessKey,
    runSmokes: normalized.runSmokes,
    steps: buildPlan(normalized),
  };
}

function ensureFunction(value, label) {
  if (typeof value === "function") return value;
  throw new Error(`workspace onboarding service requires ${label}`);
}

function stepResult(step, status, result = {}) {
  return Object.assign({}, step, {
    status,
    ok: status === "ok" || status === "skipped",
  }, result);
}

function withoutOk(value = {}) {
  const out = Object.assign({}, value);
  delete out.ok;
  return out;
}

function redactedPluginProvisioning(provisioning = {}) {
  if (!provisioning || typeof provisioning !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(provisioning)) {
    if (/key|token|secret|credential/i.test(key)) {
      out[key] = Boolean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function createWorkspaceOnboardingService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const findWorkspace = ensureFunction(options.findWorkspace, "findWorkspace");
  const upsertLocalWorkspace = ensureFunction(options.upsertLocalWorkspace, "upsertLocalWorkspace");
  const rotateWorkspaceAccessKey = ensureFunction(options.rotateWorkspaceAccessKey, "rotateWorkspaceAccessKey");
  const ensureWorkspaceGateway = ensureFunction(options.ensureWorkspaceGateway, "ensureWorkspaceGateway");
  const hermesPluginService = options.hermesPluginService || {};
  const systemProvisioningExecutor = options.systemProvisioningExecutor || null;

  function planOnboarding(input = {}) {
    return publicPlan(input, options);
  }

  async function runSystemAction(action, context) {
    if (!systemProvisioningExecutor) {
      return { status: "manual_required", error: "system_provisioning_executor_unavailable" };
    }
    if (typeof systemProvisioningExecutor.runStep === "function") {
      return systemProvisioningExecutor.runStep(action, context);
    }
    if (typeof systemProvisioningExecutor[action] === "function") {
      return systemProvisioningExecutor[action](context);
    }
    return { ok: false, error: `system_action_unavailable:${action}` };
  }

  async function applyOnboarding(input = {}, runtime = {}) {
    const normalized = normalizeRequest(input, options);
    const plan = publicPlan(normalized, options);
    if (!normalized.workspaceId) return plan;
    if (!systemProvisioningExecutor && !normalized.allowManualSystemSteps) {
      return Object.assign({}, plan, {
        ok: false,
        status: "blocked",
        error: "system_provisioning_executor_unavailable",
        blockedBeforeSideEffects: true,
        steps: plan.steps.map((step) => (
          step.category === "mac-system" || step.category === "validation"
            ? stepResult(step, "blocked", { error: "system_provisioning_executor_unavailable" })
            : step
        )),
      });
    }

    const actor = stringValue(runtime.actor || input.actor) || "owner";
    const appliedAt = nowIso();
    const steps = [];
    const context = {
      actor,
      appliedAt,
      workspaceId: normalized.workspaceId,
      label: normalized.label,
      displayName: normalized.displayName,
      macUser: normalized.macUser,
      pluginIds: normalized.pluginIds,
      paths: plan.paths,
      gateway: null,
    };
    const credentials = {};
    let ok = true;
    let blocked = false;

    async function record(stepId, fn) {
      const step = plan.steps.find((item) => item.id === stepId);
      if (!step) return null;
      if (blocked) {
        const skipped = stepResult(step, "skipped", { reason: "previous_required_step_failed" });
        steps.push(skipped);
        return skipped;
      }
      try {
        const result = await fn(step);
        const status = result?.ok === false ? "failed" : (result?.status === "manual_required" ? "manual_required" : "ok");
        const saved = stepResult(step, status, withoutOk(result));
        steps.push(saved);
        if (status !== "ok" && step.required) {
          ok = false;
          if (step.category !== "plugin" && (status !== "manual_required" || !normalized.allowManualSystemSteps)) blocked = true;
        }
        return saved;
      } catch (err) {
        const failed = stepResult(step, "failed", { error: boundedError(err?.message || err) });
        steps.push(failed);
        if (step.required) {
          ok = false;
          blocked = true;
        }
        return failed;
      }
    }

    await record("workspace.record", () => {
      const recordValue = upsertLocalWorkspace({
        workspaceId: normalized.workspaceId,
        label: normalized.label,
        username: normalized.username,
      }, actor);
      context.workspaceRecord = recordValue;
      return {
        ok: true,
        workspace: {
          id: recordValue.id,
          label: recordValue.label,
          source: recordValue.source,
        },
      };
    });

    if (normalized.createAccessKey) {
      await record("home_ai.access_key", () => {
        const result = rotateWorkspaceAccessKey(normalized.workspaceId, { actor });
        credentials.homeAiAccessKey = result.key;
        return {
          ok: true,
          accessKeyCreated: true,
          accessKeyStatus: result.record,
        };
      });
    }

    for (const step of plan.steps.filter((item) => item.category === "mac-system" && item.id !== "mac.launchd")) {
      await record(step.id, async () => {
        const result = await runSystemAction(step.action, context);
        return result?.ok === false ? { ok: false, error: boundedError(result.error || step.action) } : Object.assign({ ok: true }, result);
      });
    }

    await record("gateway.profiles", () => {
      const gateway = ensureWorkspaceGateway({
        workspaceId: normalized.workspaceId,
        refreshProfileBinding: true,
        macUser: normalized.macUser,
      });
      context.gateway = gateway;
      return gateway?.ok === false
        ? { ok: false, error: boundedError(gateway.reason || gateway.error || "gateway_workspace_provisioning_failed") }
        : {
          ok: true,
          profiles: Array.isArray(gateway?.profiles) ? gateway.profiles : [],
          restartRequired: Boolean(gateway?.restartRequired),
          profileBindingRefreshed: Boolean(gateway?.profileBindingRefreshed),
        };
    });

    for (const pluginId of normalized.pluginIds) {
      await record(`plugin.${pluginId}`, async () => {
        if (typeof hermesPluginService.grantWorkspace !== "function") {
          return { ok: false, error: "plugin_grant_service_unavailable" };
        }
        const result = await hermesPluginService.grantWorkspace({
          id: pluginId,
          pluginId,
          workspaceId: normalized.workspaceId,
          displayName: normalized.displayName,
          actor,
          skipGatewayRefresh: true,
        });
        if (!result || result.ok === false || result.provisioning?.status === "provisioning_failed") {
          return {
            ok: false,
            error: boundedError(result?.error || result?.provisioning?.error || `${pluginId}_plugin_provisioning_failed`),
            provisioning: redactedPluginProvisioning(result?.provisioning),
          };
        }
        return {
          ok: true,
          provisioning: redactedPluginProvisioning(result.provisioning),
        };
      });
    }

    await record("mac.launchd", async (step) => {
      const result = await runSystemAction(step.action, context);
      return result?.ok === false ? { ok: false, error: boundedError(result.error || step.action) } : Object.assign({ ok: true }, result);
    });

    if (normalized.runSmokes) {
      await record("validation.smokes", async (step) => {
        const result = await runSystemAction(step.action, context);
        return result?.ok === false ? { ok: false, error: boundedError(result.error || step.action) } : Object.assign({ ok: true }, result);
      });
    }

    const workspace = findWorkspace(normalized.workspaceId) || context.workspaceRecord || {};
    return Object.assign({}, plan, {
      ok,
      status: ok ? "active" : "provisioning_failed",
      appliedAt,
      workspace: {
        id: workspace.id || normalized.workspaceId,
        label: workspace.label || normalized.label,
        source: workspace.source || context.workspaceRecord?.source || "",
      },
      credentials,
      steps,
    });
  }

  return {
    applyOnboarding,
    planOnboarding,
  };
}

module.exports = {
  createWorkspaceOnboardingService,
  macUserForWorkspaceId,
  normalizePluginIds,
  publicPlan,
  slugWorkspaceId,
  workspacePaths,
};
