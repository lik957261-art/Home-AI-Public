"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  REQUIRED_PLUGIN_IDS,
  buildReport,
  parseVersion,
  renderMarkdown,
  versionAtLeast,
} = require("../scripts/public-install-preflight");

const REPO_ROOT = path.resolve(__dirname, "..");

function makeRunner(versions = {}) {
  return (command) => {
    if (command === "python3" || command === "/opt/homeai/python3.12") {
      return { status: 0, stdout: versions.python || "Python 3.12.1\n", stderr: "" };
    }
    if (command === "git") {
      return { status: 0, stdout: versions.git || "git version 2.45.0\n", stderr: "" };
    }
    return { status: 127, stdout: "", stderr: "not found" };
  };
}

function testVersionHelpers() {
  assert.deepEqual(parseVersion("Python 3.12.1"), { major: 3, minor: 12, patch: 1, raw: "3.12.1" });
  assert.equal(versionAtLeast(parseVersion("3.12.0"), { major: 3, minor: 12, patch: 0 }), true);
  assert.equal(versionAtLeast(parseVersion("3.11.9"), { major: 3, minor: 12, patch: 0 }), false);
}

function testSourceOnlyPreflightPasses() {
  const report = buildReport({ repoRoot: REPO_ROOT, sourceOnly: true });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.mode, "source-only");
  assert.equal(report.requiredPluginCount, REQUIRED_PLUGIN_IDS.length);
}

function testHostPreflightCanPassWithMockedTools() {
  const report = buildReport({
    repoRoot: REPO_ROOT,
    runner: makeRunner(),
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.mode, "host-and-source");
}

function testHostPreflightFailsClosedForOldPython() {
  const report = buildReport({
    repoRoot: REPO_ROOT,
    runner: makeRunner({ python: "Python 3.9.6\n" }),
  });
  assert.equal(report.ok, false);
  const issue = report.issues.find((item) => item.code === "python_version_too_old_or_missing");
  assert.ok(issue);
  assert.equal(issue.command, "python3");
}

function testHostPreflightAcceptsExplicitPythonCommand() {
  const report = buildReport({
    repoRoot: REPO_ROOT,
    runner: makeRunner({ python: "Python 3.12.4\n" }),
    pythonCommand: "/opt/homeai/python3.12",
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
}

function testCliSourceOnlyAndMarkdown() {
  const jsonOutput = execFileSync("node", ["scripts/public-install-preflight.js", "--source-only", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.mode, "source-only");

  const markdown = renderMarkdown(parsed);
  assert.match(markdown, /Public Install Preflight/);
  assert.match(markdown, /requiredPluginCount/);
  assert.match(markdown, /- none/);
}

testVersionHelpers();
testSourceOnlyPreflightPasses();
testHostPreflightCanPassWithMockedTools();
testHostPreflightFailsClosedForOldPython();
testHostPreflightAcceptsExplicitPythonCommand();
testCliSourceOnlyAndMarkdown();

console.log("public install preflight tests passed");
