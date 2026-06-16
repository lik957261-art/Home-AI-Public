"use strict";

const assert = require("node:assert/strict");
const { createWebPushAutomationProjectionService } = require("../adapters/web-push-automation-projection-service");

function createHarness(overrides = {}) {
  const state = overrides.state || { automationPushMarks: {} };
  const service = createWebPushAutomationProjectionService(Object.assign({
    appRouteUrl(params = {}) {
      const query = new URLSearchParams(params);
      return `/?${query.toString()}`;
    },
    compactText: (value, max = 200) => String(value || "").slice(0, max),
    hashValue: (value) => `hash-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`,
    nowIso: () => "2026-06-08T12:00:00.000Z",
    nowMs: () => Date.parse("2026-06-08T12:00:00.000Z"),
    state: () => state,
    workspaceIdForPrincipal: (principalId) => principalId === "child-principal" ? "child" : "owner",
  }, overrides.serviceOptions || {}));
  return { service, state };
}

function doc(name, updatedAt, extra = {}) {
  return Object.assign({
    name,
    url: `/files/${name}`,
    size: 100,
    updatedAt,
    runOutputUpdatedAt: updatedAt,
  }, extra);
}

function testLatestDeliverableFilteringAndSorting() {
  const { service } = createHarness();
  const job = {
    id: "job-a",
    lastRunAt: "2026-06-08T11:00:00.000Z",
    outputDocuments: [
      doc("old.md", "2026-06-08T10:20:00.000Z"),
      doc("fresh.pdf", "2026-06-08T11:20:00.000Z"),
      doc("future.pdf", "2026-06-08T13:00:00.000Z"),
      doc("notes.txt", "2026-06-08T11:30:00.000Z"),
      doc("empty.md", "2026-06-08T11:30:00.000Z", { size: 0 }),
      doc("missing-url.md", "2026-06-08T11:30:00.000Z", { url: "" }),
    ],
  };
  assert.equal(service.automationLatestDeliverableForPush(job).name, "fresh.pdf");
  assert.equal(service.automationLatestDeliverableForPush(job, {
    deliverableTimeAt: "2026-06-08T11:30:00.000Z",
  }), null);
  assert.equal(service.automationLatestDeliverableTimeMs(job), Date.parse("2026-06-08T13:00:00.000Z"));

  const jobs = [
    { id: "b", name: "B", lastRunAt: "2026-06-08T10:00:00.000Z", updatedAt: "2026-06-08T10:10:00.000Z" },
    { id: "c", name: "C", nextRunAt: "2026-06-08T09:00:00.000Z" },
    { id: "a", name: "A", outputDocuments: [doc("a.md", "2026-06-08T11:00:00.000Z")] },
  ].sort(service.automationListSortByLatestDeliverable);
  assert.deepEqual(jobs.map((item) => item.id), ["a", "b", "c"]);
}

function testSignatureSourceRefAndMarkProjection() {
  const { service, state } = createHarness();
  const latestDoc = doc("result.docx", "2026-06-08T11:05:00.000Z");
  const job = {
    id: "job-b",
    lastRunAt: "2026-06-08T11:00:00.000Z",
    lastStatus: "success",
    status: "enabled",
  };
  const signature = service.automationPushSignature(job, latestDoc);
  assert.equal(signature, "2026-06-08T11:00:00.000Z|success|enabled|||result.docx:2026-06-08T11:05:00.000Z:2026-06-08T11:05:00.000Z:/files/result.docx");
  assert.equal(service.automationPushMarkSignature(signature), signature);
  assert.equal(service.automationPushMarkSignature({ signature }), signature);
  assert.deepEqual(service.automationDeliverableSourceRef(latestDoc), {
    name: "result.docx",
    url: "/files/result.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    updatedAt: "2026-06-08T11:05:00.000Z",
    runOutputUpdatedAt: "2026-06-08T11:05:00.000Z",
  });
  service.setAutomationPushMark(job, signature, latestDoc);
  assert.deepEqual(state.automationPushMarks["job-b"], {
    signature,
    lastRunAt: "2026-06-08T11:00:00.000Z",
    lastStatus: "success",
    deliverableName: "result.docx",
    deliverableUpdatedAt: "2026-06-08T11:05:00.000Z",
    runOutputUpdatedAt: "2026-06-08T11:05:00.000Z",
    deliverableTimeAt: "2026-06-08T11:05:00.000Z",
    updatedAt: "2026-06-08T12:00:00.000Z",
  });
}

function testFailedRunSignatureIgnoresDeliverableSelection() {
  const { service } = createHarness();
  const job = {
    id: "job-failed",
    lastRunAt: "2026-06-08T11:00:00.000Z",
    lastStatus: "error",
    status: "error",
    lastError: "Script exited with code 1",
  };
  const signatureWithDoc = service.automationPushSignature(job, doc("failure.md", "2026-06-08T11:05:00.000Z"));
  const signatureWithoutDoc = service.automationPushSignature(job, null);
  assert.equal(signatureWithDoc, "2026-06-08T11:00:00.000Z|failed|Script exited with code 1");
  assert.equal(signatureWithoutDoc, signatureWithDoc);
}

function testEventProjectionAndRecentInitialDetection() {
  const { service } = createHarness();
  const latestDoc = doc("report.md", "2026-06-08T11:30:00.000Z");
  const completedJob = {
    id: "job-c",
    ownerPrincipalId: "child-principal",
    name: "Daily report",
    lastRunAt: "2026-06-08T11:00:00.000Z",
    lastStatus: "success",
    scheduleText: "daily",
  };
  const signature = service.automationPushSignature(completedJob, latestDoc);
  const event = service.automationPushEventForJob(completedJob, latestDoc, signature);
  assert.equal(event.jobId, "job-c");
  assert.equal(event.principalId, "child-principal");
  assert.equal(event.workspaceId, "child");
  assert.equal(event.payload.title, "自动化任务完成");
  assert.equal(event.payload.data.messageType, "automation_completed");
  assert.equal(event.payload.data.url, "/?view=automation&workspaceId=child&automationId=job-c");
  assert.equal(event.payload.timestamp, Date.parse("2026-06-08T12:00:00.000Z"));
  assert.equal(service.isRecentInitialAutomationEvent(completedJob, latestDoc), true);

  const failedEvent = service.automationPushEventForJob({
    id: "job-f",
    name: "Backup",
    lastRunAt: "2026-06-08T11:10:00.000Z",
    lastStatus: "failed",
    lastError: "disk full",
  }, null, "failed-sig");
  assert.equal(failedEvent.payload.title, "自动化任务失败");
  assert.equal(failedEvent.payload.data.messageType, "automation_failed");
  assert.match(failedEvent.payload.body, /disk full/);

  const todoEvent = service.automationPushEventForJob({
    id: "job-t",
    name: "Pay bill",
    itemType: "todo",
    scheduleText: "daily",
    lastRunAt: "2026-06-08T11:10:00.000Z",
    lastStatus: "success",
  }, null, "todo-sig");
  assert.equal(todoEvent.payload.title, "Pay bill");
  assert.equal(todoEvent.payload.data.messageType, "automation_scheduled_todo");
  assert.equal(service.automationJobLooksScheduledTodo({ name: "提醒交水费", scheduleText: "daily" }), true);
}

testLatestDeliverableFilteringAndSorting();
testSignatureSourceRefAndMarkProjection();
testFailedRunSignatureIgnoresDeliverableSelection();
testEventProjectionAndRecentInitialDetection();
console.log("web-push-automation-projection-service tests passed");
