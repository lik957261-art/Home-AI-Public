"use strict";

const assert = require("node:assert/strict");
const { createAutonomousDeliveryApiRoutes } = require("../server-routes/autonomous-delivery-api-routes");

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

function makeReq(method, url, body = {}) {
  return { method, url, headers: {}, body };
}

function jsonBody(res) {
  return JSON.parse(res.body || "{}");
}

function createDeps(options = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      autonomousDeliveryCoordinatorService: options.service || {
        listCases(input) {
          calls.push({ type: "listCases", input });
          return { ok: true, cases: [{ caseId: "delivery_1" }] };
        },
        async createCase(input) {
          calls.push({ type: "createCase", input });
          return { ok: true, case: { caseId: "delivery_1" }, inboxItem: { id: "ainb_delivery_1" } };
        },
        getCase(input) {
          calls.push({ type: "getCase", input });
          return { ok: true, case: { caseId: input.caseId, workspaceId: "owner" }, slices: [], events: [] };
        },
        async startCase(input) {
          calls.push({ type: "startCase", input });
          return { ok: true, case: { caseId: input.caseId, status: "running" }, dispatched: [{ taskCardIds: ["ttc_1"] }] };
        },
        async closeCase(input) {
          calls.push({ type: "closeCase", input });
          return { ok: true, case: { caseId: input.caseId, status: "completed" } };
        },
        recordReturn(input) {
          calls.push({ type: "recordReturn", input });
          return { ok: true, case: { caseId: input.caseId }, slice: { sliceId: input.sliceId, status: input.status } };
        },
        async startVerification(input) {
          calls.push({ type: "startVerification", input });
          return { ok: true, case: { caseId: input.caseId, status: "verification_dispatched" }, verificationSlice: { sliceId: `${input.sliceId}_verification`, taskCardId: "ttc_verify_1" }, taskCardIds: ["ttc_verify_1"] };
        },
        async startDeployment(input) {
          calls.push({ type: "startDeployment", input });
          return { ok: true, case: { caseId: input.caseId, status: "deployment_dispatched" }, deploymentSlice: { sliceId: `${input.sliceId}_deployment`, taskCardId: "ttc_deploy_1" }, taskCardIds: ["ttc_deploy_1"] };
        },
        async startRepair(input) {
          calls.push({ type: "startRepair", input });
          return { ok: true, case: { caseId: input.caseId, status: "repair_dispatched" }, repairSlice: { sliceId: `${input.sliceId}_repair`, taskCardId: "ttc_repair_1" }, taskCardIds: ["ttc_repair_1"] };
        },
        recordReturnForTaskCard(input) {
          calls.push({ type: "recordReturnForTaskCard", input });
          return { ok: true, case: { caseId: "delivery_1" }, slice: { sliceId: "slice_1", taskCardId: input.taskCardId, status: input.status } };
        },
        recordReturnCardEvent(input) {
          calls.push({ type: "recordReturnCardEvent", input });
          return { ok: true, case: { caseId: "delivery_1" }, slice: { sliceId: "slice_1", taskCardId: input.taskCardId, status: input.status } };
        },
      },
      broadcast(event) {
        calls.push({ type: "broadcast", event });
      },
      async readBody(req) {
        calls.push({ type: "readBody" });
        return req.body || {};
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
      requireWorkspaceAccess(req, res, workspaceId) {
        calls.push({ type: "requireWorkspaceAccess", workspaceId });
        if (options.denyWorkspace) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "workspace_denied" }));
          return "";
        }
        return workspaceId;
      },
      sendJson(res, status, payload) {
        calls.push({ type: "sendJson", status, payload });
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(payload));
      },
    },
  };
}

async function testCreateCaseRequiresWorkspaceAndBroadcastsOwnerInbox() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases", {
    workspaceId: "owner",
    text: "研究 Music 播放失败",
  });
  const res = makeResponse();
  const result = await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { workspaceId: "owner" } });
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 201);
  assert.equal(jsonBody(res).case.caseId, "delivery_1");
  assert.equal(calls.find((call) => call.type === "requireWorkspaceAccess").workspaceId, "owner");
  assert.equal(calls.find((call) => call.type === "createCase").input.text, "研究 Music 播放失败");
  assert.deepEqual(calls.find((call) => call.type === "broadcast").event, {
    type: "actionInbox.updated",
    workspaceId: "owner",
    itemId: "ainb_delivery_1",
  });
}

async function testOwnerStartsCaseWithPrompt() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/start", {
    inboxItemId: "ainb_delivery_1",
    ownerPrompt: "Keep scope tight.",
    confirmDecisions: true,
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).dispatched[0].taskCardIds[0], "ttc_1");
  assert.deepEqual(calls.find((call) => call.type === "startCase").input, {
    inboxItemId: "ainb_delivery_1",
    ownerPrompt: "Keep scope tight.",
    confirmDecisions: true,
    caseId: "delivery_1",
    actor: "owner",
    auth: { principalId: "owner" },
  });
}

async function testOwnerClosesVerifiedCase() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/close", {
    inboxItemId: "ainb_close_1",
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).case.status, "completed");
  assert.deepEqual(calls.find((call) => call.type === "closeCase").input, {
    inboxItemId: "ainb_close_1",
    caseId: "delivery_1",
    actor: "owner",
    auth: { principalId: "owner" },
  });
  assert.deepEqual(calls.find((call) => call.type === "broadcast").event, {
    type: "actionInbox.updated",
    workspaceId: "owner",
    itemId: "ainb_close_1",
  });
}

async function testRecordReturnIsOwnerOnly() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/slices/slice_1/return", {
    status: "completed",
    returnCardId: "ttc_return_1",
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).slice.status, "completed");
  assert.equal(calls.find((call) => call.type === "recordReturn").input.caseId, "delivery_1");
  assert.equal(calls.find((call) => call.type === "recordReturn").input.sliceId, "slice_1");
}

async function testOwnerStartsVerificationWithPrompt() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/slices/slice_1/verification/start", {
    inboxItemId: "ainb_verify_1",
    ownerPrompt: "Verify host readback.",
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).verificationSlice.taskCardId, "ttc_verify_1");
  assert.deepEqual(calls.find((call) => call.type === "startVerification").input, {
    inboxItemId: "ainb_verify_1",
    ownerPrompt: "Verify host readback.",
    caseId: "delivery_1",
    sliceId: "slice_1",
    actor: "owner",
    auth: { principalId: "owner" },
  });
  assert.deepEqual(calls.find((call) => call.type === "broadcast").event, {
    type: "actionInbox.updated",
    workspaceId: "owner",
    itemId: "ainb_verify_1",
  });
}

async function testOwnerStartsRepairWithPrompt() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/slices/verify_slice_1/repair/start", {
    inboxItemId: "ainb_repair_1",
    ownerPrompt: "Repair the executable proof.",
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).repairSlice.taskCardId, "ttc_repair_1");
  assert.deepEqual(calls.find((call) => call.type === "startRepair").input, {
    inboxItemId: "ainb_repair_1",
    ownerPrompt: "Repair the executable proof.",
    caseId: "delivery_1",
    sliceId: "verify_slice_1",
    actor: "owner",
    auth: { principalId: "owner" },
  });
  assert.deepEqual(calls.find((call) => call.type === "broadcast").event, {
    type: "actionInbox.updated",
    workspaceId: "owner",
    itemId: "ainb_repair_1",
  });
}

async function testOwnerStartsDeploymentWithPrompt() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/slices/slice_1/deployment/start", {
    inboxItemId: "ainb_deploy_1",
    ownerPrompt: "Use central deploy contract.",
    confirmDeployment: true,
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).deploymentSlice.taskCardId, "ttc_deploy_1");
  assert.deepEqual(calls.find((call) => call.type === "startDeployment").input, {
    inboxItemId: "ainb_deploy_1",
    ownerPrompt: "Use central deploy contract.",
    confirmDeployment: true,
    caseId: "delivery_1",
    sliceId: "slice_1",
    actor: "owner",
    auth: { principalId: "owner" },
  });
  assert.deepEqual(calls.find((call) => call.type === "broadcast").event, {
    type: "actionInbox.updated",
    workspaceId: "owner",
    itemId: "ainb_deploy_1",
  });
}

async function testRecordReturnByTaskCardId() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/task-cards/ttc_1/return", {
    status: "completed",
    returnCardId: "ttc_return_1",
    metadata: {
      evidenceLedgerPath: "/tmp/homeai-aiops-ledger.jsonl",
      requiredKinds: ["test"],
    },
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).slice.taskCardId, "ttc_1");
  assert.deepEqual(calls.find((call) => call.type === "recordReturnForTaskCard").input, {
    status: "completed",
    returnCardId: "ttc_return_1",
    metadata: {
      evidenceLedgerPath: "/tmp/homeai-aiops-ledger.jsonl",
      requiredKinds: ["test"],
    },
    taskCardId: "ttc_1",
    actor: "owner",
    auth: { principalId: "owner" },
  });
}

async function testRecordReturnCardEventIntake() {
  const { deps, calls } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/return-card-events", {
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    summary: "Implementation returned.",
    metadata: { terminal: true, ackPolicy: "none" },
  });
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"), { auth: { principalId: "owner" } });
  assert.equal(res.statusCode, 200);
  assert.equal(jsonBody(res).slice.taskCardId, "ttc_1");
  assert.deepEqual(calls.find((call) => call.type === "recordReturnCardEvent").input, {
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    summary: "Implementation returned.",
    metadata: { terminal: true, ackPolicy: "none" },
    actor: "owner",
    auth: { principalId: "owner" },
  });
}

async function testDeniedOwnerStopsStart() {
  const { deps, calls } = createDeps({ denyOwner: true });
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const req = makeReq("POST", "/api/autonomous-delivery/cases/delivery_1/start", {});
  const res = makeResponse();
  await routes.handle(req, res, new URL(req.url, "http://localhost"));
  assert.equal(res.statusCode, 403);
  assert.equal(calls.some((call) => call.type === "startCase"), false);
}

async function testNoRouteFallsThrough() {
  const { deps } = createDeps();
  const routes = createAutonomousDeliveryApiRoutes(deps);
  const result = await routes.handle(
    makeReq("GET", "/api/autonomous-delivery/unknown"),
    makeResponse(),
    new URL("http://localhost/api/autonomous-delivery/unknown"),
  );
  assert.equal(result.handled, false);
}

function testDependencyValidation() {
  assert.throws(() => createAutonomousDeliveryApiRoutes({}), /require readBody/);
}

async function run() {
  await testCreateCaseRequiresWorkspaceAndBroadcastsOwnerInbox();
  await testOwnerStartsCaseWithPrompt();
  await testOwnerClosesVerifiedCase();
  await testRecordReturnIsOwnerOnly();
  await testOwnerStartsVerificationWithPrompt();
  await testOwnerStartsDeploymentWithPrompt();
  await testOwnerStartsRepairWithPrompt();
  await testRecordReturnByTaskCardId();
  await testRecordReturnCardEventIntake();
  await testDeniedOwnerStopsStart();
  await testNoRouteFallsThrough();
  testDependencyValidation();
  console.log("autonomous delivery API route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
