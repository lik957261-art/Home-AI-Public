"use strict";

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function arrayOfStrings(value, limit = 12) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return dedupe(raw.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, limit);
}

function cleanWorkspaceCandidate(workspace = {}) {
  if (!workspace || typeof workspace !== "object") return null;
  const id = String(workspace.id || workspace.workspaceId || "").trim();
  if (!id) return null;
  const displayName = String(
    workspace.displayName
    || workspace.display_name
    || workspace.label
    || workspace.name
    || id
  ).trim();
  const aliases = arrayOfStrings([
    ...(Array.isArray(workspace.aliases) ? workspace.aliases : []),
    workspace.label,
    workspace.name,
    workspace.displayName,
    workspace.display_name,
  ], 8).filter((item) => item !== id && item !== displayName);
  return {
    workspaceId: id,
    displayName: displayName || id,
    aliases,
  };
}

function workspaceCandidateContext(workspace = {}) {
  const current = cleanWorkspaceCandidate(workspace);
  const candidates = [];
  const seen = new Set();
  for (const item of [current, ...(Array.isArray(workspace?.assignableWorkspaces) ? workspace.assignableWorkspaces : [])]) {
    const candidate = cleanWorkspaceCandidate(item);
    if (!candidate || seen.has(candidate.workspaceId)) continue;
    seen.add(candidate.workspaceId);
    candidates.push(candidate);
  }
  return candidates.slice(0, 60);
}

function parseFirstBalancedJsonObject(value) {
  const text = String(value || "");
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, index + 1));
          } catch (_) {
            break;
          }
        }
      }
    }
  }
  return null;
}

function extractJsonObject(text, label = "draft") {
  const raw = String(text || "").trim();
  if (!raw) throw new Error(`Hermes model returned an empty ${label}`);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch (_) {
    const parsed = parseFirstBalancedJsonObject(candidate);
    if (parsed) return parsed;
    throw new Error(`Hermes model did not return valid JSON for the ${label}`);
  }
}

function normalizeAutomationSchedule(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return String(value.expr || value.expression || value.cron || value.run_at || value.runAt || value.interval || value.display || "").trim();
}

function normalizeAutomationRepeat(value, schedule) {
  if (value == null || value === "" || /^forever$/i.test(String(value))) return null;
  if (/^once$/i.test(String(value))) return 1;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return /\bevery\b|[*]/i.test(String(schedule || "")) ? null : 1;
}

function createNaturalLanguageDraftService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const hermesModelText = typeof options.hermesModelText === "function"
    ? options.hermesModelText
    : async () => { throw new Error("hermesModelText dependency is required"); };
  const createAutomationDeliveryRequirement = typeof options.createAutomationDeliveryRequirement === "function"
    ? options.createAutomationDeliveryRequirement
    : () => "";
  const kanbanPlanService = options.kanbanPlanService || {};
  const automationCreateModel = options.automationCreateModel || "";
  const automationTimeoutMs = Math.max(5000, Number(options.automationTimeoutMs || 120000));
  const kanbanPlanTimeoutMs = Math.max(5000, Number(options.kanbanPlanTimeoutMs || automationTimeoutMs));
  const createConversationId = typeof options.createConversationId === "function"
    ? options.createConversationId
    : (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const todoIntakeSkillText = compactText(options.todoIntakeSkillText || [
    "# Home AI Todo Intake",
    "Use this Skill when the user asks Home AI to create a Todo, reminder, alarm, or assigned action item.",
    "The model must not directly create, complete, delete, or schedule Todo records.",
    "The model only returns a structured draft. Home AI host services validate workspace permissions, identities, dates, recurrence, Web Push, audit events, and persistence before anything is created.",
    "Do not use keyword-only guessing for people, dates, or recurrence. If a field is ambiguous, mark it missing or set needsConfirmation=true.",
    "Return a single JSON object with title, summary, assigneeWorkspaceId, assigneeDisplayName, creatorWorkspaceId, dueAt, remindAt, priority, recurrence, needsConfirmation, missingFields, confidence, and sourceText.",
  ].join("\n"), 4000);

  function normalizeAutomationDraft(raw, sourceText) {
    const draft = raw && typeof raw === "object" ? raw : {};
    if (draft.needs_clarification || draft.needsClarification) {
      throw new Error(compactText(draft.clarification || draft.question || "Automation request needs clarification", 240));
    }
    const schedule = normalizeAutomationSchedule(draft.schedule || draft.scheduleText || draft.schedule_text || draft.cron);
    if (!schedule) throw new Error("Hermes model did not produce a schedule for the automation");
    const name = compactText(draft.name || draft.title || sourceText, 80);
    const promptBase = String(draft.prompt || draft.task || draft.goal || draft.objective || sourceText || "").trim();
    if (!promptBase) throw new Error("Hermes model did not produce an automation prompt");
    const prompt = [
      promptBase,
      "",
      createAutomationDeliveryRequirement(),
    ].join("\n");
    return {
      name,
      prompt,
      schedule,
      repeat: normalizeAutomationRepeat(draft.repeat, schedule),
      deliver: "local",
      skills: arrayOfStrings(draft.skills),
      enabled_toolsets: arrayOfStrings(draft.enabled_toolsets || draft.enabledToolsets),
      model: typeof draft.model === "string" ? draft.model.trim() : "",
      provider: typeof draft.provider === "string" ? draft.provider.trim() : "",
    };
  }

  async function interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId) {
    const prompt = [
      "You interpret a natural-language request into one Hermes CRON automation draft.",
      "Return strict JSON only. Do not include Markdown fences or prose.",
      "Use Asia/Shanghai local time. Current server time is " + nowIso() + ".",
      "The schedule field must be directly accepted by Hermes cron: examples are `30m`, `every 2h`, `0 8 * * *`, or an ISO timestamp.",
      "For daily/weekly/monthly recurring Chinese requests, prefer a 5-field cron expression in Asia/Shanghai wall-clock time.",
      "If required schedule or task intent is missing, return {\"needs_clarification\":true,\"clarification\":\"...\"}.",
      "Schema: {\"name\":\"short title\",\"prompt\":\"self-contained unattended task prompt\",\"schedule\":\"Hermes schedule string\",\"repeat\":null,\"skills\":[],\"enabled_toolsets\":[]}",
      `Workspace principal: ${ownerPrincipalId}. Workspace label: ${workspace?.label || workspace?.id || ""}.`,
      "User request:",
      text,
    ].join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model: automationCreateModel,
      reasoning_effort: "low",
      conversation: createConversationId("hermes_web_automation_create"),
      instructions: "Extract exactly one automation definition. Return JSON only.",
      access_policy_context: sanitizePolicy(workspace?.policy || {}),
    }, automationTimeoutMs);
    return normalizeAutomationDraft(extractJsonObject(output, "automation draft"), text);
  }

  function normalizeKanbanDraft(raw, sourceText, workspaceId) {
    const draft = raw && typeof raw === "object" ? raw : {};
    if (draft.needs_clarification || draft.needsClarification) {
      throw new Error(compactText(draft.clarification || draft.question || "Kanban request needs clarification", 240));
    }
    const content = compactText(
      draft.content || draft.title || draft.name || draft.card || draft.task || sourceText,
      160,
    );
    if (!content) throw new Error("Hermes model did not produce Kanban card content");
    return {
      content,
      description: compactText(draft.description || draft.details || draft.notes || "", 4000),
      assignee: String(draft.assignee || draft.owner || workspaceId || "owner").trim() || "owner",
      dueTime: String(draft.dueTime || draft.due_time || draft.due || draft.deadline || "").trim(),
      reason: compactText(draft.reason || "Created from Hermes Mobile natural-language Kanban request.", 240),
    };
  }

  async function interpretKanbanNaturalLanguage(text, workspace, ownerPrincipalId) {
    const prompt = [
      "You interpret a natural-language request into one Hermes Mobile Kanban card draft.",
      "Return strict JSON only. Do not include Markdown fences or prose.",
      "Use Asia/Shanghai local time. Current server time is " + nowIso() + ".",
      "This is for a Kanban execution board, not a reminder todo list.",
      "Infer a short actionable card content/title and an optional description.",
      "Keep proper nouns such as Gmail, Hotmail, MINJI, Hermes in the original language.",
      "If assignee is omitted, default to the workspace principal.",
      "If due time is omitted or unclear, leave dueTime empty.",
      "If required execution intent is missing, return {\"needs_clarification\":true,\"clarification\":\"...\"}.",
      "Schema: {\"content\":\"short card title\",\"description\":\"optional details\",\"assignee\":\"workspace principal id or empty\",\"dueTime\":\"YYYY-MM-DD HH:mm or empty\",\"reason\":\"optional short note\"}",
      `Workspace principal: ${ownerPrincipalId}. Workspace label: ${workspace?.label || workspace?.id || ""}.`,
      "User request:",
      text,
    ].join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model: automationCreateModel,
      reasoning_effort: "low",
      conversation: createConversationId("hermes_web_kanban_create"),
      instructions: "Extract exactly one Kanban card draft. Return JSON only.",
      access_policy_context: sanitizePolicy(workspace?.policy || {}),
    }, automationTimeoutMs);
    return normalizeKanbanDraft(extractJsonObject(output, "Kanban draft"), text, ownerPrincipalId);
  }

  function normalizeTodoDraft(raw, sourceText, workspaceId) {
    const draft = raw && typeof raw === "object" ? raw : {};
    if (draft.needs_clarification || draft.needsClarification) {
      throw new Error(compactText(draft.clarification || draft.question || "Todo request needs clarification", 240));
    }
    const recurrence = draft.recurrence && typeof draft.recurrence === "object"
      ? draft.recurrence
      : { kind: String(draft.recurrence || "none").trim() || "none" };
    const missingFields = arrayOfStrings(draft.missingFields || draft.missing_fields, 12);
    const title = compactText(draft.title || draft.content || draft.task || "", 180).trim();
    if (!title) missingFields.push("title");
    const assigneeWorkspaceId = String(draft.assigneeWorkspaceId || draft.assignee_workspace_id || "").trim();
    if (!assigneeWorkspaceId && !draft.assigneeDisplayName && !draft.assignee_display_name) missingFields.push("assigneeWorkspaceId");
    const confidence = Number(draft.confidence ?? draft.modelConfidence ?? 0.8);
    return {
      title,
      summary: compactText(draft.summary || draft.description || draft.details || "", 800).trim(),
      assigneeWorkspaceId,
      assigneeDisplayName: String(draft.assigneeDisplayName || draft.assignee_display_name || "").trim(),
      creatorWorkspaceId: String(draft.creatorWorkspaceId || draft.creator_workspace_id || workspaceId || "owner").trim() || "owner",
      dueAt: String(draft.dueAt || draft.due_at || draft.deadline || "").trim(),
      remindAt: String(draft.remindAt || draft.remind_at || draft.availableAt || "").trim(),
      priority: ["normal", "high", "urgent"].includes(String(draft.priority || "").trim()) ? String(draft.priority).trim() : "normal",
      recurrence,
      needsConfirmation: Boolean(draft.needsConfirmation || draft.needs_confirmation || missingFields.length || confidence < 0.75),
      missingFields: dedupe(missingFields),
      confidence: Number.isFinite(confidence) ? confidence : 0.8,
      sourceText: compactText(draft.sourceText || draft.source_text || sourceText || "", 500),
    };
  }

  async function interpretTodoNaturalLanguage(text, workspace, ownerPrincipalId) {
    const prompt = [
      "You interpret a natural-language request into one Home AI Todo draft.",
      "Return strict JSON only. Do not include Markdown fences or prose.",
      "Use Asia/Shanghai local time. Current server time is " + nowIso() + ".",
      "Follow this Skill exactly:",
      todoIntakeSkillText,
      "Known current workspace:",
      JSON.stringify({
        workspaceId: workspace?.id || ownerPrincipalId || "owner",
        workspaceLabel: workspace?.label || workspace?.name || workspace?.id || "",
        workspacePrincipal: ownerPrincipalId,
      }),
      "Known assignable workspace candidates:",
      JSON.stringify(workspaceCandidateContext(workspace)),
      "If a person or workspace name exactly matches a candidate displayName or alias, use that candidate's workspaceId.",
      "If the name is not in the candidate list or remains ambiguous, leave assigneeWorkspaceId empty and set assigneeDisplayName plus needsConfirmation=true.",
      "If the request is for the current user/myself/me/my, use the current workspace id as assigneeWorkspaceId.",
      "If the user gives only a date with no clock time, use the end of that local day as dueAt.",
      "Return ISO-8601 timestamps with timezone offset when possible.",
      "User request:",
      text,
    ].join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model: automationCreateModel,
      reasoning_effort: "low",
      conversation: createConversationId("home_ai_todo_intake"),
      instructions: "Use the Home AI Todo Intake Skill. Extract exactly one Todo draft. Return JSON only.",
      access_policy_context: sanitizePolicy(workspace?.policy || {}),
    }, automationTimeoutMs);
    return normalizeTodoDraft(extractJsonObject(output, "Todo draft"), text, workspace?.id || ownerPrincipalId || "owner");
  }

  async function detectTodoNaturalLanguage(text, workspace, ownerPrincipalId) {
    const prompt = [
      "Decide whether the user is asking Home AI to create a Todo, reminder, alarm, or assigned action item.",
      "Return strict JSON only. Do not include Markdown fences or prose.",
      "Do not use keyword-only guessing. Use semantic intent, and be conservative when the wording is probably ordinary chat.",
      "Requests asking Home AI, Hermes, a plugin, or an agent to do work now are ordinary chat execution requests, not Todo creation requests.",
      "Examples that are not Todos unless the user explicitly says to add/save/create a Todo/reminder/alarm/later follow-up: inspect code, operate a plugin, search, summarize, fix a bug, rename product copy, replace text, deploy, continue current work.",
      "If this is not a Todo/reminder/alarm creation request, return {\"isTodoRequest\":false,\"confidence\":0,\"todoDraft\":null}.",
      "If it is a Todo request, return {\"isTodoRequest\":true,\"confidence\":0.0,\"todoDraft\":{...}} using the Home AI Todo Intake Skill output shape.",
      "Use Asia/Shanghai local time. Current server time is " + nowIso() + ".",
      "Follow this Skill exactly when producing todoDraft:",
      todoIntakeSkillText,
      "Known current workspace:",
      JSON.stringify({
        workspaceId: workspace?.id || ownerPrincipalId || "owner",
        workspaceLabel: workspace?.label || workspace?.name || workspace?.id || "",
        workspacePrincipal: ownerPrincipalId,
      }),
      "Known assignable workspace candidates:",
      JSON.stringify(workspaceCandidateContext(workspace)),
      "If a person or workspace name exactly matches a candidate displayName or alias, use that candidate's workspaceId.",
      "If the name is not in the candidate list or remains ambiguous, leave assigneeWorkspaceId empty and set assigneeDisplayName plus needsConfirmation=true.",
      "If the request is for the current user/myself/me/my, use the current workspace id as assigneeWorkspaceId.",
      "If the user gives only a date with no clock time, use the end of that local day as dueAt.",
      "Return ISO-8601 timestamps with timezone offset when possible.",
      "User request:",
      text,
    ].join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model: automationCreateModel,
      reasoning_effort: "low",
      conversation: createConversationId("home_ai_todo_detect"),
      instructions: "Use the Home AI Todo Intake Skill only to decide and draft Todo creation. Return JSON only.",
      access_policy_context: sanitizePolicy(workspace?.policy || {}),
    }, automationTimeoutMs);
    const raw = extractJsonObject(output, "Todo intent");
    const isTodoRequest = Boolean(raw?.isTodoRequest || raw?.is_todo_request);
    const confidence = Number(raw?.confidence ?? raw?.modelConfidence ?? (isTodoRequest ? 0.8 : 0));
    if (!isTodoRequest) {
      return {
        isTodoRequest: false,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        todoDraft: null,
      };
    }
    const draftSource = raw.todoDraft || raw.todo_draft || raw.draft || raw;
    return {
      isTodoRequest: true,
      confidence: Number.isFinite(confidence) ? confidence : 0.8,
      todoDraft: normalizeTodoDraft(draftSource, text, workspace?.id || ownerPrincipalId || "owner"),
    };
  }

  async function planKanbanMultiAgent(text, workspace, ownerPrincipalId, optionsForPlan = {}) {
    const sourceText = compactText(text, 8000);
    if (!sourceText) throw new Error("Kanban plan text is required");
    const maxParallel = kanbanPlanService.normalizeMaxParallel(optionsForPlan.maxParallel);
    const reasoningEffort = kanbanPlanService.normalizeReasoningEffort(optionsForPlan.reasoningEffort || optionsForPlan.reasoning_effort) || "medium";
    const prompt = [
      "You are the Hermes Mobile Kanban planner.",
      "Return strict JSON only. Do not include Markdown fences or prose.",
      "The user is creating a multi-Agent execution plan for a Kanban board.",
      `The maximum parallel worker count for this plan is ${maxParallel}. Do not propose more than ${maxParallel} first-wave runnable cards.`,
      "Create 3 to 8 cards. Make cards independently executable when possible, but add dependencies for integration, verification, or sequential work.",
      "Every card must have a short actionable title, a description, expected deliverables, acceptance criteria, and dependsOn as 1-based card numbers.",
      "Add a final integration or verification card when the work has multiple outputs.",
      "Schema: {\"summary\":\"...\",\"cards\":[{\"title\":\"...\",\"description\":\"...\",\"deliverables\":[\"...\"],\"acceptance\":[\"...\"],\"dependsOn\":[1]}]}",
      `Workspace principal: ${ownerPrincipalId}. Workspace label: ${workspace?.label || workspace?.id || ""}.`,
      "User request:",
      sourceText,
    ].join("\n\n");
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model: automationCreateModel,
      reasoning_effort: reasoningEffort,
      conversation: createConversationId("hermes_web_kanban_plan"),
      instructions: "Plan a multi-Agent Kanban decomposition. Return JSON only.",
      access_policy_context: sanitizePolicy(workspace?.policy || {}),
    }, kanbanPlanTimeoutMs);
    try {
      return kanbanPlanService.normalizePlan(extractJsonObject(output, "Kanban plan"), sourceText, workspace?.id || ownerPrincipalId || "owner", { maxParallel, reasoningEffort });
    } catch (err) {
      const fallback = kanbanPlanService.normalizePlan({
        summary: sourceText,
        cards: kanbanPlanService.fallbackCards(sourceText),
      }, sourceText, workspace?.id || ownerPrincipalId || "owner", { maxParallel, reasoningEffort });
      fallback.warning = compactText(`Planner JSON fallback used: ${err.message || String(err)}`, 300);
      return fallback;
    }
  }

  return Object.freeze({
    extractJsonObject,
    normalizeAutomationSchedule,
    normalizeAutomationRepeat,
    normalizeAutomationDraft,
    interpretAutomationNaturalLanguage,
    normalizeKanbanDraft,
    interpretKanbanNaturalLanguage,
    normalizeTodoDraft,
    interpretTodoNaturalLanguage,
    detectTodoNaturalLanguage,
    planKanbanMultiAgent,
  });
}

module.exports = {
  createNaturalLanguageDraftService,
  extractJsonObject,
  normalizeAutomationSchedule,
  normalizeAutomationRepeat,
  arrayOfStrings,
  workspaceCandidateContext,
};
