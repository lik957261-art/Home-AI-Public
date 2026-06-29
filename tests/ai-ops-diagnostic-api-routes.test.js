"use strict";

const assert = require("node:assert/strict");
const { createAiOpsDiagnosticApiRoutes } = require("../server-routes/ai-ops-diagnostic-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(chunk = "") {
      this.body += String(chunk);
    },
  };
}

function makeReq(method, url, body = {}, extra = {}) {
  return Object.assign({
    method,
    url,
    headers: { "x-hermes-web-client-version": "client-test" },
    body,
  }, extra);
}

function jsonBody(res) {
  return JSON.parse(res.body || "{}");
}

function createDeps(options = {}) {
  const calls = [];
  const cases = [];
  const events = [];
  const service = options.service || {
    ingestEvent(body, context) {
      calls.push({ type: "ingestEvent", body, context });
      const result = { ok: true, event_id: "diagevt_test", case_id: "diagcase_test", status: "inbox_waiting", event_count: 1, routing: { mode: "inbox_waiting" } };
      cases.push({ case_id: result.case_id, status: result.status });
      events.push({ event_id: result.event_id, case_id: result.case_id });
      return result;
    },
    listCases() {
      calls.push({ type: "listCases" });
      return { ok: true, cases };
    },
    listEvents(input) {
      calls.push({ type: "listEvents", input });
      return { ok: true, events };
    },
    getCase(caseId) {
      calls.push({ type: "getCase", caseId });
      return caseId === "missing" ? null : { case_id: caseId, status: "inbox_waiting" };
    },
    updateCaseStatus(input) {
      calls.push({ type: "updateCaseStatus", input });
      return { ok: true, case: { case_id: input.case_id, status: input.status } };
    },
  };
  return {
    calls,
    deps: {
      aiOpsDiagnosticIntakeService: service,
      aiOpsDiagnosticRemediationWorkflowService: options.workflowService,
      async readBody(req) {
        calls.push({ type: "readBody" });
        return req.body || {};
      },
      requireWorkspaceAccess(req, res, workspaceId) {
        calls.push({ type: "requireWorkspaceAccess", workspaceId });
        if (options.denyWorkspace) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "workspace_denied" }));
          return "";
        }
        return workspaceId;
      },
      requireOwner(req, res) {
        calls.push({ type: "requireOwner" });
        if (options.denyOwner) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "owner_required" }));
          return null;
        }
        return { owner: true };
      },
      sendJson(res, status, payload) {
        calls.push({ type: "sendJson", status, payload });
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(payload));
      },
    },
  };
}

async function testCreateEventRequiresWorkspaceAndStores() {
  const { deps, calls } = createDeps();
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const res = makeResponse();
  const req = makeReq("POST", "/api/v1/home-ai/diagnostics/events", {
    workspaceId: "weixin_wuping",
    diagnostic_type: "ui_state_mismatch",
  });
  const result = await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "weixin_wuping" } });
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 202);
  assert.equal(jsonBody(res).case_id, "diagcase_test");
  assert.deepEqual(calls.find((call) => call.type === "requireWorkspaceAccess").workspaceId, "weixin_wuping");
  const ingest = calls.find((call) => call.type === "ingestEvent");
  assert.equal(ingest.context.workspaceId, "weixin_wuping");
  assert.equal(ingest.context.clientVersion, "client-test");
}

async function testCreateEventCreatesOwnerNotificationWhenReady() {
  const notificationCalls = [];
  const { deps } = createDeps({
    workflowService: {
      async notifyOwner(input) {
        notificationCalls.push(input);
        return { ok: true, notified: true, inboxItem: { id: "ainb_diag_1" } };
      },
      async dispatchTaskCard() {
        throw new Error("automatic_diagnostic_report_must_not_dispatch_task_card");
      },
    },
  });
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const res = makeResponse();
  const req = makeReq("POST", "/api/v1/home-ai/diagnostics/events", {
    workspaceId: "weixin_wuping",
    diagnostic_type: "retry_exhausted",
  });
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "weixin_wuping" } });
  const body = jsonBody(res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(notificationCalls, [{ case_id: "diagcase_test" }]);
  assert.deepEqual(body.owner_notification, {
    ok: true,
    notified: true,
    auto_dispatched: false,
    inbox_item_id: "ainb_diag_1",
    task_card_id: "",
    reason: "",
  });
}

async function testCreateSelfCheckEventReportsAutoDispatch() {
  const notificationCalls = [];
  const { deps } = createDeps({
    workflowService: {
      async notifyOwner(input) {
        notificationCalls.push(input);
        return {
          ok: true,
          notified: false,
          autoDispatched: true,
          reason: "auto_self_check_task_card",
          taskCardResult: { cardIds: ["ttc_self_check_1"] },
        };
      },
    },
  });
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const res = makeResponse();
  const req = makeReq("POST", "/api/v1/home-ai/diagnostics/events", {
    workspaceId: "owner",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_plugin_proxy",
  });
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "owner" } });
  const body = jsonBody(res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(notificationCalls, [{ case_id: "diagcase_test" }]);
  assert.deepEqual(body.owner_notification, {
    ok: true,
    notified: false,
    auto_dispatched: true,
    inbox_item_id: "",
    task_card_id: "ttc_self_check_1",
    reason: "auto_self_check_task_card",
  });
}

async function testDeniedWorkspaceStopsCreate() {
  const { deps, calls } = createDeps({ denyWorkspace: true });
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const res = makeResponse();
  const req = makeReq("POST", "/api/v1/home-ai/diagnostics/events", { workspaceId: "owner" });
  const result = await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "owner" } });
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.some((call) => call.type === "ingestEvent"), false);
}

async function testOwnerListsCasesAndEvents() {
  const { deps, calls } = createDeps();
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const casesRes = makeResponse();
  await routes.handle(makeReq("GET", "/api/v1/home-ai/diagnostics/cases?limit=5"), casesRes, new URL("/api/v1/home-ai/diagnostics/cases?limit=5", "http://localhost"));
  assert.equal(casesRes.statusCode, 200);
  assert.equal(jsonBody(casesRes).ok, true);
  const eventsRes = makeResponse();
  await routes.handle(makeReq("GET", "/api/v1/home-ai/diagnostics/events?case_id=diagcase_test"), eventsRes, new URL("/api/v1/home-ai/diagnostics/events?case_id=diagcase_test", "http://localhost"));
  assert.equal(eventsRes.statusCode, 200);
  assert.equal(calls.filter((call) => call.type === "requireOwner").length, 2);
}

async function testOwnerUpdatesCaseState() {
  const { deps, calls } = createDeps();
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const res = makeResponse();
  const req = makeReq("POST", "/api/v1/home-ai/diagnostics/cases/diagcase_test/state", { status: "closed", reason: "verified" });
  await routes.handle(req, res, new URL(req.url, "http://localhost"));
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).case.status, "closed");
  assert.deepEqual(calls.find((call) => call.type === "updateCaseStatus").input, {
    case_id: "diagcase_test",
    status: "closed",
    reason: "verified",
    actor: "owner",
  });
}

async function testOwnerDispatchesDiagnosticTaskCard() {
  const dispatchCalls = [];
  const { deps } = createDeps({
    workflowService: {
      async dispatchTaskCard(input) {
        dispatchCalls.push(input);
        return {
          ok: true,
          dispatched: true,
          taskCardResult: { cardIds: ["ttc_diag_1"] },
        };
      },
    },
  });
  const routes = createAiOpsDiagnosticApiRoutes(deps);
  const res = makeResponse();
  const req = makeReq("POST", "/api/v1/home-ai/diagnostics/cases/diagcase_test/task-card", {});
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).taskCardResult.cardIds[0], "ttc_diag_1");
  assert.deepEqual(dispatchCalls, [{ case_id: "diagcase_test", actor: "owner" }]);
}

function testDependencyValidation() {
  assert.throws(() => createAiOpsDiagnosticApiRoutes({}), /require readBody/);
}

async function run() {
  await testCreateEventRequiresWorkspaceAndStores();
  await testCreateEventCreatesOwnerNotificationWhenReady();
  await testCreateSelfCheckEventReportsAutoDispatch();
  await testDeniedWorkspaceStopsCreate();
  await testOwnerListsCasesAndEvents();
  await testOwnerUpdatesCaseState();
  await testOwnerDispatchesDiagnosticTaskCard();
  testDependencyValidation();
  console.log("AI Ops diagnostic API route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
