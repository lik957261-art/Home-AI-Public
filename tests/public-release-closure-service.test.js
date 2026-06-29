"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPublicReleaseClosureService } = require("../adapters/public-release-closure-service");

function mkdirp(value) {
  fs.mkdirSync(value, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(filePath, value = "") {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function setupFixture(options = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-public-release-"));
  const publicRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-public-repo-"));
  writeJson(path.join(repoRoot, "package.json"), {
    scripts: Object.assign({
      "export:public": "node scripts/create-public-export.js",
      "upgrade:public": "node scripts/homeai-public-upgrade.js",
    }, options.includeReleaseScript === false ? {} : {
      "release:public": "node scripts/homeai-public-release-closure.js",
    }),
  });
  writeJson(path.join(repoRoot, "config", "public-plugin-sources.json"), {
    schemaVersion: 1,
    plugins: [
      {
        id: "moira",
        repositoryUrl: "https://github.com/pentiumxp/MOIRA_chinese_astrology_public.git",
      },
      {
        id: "movie",
        repositoryUrl: "https://github.com/pentiumxp/HomeAI-Movie.git",
        operatorAuthenticated: true,
      },
    ],
  });
  writeFile(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "public-upgrade-loop.md"), "# Public upgrade loop\n");
  writeFile(path.join(repoRoot, "scripts", "create-public-export.js"), "\n");
  if (options.includeReleaseScript !== false) {
    writeFile(path.join(repoRoot, "scripts", "homeai-public-release-closure.js"), "\n");
  }
  writeFile(path.join(repoRoot, "scripts", "homeai-public-upgrade.js"), "\n");
  return { repoRoot, publicRepoPath };
}

function createFakeRunner(fixture, calls) {
  let publicSynced = false;
  return async function fakeRunProcess(command, args = [], options = {}) {
    calls.push({ command, args: [...args], cwd: options.cwd || "" });
    if (command === "git") {
      if (args[0] === "status") {
        if (path.resolve(options.cwd) === path.resolve(fixture.publicRepoPath) && publicSynced) {
          return { ok: true, status: 0, stdout: " M README.md\n" };
        }
        return { ok: true, status: 0, stdout: "" };
      }
      if (args[0] === "remote" && args[1] === "get-url" && args[2] === "public") {
        return { ok: true, status: 0, stdout: "git@github.com:pentiumxp/Home-AI-Public.git\n" };
      }
      if (args[0] === "add") return { ok: true, status: 0, stdout: "" };
      if (args[0] === "commit") return { ok: true, status: 0, stdout: "[main abc123] publish\n" };
      if (args[0] === "push") return { ok: true, status: 0, stdout: "" };
    }
    if (command === "rsync") {
      publicSynced = true;
      return { ok: true, status: 0, stdout: "" };
    }
    if (command === "/fake/node") {
      return { ok: true, status: 0, stdout: "ok\n" };
    }
    return { ok: false, status: 1, stderr: `unexpected ${command} ${args.join(" ")}` };
  };
}

function createFakeExport(calls) {
  return function fakeCreateExport(options = {}) {
    calls.push({ type: "createExport", options });
    mkdirp(options.outDir);
    writeJson(path.join(options.outDir, ".public-export-report.json"), {
      ok: true,
      sourceCommit: "abc123",
      fileCount: 7,
    });
    return {
      outDir: options.outDir,
      report: {
        sourceCommit: "abc123",
        fileCount: 7,
      },
    };
  };
}

async function testPlanRequiresReleaseScript() {
  const fixture = setupFixture({ includeReleaseScript: false });
  const calls = [];
  const service = createPublicReleaseClosureService({
    repoRoot: fixture.repoRoot,
    runProcess: createFakeRunner(fixture, calls),
    createExport: createFakeExport(calls),
    nodeCommand: "/fake/node",
    rsyncCommand: "rsync",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const plan = await service.buildPlan();
  assert.equal(plan.ok, false);
  assert.ok(plan.issues.some((issue) => issue.code === "public_release_source_check_failed:packageHasReleaseScript"));
  assert.ok(plan.issues.some((issue) => issue.code === "public_release_source_check_failed:releaseScriptExists"));
}

async function testPlanRejectsImplicitPublicPush() {
  const fixture = setupFixture();
  const calls = [];
  const service = createPublicReleaseClosureService({
    repoRoot: fixture.repoRoot,
    runProcess: createFakeRunner(fixture, calls),
    createExport: createFakeExport(calls),
    nodeCommand: "/fake/node",
    rsyncCommand: "rsync",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const missingRepo = await service.buildPlan({ syncPublicRepo: true });
  assert.equal(missingRepo.ok, false);
  assert.ok(missingRepo.blockers.some((blocker) => blocker.code === "public_repo_path_required"));

  const pushWithoutCommit = await service.buildPlan({
    publicRepoPath: fixture.publicRepoPath,
    syncPublicRepo: true,
    pushPublic: true,
  });
  assert.equal(pushWithoutCommit.ok, false);
  assert.ok(pushWithoutCommit.blockers.some((blocker) => blocker.code === "public_push_requires_commit_public"));
}

async function testExecuteExportsValidatesSyncsCommitsAndPushes() {
  const fixture = setupFixture();
  const calls = [];
  const outDir = path.join(fixture.repoRoot, "workspace", "public-export", "test-export");
  const service = createPublicReleaseClosureService({
    repoRoot: fixture.repoRoot,
    runProcess: createFakeRunner(fixture, calls),
    createExport: createFakeExport(calls),
    nodeCommand: "/fake/node",
    rsyncCommand: "rsync",
    nowIso: () => "2026-06-29T00:00:00.000Z",
  });
  const result = await service.executeClosure({
    outDir,
    publicRepoPath: fixture.publicRepoPath,
    syncPublicRepo: true,
    commitPublic: true,
    pushPublic: true,
    commitMessage: "Publish test release",
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.ok(result.steps.some((step) => step.type === "create-public-export"));
  assert.ok(result.steps.some((step) => step.type === "validate-public-export"));
  assert.ok(result.steps.some((step) => step.type === "sync-public-repo"));
  assert.ok(result.steps.some((step) => step.type === "validate-public-repo"));
  assert.ok(result.steps.some((step) => step.type === "git-commit-public-repo"));
  assert.ok(result.steps.some((step) => step.type === "git-push-public-repo"));
  assert.ok(calls.some((call) => call.command === "rsync"));
  assert.ok(calls.some((call) => call.command === "git" && call.args[0] === "commit" && call.args.includes("Publish test release")));
}

(async () => {
  await testPlanRequiresReleaseScript();
  await testPlanRejectsImplicitPublicPush();
  await testExecuteExportsValidatesSyncsCommitsAndPushes();
  console.log("public release closure service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
