"use strict";

const assert = require("node:assert/strict");

const {
  buildPlan,
  buildRemoteSteps,
  buildSshArgs,
  runRemoteDeploySmoke,
  safeRemoteTempRoot,
  shellQuote,
  summarizeStep,
} = require("../adapters/public-remote-deploy-smoke-service");

function json(value) {
  return JSON.stringify(value);
}

async function testPlanIsBoundedAndSafeByDefault() {
  const plan = buildPlan({ stamp: "20260629T150000Z" });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.remoteRoot, "/tmp/homeai-public-remote-deploy-smoke-20260629T150000Z");
  assert.equal(plan.executeProductionUpgrade, false);
  assert.ok(plan.actions.some((action) => action.type === "public-upgrade-rehearsal"));
  assert.equal(plan.actions.some((action) => action.type === "public-production-upgrade"), false);
}

function testRejectsUnsafeRemoteRoot() {
  assert.equal(safeRemoteTempRoot("/Users/example/path", "stamp"), "");
  const plan = buildPlan({ execute: true, sshTarget: "macbook-air", remoteRoot: "/Users/example/path" });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.blockers.map((item) => item.code), ["remote_temp_root_invalid"]);
}

function testSshArgsDoNotExposeShellToLocalEvaluation() {
  const args = buildSshArgs({
    sshTarget: "macbook-air",
    sshConfig: "/tmp/ssh_config",
    identityFile: "/tmp/key",
    port: "2222",
  }, "/bin/sh -lc 'echo ok'");
  assert.deepEqual(args.slice(0, 10), [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    "-F",
    "/tmp/ssh_config",
    "-i",
    "/tmp/key",
    "-p",
    "2222",
  ]);
  assert.equal(args.at(-2), "macbook-air");
  assert.equal(args.at(-1), "/bin/sh -lc 'echo ok'");
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
}

async function testExecuteHappyPathWithFakeSsh() {
  const calls = [];
  async function runProcess(command, args) {
    calls.push({ command, args, remote: args.at(-1) });
    const remote = args.at(-1);
    if (remote.includes("uname=") || remote.includes("for tool in git")) {
      return { status: 0, stdout: "uname=Darwin\narch=arm64\ngit=/usr/bin/git\ncurl=/usr/bin/curl\ntar=/usr/bin/tar\nbash=/bin/bash\nnode=\nnpm=\n", stderr: "" };
    }
    if (remote.includes("nodeVersion=")) {
      return { status: 0, stdout: "node=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/node\nnpm=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/npm\nnodeVersion=v24.14.1\n", stderr: "" };
    }
    if (remote.includes("public-install-preflight")) {
      return { status: 0, stdout: json({ ok: true, requiredPluginCount: 10, issues: [] }), stderr: "" };
    }
    if (remote.includes("macos-fresh-install-rehearsal")) {
      return { status: 0, stdout: json({ ok: true, phaseCount: 9, issues: [], artifacts: [{ path: "data/secrets/owner-web-key.secret", exists: true }] }), stderr: "" };
    }
    if (remote.includes("rehearse:public-upgrade")) {
      return {
        status: 0,
        stdout: json({
          ok: true,
          stepCount: 7,
          tempRemoved: true,
          steps: [
            {
              type: "validate-operator-clone-gate-plan",
              detail: {
                pluginCount: 10,
                cloneActionCount: 10,
                deployActionCount: 10,
                movieOperatorAuthenticated: true,
              },
            },
          ],
        }),
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  }
  const report = await runRemoteDeploySmoke({
    execute: true,
    sshTarget: "macbook-air",
    stamp: "20260629T150001Z",
  }, { runProcess });
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.cleanup.attempted, true);
  assert.equal(report.steps.at(-1).type, "public-upgrade-rehearsal");
  assert.equal(report.steps.at(-1).summary.deployActionCount, 10);
  assert.ok(calls.every((call) => call.command === "ssh"));
}

async function testCycleInstallRunsInstallDeleteReinstallInSandbox() {
  const calls = [];
  async function runProcess(command, args) {
    const remote = args.at(-1);
    calls.push(remote);
    if (remote.includes("for tool in git")) {
      return { status: 0, stdout: "uname=Darwin\narch=arm64\ngit=/usr/bin/git\ncurl=/usr/bin/curl\ntar=/usr/bin/tar\nbash=/bin/bash\nnode=\nnpm=\n", stderr: "" };
    }
    if (remote.includes("nodeVersion=")) {
      return { status: 0, stdout: "node=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/node\nnpm=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/npm\nnodeVersion=v24.14.1\n", stderr: "" };
    }
    if (remote.includes("public-install-preflight")) {
      return { status: 0, stdout: json({ ok: true, requiredPluginCount: 10, issues: [] }), stderr: "" };
    }
    if (remote.includes("macos-fresh-install-rehearsal")) {
      return { status: 0, stdout: json({ ok: true, phaseCount: 9, issues: [], artifacts: [] }), stderr: "" };
    }
    if (remote.includes("install-macos-production.sh --execute --guided")) {
      return { status: 0, stdout: json({ ok: true, guidedExecutedCount: 9, issues: [] }), stderr: "" };
    }
    if (remote.includes("removed=true")) {
      return { status: 0, stdout: "removed=true\n", stderr: "" };
    }
    if (remote.includes("rehearse:public-upgrade")) {
      return {
        status: 0,
        stdout: json({
          ok: true,
          stepCount: 7,
          tempRemoved: true,
          steps: [{ type: "validate-operator-clone-gate-plan", detail: { pluginCount: 10, cloneActionCount: 10, deployActionCount: 10, movieOperatorAuthenticated: true } }],
        }),
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  }
  const report = await runRemoteDeploySmoke({
    execute: true,
    sshTarget: "macbook-air",
    cycleInstall: true,
    stamp: "20260629T150003Z",
  }, { runProcess });
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.deepEqual(report.steps.map((step) => step.type), [
    "remote-system-probe",
    "prepare-remote-root",
    "bootstrap-node-runtime",
    "clone-public-repo",
    "public-source-preflight",
    "macos-fresh-install-rehearsal",
    "macos-install-cycle-first",
    "macos-install-cycle-delete",
    "macos-install-cycle-second",
    "public-upgrade-rehearsal",
  ]);
  assert.equal(report.steps.find((step) => step.type === "macos-install-cycle-delete").summary.removed, true);
  assert.equal(calls.filter((remote) => remote.includes("install-macos-production.sh --execute --guided")).length, 2);
  assert.equal(calls.some((remote) => remote.includes("rehearsal-root")), true);
  assert.equal(calls.filter((remote) => remote.includes("target-root")).length >= 2, true);
  assert.equal(calls.some((remote) => remote.includes("/Users/example/path")), false);
}

function testProductionUpgradeCommandUsesSourceAdoptionGate() {
  const plan = buildPlan({
    execute: true,
    sshTarget: "macbook-air",
    stamp: "20260629T150004Z",
    remoteRoot: "/tmp/homeai-public-remote-deploy-smoke-x",
    publicRepoUrl: "https://example.test/repo.git",
    executeProductionUpgrade: true,
    productionRoot: "/Users/example/path",
    reason: "friend-upgrade",
    sudoPasswordFile: "/private/local/sudo-password",
  });
  assert.equal(plan.sudoPasswordFileProvided, true);
  assert.equal(JSON.stringify(plan).includes("/private/local/sudo-password"), false);
  const steps = buildRemoteSteps(plan);
  assert.deepEqual(steps.slice(2, 4).map((step) => step.type), ["upload-sudo-password-file", "chmod-sudo-password-file"]);
  assert.equal(steps.find((step) => step.type === "upload-sudo-password-file").localCommand, "scp");
  const upgrade = steps.find((step) => step.type === "public-production-upgrade");
  assert.ok(upgrade);
  assert.match(upgrade.script, /--clone-missing-plugins/);
  assert.match(upgrade.script, /--adopt-non-git-sources/);
  assert.match(upgrade.script, /--update-hermes-agent/);
  assert.match(upgrade.script, /--install-hermes-agent-dependencies/);
  assert.match(upgrade.script, /--force-closure-validation/);
  assert.match(upgrade.script, /--allow-provider-auth-pending/);
  assert.match(upgrade.script, /nohup \/bin\/sh "\$runner_path"/);
  assert.match(upgrade.script, /production-upgrade\.stdout/);
  assert.match(upgrade.script, /production-upgrade\.stderr/);
  assert.match(upgrade.script, /production-upgrade\.status/);
  assert.match(upgrade.script, /HOMEAI_MAC_SUDO_PASSWORD_FILE='\/tmp\/homeai-public-remote-deploy-smoke-x\/sudo-password'/);
  assert.match(upgrade.script, /HOMEAI_NODE='\/tmp\/homeai-public-remote-deploy-smoke-x\/runtime\/bin\/node'/);
  assert.match(upgrade.script, /HOMEAI_NPM='\/tmp\/homeai-public-remote-deploy-smoke-x\/runtime\/bin\/npm'/);
  assert.match(upgrade.script, /export HOMEAI_PYTHON="\$\(command -v "\$candidate"\)"/);
  assert.match(upgrade.script, /--plugin-root '\/tmp\/homeai-public-remote-deploy-smoke-x\/upgrade-sources\/plugins'/);
  assert.match(upgrade.script, /--hermes-agent-source '\/tmp\/homeai-public-remote-deploy-smoke-x\/upgrade-sources\/hermes-agent-official'/);
  assert.doesNotMatch(upgrade.script, /export HOMEAI_PUBLIC_REPOSITORY_URL=.*npm run --silent upgrade:public/);
  assert.match(upgrade.script, /export HOMEAI_PUBLIC_REPOSITORY_URL='https:\/\/example\.test\/repo\.git'\nexport GIT_SSH_COMMAND=/);
  assert.match(upgrade.script, /cd '\/tmp\/homeai-public-remote-deploy-smoke-x\/Home-AI-Public' && npm run --silent upgrade:public -- --root/);
  assert.deepEqual(upgrade.resultFiles, {
    stdoutPath: "/tmp/homeai-public-remote-deploy-smoke-x/production-upgrade.stdout",
    stderrPath: "/tmp/homeai-public-remote-deploy-smoke-x/production-upgrade.stderr",
    statusPath: "/tmp/homeai-public-remote-deploy-smoke-x/production-upgrade.status",
    runnerPath: "/tmp/homeai-public-remote-deploy-smoke-x/production-upgrade-runner.sh",
  });
}

async function testStopsOnFailedPreflightAndCleansUp() {
  async function runProcess(command, args) {
    const remote = args.at(-1);
    if (remote.includes("for tool in git")) return { status: 0, stdout: "uname=Darwin\narch=arm64\ngit=/usr/bin/git\ncurl=/usr/bin/curl\ntar=/usr/bin/tar\nbash=/bin/bash\nnode=\nnpm=\n", stderr: "" };
    if (remote.includes("nodeVersion=")) return { status: 0, stdout: "node=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/node\nnpm=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/npm\nnodeVersion=v24.14.1\n", stderr: "" };
    if (remote.includes("public-install-preflight")) return { status: 1, stdout: json({ ok: false, issues: [{ code: "missing" }] }), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  }
  const report = await runRemoteDeploySmoke({
    execute: true,
    sshTarget: "macbook-air",
    stamp: "20260629T150002Z",
  }, { runProcess });
  assert.equal(report.ok, false);
  assert.equal(report.cleanup.attempted, true);
  assert.equal(report.steps.some((step) => step.type === "macos-fresh-install-rehearsal"), false);
  assert.equal(report.steps.at(-1).summary.issueCount, 1);
}

async function testProductionUpgradeFailureParsesLongJsonBeforeTruncation() {
  async function runProcess(command, args) {
    const remote = args.at(-1);
    if (remote.includes("for tool in git")) return { status: 0, stdout: "uname=Darwin\narch=arm64\ngit=/usr/bin/git\ncurl=/usr/bin/curl\ntar=/usr/bin/tar\nbash=/bin/bash\nnode=\nnpm=\n", stderr: "" };
    if (remote.includes("nodeVersion=")) return { status: 0, stdout: "node=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/node\nnpm=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/npm\nnodeVersion=v24.14.1\n", stderr: "" };
    if (remote.includes("public-install-preflight")) return { status: 0, stdout: json({ ok: true, requiredPluginCount: 10, issues: [] }), stderr: "" };
    if (remote.includes("macos-fresh-install-rehearsal")) return { status: 0, stdout: json({ ok: true, phaseCount: 9, issues: [], artifacts: [] }), stderr: "" };
    if (remote.includes("rehearse:public-upgrade")) return { status: 0, stdout: json({ ok: true, steps: [] }), stderr: "" };
    if (remote.includes("HOMEAI_REMOTE_RESULT_STATUS_PATH")) {
      return {
        status: 0,
        stdout: json({
          status: 1,
          statusPresent: true,
          stdout: json({
            ok: false,
            mode: "execute",
            error: "closure_validation_failed",
            stepCount: 2,
            initialPlan: {
              padding: "x".repeat(12000),
            },
          }),
          stderr: "",
        }),
        stderr: "",
      };
    }
    if (remote.includes("upgrade:public")) {
      return {
        status: 255,
        stdout: "",
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  }
  const report = await runRemoteDeploySmoke({
    execute: true,
    sshTarget: "macbook-air",
    executeProductionUpgrade: true,
    productionRoot: "/Users/example/path",
    stamp: "20260629T150005Z",
  }, { runProcess });
  assert.equal(report.ok, false);
  const upgrade = report.steps.find((step) => step.type === "public-production-upgrade");
  assert.equal(upgrade.summary.ok, false);
  assert.equal(upgrade.summary.error, "closure_validation_failed");
  assert.equal(upgrade.summary.stepCount, 2);
}

async function testProductionUpgradeReadsResultFilesAfterSshChannelFailure() {
  async function runProcess(command, args) {
    const remote = args.at(-1);
    if (remote.includes("for tool in git")) return { status: 0, stdout: "uname=Darwin\narch=arm64\ngit=/usr/bin/git\ncurl=/usr/bin/curl\ntar=/usr/bin/tar\nbash=/bin/bash\nnode=\nnpm=\n", stderr: "" };
    if (remote.includes("nodeVersion=")) return { status: 0, stdout: "node=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/node\nnpm=/tmp/homeai-public-remote-deploy-smoke-x/runtime/bin/npm\nnodeVersion=v24.14.1\n", stderr: "" };
    if (remote.includes("public-install-preflight")) return { status: 0, stdout: json({ ok: true, requiredPluginCount: 10, issues: [] }), stderr: "" };
    if (remote.includes("macos-fresh-install-rehearsal")) return { status: 0, stdout: json({ ok: true, phaseCount: 9, issues: [], artifacts: [] }), stderr: "" };
    if (remote.includes("rehearse:public-upgrade")) return { status: 0, stdout: json({ ok: true, steps: [] }), stderr: "" };
    if (remote.includes("HOMEAI_REMOTE_RESULT_STATUS_PATH")) {
      return {
        status: 0,
        stdout: json({
          status: 0,
          statusPresent: true,
          stdout: json({
            ok: true,
            mode: "execute",
            stepCount: 6,
            updatedPlugins: ["codex-mobile-web"],
            appUpdated: false,
            hermesAgentUpdated: false,
          }),
          stderr: "",
        }),
        stderr: "",
      };
    }
    if (remote.includes("upgrade:public")) {
      return { status: 255, stdout: "", stderr: "ssh channel closed" };
    }
    return { status: 0, stdout: "", stderr: "" };
  }
  const report = await runRemoteDeploySmoke({
    execute: true,
    sshTarget: "macbook-air",
    executeProductionUpgrade: true,
    productionRoot: "/Users/example/path",
    stamp: "20260629T150006Z",
  }, { runProcess });
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  const upgrade = report.steps.find((step) => step.type === "public-production-upgrade");
  assert.equal(upgrade.ok, true);
  assert.equal(upgrade.status, 0);
  assert.equal(upgrade.summary.updatedPluginCount, 1);
  assert.equal(upgrade.summary.stepCount, 6);
}

function testSummariesAreBounded() {
  const summary = summarizeStep("remote-system-probe", {
    ok: false,
    stdout: "uname=Darwin\narch=arm64\ngit=/usr/bin/git\ncurl=/usr/bin/curl\ntar=/usr/bin/tar\nbash=/bin/bash\nnode=\nnpm=/usr/local/bin/npm\n",
  });
  assert.deepEqual(summary.missingTools, []);
  assert.equal(summary.nodeAvailable, false);
  const installSummary = summarizeStep("macos-install-cycle-first", {
    ok: true,
    status: 0,
    stdout: "installStatus=0\ninstallOk=true\nguidedExecutedCount=12\noperatorPhaseCount=5\nphaseCount=18\nissueCount=0\n",
  });
  assert.equal(installSummary.ok, true);
  assert.equal(installSummary.guidedExecutedCount, 12);
  assert.equal(installSummary.operatorPhaseCount, 5);
  const steps = buildRemoteSteps({ remoteRoot: "/tmp/homeai-public-remote-deploy-smoke-x", publicRepoUrl: "https://example.test/repo.git" });
  assert.deepEqual(steps.map((step) => step.type), [
    "remote-system-probe",
    "prepare-remote-root",
    "bootstrap-node-runtime",
    "clone-public-repo",
    "public-source-preflight",
    "macos-fresh-install-rehearsal",
    "public-upgrade-rehearsal",
  ]);
}

(async () => {
  await testPlanIsBoundedAndSafeByDefault();
  testRejectsUnsafeRemoteRoot();
  testSshArgsDoNotExposeShellToLocalEvaluation();
  await testExecuteHappyPathWithFakeSsh();
  await testCycleInstallRunsInstallDeleteReinstallInSandbox();
  testProductionUpgradeCommandUsesSourceAdoptionGate();
  await testStopsOnFailedPreflightAndCleansUp();
  await testProductionUpgradeFailureParsesLongJsonBeforeTruncation();
  await testProductionUpgradeReadsResultFilesAfterSshChannelFailure();
  testSummariesAreBounded();
  console.log("public remote deploy smoke service tests passed");
})();
