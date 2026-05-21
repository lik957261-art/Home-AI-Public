"use strict";

const assert = require("node:assert/strict");
const { createKanbanPlanService } = require("../adapters/kanban-plan-service");

function service() {
  let nextPlan = 1;
  let nextCase = 1;
  return createKanbanPlanService({
    defaultMaxParallel: 3,
    maxParallelLimit: 5,
    maxCards: 8,
    validReasoningEfforts: new Set(["low", "medium", "high", "xhigh"]),
    createPlanId: () => `plan-${nextPlan++}`,
    createSingleCaseId: () => `single-${nextCase++}`,
  });
}

{
  const planner = service();
  const cards = planner.fallbackCards("Build the dashboard");
  assert.equal(cards.length, 4);
  assert.match(cards[0].title, /Scope and acceptance: Build the dashboard/);
  assert.deepEqual(cards[3].dependsOn, [1, 2, 3]);
}

{
  const planner = service();
  assert.deepEqual(planner.dependencyRefs("1, card-a; done\nreview"), ["1", " card-a", " done", "review"]);
  assert.deepEqual(planner.dependencyRefs(["a", "b"]), ["a", "b"]);
  assert.deepEqual(planner.dependencyRefs(null), []);
  assert.equal(planner.normalizeMaxParallel("0"), 3);
  assert.equal(planner.normalizeMaxParallel("9"), 5);
  assert.equal(planner.normalizeMaxParallel("2.8"), 2);
  assert.equal(planner.normalizeReasoningEffort("HIGH"), "high");
  assert.equal(planner.normalizeReasoningEffort("invalid"), "");
}

{
  const planner = service();
  const plan = planner.normalizePlan({
    id: "explicit",
    sourceText: "source override",
    summary: "Test plan",
    reasoningEffort: "high",
    cards: [
      { clientId: "scope", title: "Scope" },
      { clientId: "impl", title: "Implement feature", dependsOn: ["scope"] },
      { clientId: "verify", title: "Verify output", dependsOn: ["2"] },
      { clientId: "docs", title: "Write docs", dependsOn: ["Implement"] },
      { clientId: "self", title: "Self dependency", dependsOn: ["self"] },
      { clientId: "forward", title: "Forward dependency", dependsOn: ["7"] },
      { clientId: "future", title: "Future task" },
    ],
  }, "ignored", "owner", { maxParallel: 2 });
  assert.equal(plan.id, "explicit");
  assert.equal(plan.workspaceId, "owner");
  assert.equal(plan.maxParallel, 2);
  assert.equal(plan.reasoningEffort, "high");
  assert.deepEqual(plan.cards.map((card) => card.dependsOn), [
    [],
    ["scope"],
    ["impl"],
    ["impl"],
    [],
    [],
    [],
  ]);
  assert.deepEqual(plan.cards.filter((card) => card.initialRunnable).map((card) => card.clientId), ["scope", "self"]);
}

{
  const planner = service();
  assert.throws(
    () => planner.normalizePlan({ needs_clarification: true, clarification: "Need files" }, "x", "owner"),
    /Need files/,
  );
  const fallback = planner.normalizePlan({}, "Fallback topic", "owner", { reasoningEffort: "medium" });
  assert.equal(fallback.id, "plan-1");
  assert.equal(fallback.cards.length, 4);
  assert.equal(fallback.cards[0].initialRunnable, true);
}

{
  const planner = service();
  const plan = planner.normalizePlan({
    summary: "Ship change",
    cards: [
      { clientId: "a", title: "A" },
      { clientId: "b", title: "B", dependsOn: ["a"], deliverables: ["Patch"], acceptance: ["Tests pass"] },
    ],
  }, "Source request", "owner", { maxParallel: 1, reasoningEffort: "medium" });
  const labels = planner.dependencyLabelsForServer(plan, plan.cards[1]);
  assert.deepEqual(labels, ["A"]);
  const description = planner.cardDescription(plan, plan.cards[1]);
  assert.match(description, /Multi-Agent plan: Ship change/);
  assert.match(description, /Requested reasoning effort: medium/);
  assert.match(description, /Expected deliverables:\n- Patch/);
  assert.match(description, /Dependencies:\n- A/);
  assert.match(description, /at most 1 first-wave cards/);
}

{
  const planner = service();
  const payload = planner.singleCardCasePayload("Build report", "Detailed work", "Original request");
  assert.deepEqual(payload, {
    caseId: "single-1",
    caseMode: "single-card",
    caseSourceText: "Original request",
    caseSummary: "Build report",
    caseCardId: "single",
    caseCardIndex: 1,
    caseCardCount: 1,
    caseCardGoal: "Detailed work",
  });
}

console.log("kanban-plan-service tests passed");
