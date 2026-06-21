"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const CHECKLIST_ITEMS = [
  {
    id: "stage1-production-minimum",
    title: "Stage 1 OS-level workspace isolation remains the production minimum",
    command: "sudo node scripts/macos-worker-filesystem-access-harness.js --root <mac-root> --json",
    evidenceRequired: [
      "Workspace worker users can access their own required roots.",
      "Cross-workspace deny checks pass for private Owner, Skill, Memory, and plugin roots.",
    ],
    riskBoundary: "Stage 1 protects worker and MCP tool execution, but it is not a listener-side file broker.",
  },
  {
    id: "host-file-routes-remain-policy-gated",
    title: "Host file routes remain product-policy gated before Stage 2",
    command: "node tests/directory-browser-boundary-service.test.js && node tests/file-artifact-access-service.test.js",
    evidenceRequired: [
      "Directory listing, preview, upload, rename, delete, and artifact access resolve through Home AI ACL services.",
      "Host direct filesystem reads of workspace-private files are not accepted as a Stage 2 closure claim.",
    ],
    riskBoundary: "Product ACL checks reduce exposure but do not remove listener process filesystem capability.",
  },
  {
    id: "stage2-broker-requirements-preserved",
    title: "Stage 2 workspace file broker requirements stay explicit",
    command: "node scripts/productization-acceptance-matrix.js --verify-docs",
    evidenceRequired: [
      "The deployment plan still states that the listener must stop direct filesystem reads of workspace-private files.",
      "The plan still requires a per-workspace local file broker running as the workspace OS user.",
    ],
    riskBoundary: "Do not downgrade Stage 2 into an ACL-only or route-only implementation.",
  },
  {
    id: "fresh-install-closure-boundary",
    title: "Fresh install closure does not claim Stage 2 until a broker exists",
    command: "node scripts/macos-install-operator-closure-checklist.js --markdown",
    evidenceRequired: [
      "Operator closure distinguishes source checks, privileged ACL apply steps, and live runtime checks.",
      "Stage 2 broker absence is visible as a future boundary, not hidden behind green install rehearsals.",
    ],
    riskBoundary: "A green install rehearsal or ACL harness is not proof that listener-side direct file access was removed.",
  },
];

const REQUIRED_REFERENCES = [
  {
    file: "docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md",
    patterns: [
      "### Stage 1: Strong Worker/MCP Isolation",
      "### Stage 2: Workspace File Broker",
      "Listener stops direct filesystem reads of workspace-private files",
      "Each workspace gets a small local file broker",
      "minimum acceptable Mac",
    ],
  },
  {
    file: "docs/MODULES/deployment.md",
    patterns: [
      "Stage 1 OS-level workspace isolation is implemented",
      "Stage 2 workspace file broker",
      "macos-workspace-file-broker-boundary-checklist.js",
    ],
  },
  {
    file: "scripts/macos-worker-filesystem-access-harness.js",
    patterns: [
      "defaultDenyChecks",
      "expectedDenied",
      "scanDriveDirectoriesMissingOwnerWrite",
      "sudo",
    ],
  },
  {
    file: "docs/MODULES/directory-files.md",
    patterns: [
      "The same ACL boundary must protect listing, preview, upload, rename, delete",
      "Preview access must be resolved through thread/message/group/automation ACLs",
    ],
  },
  {
    file: "docs/MODULES/workspace-auth-permissions.md",
    patterns: [
      "It is the product permission boundary",
      "Server-side code constructs the access policy",
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
  console.log("# macOS Workspace File Broker Boundary Checklist");
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
