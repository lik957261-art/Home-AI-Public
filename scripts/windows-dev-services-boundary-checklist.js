"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const CHECKLIST_ITEMS = [
  {
    id: "mac-production-authority",
    title: "Mac production remains the authoritative Home AI runtime",
    command: "node scripts/production-self-diagnostics.js --markdown",
    evidenceRequired: [
      "Mac production diagnostics are selected for production closure.",
      "Windows scheduled task state is not cited as a Mac production rollback or closure proof.",
    ],
    riskBoundary: "Windows task state may explain local development behavior only.",
  },
  {
    id: "windows-native-dev-services",
    title: "Windows tasks are local development services",
    command: "node tests/startup-scripts.test.js",
    evidenceRequired: [
      "Windows native startup scripts remain test-covered.",
      "WSL-specific arguments are not reintroduced into the Windows listener logon task contract.",
    ],
    riskBoundary: "This is source evidence for development launchers, not live Mac production evidence.",
  },
  {
    id: "hidden-powershell-windows",
    title: "Windows launcher child processes remain hidden",
    command: "node tests/no-window-command-harness.test.js",
    evidenceRequired: [
      "PowerShell Start-Process calls use -WindowStyle Hidden.",
      "Gateway stop/start child PowerShell invocations use -WindowStyle Hidden.",
    ],
    riskBoundary: "Codex Desktop itself may still have an intentional visible app window.",
  },
  {
    id: "rollback-evidence-boundary",
    title: "Production rollback evidence comes from Mac backups and diagnostics",
    command: "node scripts/productization-acceptance-matrix.js --verify-docs",
    evidenceRequired: [
      "Backup/rollback dimension remains part of the productization matrix.",
      "Mac deployment contract remains the source for production rollback evidence.",
    ],
    riskBoundary: "Do not infer production authority from restored Windows scheduled tasks.",
  },
];

const REQUIRED_REFERENCES = [
  {
    file: "docs/MODULES/deployment.md",
    patterns: [
      "Windows scheduled tasks were disabled during cutover",
      "development services",
      "not production rollback evidence",
      "-WindowStyle Hidden",
    ],
  },
  {
    file: "docs/TEST_MATRIX.md",
    patterns: [
      "Hermes Web Listener User Logon",
      "scheduled task",
      "no WSL",
      "windows-dev-services-boundary-checklist.js",
    ],
  },
  {
    file: "tests/startup-scripts.test.js",
    patterns: [
      "WindowStyle Hidden",
      "startGatewayPool",
    ],
  },
  {
    file: "tests/no-window-command-harness.test.js",
    patterns: [
      "Start-Process must use -WindowStyle Hidden",
      "PowerShell",
    ],
  },
  {
    file: "docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md",
    patterns: [
      "rollback",
      "Mac",
      "production",
    ],
  },
];

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function checkReferences(issues) {
  for (const entry of REQUIRED_REFERENCES) {
    let text = "";
    try {
      text = read(entry.file);
    } catch {
      addIssue(issues, "reference_file_missing", { file: entry.file });
      continue;
    }
    for (const pattern of entry.patterns) {
      if (!text.includes(pattern)) {
        addIssue(issues, "reference_pattern_missing", { file: entry.file, pattern });
      }
    }
  }
}

function checkItems(issues) {
  const ids = new Set();
  for (const item of CHECKLIST_ITEMS) {
    if (!String(item.id || "").trim()) addIssue(issues, "item_id_missing", { item });
    if (ids.has(item.id)) addIssue(issues, "item_id_duplicate", { id: item.id });
    ids.add(item.id);
    if (!String(item.title || "").trim()) addIssue(issues, "item_title_missing", { id: item.id });
    if (!String(item.command || "").trim()) addIssue(issues, "item_command_missing", { id: item.id });
    if (!Array.isArray(item.evidenceRequired) || item.evidenceRequired.length === 0) {
      addIssue(issues, "item_evidence_missing", { id: item.id });
    }
    if (!String(item.riskBoundary || "").trim()) addIssue(issues, "item_risk_boundary_missing", { id: item.id });
  }
}

function buildChecklist() {
  const issues = [];
  checkItems(issues);
  checkReferences(issues);
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    itemCount: CHECKLIST_ITEMS.length,
    items: CHECKLIST_ITEMS.map((item, index) => ({
      order: index + 1,
      id: item.id,
      title: item.title,
      command: item.command,
      evidenceRequired: item.evidenceRequired,
      riskBoundary: item.riskBoundary,
    })),
    checkedReferences: REQUIRED_REFERENCES.map((entry) => entry.file),
    issues,
  };
}

function printMarkdown(report) {
  console.log("# Windows Development Services Boundary Checklist");
  console.log("");
  console.log(`- ok: ${report.ok}`);
  console.log(`- itemCount: ${report.itemCount}`);
  console.log("");
  console.log("## Boundary Items");
  for (const item of report.items) {
    console.log("");
    console.log(`${item.order}. ${item.title}`);
    console.log(`   - id: ${item.id}`);
    console.log(`   - command: ${item.command}`);
    console.log(`   - evidenceRequired: ${item.evidenceRequired.join(" ; ")}`);
    console.log(`   - riskBoundary: ${item.riskBoundary}`);
  }
  if (report.issues.length > 0) {
    console.log("");
    console.log("## Issues");
    for (const issue of report.issues) {
      console.log(`- ${issue.code}: ${JSON.stringify(issue.detail)}`);
    }
  }
}

function main() {
  const report = buildChecklist();
  if (process.argv.includes("--markdown")) printMarkdown(report);
  else console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  CHECKLIST_ITEMS,
  REQUIRED_REFERENCES,
  buildChecklist,
};
