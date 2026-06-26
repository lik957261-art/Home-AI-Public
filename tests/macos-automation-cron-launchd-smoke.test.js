"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildReport,
} = require("../scripts/macos-automation-cron-launchd-smoke");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-cron-launchd-"));
try {
  const app = path.join(root, "app");
  const dataScripts = path.join(root, "data", "hermes-home", "scripts");
  fs.mkdirSync(path.join(app, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(app, "gateway-runtime-overrides"), { recursive: true });
  fs.mkdirSync(dataScripts, { recursive: true });
  const scriptText = "#!/usr/bin/env bash\necho ok\n";
  fs.writeFileSync(path.join(app, "scripts", "homeai-disaster-backup-cron.sh"), scriptText);
  fs.writeFileSync(path.join(dataScripts, "homeai-disaster-backup-cron.sh"), scriptText);
  fs.chmodSync(path.join(dataScripts, "homeai-disaster-backup-cron.sh"), 0o750);

  const plistObject = {
    Label: "com.hermesmobile.cron",
    UserName: "hermes-host",
    ProgramArguments: [
      path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python"),
      path.join(app, "scripts", "hermes-mobile-cron-dispatcher.py"),
      "--dispatch",
    ],
    EnvironmentVariables: {
      HERMES_WEB_CRON_JOBS_PATH: path.join(root, "data", "hermes-home", "cron", "jobs.json"),
      HERMES_WEB_CRON_OUTPUT_ROOT: path.join(root, "data", "hermes-home", "cron", "output"),
      PYTHONPATH: [
        path.join(app, "gateway-runtime-overrides"),
        path.join(root, "runtime", "hermes-agent-official", "source"),
      ].join(":"),
      HERMES_CRON_SCRIPT_TIMEOUT: "1800",
      HOMEAI_DISASTER_BACKUP_TRANSPORT: "auto",
      HOMEAI_DISASTER_BACKUP_SSH_TARGET: "nas@example",
      HOMEAI_DISASTER_BACKUP_SSH_DESTINATION: "/volume1/backup",
    },
  };

  const ok = buildReport({ root, app, plistObject });
  assert.equal(ok.ok, true, JSON.stringify(ok.issues, null, 2));
  assert.equal(ok.hasDispatchFlag, true);
  assert.equal(ok.backupSshConfigured, true);

  fs.writeFileSync(path.join(dataScripts, "homeai-disaster-backup-cron.sh"), "#!/usr/bin/env bash\necho drift\n");
  const drift = buildReport({ root, app, plistObject });
  assert.equal(drift.ok, false);
  assert.ok(drift.issues.some((issue) => issue.code === "cron_launchd_data_script_drift"));

  const badPlist = {
    ...plistObject,
    ProgramArguments: plistObject.ProgramArguments.slice(0, 2),
    EnvironmentVariables: {
      ...plistObject.EnvironmentVariables,
      HERMES_CRON_SCRIPT_TIMEOUT: "120",
      HOMEAI_DISASTER_BACKUP_SSH_TARGET: "",
    },
  };
  const bad = buildReport({ root, app, plistObject: badPlist });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((issue) => issue.code === "cron_launchd_dispatcher_unexpected"));
  assert.ok(bad.issues.some((issue) => issue.code === "cron_launchd_script_timeout_too_low"));
  assert.ok(bad.issues.some((issue) => issue.code === "cron_launchd_backup_ssh_target_missing"));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("macos automation cron launchd smoke tests passed");
