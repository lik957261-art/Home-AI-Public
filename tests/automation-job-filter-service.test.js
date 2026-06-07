"use strict";

const assert = require("node:assert/strict");

const {
  createAutomationJobFilterService,
} = require("../adapters/automation-job-filter-service");

const service = createAutomationJobFilterService();

const job = {
  id: "job_1",
  name: "Morning digest",
  promptPreview: "Summarize inbox",
  schedule: "0 8 * * *",
  status: "active",
  deliver: "web_push",
  ownerPrincipalId: "owner",
  skills: ["mail", "summary"],
  outputDocuments: [{ name: "daily.md" }],
};

assert.equal(service.jobMatchesSearch(job, ""), true);
assert.equal(service.jobMatchesSearch(job, " INBOX "), true);
assert.equal(service.jobMatchesSearch(job, "daily.md"), true);
assert.equal(service.jobMatchesSearch(job, "missing"), false);

assert.equal(service.jobMatchesOwner(job, "owner"), true);
assert.equal(service.jobMatchesOwner(job, "weixin_wuping"), false);
assert.equal(service.jobMatchesOwner({ id: "legacy" }, "owner"), true);
assert.equal(service.jobMatchesOwner({ id: "legacy" }, "weixin_wuping"), false);
assert.equal(service.jobMatchesOwner(job, ""), false);

console.log("automation job filter service tests passed");
