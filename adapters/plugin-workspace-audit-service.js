"use strict";

const fs = require("node:fs");
const path = require("node:path");

const AUDIT_KIND = "plugin_workspace_audit";
const DEFAULT_AUDIT_EXECUTOR = "codex_readonly";
const ALLOWED_AUDIT_MODES = new Set(["recent_changes", "dirty_diff", "full_sample"]);

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function cleanId(value, max = 80) {
  const id = clean(value, max).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) ? id : "";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compactList(value, maxItems = 20, maxText = 120) {
  const items = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of items) {
    const text = clean(item, maxText);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function safeAuditSourceRef(input = {}) {
  const source = objectValue(input);
  const out = {};
  for (const key of ["reportUrl", "report_url", "automationId", "automation_id", "jobId", "job_id", "route"]) {
    if (source[key] == null) continue;
    if (key === "route" && typeof source[key] === "object" && !Array.isArray(source[key])) {
      out.route = {
        name: clean(source[key].name, 80),
        tab: clean(source[key].tab, 80),
        itemId: clean(source[key].itemId || source[key].item_id, 160),
      };
    } else {
      out[key] = clean(source[key], 600);
    }
  }
  return out;
}

function envKeyForPlugin(pluginId = "") {
  return String(pluginId || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function parseAuditTargetConfig(options = {}) {
  const env = options.env || process.env;
  const raw = clean(env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS || env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS, 20000);
  const targets = Object.create(null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          const pluginId = cleanId(key);
          if (!pluginId) continue;
          targets[pluginId] = typeof value === "string" ? { path: value } : objectValue(value);
        }
      }
    } catch (_) {
      targets.__config_error = { error: "audit_target_config_invalid_json" };
    }
  }
  for (const [key, value] of Object.entries(env)) {
    const match = key.match(/^HERMES_(?:MOBILE|WEB)_PLUGIN_WORKSPACE_AUDIT_([A-Z0-9_]+)_PATH$/);
    if (!match) continue;
    const pluginKey = String(match[1] || "").toLowerCase().replace(/_/g, "-");
    const pluginId = cleanId(pluginKey);
    if (!pluginId) continue;
    targets[pluginId] = Object.assign({}, targets[pluginId] || {}, { path: value });
  }
  return targets;
}

function configuredTargetForPlugin(pluginId, options = {}) {
  const targets = options.auditTargets && typeof options.auditTargets === "object"
    ? options.auditTargets
    : parseAuditTargetConfig(options);
  const direct = targets[pluginId];
  if (direct) return direct;
  const env = options.env || process.env;
  const envPath = env[`HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_${envKeyForPlugin(pluginId)}_PATH`]
    || env[`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_${envKeyForPlugin(pluginId)}_PATH`];
  return envPath ? { path: envPath } : null;
}

function targetError(status, code, message) {
  return { ok: false, status, code, error: message };
}

function createPluginWorkspaceAuditService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : clean;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const isPathProtected = typeof options.isPathProtected === "function" ? options.isPathProtected : () => false;
  const pluginService = options.pluginService || null;
  const actionInboxService = options.actionInboxService || null;
  const resolveAutomationCronProfile = typeof options.resolveAutomationCronProfile === "function"
    ? options.resolveAutomationCronProfile
    : () => "";
  const targetResolver = typeof options.resolveAuditTarget === "function" ? options.resolveAuditTarget : null;

  function pluginVisible(pluginId, workspaceId) {
    if (!pluginService || typeof pluginService.list !== "function") {
      return targetError(503, "plugin_registry_unavailable", "Plugin registry is unavailable");
    }
    const plugins = pluginService.list({ workspaceId }) || [];
    const plugin = plugins.find((item) => cleanId(item.id) === pluginId);
    if (!plugin) {
      return targetError(404, "plugin_audit_target_not_authorized", "Plugin is not registered, enabled, or authorized for this workspace");
    }
    return { ok: true, plugin };
  }

  function resolveTarget(pluginId, workspaceId) {
    if (targetResolver) {
      const resolved = targetResolver({ pluginId, workspaceId });
      if (resolved?.ok === false) return resolved;
      if (resolved?.path || resolved?.workspacePath) return resolved;
    }
    const configured = configuredTargetForPlugin(pluginId, options);
    if (!configured) {
      return targetError(503, "plugin_audit_target_unconfigured", "Plugin workspace audit target is not configured");
    }
    if (configured.error) return targetError(503, configured.error, "Plugin workspace audit target configuration is invalid");
    return configured;
  }

  function normalizeTargetPath(target) {
    if (target?.ok === false) return target;
    const rawPath = clean(target?.path || target?.workspacePath || target?.workspace_path, 2000);
    if (!rawPath) return targetError(503, "plugin_audit_target_unconfigured", "Plugin workspace audit target path is not configured");
    if (!path.isAbsolute(rawPath)) return targetError(400, "plugin_audit_target_path_not_absolute", "Plugin workspace audit target path must be absolute");
    if (isPathProtected(rawPath)) return targetError(403, "plugin_audit_target_path_protected", "Plugin workspace audit target path is protected");
    let realPath = "";
    try {
      realPath = fs.realpathSync.native(rawPath);
      const stat = fs.statSync(realPath);
      if (!stat.isDirectory()) return targetError(400, "plugin_audit_target_not_directory", "Plugin workspace audit target is not a directory");
    } catch (_) {
      return targetError(404, "plugin_audit_target_missing", "Plugin workspace audit target path does not exist");
    }
    if (isPathProtected(realPath)) return targetError(403, "plugin_audit_target_path_protected", "Plugin workspace audit target path is protected");
    return { ok: true, path: realPath, pathRef: clean(target.pathRef || target.workspacePathRef || "configured", 120) || "configured" };
  }

  function buildPrompt(input = {}) {
    const pluginTitle = clean(input.pluginTitle || input.pluginId, 120);
    const mode = clean(input.auditMode, 40);
    const notes = clean(input.instructions || input.notes, 1200);
    const includeGlobs = compactList(input.scope?.includeGlobs || input.scope?.include_globs, 20, 160);
    const excludeGlobs = compactList(input.scope?.excludeGlobs || input.scope?.exclude_globs, 20, 160);
    return [
      `You are auditing the Home AI embedded plugin workspace \"${pluginTitle}\".`,
      "",
      "Read-only policy:",
      "- Do not edit files, create files, delete files, run migrations, install packages, commit, push, deploy, restart services, or mutate databases.",
      "- Use source inspection and bounded metadata commands only.",
      "- Do not print secrets, access keys, tokens, push endpoints, private user content, or long raw logs.",
      "",
      "Audit output:",
      "- Findings first, ordered by severity.",
      "- Include concrete file/line references when available.",
      "- Include residual risks and suggested follow-up task cards.",
      "- Keep the report concise and product-safe.",
      "",
      `Audit mode: ${mode}.`,
      includeGlobs.length ? `Include globs: ${includeGlobs.join(", ")}` : "",
      excludeGlobs.length ? `Exclude globs: ${excludeGlobs.join(", ")}` : "",
      notes ? `User guidance: ${notes}` : "",
    ].filter(Boolean).join("\n");
  }

  async function buildAuditDraft(input = {}) {
    const workspaceId = clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
    const pluginId = cleanId(input.pluginId || input.plugin_id);
    if (!pluginId) return targetError(400, "plugin_id_invalid", "Valid pluginId is required");
    if (input.readonly === false || input.readOnly === false || input.read_only === false) {
      return targetError(400, "plugin_audit_readonly_required", "Plugin workspace audit is read-only in version 1");
    }
    const schedule = clean(input.schedule, 120);
    if (!schedule) return targetError(400, "plugin_audit_schedule_required", "Audit schedule is required");
    const auditMode = clean(input.auditMode || input.audit_mode || "recent_changes", 40) || "recent_changes";
    if (!ALLOWED_AUDIT_MODES.has(auditMode)) {
      return targetError(400, "plugin_audit_mode_invalid", "Unsupported plugin workspace audit mode");
    }
    const visible = pluginVisible(pluginId, workspaceId);
    if (!visible.ok) return visible;
    const target = normalizeTargetPath(resolveTarget(pluginId, workspaceId));
    if (!target.ok) return target;
    const scope = objectValue(input.scope);
    const ownerPrincipalId = clean(input.ownerPrincipalId || input.owner_principal_id || workspaceId, 120) || workspaceId;
    const title = clean(visible.plugin.title || pluginId, 120) || pluginId;
    const audit = {
      kind: AUDIT_KIND,
      pluginId,
      pluginTitle: title,
      targetWorkspaceId: workspaceId,
      workspacePathRef: target.pathRef,
      workspacePath: target.path,
      auditMode,
      executor: clean(input.executor || DEFAULT_AUDIT_EXECUTOR, 80) || DEFAULT_AUDIT_EXECUTOR,
      readonly: true,
      scope: {
        includeGlobs: compactList(scope.includeGlobs || scope.include_globs, 20, 160),
        excludeGlobs: compactList(scope.excludeGlobs || scope.exclude_globs, 20, 160),
      },
      createdAt: nowIso(),
    };
    const job = {
      kind: AUDIT_KIND,
      name: compactText(input.name || `${title} workspace audit`, 120),
      prompt: buildPrompt({
        pluginId,
        pluginTitle: title,
        auditMode,
        scope: audit.scope,
        instructions: input.instructions || input.notes,
      }),
      schedule,
      deliver: "local",
      skills: [],
      enabled_toolsets: [],
      profile: clean(input.profile || "", 120),
      audit,
      readonly: true,
    };
    const profile = await Promise.resolve(resolveAutomationCronProfile({
      workspaceId,
      ownerPrincipalId,
      job,
      audit,
    }));
    if (profile && !job.profile) job.profile = profile;
    return { ok: true, workspaceId, ownerPrincipalId, plugin: visible.plugin, target, audit, job };
  }

  async function createAuditPlan(input = {}) {
    const draft = await buildAuditDraft(input);
    if (!draft.ok) return draft;
    const automationProvider = input.automationProvider || options.automationProvider;
    if (!automationProvider || typeof automationProvider.createJob !== "function") {
      return targetError(503, "automation_provider_unavailable", "Automation provider is unavailable");
    }
    let created;
    try {
      created = await automationProvider.createJob({
        dryRun: Boolean(input.dryRun || input.dry_run),
        text: clean(input.text || input.instructions || draft.job.name, 1000),
        job: draft.job,
        ownerPrincipalId: draft.ownerPrincipalId,
        accessPolicyContext: objectValue(input.accessPolicyContext || input.access_policy_context),
      });
    } catch (err) {
      return targetError(err.status || 500, "plugin_audit_create_failed", compactText(err.message || err, 800));
    }
    if (!created?.ok) {
      return {
        ok: false,
        status: created?.status || 400,
        code: created?.code || "plugin_audit_create_failed",
        error: compactText(created?.error || "Plugin workspace audit plan creation failed", 800),
        draft: draft.job,
        result: created,
      };
    }
    return {
      ok: true,
      job: created.job || null,
      draft: draft.job,
      audit: draft.audit,
      source: Object.assign({}, created.source || {}, {
        workspaceId: draft.workspaceId,
        ownerPrincipalId: draft.ownerPrincipalId,
        kind: AUDIT_KIND,
      }),
    };
  }

  function upsertAuditInboxItem(input = {}) {
    if (!actionInboxService || typeof actionInboxService.upsertSourceItem !== "function") {
      return targetError(503, "action_inbox_unavailable", "Action Inbox service is unavailable");
    }
    const workspaceId = clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
    const pluginId = cleanId(input.pluginId || input.plugin_id || input.sourceRef?.pluginId);
    const auditRunId = clean(input.auditRunId || input.audit_run_id || input.sourceId || input.source_id, 160);
    const failed = input.status === "error" || input.itemType === "error" || input.error;
    const itemType = failed ? "error" : (input.itemType === "info" ? "info" : "review");
    const severity = clean(input.severity || "normal", 40) || "normal";
    const findingCount = Math.max(0, Number(input.findingCount || input.finding_count || 0) || 0);
    const sourceRef = Object.assign({}, safeAuditSourceRef(input.sourceRef || input.source_ref), {
      kind: AUDIT_KIND,
      pluginId,
      auditRunId,
      severity,
      findingCount,
    });
    return actionInboxService.upsertSourceItem({
      workspaceId,
      sourceType: "automation",
      sourceId: auditRunId || `${pluginId}:latest`,
      itemType,
      priority: severity === "critical" || severity === "high" ? "high" : "normal",
      title: compactText(input.title || (failed ? "Plugin workspace audit failed" : "Plugin workspace audit review"), 180),
      summary: compactText(input.summary || input.error || "", 800),
      sourceRef,
      deepLink: clean(input.deepLink || input.deep_link, 600),
      dedupeKey: clean(input.dedupeKey || input.dedupe_key || `plugin-audit:${workspaceId}:${pluginId}:${auditRunId || "latest"}`, 240),
    });
  }

  return Object.freeze({
    buildAuditDraft,
    createAuditPlan,
    upsertAuditInboxItem,
  });
}

module.exports = {
  AUDIT_KIND,
  createPluginWorkspaceAuditService,
  parseAuditTargetConfig,
};
