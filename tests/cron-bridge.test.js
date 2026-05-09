"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const python = process.platform === "win32" ? "python" : "python3";

function runBridge(env, request = { action: "list", include_disabled: true, limit: 0 }) {
  const result = spawnSync(python, [path.join(repoRoot, "cron_bridge.py")], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, env),
    input: JSON.stringify(request),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function touch(filePath, date) {
  fs.utimesSync(filePath, date, date);
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-cron-bridge-"));
  const hermesHome = path.join(tempRoot, "home");
  const outputRoot = path.join(tempRoot, "output");
  const jobRoot = path.join(outputRoot, "job_1");
  fs.mkdirSync(path.join(hermesHome, "cron"), { recursive: true });
  fs.mkdirSync(jobRoot, { recursive: true });

  fs.writeFileSync(path.join(hermesHome, "cron", "jobs.json"), JSON.stringify({
    jobs: [{
      id: "job_1",
      name: "Scan limit job",
      enabled: true,
      owner_principal_id: "owner",
      schedule: { kind: "cron", expr: "0 8 * * *", display: "0 8 * * *" },
      repeat: { times: null, completed: 0 },
    }],
  }));

  for (let index = 0; index < 6; index += 1) {
    const date = new Date(Date.UTC(2026, 0, 1, 0, index, 0));
    const pdfPath = path.join(jobRoot, `report-${index}.pdf`);
    fs.writeFileSync(pdfPath, `%PDF-1.7\nreport ${index}\n%%EOF\n`);
    touch(pdfPath, date);
  }

  const baseEnv = {
    HERMES_HOME: hermesHome,
    HERMES_WEB_HERMES_HOME: hermesHome,
    HERMES_WEB_CRON_OUTPUT_ROOT: outputRoot,
  };

  const limited = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "2",
  }));
  assert.equal(limited.ok, true);
  assert.deepEqual(
    limited.jobs[0].outputDocuments.map((item) => item.name),
    ["report-5.pdf", "report-4.pdf"],
  );

  const full = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "0",
  }));
  assert.equal(full.ok, true);
  assert.deepEqual(
    full.jobs[0].outputDocuments.map((item) => item.name),
    ["report-5.pdf", "report-4.pdf", "report-3.pdf", "report-2.pdf", "report-1.pdf", "report-0.pdf"],
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("cron-bridge tests passed");
}

main();
