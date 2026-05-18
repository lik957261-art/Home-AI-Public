"use strict";

const assert = require("node:assert/strict");
const { createKanbanTaskDispatchPolicy } = require("../adapters/kanban-task-dispatch-policy");

const policy = createKanbanTaskDispatchPolicy();

{
  const dispatch = policy.resolveKanbanDispatch(
    { content: "Take medicine", assignee: "owner" },
    { requestedAssignee: "owner", executableAssignee: "lowgw1" },
  );
  assert.equal(dispatch.manualOnly, true);
  assert.equal(dispatch.dispatchMode, "manual");
  assert.equal(dispatch.officialAssignee, "");
  assert.equal(dispatch.includeCompletionContract, false);
}

{
  const dispatch = policy.resolveKanbanDispatch(
    { content: "Build report", case_id: "case-1", case_mode: "multi-agent" },
    { requestedAssignee: "owner", executableAssignee: "lowgw1" },
  );
  assert.equal(dispatch.manualOnly, false);
  assert.equal(dispatch.dispatchMode, "auto");
  assert.equal(dispatch.officialAssignee, "lowgw1");
  assert.equal(dispatch.includeCompletionContract, true);
}

{
  assert.equal(policy.manualOnlyForPayload({ case_id: "single", case_mode: "single-card" }), true);
  assert.equal(policy.manualOnlyForPayload({ case_id: "single", case_mode: "single-card", auto_dispatch: true }), false);
}

{
  const studyDispatch = policy.resolveKanbanDispatch(
    { content: "Reading task", case_id: "study-case", case_mode: "study-plan", case_template: "reading" },
    { requestedAssignee: "weixin_stephen", executableAssignee: "lowgw7" },
  );
  assert.equal(studyDispatch.manualOnly, true);
  assert.equal(studyDispatch.officialAssignee, "");
  const assessmentDispatch = policy.resolveKanbanDispatch(
    { content: "AMC8 task", case_id: "exam-case", case_mode: "assessment-plan", case_template: "amc8" },
    { requestedAssignee: "weixin_stephen", executableAssignee: "lowgw7" },
  );
  assert.equal(assessmentDispatch.manualOnly, true);
  assert.equal(assessmentDispatch.officialAssignee, "");
}

{
  const dispatch = policy.resolveKanbanDispatch(
    { content: "Growth task", case_id: "growth-case", case_mode: "study-plan", case_template: "learning-growth" },
    { requestedAssignee: "weixin_stephen", executableAssignee: "lowgw7" },
  );
  assert.equal(dispatch.manualOnly, true);
  assert.equal(dispatch.dispatchMode, "manual");
  assert.equal(dispatch.officialAssignee, "");
  assert.equal(dispatch.includeCompletionContract, false);
  assert.equal(policy.manualOnlyForPayload({
    case_id: "growth-case",
    case_mode: "study-plan",
    case_template: "learning-growth",
    auto_dispatch: true,
  }), false);
}

console.log("kanban task dispatch policy tests passed");
