"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  createIdempotencyKey,
  createKanbanPlanCardCreationService,
  createPlanIdempotencyKey,
  defaultAssessmentConfigLine,
} = require("../adapters/kanban-plan-card-creation-service");

function idempotency(mode, planId, clientId) {
  const hash = crypto.createHash("sha256").update(`${planId}\0${clientId}`).digest("hex").slice(0, 24);
  return `hm-${mode}-${hash}`;
}

function makeHarness(overrides = {}) {
  const calls = {
    add: [],
    block: [],
    cover: [],
    directory: [],
    share: [],
    topic: [],
    verify: [],
  };
  const blockFailures = new Set(overrides.blockFailures || []);
  const service = createKanbanPlanCardCreationService(Object.assign({
    assessmentConfigLine(config = {}) {
      return `CONFIG:${config.id || config.subject || "none"}`;
    },
    compactText(value) {
      return String(value || "");
    },
    ensureKanbanCaseSharedDirectory(workspaceId, plan) {
      calls.directory.push({ workspaceId, planId: plan.id });
      return {
        sharedDirectoryPath: `shared/${workspaceId}/${plan.id}`,
        caseDirectoryPath: `shared/${workspaceId}/${plan.id}/case`,
      };
    },
    ensureKanbanCaseTopicThread(workspaceId, plan, directoryInfo) {
      calls.topic.push({ workspaceId, planId: plan.id, directoryInfo });
      return { thread: { id: `thread-${plan.id}` }, taskGroupId: `case_${plan.id}` };
    },
    kanbanCardProvider: {
      addCard(payload) {
        calls.add.push(payload);
        if (payload.content === "fail-add") return Promise.resolve({ ok: false, error: "add failed" });
        return Promise.resolve({
          ok: true,
          id: `card-${calls.add.length}`,
          content: payload.content,
          kanbanBoard: `board-${payload.workspaceId}`,
          kanbanStatus: "todo",
          source: "kanban",
        });
      },
      mutateCard(payload) {
        calls.block.push(payload);
        if (blockFailures.has(payload.cardId)) return Promise.resolve({ ok: false, error: `block failed ${payload.cardId}` });
        return Promise.resolve({
          ok: true,
          id: payload.cardId,
          content: `blocked:${payload.cardId}`,
          kanbanBoard: `board-${payload.workspaceId}`,
          kanbanStatus: "blocked",
          source: "kanban",
        });
      },
    },
    kanbanCaseTopicTitle(plan) {
      return `Topic ${plan.id}`;
    },
    normalizeKanbanAssessmentPlan(input, workspaceId, options) {
      assert.equal(options?.strict, true);
      return Object.assign({
        id: "assessment-one",
        mode: "assessment-plan",
        template: "assessment",
        workspaceId,
        blueprint: "Blueprint",
        summary: "Assessment summary",
        reminderLeadMinutes: 30,
        performerWorkspaceIds: ["child"],
        viewerWorkspaceIds: ["viewer"],
        cards: [
          {
            clientId: "assessment-1",
            title: "Assessment 1",
            description: "Description 1",
            dueTime: "2026-05-16 21:00",
            config: { id: "exam-1" },
            deliverables: ["Exam"],
            acceptance: ["Pass"],
          },
          {
            clientId: "assessment-2",
            title: "Assessment 2",
            description: "Description 2",
            dueTime: "2026-05-30 21:00",
            config: { id: "exam-2" },
            deliverables: ["Exam 2"],
            acceptance: ["Pass 2"],
          },
        ],
      }, input.normalizedPlan || {});
    },
    normalizeKanbanMaxParallel(value) {
      return Math.max(1, Number(value) || 1);
    },
    normalizeKanbanNotificationAssignee(workspaceId, ...candidates) {
      return candidates.find(Boolean) || `principal-${workspaceId}`;
    },
    normalizeKanbanPlan(_input, _sourceText, workspaceId, options) {
      return {
        id: "plan-one",
        mode: "multi-agent",
        workspaceId,
        sourceText: "Source",
        summary: "Summary",
        maxParallel: options.maxParallel,
        reasoningEffort: options.reasoningEffort,
        cards: [
          {
            clientId: "scope",
            title: "Scope",
            description: "Scope goal",
            assignee: "analyst",
            dependsOn: [],
            deliverables: ["Brief"],
            acceptance: ["Reviewed"],
          },
          {
            clientId: "build",
            title: "Build",
            description: "Build goal",
            assignee: "",
            dependsOn: ["scope"],
            deliverables: ["Patch"],
            acceptance: ["Tests"],
          },
          {
            clientId: "review",
            title: "Review",
            description: "Review goal",
            assignee: "",
            dependsOn: [],
            deliverables: ["Report"],
            acceptance: ["Risks"],
          },
        ],
      };
    },
    normalizeKanbanPlanReasoningEffort(value) {
      return String(value || "");
    },
    normalizeKanbanStudyPlan(input, workspaceId) {
      return Object.assign({
        id: "study-one",
        mode: "study-plan",
        template: "reading",
        workspaceId,
        sourceText: "Study source",
        summary: "Study summary",
        reminderLeadMinutes: 15,
        performerWorkspaceIds: ["child"],
        viewerWorkspaceIds: ["viewer"],
        cards: [
          {
            clientId: "reading-session-1",
            title: "Read 1",
            day: 1,
            description: "Session 1",
            dueTime: "2026-05-16 20:00",
            deliverables: ["Audio"],
            acceptance: ["Quiz"],
            learningProgramId: "program-1",
            learningDraftId: "draft-1",
            learningTaskCardId: "task-card-1",
            cardCreationSkillId: "learning-growth-card-creation",
          },
          {
            clientId: "reading-session-2",
            title: "Read 2",
            day: 2,
            description: "Session 2",
            dueTime: "2026-05-17 20:00",
            deliverables: ["Audio 2"],
            acceptance: ["Quiz 2"],
          },
        ],
      }, input.normalizedPlan || {});
    },
    kanbanPlanCardDescription(plan, card) {
      return `${plan.summary}: ${card.description}`;
    },
    kanbanPlanDependencyLabelsForServer(plan, card) {
      return (card.dependsOn || []).map((id) => plan.cards.find((candidate) => candidate.clientId === id)?.title || id);
    },
    publicKanbanCoverFile(_workspaceId, cover) {
      return { path: `/public/${cover.name}`, role: "cover" };
    },
    publicTodo(result) {
      return {
        id: result.id,
        content: result.content,
        kanbanBoard: result.kanbanBoard,
        kanbanStatus: result.kanbanStatus,
        source: result.source,
      };
    },
    saveKanbanReadingCoverUpload(workspaceId, planId, cover) {
      calls.cover.push({ workspaceId, planId, cover });
      return cover ? { path: `/raw/${planId}.png`, name: "cover.png", mime: "image/png", size: 12 } : null;
    },
    todoAssigneeLabel(workspaceId, principalId) {
      return `${workspaceId}:${principalId}`;
    },
    upsertKanbanCaseShare(workspaceId, planId, input) {
      calls.share.push({ workspaceId, planId, input });
      return Object.assign({ workspaceId, planId }, input);
    },
    verifyDirectTodoCreateResult(todo) {
      calls.verify.push(todo);
      return todo.id ? { ok: true, error: "" } : { ok: false, error: "missing id" };
    },
    workspacePrincipal(workspaceId) {
      return `principal-${workspaceId}`;
    },
  }, overrides));
  return { service, calls };
}

async function testMultiAgentCreationAndParking() {
  const { service, calls } = makeHarness();
  const result = await service.createKanbanPlanCards("owner", {
    sourceText: "Source override",
    maxParallel: 1,
    reasoningEffort: "high",
  }, { assignee: "fallback-assignee" });

  assert.equal(result.ok, true);
  assert.equal(result.maxParallel, 1);
  assert.equal(calls.add.length, 3);
  assert.deepEqual(calls.add.map((call) => call.content), ["Scope", "Build", "Review"]);
  assert.equal(calls.add[0].assignee, "analyst");
  assert.equal(calls.add[1].assignee, "fallback-assignee");
  assert.equal(calls.add[0].idempotencyKey, createPlanIdempotencyKey("plan-one", "scope"));
  assert.equal(calls.add[1].caseDependsOn[0], "scope");
  assert.equal(calls.add[1].caseCardIndex, 2);
  assert.equal(calls.block.length, 2);
  assert.equal(calls.block[0].cardId, "card-2");
  assert.match(calls.block[0].reason, /Waiting for planned upstream cards: Scope\./);
  assert.equal(calls.block[1].cardId, "card-3");
  assert.match(calls.block[1].reason, /free multi-Agent execution slot/);
  assert.equal(result.cards[1].dependsOn[0], "card-1");
  assert.equal(result.cards[1].blocked, true);
  assert.equal(result.cards[2].blocked, true);
  assert.equal(calls.verify.length, 3);
}

async function testStudyPlanCreatesCoverShareTopicAndSequentialBlocks() {
  const { service, calls } = makeHarness();
  const result = await service.createKanbanStudyPlanCards("owner", {
    coverImage: { dataBase64: "abc" },
    managerWorkspaceIds: ["manager"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.cover, [{ workspaceId: "owner", planId: "study-one", cover: { dataBase64: "abc" } }]);
  assert.equal(result.plan.cover.path, "/public/cover.png");
  assert.deepEqual(calls.directory, [{ workspaceId: "owner", planId: "study-one" }]);
  assert.equal(calls.topic[0].directoryInfo.caseDirectoryPath, "shared/owner/study-one/case");
  assert.deepEqual(calls.share[0].input, {
    performerWorkspaceIds: ["child"],
    viewerWorkspaceIds: ["viewer"],
    managerWorkspaceIds: ["manager"],
    topicThreadId: "thread-study-one",
    topicTaskGroupId: "case_study-one",
    sharedDirectoryPath: "shared/owner/study-one",
    caseDirectoryPath: "shared/owner/study-one/case",
  });
  assert.equal(calls.add[0].assignee, "principal-child");
  assert.equal(calls.add[0].assigneeLabel, "owner:principal-child");
  assert.match(calls.add[0].description, /Hermes Mobile/);
  assert.equal(calls.add[0].caseCover.name, "cover.png");
  assert.equal(calls.add[0].learningProgramId, "program-1");
  assert.equal(calls.add[0].learningDraftId, "draft-1");
  assert.equal(calls.add[0].learningTaskCardId, "task-card-1");
  assert.equal(calls.add[0].caseCreationSkillId, "learning-growth-card-creation");
  assert.equal(calls.add[0].idempotencyKey, idempotency("study-plan", "study-one", "reading-session-1"));
  assert.equal(calls.add[1].caseDependsOn[0], "reading-session-1");
  assert.equal(calls.block.length, 1);
  assert.match(calls.block[0].reason, /previous study session completion/);
  assert.equal(result.cards[1].card.kanbanStatus, "blocked");
  assert.deepEqual(result.topic, {
    threadId: "thread-study-one",
    taskGroupId: "case_study-one",
    title: "Topic study-one",
  });
  assert.deepEqual(result.sharedDirectory, {
    path: "shared/owner/study-one",
    caseDirectoryPath: "shared/owner/study-one/case",
    permission: "read_only",
  });
}

async function testProgrammingStudyTemplateUsesAssessmentParking() {
  const { service, calls } = makeHarness({
    normalizeKanbanStudyPlan(_input, workspaceId) {
      return {
        id: "programming-one",
        mode: "assessment-plan",
        template: "programming",
        workspaceId,
        blueprint: "Programming blueprint",
        summary: "Programming summary",
        reminderLeadMinutes: 15,
        performerWorkspaceIds: ["child"],
        viewerWorkspaceIds: [],
        cards: [
          {
            clientId: "programming-1",
            title: "Programming 1",
            description: "Programming description 1",
            dueTime: "2026-05-15 20:00",
            config: { subject: "programming" },
            deliverables: ["Programming exam"],
            acceptance: ["Pass"],
          },
          {
            clientId: "programming-2",
            title: "Programming 2",
            description: "Programming description 2",
            dueTime: "2026-05-17 20:00",
            config: { subject: "programming" },
            deliverables: ["Programming exam 2"],
            acceptance: ["Pass 2"],
          },
        ],
      };
    },
  });
  const result = await service.createKanbanStudyPlanCards("owner", {
    coverImage: { dataBase64: "unused" },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.cover.length, 0);
  assert.equal(calls.add[0].reason, "Created from Hermes Mobile assessment plan.");
  assert.equal(calls.add[0].caseMode, "assessment-plan");
  assert.equal(calls.add[0].caseTemplate, "programming");
  assert.equal(calls.add[0].caseSourceText, "Programming blueprint\n\nCONFIG:programming");
  assert.equal(calls.block.length, 2);
  assert.match(calls.block[0].reason, /Manual formal assessment is open/);
  assert.match(calls.block[1].reason, /previous assessment completion/);
  assert.deepEqual(result.cards.map((card) => card.blocked), [true, true]);
}

async function testAssessmentPlanCreatesAndParksAllCards() {
  const { service, calls } = makeHarness();
  const result = await service.createKanbanAssessmentPlanCards("owner", {
    assignee: "explicit-assignee",
  }, { strict: true });

  assert.equal(result.ok, true);
  assert.equal(calls.add.length, 2);
  assert.equal(calls.add[0].assignee, "explicit-assignee");
  assert.equal(calls.add[0].reason, "Created from Hermes Mobile assessment plan.");
  assert.equal(calls.add[0].caseSourceText, "Blueprint\n\nCONFIG:exam-1");
  assert.equal(calls.add[0].caseCardGoal, "CONFIG:exam-1\n\nDescription 1");
  assert.equal(calls.add[0].idempotencyKey, createIdempotencyKey("assessment-plan", "assessment-one", "assessment-1"));
  assert.deepEqual(calls.add[1].caseDependsOn, ["assessment-1"]);
  assert.equal(calls.block.length, 2);
  assert.match(calls.block[0].reason, /Manual formal assessment is open/);
  assert.match(calls.block[1].reason, /previous assessment completion/);
  assert.deepEqual(result.cards.map((card) => card.blocked), [true, true]);
  assert.equal(result.cards[1].dependsOn[0], "assessment-1");
  assert.equal(result.share.topicThreadId, "thread-assessment-one");
}

async function testProviderAndBlockFailureShapes() {
  {
    const { service } = makeHarness({
      normalizeKanbanStudyPlan(input, workspaceId) {
        return {
          id: "study-fail-add",
          mode: "study-plan",
          template: "reading",
          workspaceId,
          sourceText: "",
          summary: "",
          reminderLeadMinutes: 0,
          performerWorkspaceIds: [],
          viewerWorkspaceIds: [],
          cards: [{ clientId: "a", title: "fail-add", day: 1, dueTime: "", description: "" }],
        };
      },
    });
    const result = await service.createKanbanStudyPlanCards("owner", {});
    assert.equal(result.ok, false);
    assert.equal(result.error, "add failed");
    assert.deepEqual(result.cards, []);
  }

  {
    const { service } = makeHarness({ blockFailures: ["card-1"] });
    const result = await service.createKanbanAssessmentPlanCards("owner", {}, { strict: true });
    assert.equal(result.ok, false);
    assert.match(result.error, /could not be parked: block failed card-1/);
    assert.equal(result.cards[0].blocked, false);
    assert.equal(result.cards[0].blockError, "block failed card-1");
  }
}

function testHelperExports() {
  assert.equal(createIdempotencyKey("study-plan", "p1", "c1"), idempotency("study-plan", "p1", "c1"));
  assert.equal(createPlanIdempotencyKey("p1", "c1"), idempotency("plan", "p1", "c1"));
  assert.match(defaultAssessmentConfigLine({ subject: "math" }), /^ASSESSMENT_CONFIG:/);
  assert.throws(
    () => createKanbanPlanCardCreationService({ kanbanCardProvider: { addCard() {} } }),
    /requires kanbanCardProvider add\/mutate/,
  );
}

async function run() {
  testHelperExports();
  await testMultiAgentCreationAndParking();
  await testStudyPlanCreatesCoverShareTopicAndSequentialBlocks();
  await testProgrammingStudyTemplateUsesAssessmentParking();
  await testAssessmentPlanCreatesAndParksAllCards();
  await testProviderAndBlockFailureShapes();
  console.log("kanban-plan-card-creation-service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
