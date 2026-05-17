"use strict";

const assert = require("node:assert/strict");
const { createLearningProgramPublishService } = require("../adapters/learning-program-publish-service");

async function run() {
  const calls = [];
  const service = createLearningProgramPublishService({
    async createKanbanStudyPlanCards(workspaceId, input) {
      calls.push({ workspaceId, input });
      return { ok: true, cards: [{ card: { id: "kanban-1" } }] };
    },
  });

  const result = await service.publish({
    program: {
      programId: "program-1",
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      learnerName: "Fanfan",
      title: "English growth",
      domain: "english",
      goalSummary: "Summary-only goal.",
      focusAreas: ["speaking", "writing"],
      startDate: "2026-05-17",
      timeOfDay: "19:30",
    },
    draft: {
      draftId: "draft-1",
      weekStart: "2026-05-17",
      weekEnd: "2026-05-23",
      taskCount: 2,
      dailyPlans: [
        {
          date: "2026-05-17",
          tasks: [{
            taskId: "task-1",
            title: "Short writing",
            learnerInstruction: "Write a first draft of 6-8 English sentences.",
            deliverables: ["first English draft", "rewritten draft"],
            acceptance: ["first draft submitted", "rewrite submitted"],
            interactionStateMachine: ["receive_task", "learner_drafts", "ai_feedback", "learner_rewrites"],
            plannedMinutes: 15,
          }],
        },
        { date: "2026-05-18", tasks: [{ taskId: "task-2", title: "Task two", instruction: "Answer the second instruction." }] },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.workspaceId, "weixin_stephen");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, "weixin_stephen");
  assert.equal(calls[0].input.studyTemplate, "learning-growth");
  assert.equal(calls[0].input.caseTemplate, "learning-growth");
  assert.equal(calls[0].input.performerWorkspaceIds[0], "weixin_stephen");
  assert.equal(calls[0].input.viewerWorkspaceIds[0], "weixin_stephen");
  assert.match(calls[0].input.submissionLabel, /Fanfan Growth/);
  assert.equal(calls[0].input.sessions, 2);
  assert.equal(calls[0].input.cards.length, 2);
  assert.equal(calls[0].input.cards[0].clientId, "task-1");
  assert.equal(calls[0].input.cards[0].title, "Short writing");
  assert.equal(calls[0].input.cards[0].dueTime, "2026-05-17 19:30");
  assert.equal(calls[0].input.cards[0].deliverables[0], "first English draft");
  assert.match(calls[0].input.cards[0].description, /Task instruction:\nWrite a first draft/);
  assert.match(calls[0].input.cards[0].description, /Interaction flow:/);
}

run().then(() => {
  console.log("learning program publish service tests passed");
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
