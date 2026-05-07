"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAutomationProvider } = require("../adapters/automation-provider");

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
      return Object.assign({ ok: true }, payload);
    },
  });

  const firstList = await provider.listJobs({ includeDisabled: true, limit: 0 });
  assert.equal(firstList.ok, true);
  assert.equal(firstList.source.cache, "miss");
  assert.deepEqual(calls.at(-1), {
    action: "list",
    include_disabled: true,
    limit: 0,
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
    include_disabled: false,
    limit: 25,
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
  assert.deepEqual(values.map((item) => path.basename(item)), ["report.pdf", "notes.md"]);

  const deliverableFile = provider.resolveDeliverableFile(new URLSearchParams({ jobId: "job_1", run: "run.md", index: "0" }));
  assert.equal(deliverableFile.file.name, "report.pdf");
  assert.equal(deliverableFile.file.mime, "application/pdf");

  const unauthorized = await provider.resolveAuthorizedDeliverableFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "job_1", run: "run.md", index: "0" }),
    auth: { workspaceId: "workspace_b" },
  });
  assert.equal(unauthorized.status, 403);

  const authorized = await provider.resolveAuthorizedDeliverableFile({
    query: new URLSearchParams({ workspaceId: "workspace_a", jobId: "job_1", run: "run.md", index: "0" }),
    auth: { workspaceId: "workspace_a" },
  });
  assert.equal(authorized.file.name, "report.pdf");
}

run()
  .then(() => console.log("automation-provider contract passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
