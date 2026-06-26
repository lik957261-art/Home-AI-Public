"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createCodexThreadTaskCardService } = require("./codex-thread-task-card-service");

const AUDIT_KIND = "plugin_workspace_audit";
const HOST_AUDIT_TARGET_ID = "home-ai";
const DEFAULT_AUDIT_EXECUTOR = "codex_readonly";
const DEFAULT_DEEP_AUDIT_PROFILE = "hm-owner-openai-xhigh";
const ALLOWED_AUDIT_MODES = new Set(["product_reality", "alignment", "recent_changes", "dirty_diff", "full_sample"]);
const DEFAULT_PLUGIN_AUDIT_THREAD_TITLE = "Plugin Workspace Audit";
const DEFAULT_PLATFORM_AUDIT_THREAD_TITLE = "Home AI Platform Audit";

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function cleanId(value, max = 80) {
  const id = clean(value, max).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) ? id : "";
}

function normalizeAuditTargetId(value) {
  const id = cleanId(value);
  if (["homeai", "home_ai", "home-ai-host", "home_ai_host", "host", "platform"].includes(id)) return HOST_AUDIT_TARGET_ID;
  return id;
}

function auditTargetKind(targetId) {
  return targetId === HOST_AUDIT_TARGET_ID ? "platform" : "plugin";
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
  for (const key of ["reportUrl", "report_url", "automationId", "automation_id", "jobId", "job_id", "latestDocumentName", "latest_document_name", "triggerMode", "trigger_mode", "auditMode", "audit_mode", "route"]) {
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
  const deliverable = objectValue(source.latestDeliverable || source.latest_deliverable);
  if (deliverable.url || deliverable.name) {
    out.latestDeliverable = {
      name: clean(deliverable.name || source.latestDocumentName || source.latest_document_name || "delivery.md", 160) || "delivery.md",
      url: clean(deliverable.url, 600),
      mime: clean(deliverable.mime || deliverable.contentType || deliverable.content_type, 120),
    };
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

function errorResult(err, fallbackCode) {
  if (err?.safe && typeof err.safe === "object") return err.safe;
  return targetError(err?.status || 500, err?.code || fallbackCode || "plugin_audit_request_failed", clean(err?.message || err, 800));
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
  const auditRequestCardService = options.auditRequestCardService || createCodexThreadTaskCardService({
    compactText,
    env: options.env,
    fetch: options.fetch,
    fs: options.fs,
    key: options.codexMobileKey,
    keyFile: options.codexMobileKeyFile,
    baseUrl: options.codexMobileBaseUrl,
    pluginAuditThreadTitle: options.pluginAuditThreadTitle,
    platformAuditThreadTitle: options.platformAuditThreadTitle,
    sourceThreadTitlePrefix: options.sourceThreadTitlePrefix,
    sourceWorkspaceCwd: options.sourceWorkspaceCwd,
  });

  function pluginVisible(pluginId, workspaceId, targetKind = "plugin") {
    if (targetKind === "platform") {
      return { ok: true, plugin: { id: HOST_AUDIT_TARGET_ID, title: "Home AI 宿主" } };
    }
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
    const targetKind = clean(input.targetKind || input.target_kind || "plugin", 40) === "platform" ? "platform" : "plugin";
    const pluginTitle = clean(input.pluginTitle || input.pluginId, 120);
    const mode = clean(input.auditMode, 40);
    const notes = clean(input.instructions || input.notes, 1200);
    const includeGlobs = compactList(input.scope?.includeGlobs || input.scope?.include_globs, 20, 160);
    const excludeGlobs = compactList(input.scope?.excludeGlobs || input.scope?.exclude_globs, 20, 160);
    if (targetKind === "platform") {
      return [
        `You are auditing the Home AI host/platform workspace \"${pluginTitle || "Home AI"}\" for product reality, architecture, implementation, UX, and test evidence alignment.`,
        "",
        "Read-only policy:",
        "- Do not edit files, create files, delete files, run migrations, install packages, commit, push, deploy, restart services, or mutate databases.",
        "- Use canonical contracts, source inspection, tests-as-evidence inspection, git metadata, and bounded read-only runtime evidence only.",
        "- Do not print secrets, access keys, tokens, push endpoints, private user content, raw provider payloads, or long raw logs.",
        "",
        "Home AI platform audit boundary:",
        "- This audit belongs in the dedicated `Home AI Platform Audit` thread, not the ordinary Home AI implementation thread and not `Plugin Workspace Audit`.",
        "- Start from AGENTS.md, docs/DOCS_INDEX.md, canonical platform contracts, source, tests, scripts, git metadata, and bounded read-only runtime evidence.",
        "- Do not use `.agent-context/HANDOFF.md`, archived handoffs, or implementation-thread summaries as audit evidence unless the user explicitly asks to audit those documents.",
        "",
        "Audit objective:",
        "- Required reasoning: run this audit with X High reasoning (`agent.reasoning_effort=xhigh`) for `product_reality` mode.",
        "- Read Home AI `docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md`, `docs/PLATFORM_CONTRACTS/deep-product-reality-audit-contract.md`, and `docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md` before source-first inspection.",
        "- Build a compact platform thesis and core journey/control-plane matrix before findings.",
        "- Compare product intent, architecture/domain contract, code implementation, real UX/failure state, and executable test/harness evidence.",
        "- For every finding, name the owning Home AI layer, required repair surface, closure validation, and suggested implementation thread/card target.",
        "",
        "Audit output:",
        "- Deliver the final report in Simplified Chinese.",
        "- Findings first, ordered by severity.",
        "- Include concrete file/line references when available.",
        "- Include platform thesis, core journey/control-plane matrix, architecture reality review, UX/failure reality review, test/harness reality review, design critique, closure criteria, and suggested task-card destination.",
        "- Keep the report concise and product-safe.",
        "",
        `Audit mode: ${mode}.`,
        includeGlobs.length ? `Include globs: ${includeGlobs.join(", ")}` : "",
        excludeGlobs.length ? `Exclude globs: ${excludeGlobs.join(", ")}` : "",
        notes ? `User guidance: ${notes}` : "",
      ].filter(Boolean).join("\n");
    }
    if (mode === "product_reality") {
      return [
        `You are auditing the Home AI embedded plugin workspace \"${pluginTitle}\" for product reality alignment.`,
        "",
        "Read-only policy:",
        "- Do not edit files, create files, delete files, run migrations, install packages, commit, push, deploy, restart services, or mutate databases.",
        "- Use source inspection, tests-as-evidence inspection, docs, git metadata, and bounded read-only runtime evidence only.",
        "- Do not print secrets, access keys, tokens, push endpoints, private user content, raw provider payloads, or long raw logs.",
        "",
        "Deep Product Reality Audit objective:",
        "- Required reasoning: run this audit with X High reasoning (`agent.reasoning_effort=xhigh`). A Codex Mobile source delivery receipt with `delivery.reasoningEffort=xhigh` and `injectionRuntime.reasoningEffort=xhigh` is sufficient runtime evidence. If no task-card field, delivery receipt, or target runtime evidence confirms X High execution, return blocked_runtime_evidence or redirect to the platform owner instead of producing a shallow audit.",
        "- Read Home AI `docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md` and `docs/PLATFORM_CONTRACTS/deep-product-reality-audit-contract.md`, then read the target plugin's product, design, architecture, module, and test-matrix docs before source-first inspection.",
        "- Build a compact Product Thesis and Core Journey Matrix before findings. Cover two to four core journeys, including actor, trigger, intended completion state, failure/degraded state, data/provider/workspace state touched, implementation evidence, and executable test/harness evidence.",
        "- Compare five layers for those journeys: product intent, architecture/domain contract, code implementation, real user workflow/UX state, and executable test or harness evidence.",
        "- Review domain/state contracts: identity, workspace binding, capability gates, persistence lifecycle, synchronization lifecycle, failure/degraded states, and compatibility/degraded behavior.",
        "- Review architecture reality: service/provider boundaries, overloaded entrypoints, source/prod equivalence, runtime ownership, and test seams.",
        "- Find mismatches where the product says or implies one behavior but implementation, UX, persistence, routing, tests, or docs prove a different behavior.",
        "- Challenge the design itself when docs are contradictory, overpromised, unsafe, unrealistic, or not aligned with Home AI ownership boundaries.",
        "- Classify every non-trivial finding as one of: surface_product_reality, journey_gap, domain_model_gap, design_gap, product_doc_gap, implementation_gap, architecture_gap, ux_gap, test_gap, evidence_gap, fallback_debt, or closure_gap.",
        "- Action-route, label, and manifest findings are valid, but they are `surface_product_reality` unless tied to a core journey, domain/state contract, UX/failure state, and executable evidence boundary.",
        "- Do not stop after one or two convenient small findings. For each target, name the product/design/architecture docs read, selected core journeys, evidence trails, skipped boundaries, and open questions. If that coverage is missing, return partially_closed or closed_surface_only, not closed_deep.",
        "- Prefer root-cause architecture findings over local workaround recommendations. Symptom suppression, silent compatibility behavior, or another patch layer is not closure.",
        "- For each finding, name the owning workspace/layer, required repair surface, closure validation, and whether the repair belongs to the plugin thread, Home AI implementation thread, or audit follow-up.",
        "",
        "Task-card and closure workflow:",
        "- The audit thread must not repair directly. It must send bounded repair cards to the owning workspace/thread.",
        "- Deployment-only plugin residuals belong to the plugin implementation thread when central `deploy:macos -- --plugin <plugin-id>` can complete closure. Do not send a Home AI task card merely because the plugin needs the shared deploy script. Send Home AI cards only for true platform/deploy-script/proxy/provisioning/Gateway/shared-policy/permission blockers.",
        "- Every repair card must include a Return Card Required section with completion, rejection, redirect, or blocked reply requirements.",
        "- Closure requires implementation-thread return evidence plus a separate read-only closure verification pass by the audit thread.",
        "",
        "Audit output:",
        "- Deliver the final report in Simplified Chinese.",
        "- Findings first, ordered by severity.",
        "- Include concrete file/line references when available.",
        "- Include Product Thesis, Core Journey Matrix, Domain/State Contract Review, Architecture Reality Review, UX/Failure Reality Review, Test/Harness Reality Review, Design Critique, closure criteria, and suggested task-card destination.",
        "- Keep the report concise and product-safe.",
        "",
        `Audit mode: ${mode}.`,
        includeGlobs.length ? `Include globs: ${includeGlobs.join(", ")}` : "",
        excludeGlobs.length ? `Exclude globs: ${excludeGlobs.join(", ")}` : "",
        notes ? `User guidance: ${notes}` : "",
      ].filter(Boolean).join("\n");
    }
    if (mode === "alignment") {
      return [
        `You are auditing the Home AI embedded plugin workspace \"${pluginTitle}\" for design-goal alignment.`,
        "",
        "Read-only policy:",
        "- Do not edit files, create files, delete files, run migrations, install packages, commit, push, deploy, restart services, or mutate databases.",
        "- Use source inspection and bounded metadata commands only.",
        "- Do not print secrets, access keys, tokens, push endpoints, private user content, or long raw logs.",
        "",
        "Alignment audit objective:",
        "- Read the plugin workspace context and docs first, including `.agent-context/PROJECT_CONTEXT.md`, `.agent-context/HANDOFF.md`, `docs/README.md`, `docs/DOCS_INDEX.md`, product requirements, architecture notes, implementation notes, and test matrices when present.",
        "- Compare documented goals, platform contracts, and current implementation.",
        "- Identify implemented goals, partial implementations, missing promised behavior, stale docs, security/privacy risks, cross-platform/deploy gaps, UI consistency gaps, performance/extensibility risks, and missing harness coverage.",
        "- Produce suggested task cards only as recommendations. Do not perform the repairs.",
        "",
        "Audit output:",
        "- Deliver the final report in Simplified Chinese.",
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
    const pluginId = normalizeAuditTargetId(input.pluginId || input.plugin_id);
    if (!pluginId) return targetError(400, "plugin_id_invalid", "Valid pluginId is required");
    const targetKind = auditTargetKind(pluginId);
    if (input.readonly === false || input.readOnly === false || input.read_only === false) {
      return targetError(400, "plugin_audit_readonly_required", "Plugin workspace audit is read-only in version 1");
    }
    const schedule = clean(input.schedule, 120);
    if (!schedule) return targetError(400, "plugin_audit_schedule_required", "Audit schedule is required");
    const auditMode = clean(input.auditMode || input.audit_mode || "recent_changes", 40) || "recent_changes";
    if (!ALLOWED_AUDIT_MODES.has(auditMode)) {
      return targetError(400, "plugin_audit_mode_invalid", "Unsupported plugin workspace audit mode");
    }
    const visible = pluginVisible(pluginId, workspaceId, targetKind);
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
      targetKind,
      targetThreadTitle: targetKind === "platform" ? DEFAULT_PLATFORM_AUDIT_THREAD_TITLE : DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
      targetWorkspaceId: workspaceId,
      workspacePathRef: target.pathRef,
      workspacePath: target.path,
      auditMode,
      triggerMode: clean(input.triggerMode || input.trigger_mode || "scheduled", 40) || "scheduled",
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
        targetKind,
        auditMode,
        scope: audit.scope,
        instructions: input.instructions || input.notes,
      }),
      schedule,
      deliver: "local",
      skills: [],
      enabled_toolsets: [],
      profile: clean(input.profile || (auditMode === "product_reality" ? (options.deepAuditProfile || options.env?.HOMEAI_PLUGIN_WORKSPACE_AUDIT_XHIGH_PROFILE || DEFAULT_DEEP_AUDIT_PROFILE) : ""), 120),
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

  async function triggerManualAudit(input = {}) {
    const draft = await buildAuditDraft(Object.assign({}, input, {
      schedule: clean(input.schedule, 120) || "1m",
      auditMode: clean(input.auditMode || input.audit_mode || "product_reality", 40) || "product_reality",
      triggerMode: "manual",
    }));
    if (!draft.ok) return draft;
    const dryRun = Boolean(input.dryRun || input.dry_run);
    const requestCard = buildAuditRequestCard(draft, input);
    if (dryRun) {
      return {
        ok: true,
        requestCard: Object.assign({ dryRun: true }, requestCard),
        draft: requestCard.draft,
        audit: draft.audit,
        source: {
          name: "codex_mobile_task_card",
          kind: AUDIT_KIND,
          workspaceId: draft.workspaceId,
          ownerPrincipalId: draft.ownerPrincipalId,
          triggerMode: "manual",
          dispatch: "dry_run",
        },
      };
    }
    if (!auditRequestCardService || typeof auditRequestCardService.sendTaskCard !== "function") {
      return targetError(503, "audit_request_card_service_unavailable", "Audit request card service is unavailable");
    }
    let sent;
    try {
      sent = await auditRequestCardService.sendTaskCard(requestCard);
    } catch (err) {
      return Object.assign(errorResult(err, "audit_request_card_send_failed"), {
        draft: requestCard.draft,
        audit: draft.audit,
      });
    }
    return {
      ok: true,
      requestCard: sent,
      draft: requestCard.draft,
      audit: draft.audit,
      source: Object.assign({}, sent?.result || {}, {
        name: "codex_mobile_task_card",
        workspaceId: draft.workspaceId,
        ownerPrincipalId: draft.ownerPrincipalId,
        kind: AUDIT_KIND,
        triggerMode: "manual",
        dispatch: "central_audit_thread",
        sourceThreadId: sent?.sourceThreadId,
        targetThreadId: sent?.targetThreadId,
      }),
    };
  }

  function buildAuditRequestCard(draft, input = {}) {
    const auditMode = draft.audit.auditMode || "product_reality";
    const targetKind = draft.audit.targetKind === "platform" ? "platform" : "plugin";
    const targetThreadTitle = targetKind === "platform" ? DEFAULT_PLATFORM_AUDIT_THREAD_TITLE : DEFAULT_PLUGIN_AUDIT_THREAD_TITLE;
    const title = targetKind === "platform"
      ? `Home AI ${auditMode === "product_reality" ? "Product Reality" : auditMode} audit`
      : `${draft.plugin.title || draft.audit.pluginTitle || draft.audit.pluginId} ${auditMode === "product_reality" ? "Product Reality" : auditMode} audit`;
    const summary = targetKind === "platform"
      ? `Home AI platform audit request for ${draft.audit.targetWorkspaceId}`
      : `${draft.audit.pluginId} audit request for ${draft.audit.targetWorkspaceId}`;
    const instructions = clean(input.instructions || input.notes, 1200);
    const body = [
      `# Central Audit Request: ${draft.audit.pluginTitle || draft.audit.pluginId}`,
      "",
      "Home AI trigger boundary:",
      "- Home AI is only the request trigger for this audit.",
      "- Do not run the audit inside Home AI Automation, CRON, or the Home AI app process.",
      targetKind === "platform"
        ? "- This request targets the central `Home AI Platform Audit` thread only."
        : "- This request targets the central `Plugin Workspace Audit` thread only.",
      targetKind === "platform"
        ? "- The platform audit thread owns read-only evidence gathering, findings, repair-card routing, return-card tracking, and closure verification."
        : "- The central audit thread owns workspace fan-out, repair-card routing, return-card tracking, and closure verification.",
      "- The audit thread must send a final return card back to the Home AI source thread.",
      "",
      "Reasoning Requirement:",
      "- Required reasoning effort: `xhigh` / X High.",
      "- Preferred Home AI/Gateway profile when a fresh profile-backed run is used: `hm-owner-openai-xhigh`.",
      "- A Codex Mobile source-thread delivery receipt with `delivery.reasoningEffort=xhigh` and `injectionRuntime.reasoningEffort=xhigh` is sufficient runtime evidence.",
      "- If no task-card field, delivery receipt, or target runtime evidence confirms X High execution, return `blocked_runtime_evidence` or `redirected` instead of producing a shallow audit result.",
      "",
      "Audit target:",
      `- target_id: ${draft.audit.pluginId}`,
      `- target_kind: ${targetKind}`,
      targetKind === "plugin" ? `- plugin_id: ${draft.audit.pluginId}` : "",
      targetKind === "plugin" ? `- plugin_title: ${draft.audit.pluginTitle || draft.audit.pluginId}` : "",
      targetKind === "platform" ? "- platform_title: Home AI" : "",
      `- target_workspace_id: ${draft.audit.targetWorkspaceId}`,
      `- workspace_path_ref: ${draft.audit.workspacePathRef}`,
      `- workspace_path: ${draft.audit.workspacePath}`,
      `- audit_mode: ${auditMode}`,
      "",
      "Audit instructions:",
      draft.job.prompt,
      instructions ? `\nAdditional user guidance:\n${instructions}` : "",
      "",
      "Return Card Required:",
      "- Reply to the Home AI source thread with status `completed`, `rejected`, `redirected`, or `blocked`.",
      "- Include bounded findings, repair cards sent, closure status, residual risks, and privacy confirmation.",
      "- Do not include raw secrets, access keys, cookies, launch tokens, private payloads, provider payloads, database rows, full prompts, or long logs.",
    ].filter(Boolean).join("\n");
    return {
      auditKind: targetKind,
      targetThreadTitle: clean(input.targetThreadTitle || input.target_thread_title || targetThreadTitle, 160),
      title,
      summary,
      body,
      workflowMode: "manual",
      reasoningEffort: auditMode === "product_reality" ? "xhigh" : "",
      requestId: clean(input.requestId || input.request_id || `${targetKind}-audit:${draft.audit.targetWorkspaceId}:${draft.audit.pluginId}:${auditMode}`, 240),
      draft: {
        kind: AUDIT_KIND,
        title,
        prompt: draft.job.prompt,
        profile: draft.job.profile,
        reasoningEffort: auditMode === "product_reality" ? "xhigh" : "",
        auditMode,
        triggerMode: "manual",
        readonly: true,
      },
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
    const auditMode = clean(input.auditMode || input.audit_mode || input.sourceRef?.auditMode || input.sourceRef?.audit_mode || "product_reality", 80) || "product_reality";
    const triggerMode = clean(input.triggerMode || input.trigger_mode || input.sourceRef?.triggerMode || input.sourceRef?.trigger_mode || "", 80);
    const sourceRef = Object.assign({}, safeAuditSourceRef(input.sourceRef || input.source_ref), {
      kind: AUDIT_KIND,
      pluginId,
      auditRunId,
      auditMode,
      triggerMode,
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
      dedupeKey: clean(input.dedupeKey || input.dedupe_key || `plugin-audit:${workspaceId}:${pluginId}:${auditMode}:${itemType}`, 240),
    });
  }

  return Object.freeze({
    buildAuditDraft,
    createAuditPlan,
    triggerManualAudit,
    upsertAuditInboxItem,
  });
}

module.exports = {
  AUDIT_KIND,
  createPluginWorkspaceAuditService,
  parseAuditTargetConfig,
};
