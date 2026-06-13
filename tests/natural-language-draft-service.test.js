"use strict";

const assert = require("node:assert/strict");
const { createKanbanPlanService } = require("../adapters/kanban-plan-service");
const {
  createNaturalLanguageDraftService,
  extractJsonObject,
  normalizeAutomationSchedule,
  normalizeAutomationRepeat,
} = require("../adapters/natural-language-draft-service");

function makeService(outputs = []) {
  const calls = [];
  const planService = createKanbanPlanService({
    defaultMaxParallel: 2,
    maxParallelLimit: 4,
    maxCards: 6,
    validReasoningEfforts: new Set(["low", "medium", "high", "xhigh"]),
    createPlanId: () => "plan-1",
  });
  const service = createNaturalLanguageDraftService({
    automationCreateModel: "test-model",
    automationTimeoutMs: 9000,
    kanbanPlanTimeoutMs: 11000,
    createAutomationDeliveryRequirement: () => "Deliver locally.",
    createConversationId: (prefix) => `${prefix}_fixed`,
    hermesModelText: async (body, timeoutMs) => {
      calls.push({ body, timeoutMs });
      if (!outputs.length) throw new Error("no fake output");
      return outputs.shift();
    },
    kanbanPlanService: planService,
    nowIso: () => "2026-05-15T10:00:00.000+08:00",
    sanitizePolicy: () => ({ allowed_toolsets: ["todo"] }),
  });
  return { service, calls };
}

async function main() {
{
  assert.deepEqual(extractJsonObject("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(extractJsonObject("prefix {\"value\":3} suffix"), { value: 3 });
  assert.deepEqual(extractJsonObject("{\"value\":3}\n\nextra explanation {\"ignored\":true}"), { value: 3 });
  assert.deepEqual(extractJsonObject("```json\n{\"value\":{\"nested\":true}}\n```\n\nDone."), { value: { nested: true } });
  assert.throws(() => extractJsonObject("", "draft"), /empty draft/);
}

{
  assert.equal(normalizeAutomationSchedule({ cron: "0 8 * * *" }), "0 8 * * *");
  assert.equal(normalizeAutomationSchedule({ runAt: "2026-05-15T09:00:00+08:00" }), "2026-05-15T09:00:00+08:00");
  assert.equal(normalizeAutomationRepeat("once", "0 8 * * *"), 1);
  assert.equal(normalizeAutomationRepeat("", "0 8 * * *"), null);
  assert.equal(normalizeAutomationRepeat("3", "0 8 * * *"), 3);
}

{
  const { service } = makeService();
  const draft = service.normalizeAutomationDraft({
    title: "Morning report",
    task: "Summarize overnight mail",
    schedule: { cron: "0 8 * * *" },
    skills: ["mail", "mail", "summary"],
    enabledToolsets: "web",
  }, "fallback");
  assert.equal(draft.name, "Morning report");
  assert.match(draft.prompt, /Summarize overnight mail/);
  assert.match(draft.prompt, /Deliver locally/);
  assert.equal(draft.schedule, "0 8 * * *");
  assert.equal(draft.repeat, null);
  assert.deepEqual(draft.skills, ["mail", "summary"]);
  assert.deepEqual(draft.enabled_toolsets, ["web"]);
}

{
  const { service, calls } = makeService([
    JSON.stringify({ name: "Weekly cleanup", prompt: "Clean mailbox", schedule: "0 20 * * 5", repeat: 2 }),
  ]);
  const draft = await service.interpretAutomationNaturalLanguage("clean Hotmail weekly", { id: "owner", label: "Owner", policy: { secret: "redacted by fake" } }, "owner");
  assert.equal(draft.name, "Weekly cleanup");
  assert.equal(draft.repeat, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeoutMs, 9000);
  assert.equal(calls[0].body.model, "test-model");
  assert.equal(calls[0].body.conversation, "hermes_web_automation_create_fixed");
  assert.deepEqual(calls[0].body.access_policy_context, { allowed_toolsets: ["todo"] });
}

{
  const { service } = makeService();
  const draft = service.normalizeKanbanDraft({
    title: "Fix upload focus",
    details: "Keep recorder state stable.",
    owner: "weixin_stephen",
    deadline: "2026-05-16 21:00",
  }, "fallback", "owner");
  assert.equal(draft.content, "Fix upload focus");
  assert.equal(draft.description, "Keep recorder state stable.");
  assert.equal(draft.assignee, "weixin_stephen");
  assert.equal(draft.dueTime, "2026-05-16 21:00");
}

{
  const { service } = makeService();
  const draft = service.normalizeTodoDraft({
    title: "\u56fd\u5185\u62a5\u7a0e",
    assigneeWorkspaceId: "owner",
    creatorWorkspaceId: "owner",
    dueAt: "2026-06-30T23:59:00+08:00",
    priority: "normal",
    recurrence: { kind: "none" },
    confidence: 0.93,
  }, "fallback", "owner");
  assert.equal(draft.title, "\u56fd\u5185\u62a5\u7a0e");
  assert.equal(draft.assigneeWorkspaceId, "owner");
  assert.equal(draft.needsConfirmation, false);
  assert.deepEqual(draft.missingFields, []);
}

{
  const { service, calls } = makeService([
    JSON.stringify({
      title: "\u56fd\u5185\u62a5\u7a0e",
      assigneeWorkspaceId: "owner",
      creatorWorkspaceId: "owner",
      dueAt: "2026-06-30T23:59:00+08:00",
      priority: "normal",
      recurrence: { kind: "none" },
      needsConfirmation: false,
      missingFields: [],
      confidence: 0.95,
      sourceText: "\u589e\u52a0\u6211\u7684\u4e00\u4e2a\u622a\u81f3\u5230 6 \u6708 30 \u53f7\u7684\u5f85\u529e\u4e8b\u9879\uff0c\u56fd\u5185\u62a5\u7a0e",
    }),
  ]);
  const draft = await service.interpretTodoNaturalLanguage(
    "\u589e\u52a0\u6211\u7684\u4e00\u4e2a\u622a\u81f3\u5230 6 \u6708 30 \u53f7\u7684\u5f85\u529e\u4e8b\u9879\uff0c\u56fd\u5185\u62a5\u7a0e",
    { id: "owner", label: "Owner", policy: { secret: "redacted by fake" } },
    "owner",
  );
  assert.equal(draft.title, "\u56fd\u5185\u62a5\u7a0e");
  assert.equal(draft.dueAt, "2026-06-30T23:59:00+08:00");
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.input, /Home AI Todo Intake/);
  assert.match(calls[0].body.input, /Do not use keyword-only guessing/);
  assert.equal(calls[0].body.conversation, "home_ai_todo_intake_fixed");
}

{
  const { service, calls } = makeService([
    JSON.stringify({ isTodoRequest: false, confidence: 0.12, todoDraft: null }),
  ]);
  const result = await service.detectTodoNaturalLanguage(
    "\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837",
    { id: "owner", label: "Owner", policy: {} },
    "owner",
  );
  assert.equal(result.isTodoRequest, false);
  assert.equal(result.todoDraft, null);
  assert.equal(calls[0].body.conversation, "home_ai_todo_detect_fixed");
  assert.match(calls[0].body.input, /Do not use keyword-only guessing/);
}

{
  const { service } = makeService([
    JSON.stringify({
      isTodoRequest: true,
      confidence: 0.94,
      todoDraft: {
        title: "\u56fd\u5185\u62a5\u7a0e",
        assigneeWorkspaceId: "owner",
        creatorWorkspaceId: "owner",
        dueAt: "2026-06-30T23:59:59+08:00",
        priority: "normal",
        recurrence: { kind: "none" },
        needsConfirmation: false,
        missingFields: [],
        confidence: 0.95,
      },
    }),
  ]);
  const result = await service.detectTodoNaturalLanguage(
    "\u589e\u52a0\u6211\u7684\u4e00\u4e2a\u622a\u81f3\u5230 6 \u6708 30 \u53f7\u7684\u5f85\u529e\u4e8b\u9879\uff0c\u56fd\u5185\u62a5\u7a0e",
    { id: "owner", label: "Owner", policy: {} },
    "owner",
  );
  assert.equal(result.isTodoRequest, true);
  assert.equal(result.todoDraft.title, "\u56fd\u5185\u62a5\u7a0e");
  assert.equal(result.todoDraft.needsConfirmation, false);
}

{
  const { service, calls } = makeService([
    JSON.stringify({
      summary: "Refactor",
      cards: [
        { title: "Extract service" },
        { title: "Verify", dependsOn: [1] },
      ],
    }),
  ]);
  const plan = await service.planKanbanMultiAgent("refactor the module", { id: "owner", label: "Owner" }, "owner", { maxParallel: 1, reasoningEffort: "high" });
  assert.equal(plan.summary, "Refactor");
  assert.equal(plan.maxParallel, 1);
  assert.equal(plan.reasoningEffort, "high");
  assert.equal(plan.cards.length, 2);
  assert.deepEqual(plan.cards[1].dependsOn, ["card-1"]);
  assert.equal(calls[0].timeoutMs, 11000);
  assert.equal(calls[0].body.reasoning_effort, "high");
}

{
  const { service } = makeService(["not json"]);
  const plan = await service.planKanbanMultiAgent("ship resilient flow", { id: "owner" }, "owner", { maxParallel: 2 });
  assert.equal(plan.warning.includes("Planner JSON fallback used"), true);
  assert.equal(plan.cards.length, 4);
}

console.log("natural language draft service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
