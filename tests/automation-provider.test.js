"use strict";

const assert = require("node:assert/strict");
const { createAutomationProvider } = require("../adapters/automation-provider");

async function run() {
  const calls = [];
  const provider = createAutomationProvider({
    cacheTtlMs: 60_000,
    async runBridge(payload) {
      calls.push(payload);
      if (payload.action === "list") {
        return {
          ok: true,
          jobs: [{ id: `job_${calls.length}`, ownerPrincipalId: "owner" }],
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
}

run()
  .then(() => console.log("automation-provider contract passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
