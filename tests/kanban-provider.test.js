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
        return { code: 0, stdout: JSON.stringify({ task_id: "t_created" }), stderr: "" };
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

  const completed = await provider.run({
    action: "complete",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.status, "completed");

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

  const blocked = await provider.run({
    action: "block",
    workspace_id: "weixin_stephen",
    source_principal: "weixin_stephen",
    todo_id: "t_created",
    reason: "need input",
  });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.kanban_status, "blocked");

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

  fs.rmSync(tempDir, { recursive: true, force: true });
}

run()
  .then(() => console.log("kanban-provider tests passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
