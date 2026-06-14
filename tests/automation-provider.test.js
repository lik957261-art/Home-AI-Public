"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAutomationProvider } = require("../adapters/automation-provider");

async function testAutomationBackendMutationGuards() {
  {
    let bridgeCalled = false;
    const provider = createAutomationProvider({
      automationBackend: "native_cron",
      runBridge() {
        bridgeCalled = true;
        return { ok: true };
      },
    });
    const result = await provider.createJob({ text: "monthly report" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.code, "automation_backend_unsupported");
    assert.match(result.error, /Unsupported Automation backend/);
    assert.equal(bridgeCalled, false);
  }

  {
    let bridgeCalled = false;
    const provider = createAutomationProvider({
      allowLocalAutomationWrites: false,
      automationBackend: "local",
      runBridge() {
        bridgeCalled = true;
        return { ok: true };
      },
    });
    const result = await provider.mutateJob({ action: "pause", jobId: "job_1" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.code, "automation_local_write_disabled");
    assert.equal(bridgeCalled, false);
  }

  {
    const calls = [];
    const provider = createAutomationProvider({
      automationBackend: "local",
      runBridge(payload) {
        calls.push(payload);
        return { ok: true, job: { id: "local-job" }, source: { name: "local_automations" } };
      },
    });
    const result = await provider.createJob({ text: "local test job" });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((item) => item.action), ["create"]);
  }

  {
    const provider = createAutomationProvider({
      automationBackend: "hermes_cron",
      runBridge() {
        throw new Error("cron bridge unavailable");
      },
    });
    await assert.rejects(
      () => provider.createJob({ text: "canonical job" }),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /cron bridge unavailable/);
        return true;
      },
    );
  }
}

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-automation-provider-"));
  const outputRoot = path.join(tempRoot, "cron-output");
  const deliveryRoot = path.join(tempRoot, "deliveries");
  const jobOutputRoot = path.join(outputRoot, "job_1");
  fs.mkdirSync(jobOutputRoot, { recursive: true });
  fs.mkdirSync(deliveryRoot, { recursive: true });
  const pdfPath = path.join(deliveryRoot, "report.pdf");
  const mdPath = path.join(deliveryRoot, "notes.md");
  fs.writeFileSync(pdfPath, "%PDF-1.7\n%%EOF\n");
  fs.writeFileSync(mdPath, "# Notes\n");
  fs.writeFileSync(path.join(jobOutputRoot, "run.md"), [
    `MEDIA: ${mdPath}`,
    `MEDIA: ${pdfPath}`,
    `MEDIA: ${pdfPath}`,
  ].join("\n"));

  const calls = [];
  const provider = createAutomationProvider({
    cacheTtlMs: 60_000,
    cronOutputRoot: outputRoot,
    runLogRoot: path.join(tempRoot, "run-logs"),
    extraDeliverableRoots: [deliveryRoot],
    normalizeLocalPath: (value) => String(value || ""),
    mimeFor(file) {
      return path.extname(file).toLowerCase() === ".pdf" ? "application/pdf" : "text/markdown";
    },
    isPathAllowed: () => false,
    findWorkspace(workspaceId) {
      return workspaceId === "workspace_a" ? { id: "workspace_a" } : null;
    },
    authCanAccessWorkspace(auth, workspaceId) {
      return auth?.workspaceId === workspaceId;
    },
    workspacePrincipal(workspaceId) {
      return `principal:${workspaceId}`;
    },
    jobMatchesOwner(job, ownerPrincipalId) {
      return job.ownerPrincipalId === ownerPrincipalId;
    },
    async runBridge(payload) {
      calls.push(payload);
      if (payload.action === "list") {
        return {
          ok: true,
          jobs: [{ id: "job_1", ownerPrincipalId: "principal:workspace_a" }],
          source: { name: "hermes_cron", jobCount: 1 },
        };
      }
      if (payload.action === "read_deliverable") {
        return {
          ok: true,
          file: {
            name: "report.pdf",
            mime: "application/pdf",
            size: Buffer.byteLength("%PDF-1.7\n%%EOF\n"),
            updatedAt: new Date(0).toISOString(),
            displayPath: "bridge/report.pdf",
            contentBase64: Buffer.from("%PDF-1.7\n%%EOF\n").toString("base64"),
          },
        };
      }
      return Object.assign({ ok: true }, payload);
    },
  });

  const firstList = await provider.listJobs({ includeDisabled: true, limit: 0 });
  assert.equal(firstList.ok, true);
  assert.equal(firstList.source.cache, "miss");
  assert.deepEqual(calls.at(-1), {
    action: "list",
    detail: "full",
    include_disabled: true,
    limit: 0,
    owner_principal_id: "",
  });

  const secondList = await provider.listJobs({ includeDisabled: true, limit: 0 });
  assert.equal(secondList.source.cache, "hit");
  assert.equal(calls.length, 1);

  const freshList = await provider.listJobs({ includeDisabled: true, bypassCache: true, limit: 0 });
  assert.equal(freshList.source.cache, undefined);
  assert.equal(calls.length, 2);

  provider.clearListCache();
  await provider.listJobs({ includeDisabled: false, limit: 25 });
  assert.deepEqual(calls.at(-1), {
    action: "list",
    detail: "full",
    include_disabled: false,
    limit: 25,
    owner_principal_id: "",
  });

  await provider.listJobs({ includeDisabled: true, bypassCache: true, limit: 5, detail: "summary" });
  assert.deepEqual(calls.at(-1), {
    action: "list",
    detail: "summary",
    include_disabled: true,
    limit: 5,
    owner_principal_id: "",
  });

  await provider.createJob({
    dryRun: true,
    text: "daily backup",
    job: { name: "Backup", schedule: "0 3 * * *" },
    ownerPrincipalId: "workspace_a",
    accessPolicyContext: { principal_id: "workspace_a" },
  });
  assert.deepEqual(calls.at(-1), {
    action: "create",
    dry_run: true,
    text: "daily backup",
    job: { name: "Backup", schedule: "0 3 * * *" },
    owner_principal_id: "workspace_a",
    access_policy_context: { principal_id: "workspace_a" },
  });

  await provider.mutateJob({
    action: "update",
    jobId: "job_1",
    ownerPrincipalId: "workspace_a",
    dryRun: false,
    patch: { schedule: "30 3 * * *" },
    reason: "adjust schedule",
  });
  assert.deepEqual(calls.at(-1), {
    action: "update",
    job_id: "job_1",
    owner_principal_id: "workspace_a",
    dry_run: false,
    patch: { schedule: "30 3 * * *" },
    reason: "adjust schedule",
  });

  const outputFile = provider.resolveOutputFile(new URLSearchParams({ jobId: "job_1", file: "run.md" }));
  assert.equal(outputFile.file.name, "run.md");
  assert.equal(outputFile.file.mime, "text/markdown");

  const values = provider.deliverablePathValues(fs.readFileSync(outputFile.file.localPath, "utf8"));
  assert.deepEqual(values.map((item) => path.basename(item)), ["notes.md", "report.pdf"]);

  const deliverableFile = provider.resolveDeliverableFile(new URLSearchParams({ jobId: "job_1", run: "run.md", index: "0" }));
  assert.equal(deliverableFile.file.name, "notes.md");
  assert.equal(deliverableFile.file.mime, "text/markdown");

  const unauthorized = await provider.resolveAuthorizedDeliverableFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "job_1", run: "run.md", index: "0" }),
    auth: { workspaceId: "workspace_b" },
  });
  assert.equal(unauthorized.status, 403);

  const authorized = await provider.resolveAuthorizedDeliverableFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "job_1", run: "run.md", index: "0" }),
    auth: { workspaceId: "workspace_a" },
  });
  assert.equal(authorized.file.name, "notes.md");

  const archivedOutputRoot = path.join(tempRoot, "archived-output");
  const archivedJobRoot = path.join(archivedOutputRoot, "archived_job_1");
  fs.mkdirSync(archivedJobRoot, { recursive: true });
  fs.writeFileSync(path.join(archivedJobRoot, "report.md"), "# Archived audit\n");
  const archivedProvider = createAutomationProvider({
    cacheTtlMs: 0,
    cronOutputRoot: archivedOutputRoot,
    normalizeLocalPath: (value) => String(value || ""),
    mimeFor: () => "text/markdown",
    findWorkspace(workspaceId) {
      return workspaceId === "workspace_a" ? { id: "workspace_a" } : null;
    },
    authCanAccessWorkspace(auth, workspaceId) {
      return auth?.workspaceId === workspaceId;
    },
    workspacePrincipal(workspaceId) {
      return `principal:${workspaceId}`;
    },
    jobMatchesOwner(job, ownerPrincipalId) {
      return job.ownerPrincipalId === ownerPrincipalId;
    },
    actionInboxService: {
      listItems() {
        return {
          ok: true,
          items: [{
            sourceRef: {
              automationId: "archived_job_1",
              reportUrl: "/api/automations/output?jobId=archived_job_1&file=report.md",
              latestDeliverable: {
                url: "/api/automations/output?jobId=archived_job_1&file=report.md",
              },
            },
          }],
        };
      },
    },
    async runBridge(payload) {
      if (payload.action === "list") return { ok: true, jobs: [], source: { name: "hermes_cron" } };
      return { ok: false, error: "unexpected bridge action" };
    },
  });
  const archivedAuthorized = await archivedProvider.resolveAuthorizedOutputFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "archived_job_1", file: "report.md" }),
    auth: { workspaceId: "workspace_a" },
  });
  assert.equal(archivedAuthorized.file.name, "report.md");
  const archivedDenied = await archivedProvider.resolveAuthorizedOutputFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "archived_job_1", file: "other.md" }),
    auth: { workspaceId: "workspace_a" },
  });
  assert.equal(archivedDenied.status, 404);

  fs.rmSync(jobOutputRoot, { recursive: true, force: true });
  const bridgeAuthorized = await provider.resolveAuthorizedDeliverableFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "job_1", run: "run.md", index: "0" }),
    auth: { workspaceId: "workspace_a" },
  });
  assert.equal(bridgeAuthorized.bridgeFile.name, "report.pdf");
  assert.equal(Buffer.from(bridgeAuthorized.bridgeFile.contentBase64, "base64").toString("utf8"), "%PDF-1.7\n%%EOF\n");

  await testAutomationBackendMutationGuards();
}

run()
  .then(() => console.log("automation-provider contract passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
