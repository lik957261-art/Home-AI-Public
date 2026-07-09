"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  PLANNER_SCRIPT,
  resolvePlannerSource,
  runScheduledTask,
} = require("../adapters/codex-mobile-pr-automation-scheduled-task-service");

function tempDir(name = "homeai-pr-auto-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeFile(filePath, text, mode = 0o644) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, { encoding: "utf8", mode });
}

function initRepoWithBase() {
  const repo = tempDir("homeai-codex-pr-repo-");
  run("git", ["init"], repo);
  run("git", ["config", "user.email", "test@example.invalid"], repo);
  run("git", ["config", "user.name", "Test"], repo);
  writeFile(path.join(repo, "README.md"), "base\n");
  run("git", ["add", "."], repo);
  run("git", ["commit", "-m", "base"], repo);
  const baseCommit = run("git", ["rev-parse", "HEAD"], repo).trim();
  return { repo, baseCommit };
}

function plannerStub() {
  return `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}
const stateFile = arg("--state-file");
const run = {
  state: "absorption_dispatched",
  issueCode: "generated_artifacts_rebuild_required",
  privacy: "metadata_only",
  openPullRequestSummary: { privateCount: 1, publicCount: 2 },
  selectedPullRequest: {
    identity: "github-pr:pentiumxp/codex-mobile-web-public:92",
    repoKind: "public",
    repository: "pentiumxp/codex-mobile-web-public",
    number: 92,
    headShort: "abcdef12"
  },
  actions: [{ type: "use_clean_detached_worktree" }],
  taskCardRequests: [{ purpose: "pr_absorption", idempotencyKey: "codex-mobile-pr:92:abcdef12" }]
};
if (process.argv.includes("--write-state") && stateFile) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ version: 1, records: [{ identity: run.selectedPullRequest.identity, state: run.state, selectedHeadShort: "abcdef12" }] }, null, 2) + "\\n", "utf8");
}
process.stdout.write(JSON.stringify(run, null, 2) + "\\n");
`;
}

function addPlannerOnOriginMain(repo) {
  writeFile(path.join(repo, PLANNER_SCRIPT), plannerStub(), 0o755);
  run("git", ["add", "."], repo);
  run("git", ["commit", "-m", "add planner"], repo);
  const plannerCommit = run("git", ["rev-parse", "HEAD"], repo).trim();
  run("git", ["update-ref", "refs/remotes/origin/main", plannerCommit], repo);
  return plannerCommit;
}

async function testStaleCheckoutUsesOriginMainCleanWorktree() {
  const { repo, baseCommit } = initRepoWithBase();
  const plannerCommit = addPlannerOnOriginMain(repo);
  run("git", ["checkout", "--detach", baseCommit], repo);
  assert.equal(fs.existsSync(path.join(repo, PLANNER_SCRIPT)), false);
  const stateFile = path.join(tempDir(), "state.json");
  const result = runScheduledTask({
    checkout: repo,
    sourceRef: "origin/main",
    worktreeRoot: path.join(tempDir(), "source"),
    stateFile,
    env: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, "absorption_dispatched");
  assert.equal(result.source.strategy, "clean_detached_worktree");
  assert.equal(result.source.commit, plannerCommit);
  assert.equal(result.source.sharedCheckout.localPlannerExists, false);
  assert.equal(result.source.sharedCheckout.refPlannerExists, true);
  assert.equal(result.source.sharedCheckout.checkoutIssueCode, "planner_checkout_stale");
  assert.equal(result.readback.publicOpenPullRequestCount, 2);
  assert.equal(result.readback.taskCardIdempotencyKey, "codex-mobile-pr:92:abcdef12");
  assert.equal(fs.existsSync(stateFile), true);
  assert.equal(fs.existsSync(path.join(repo, PLANNER_SCRIPT)), false);
}

async function testDirtySharedCheckoutFailsClosedWhenCleanWorktreeDisabled() {
  const { repo } = initRepoWithBase();
  addPlannerOnOriginMain(repo);
  writeFile(path.join(repo, "dirty.txt"), "dirty\n");
  const result = resolvePlannerSource({
    checkout: repo,
    sourceRef: "origin/main",
    useCleanWorktree: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.issueCode, "shared_checkout_dirty");
}

async function testMissingPlannerSourceFailsClosedWithoutMislabelingStaleAsMissing() {
  const { repo } = initRepoWithBase();
  const head = run("git", ["rev-parse", "HEAD"], repo).trim();
  run("git", ["update-ref", "refs/remotes/origin/main", head], repo);
  const result = runScheduledTask({
    checkout: repo,
    sourceRef: "origin/main",
    worktreeRoot: path.join(tempDir(), "source"),
    stateFile: path.join(tempDir(), "state.json"),
    env: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.issueCode, "planner_source_missing");
  assert.equal(result.source.sharedCheckout.localPlannerExists, false);
  assert.equal(result.source.sharedCheckout.refPlannerExists, false);
}

async function runTests() {
  await testStaleCheckoutUsesOriginMainCleanWorktree();
  await testDirtySharedCheckoutFailsClosedWhenCleanWorktreeDisabled();
  await testMissingPlannerSourceFailsClosedWithoutMislabelingStaleAsMissing();
  console.log("codex mobile pr automation scheduled-task service tests passed");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
