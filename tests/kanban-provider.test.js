"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createKanbanTodoBridge, parseJsonOutput, parseCommandArgs, safeSlug } = require("../adapters/kanban-provider");

async function run() {
  assert.deepEqual(parseCommandArgs("a,b,c"), ["a", "b", "c"]);
  assert.deepEqual(parseCommandArgs('["-d","Ubuntu","--","hermes"]'), ["-d", "Ubuntu", "--", "hermes"]);
  assert.equal(safeSlug("Weixin Stephen / Reading"), "weixin-stephen-reading");
  assert.deepEqual(parseJsonOutput('prefix\n[{"id":"t_one","skills":[]}]\ntrailer'), [{ id: "t_one", skills: [] }]);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-kanban-provider-"));
  const calls = [];
  let createCount = 0;
  const provider = createKanbanTodoBridge({
    command: "hermes",
    baseArgs: ["-p", "owner"],
    metadataPath: path.join(tempDir, "meta.json"),
    boardForWorkspace: (workspaceId) => `board-${workspaceId}`,
    boardNameForWorkspace: (workspaceId) => `Board ${workspaceId}`,
    workspacePathForWorkspace: (workspaceId) => `/workspaces/${workspaceId}`,
    assigneeForWorkspace: (workspaceId) => `exec-${workspaceId}`,
    async runCommand(command, args) {
      calls.push([command, args]);
      const joined = args.join(" ");
      if (joined.includes("boards create")) return { code: 0, stdout: "", stderr: "" };
      if (joined.includes(" create ")) {
        createCount += 1;
        const taskId = createCount === 1 ? "t_created" : `t_created_${createCount}`;
        return { code: 0, stdout: JSON.stringify({ task_id: taskId }), stderr: "" };
      }
      if (joined.includes(" list ")) {
        return {
          code: 0,
          stdout: JSON.stringify({
            tasks: [
              { id: "t_created", title: "Read chapter", status: "todo", skills: [] },
              {
                id: "t_done",
                title: "Closed",
                status: "done",
                assignee: "weixin_stephen",
                priority: 3,
                tenant: "weixin_stephen",
                workspace: "dir:/workspaces/weixin_stephen",
                created_by: "weixin_stephen",
                created_at: 1778400000,
                skills: ["kanban-worker"],
              },
            ],
          }),
          stderr: "",
        };
      }
      if (joined.includes(" complete ") || joined.includes(" archive ") || joined.includes(" comment ")
        || joined.includes(" block ") || joined.includes(" unblock ")) {
        return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
      }
      return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
    },
  });

  const created = await provider.run({
    action: "add",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    assignee: "weixin_stephen",
    content: "Read chapter",
    due_time: "2026-05-10 18:00",
    reminder_lead_minutes: 15,
    recurrence: "none",
    case_id: "case-one",
    case_mode: "multi-agent",
    case_source_text: "Original request",
    case_summary: "Requirement to conclusion",
    case_card_id: "card-1",
    case_card_index: 1,
    case_card_count: 2,
    case_depends_on: [],
    case_deliverables: ["Draft"],
    case_acceptance: ["Readable archive story"],
    case_card_goal: "Scope the work",
  });
  assert.equal(created.ok, true);
  assert.equal(created.id, "t_created");
  assert.equal(created.status, "open");
  assert.equal(created.kanban_board, "board-weixin-stephen");
  assert.equal(created.kanban_assignee, "exec-weixin_stephen");
  assert.equal(created.kanban_case_id, "case-one");
  assert.equal(created.kanban_case_summary, "Requirement to conclusion");
  assert.equal(created.kanban_case_card_index, 1);
  assert.deepEqual(created.kanban_case_deliverables, ["Draft"]);
  assert.deepEqual(created.kanban_case_acceptance, ["Readable archive story"]);
  assert.equal(created.kanban_case_card_goal, "Scope the work");

  const createCall = calls.find(([, args]) => args.includes("create") && args.includes("Read chapter"));
  assert.ok(createCall);
  assert.deepEqual(createCall[1].slice(0, 4), ["-p", "owner", "kanban", "--board"]);
  assert.ok(createCall[1].includes("--created-by"));
  assert.ok(createCall[1].includes("--assignee"));
  assert.equal(createCall[1][createCall[1].indexOf("--assignee") + 1], "exec-weixin_stephen");
  assert.ok(createCall[1].includes("dir:/workspaces/weixin_stephen"));

  const listed = await provider.run({
    action: "list",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    include_completed: false,
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.todos.length, 1);
  assert.equal(listed.todos[0].id, "t_created");
  assert.equal(listed.todos[0].due_local.startsWith("2026-05-10"), true);

  const createdWithoutDue = await provider.run({
    action: "add",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    assignee: "weixin_stephen",
    content: "No due Kanban card",
  });
  assert.equal(createdWithoutDue.ok, true);
  assert.equal(createdWithoutDue.due_at, "");
  assert.equal(createdWithoutDue.due_local, "");

  const blocked = await provider.run({
    action: "block",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
    reason: "need input",
  });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.kanban_status, "blocked");

  const blockedPush = await provider.run({
    action: "web_pending_pushes",
    principals: ["weixin_stephen"],
    blocked_notification_delay_minutes: 0,
    limit: 10,
  });
  assert.equal(blockedPush.ok, true);
  const blockedEvents = blockedPush.events.filter((event) => event.messageType === "blocked");
  assert.equal(blockedEvents.length, 1);
  assert.equal(blockedEvents[0].todoId, "t_created");
  assert.match(blockedEvents[0].body, /need input/);

  const reading = await provider.run({
    action: "add",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    assignee: "weixin_stephen",
    content: "Reading session 2",
    case_id: "study-case",
    case_mode: "study-plan",
    case_template: "reading",
    case_card_id: "reading-session-2",
    case_card_index: 2,
    case_card_count: 10,
    case_depends_on: ["reading-session-1"],
  });
  assert.equal(reading.ok, true);
  const readingBlocked = await provider.run({
    action: "block",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: reading.id,
    reason: "Waiting for previous study session completion; Hermes Mobile shows only the current study session.",
  });
  assert.equal(readingBlocked.ok, true);
  const readingBlockedPush = await provider.run({
    action: "web_pending_pushes",
    principals: ["weixin_stephen"],
    blocked_notification_delay_minutes: 0,
    limit: 20,
  });
  assert.equal(readingBlockedPush.ok, true);
  assert.equal(readingBlockedPush.events.some((event) => event.messageType === "blocked" && event.todoId === reading.id), false);

  const assessment = await provider.run({
    action: "add",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    assignee: "weixin_stephen",
    content: "Math formal assessment 2",
    case_id: "assessment-case",
    case_mode: "assessment-plan",
    case_template: "math",
    case_card_id: "assessment-exam-2",
    case_card_index: 2,
    case_card_count: 10,
    case_depends_on: ["assessment-exam-1"],
  });
  assert.equal(assessment.ok, true);
  const assessmentBlocked = await provider.run({
    action: "block",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: assessment.id,
    reason: "Waiting for previous assessment completion; Hermes Mobile shows only the current assessment card.",
  });
  assert.equal(assessmentBlocked.ok, true);
  const assessmentBlockedPush = await provider.run({
    action: "web_pending_pushes",
    principals: ["weixin_stephen"],
    blocked_notification_delay_minutes: 0,
    limit: 20,
  });
  assert.equal(assessmentBlockedPush.ok, true);
  assert.equal(assessmentBlockedPush.events.some((event) => event.messageType === "blocked" && event.todoId === assessment.id), false);

  const commented = await provider.run({
    action: "comment",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
    comment: "approve preview only",
  });
  assert.equal(commented.ok, true);
  assert.equal(commented.action, "comment");
  const commentCall = calls.find(([, args]) => args.includes("comment") && args.includes("approve preview only"));
  assert.ok(commentCall);
  assert.ok(commentCall[1].includes("--author"));

  const unblocked = await provider.run({
    action: "unblock",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
  });
  assert.equal(unblocked.ok, true);
  assert.equal(unblocked.kanban_status, "todo");
  const reassignCall = calls.find(([, args]) => args.includes("reassign") && args.includes("t_created"));
  assert.ok(reassignCall);
  assert.equal(reassignCall[1][reassignCall[1].indexOf("t_created") + 1], "exec-weixin_stephen");

  const completed = await provider.run({
    action: "complete",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.status, "completed");

  const revision = await provider.run({
    action: "revise",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
    comment: "revise the final copy",
  });
  assert.equal(revision.ok, true);
  assert.equal(revision.action, "revise");
  assert.equal(revision.originalId, "t_created");
  assert.equal(revision.revisionId, "t_created_5");
  assert.equal(revision.status, "open");
  assert.equal(revision.kanban_revision_of, "t_created");
  assert.equal(revision.kanban_revision_request, "revise the final copy");
  assert.ok(calls.some(([, args]) => args.includes("create") && args.includes("修改：Read chapter")));
  assert.ok(calls.some(([, args]) => args.includes("comment") && args.includes("Manual revision requested: revise the final copy\nFollow-up card: t_created_5")));

  const readingRevision = await provider.run({
    action: "revise",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: reading.id,
    comment: "redo the reading response",
  });
  assert.equal(readingRevision.ok, true);
  assert.equal(readingRevision.action, "revise");
  assert.equal(readingRevision.kanban_revision_of, reading.id);
  assert.equal(readingRevision.kanban_case_mode, "study-plan");
  assert.equal(readingRevision.kanban_case_template, "reading");
  assert.equal(readingRevision.kanban_case_card_index, 2);
  assert.equal(readingRevision.kanban_case_card_count, 10);
  assert.deepEqual(readingRevision.kanban_case_depends_on, []);

  const listedWithClosed = await provider.run({
    action: "list",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    include_completed: true,
  });
  const closed = listedWithClosed.todos.find((todo) => todo.id === "t_done");
  assert.equal(closed.kanban_assignee, "weixin_stephen");
  assert.equal(closed.kanban_priority, 3);
  assert.equal(closed.kanban_tenant, "weixin_stephen");
  assert.equal(closed.kanban_workspace_kind, "dir");
  assert.deepEqual(closed.kanban_skills, ["kanban-worker"]);
  assert.match(closed.created_at, /^2026-/);

  const pushed = await provider.run({
    action: "web_pending_pushes",
    principals: ["weixin_stephen"],
    limit: 10,
  });
  assert.equal(pushed.ok, true);
  assert.deepEqual(pushed.events, []);

  const deleted = await provider.run({
    action: "delete",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
  });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.action, "delete");
  const listedAfterDelete = await provider.run({
    action: "list",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    include_completed: true,
  });
  assert.equal(listedAfterDelete.ok, true);
  assert.equal(listedAfterDelete.todos.some((todo) => todo.id === "t_created"), false);
  const metadataAfterDelete = JSON.parse(fs.readFileSync(path.join(tempDir, "meta.json"), "utf8"));
  assert.ok(metadataAfterDelete.todos.t_created.deletedAt);

  const fallbackProvider = createKanbanTodoBridge({
    command: "hermes",
    metadataPath: path.join(tempDir, "fallback-meta.json"),
    boardForWorkspace: () => "fallback-board",
    async runCommand(command, args) {
      const joined = args.join(" ");
      if (joined.includes("boards create")) return { code: 0, stdout: "", stderr: "" };
      if (joined.includes(" create ")) return { code: 0, stdout: "Created without JSON\n", stderr: "" };
      if (joined.includes(" list ")) {
        return {
          code: 0,
          stdout: [
            "worker_child=placeholder",
            JSON.stringify([{ id: "t_fallback", title: "Fallback lookup", tenant: "owner", created_at: 1778400000 }], null, 2),
          ].join("\n"),
          stderr: "",
        };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const fallbackCreated = await fallbackProvider.run({
    action: "add",
    workspace_id: "owner",
    source_principal: "owner",
    content: "Fallback lookup",
    due_time: "2026-05-10 20:00",
  });
  assert.equal(fallbackCreated.ok, true);
  assert.equal(fallbackCreated.id, "t_fallback");

  const reconcileCalls = [];
  const meta = (value) => `<!-- hermes-mobile-todo ${JSON.stringify(value)} -->`;
  const reconcileTasks = [
    {
      id: "t_upstream",
      title: "Upstream",
      status: "done",
      body: meta({
        content: "Upstream",
        assignee: "owner",
        caseId: "case-auto",
        caseCardId: "card-1",
        caseCardIndex: 1,
        caseCardCount: 2,
      }),
      completed_at: 1778600000,
      updated_at: 1778600000,
    },
    {
      id: "t_downstream",
      title: "Downstream",
      status: "blocked",
      body: meta({
        content: "Downstream",
        assignee: "owner",
        caseId: "case-auto",
        caseCardId: "card-2",
        caseCardIndex: 2,
        caseCardCount: 2,
        caseDependsOn: ["card-1"],
      }),
      updated_at: 1778600100,
    },
  ];
  const reconcileProvider = createKanbanTodoBridge({
    command: "hermes",
    metadataPath: path.join(tempDir, "reconcile-meta.json"),
    boardForWorkspace: () => "reconcile-board",
    assigneeForWorkspace: () => "exec-owner",
    async runCommand(command, args) {
      reconcileCalls.push(args);
      const joined = args.join(" ");
      if (joined.includes("boards create")) return { code: 0, stdout: "", stderr: "" };
      if (joined.includes(" list ")) return { code: 0, stdout: JSON.stringify({ tasks: reconcileTasks }), stderr: "" };
      if (joined.includes(" unblock ")) {
        reconcileTasks[1].status = "todo";
        return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
      }
      if (joined.includes(" reassign ") || joined.includes(" comment ")) return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
      return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
    },
  });
  const reconciled = await reconcileProvider.run({
    action: "reconcile_dependency_blocks",
    workspace_id: "owner",
    source_principal: "owner",
    limit: 20,
  });
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.released.length, 1);
  assert.equal(reconciled.released[0].id, "t_downstream");
  assert.ok(reconcileCalls.some((args) => args.includes("unblock") && args.includes("t_downstream")));
  assert.ok(reconcileCalls.some((args) => args.includes("comment") && args.includes("All planned upstream cards completed; Hermes Mobile released dependency block.")));

  const manualReconcileCalls = [];
  const manualTasks = [
    {
      id: "t_manual_upstream",
      title: "Manual upstream",
      status: "done",
      body: meta({
        content: "Manual upstream",
        assignee: "owner",
        caseId: "case-manual",
        caseMode: "assessment-plan",
        caseCardId: "exam-1",
        caseCardIndex: 1,
        caseCardCount: 2,
      }),
      completed_at: 1778600000,
      updated_at: 1778600000,
    },
    {
      id: "t_manual_downstream",
      title: "Manual downstream",
      status: "blocked",
      body: meta({
        content: "Manual downstream",
        assignee: "owner",
        caseId: "case-manual",
        caseMode: "assessment-plan",
        caseCardId: "exam-2",
        caseCardIndex: 2,
        caseCardCount: 2,
        caseDependsOn: ["exam-1"],
      }),
      updated_at: 1778600100,
    },
  ];
  const manualReconcileProvider = createKanbanTodoBridge({
    command: "hermes",
    metadataPath: path.join(tempDir, "manual-reconcile-meta.json"),
    boardForWorkspace: () => "manual-reconcile-board",
    assigneeForWorkspace: () => "exec-owner",
    async runCommand(command, args) {
      manualReconcileCalls.push(args);
      const joined = args.join(" ");
      if (joined.includes("boards create")) return { code: 0, stdout: "", stderr: "" };
      if (joined.includes(" list ")) return { code: 0, stdout: JSON.stringify({ tasks: manualTasks }), stderr: "" };
      if (joined.includes(" unblock ")) throw new Error("manual assessment plan should not be auto-unblocked");
      return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
    },
  });
  const manualReconciled = await manualReconcileProvider.run({
    action: "reconcile_dependency_blocks",
    workspace_id: "owner",
    source_principal: "owner",
    limit: 20,
  });
  assert.equal(manualReconciled.ok, true);
  assert.equal(manualReconciled.released.length, 0);
  assert.equal(manualReconcileCalls.some((args) => args.includes("unblock")), false);

  fs.rmSync(tempDir, { recursive: true, force: true });
}

run()
  .then(() => console.log("kanban-provider tests passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
