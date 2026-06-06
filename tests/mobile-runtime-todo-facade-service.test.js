"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeTodoFacadeService,
  stripPrincipalLabelPrefixes,
} = require("../adapters/mobile-runtime-todo-facade-service");

function createFacade(overrides = {}) {
  const workspaces = [
    { id: "owner", label: "Owner", role: "owner", policy: { principal_id: "owner" } },
    { id: "weixin_wuping", label: "吴萍", role: "user", policy: { principal_id: "wuping" } },
    { id: "weixin_stephen", label: "Steven", role: "user", policy: { principal_id: "stephen" } },
  ];
  return createMobileRuntimeTodoFacadeService(Object.assign({
    findWorkspace(workspaceId) {
      return workspaces.find((item) => item.id === workspaceId || item.policy?.principal_id === workspaceId) || null;
    },
    loadCatalog() {
      return {
        workspaces,
        routeMap: {
          principal_allowed_targets: {
            owner: "*",
            wuping: ["weixin_wuping", "weixin_stephen"],
          },
        },
      };
    },
    principalLabelPrefixes: ["weixin_"],
    useKanbanTodoBackend: () => false,
  }, overrides));
}

assert.equal(stripPrincipalLabelPrefixes("weixin_wuping", ["weixin_"]), "wuping");
assert.equal(stripPrincipalLabelPrefixes("owner", ["weixin_"]), "owner");

{
  const facade = createFacade();
  assert.equal(facade.workspacePrincipal("weixin_wuping"), "wuping");
  assert.deepEqual(facade.todoAssigneesForWorkspace("weixin_wuping").map((item) => item.id), [
    "weixin_wuping",
    "weixin_stephen",
  ]);
  assert.equal(facade.todoAssigneeLabel("weixin_wuping", "weixin_wuping"), "吴萍");
  assert.equal(facade.resolveTodoAssigneeFromText("提醒 Steven 明天 9 点读书", "weixin_wuping"), "weixin_stephen");
  assert.equal(facade.resolveTodoAssigneeFromText("提醒 wuping 明天 9 点读书", "weixin_wuping"), "weixin_wuping");
}

{
  const facade = createFacade();
  const due = facade.parseWebTodoDueFromText("2026-05-16 09:30", new Date(2026, 4, 15, 13, 10));
  assert.deepEqual(due, { dueTime: "2026-05-16 09:30", raw: "2026-05-16 09:30" });
  const intent = facade.detectDirectTodoCreateIntentForWeb("提醒吴萍明天9点读书", "owner", new Date(2026, 4, 15, 13, 10));
  assert.equal(intent.assignee, "weixin_wuping");
  assert.equal(intent.assigneeLabel, "吴萍");
  assert.equal(intent.dueTime, "2026-05-16 09:00");
  assert.equal(facade.detectDirectKanbanCreateRequest("新增看板卡片：整理Hotmail"), true);
  assert.equal(facade.verifyDirectTodoCreateResult({ id: "t1", source: "local" }).ok, true);
}

{
  const facade = createFacade({ useKanbanTodoBackend: () => true });
  assert.equal(facade.directTodoCreateNeedsKanbanFields({ id: "t1", source: "local" }), true);
  assert.deepEqual(facade.verifyDirectTodoCreateResult({ id: "t1", source: "kanban" }), {
    ok: false,
    error: "Kanban card creation returned without board/status metadata.",
  });
}

assert.throws(() => createMobileRuntimeTodoFacadeService({}), /requires findWorkspace/);
assert.throws(() => createMobileRuntimeTodoFacadeService({
  findWorkspace: () => null,
  loadCatalog: () => ({ workspaces: [] }),
}), /requires useKanbanTodoBackend/);

console.log("mobile runtime todo facade service tests passed");
