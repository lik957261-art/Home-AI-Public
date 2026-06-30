"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  EXPECTED_PHASES,
} = require("./macos-install-phase-coverage-audit");
const {
  REHEARSAL_PHASES,
} = require("./macos-fresh-install-rehearsal");

const REPO_ROOT = path.resolve(__dirname, "..");

const VERIFICATION_CLASSES = [
  "source_check",
  "source_rehearsed",
  "external_input",
  "privileged_apply",
  "live_runtime",
];

const PHASE_VERIFICATION = {
  "system-preflight": {
    verificationClass: "source_check",
    evidence: ["scripts/public-install-preflight.js --source-only"],
    reason: "Read-only source and public-install metadata preflight.",
  },
  "install-dependencies": {
    verificationClass: "external_input",
    evidence: ["npm ci --omit=dev against the staged production app"],
    reason: "Requires an installed app tree, npm, and network/cache access for package resolution.",
  },
  "create-service-users": {
    verificationClass: "privileged_apply",
    evidence: ["dscl audit by default", "sudo HOMEAI_INSTALL_ALLOW_USER_CREATE=1 for creation"],
    reason: "Service user creation is a bounded macOS privileged operation.",
  },
  "create-directory-layout": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js"],
    reason: "Runs in a temporary root and verifies directory/artifact creation.",
  },
  "install-hermes-mobile": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js"],
    reason: "Copies the source checkout into an empty temporary app tree during fresh-install rehearsal; existing production updates use deploy-macos-production.js.",
  },
  "install-official-hermes-runtime": {
    verificationClass: "external_input",
    evidence: ["--node-command Node.js >=22 pinning into runtime/node-current"],
    reason: "Depends on the operator-provided official runtime executable.",
  },
  "configure-owner": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js"],
    reason: "Creates or normalizes the owner web key file in the temporary root without printing the key.",
  },
  "configure-workspace-isolation": {
    verificationClass: "privileged_apply",
    evidence: ["directory scaffold without ACL apply", "sudo HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 for ownership/ACL"],
    reason: "Workspace ownership and ACL correctness requires applying macOS user permissions.",
  },
  "configure-gateway-profiles": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js"],
    reason: "Writes the Gateway manifest, worker key files, and profile skeletons in a temporary root.",
  },
  "install-gateway-launchd-services": {
    verificationClass: "source_rehearsed",
    privilegedApplyGate: "HOMEAI_INSTALL_LAUNCHD_APPLY=1",
    evidence: ["scripts/macos-fresh-install-rehearsal.js", "fake launchd paths in tests"],
    reason: "Stages Gateway LaunchDaemon plans in a temporary root; system install/load remains gated.",
  },
  "repair-gateway-worker-acl": {
    verificationClass: "privileged_apply",
    evidence: ["ACL plan by default", "sudo HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 for repair"],
    reason: "Gateway worker ACL repair mutates macOS file ownership and access controls.",
  },
  "configure-cron": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js"],
    reason: "Creates the CRON store, helper scripts, and plans in a temporary root.",
  },
  "configure-plugins": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js"],
    reason: "Writes the public plugin source plan without cloning private state.",
  },
  "install-plugin-dependencies": {
    verificationClass: "external_input",
    evidence: ["npm install/npm ci against installed public plugin roots"],
    reason: "Requires plugin source roots, npm, and network/cache access for package resolution.",
  },
  "plan-plugin-workspace-provisioning": {
    verificationClass: "source_rehearsed",
    evidence: ["scripts/macos-fresh-install-rehearsal.js", "scripts/macos-first-start-preflight.js"],
    reason: "Writes the bounded plugin provisioning plan required by first-start preflight.",
  },
  "install-launchd-services": {
    verificationClass: "source_rehearsed",
    privilegedApplyGate: "HOMEAI_INSTALL_LAUNCHD_APPLY=1",
    evidence: ["scripts/macos-fresh-install-rehearsal.js", "tests/install-macos-production.test.js"],
    reason: "Stages core/plugin launchd plans in a temporary root; system install/load remains gated.",
  },
  "apply-plugin-workspace-provisioning": {
    verificationClass: "live_runtime",
    evidence: ["scripts/macos-plugin-workspace-provisioning-apply.js", "tests/macos-plugin-workspace-provisioning-apply.test.js"],
    reason: "Requires installed plugin services and writes workspace-local plugin bindings/grants plus Gateway MCP materialization before first-start preflight.",
  },
  "run-first-start-preflight": {
    verificationClass: "live_runtime",
    evidence: ["scripts/macos-first-start-preflight.js"],
    reason: "Validates staged runtime state and selected network mode before first service use.",
  },
  "run-smoke-tests": {
    verificationClass: "live_runtime",
    evidence: ["scripts/macos-production-closure-validation.js"],
    reason: "Requires the production listener and supporting runtime services to be available.",
  },
  "print-access-info": {
    verificationClass: "source_check",
    evidence: ["install-macos-production.sh phase output"],
    reason: "Prints bounded access metadata after install planning.",
  },
};

const REQUIRED_DOCS = [
  "docs/MODULES/deployment.md",
  "docs/PUBLIC_INSTALLATION_CHECKLIST.md",
  "docs/TEST_MATRIX.md",
  "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
];

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classCounts(phases) {
  const counts = Object.fromEntries(VERIFICATION_CLASSES.map((item) => [item, 0]));
  for (const phase of phases) {
    counts[phase.verificationClass] = (counts[phase.verificationClass] || 0) + 1;
  }
  return counts;
}

function checkPhaseCoverage(issues) {
  const classified = Object.keys(PHASE_VERIFICATION);
  const missing = EXPECTED_PHASES.filter((phase) => !classified.includes(phase));
  const extra = classified.filter((phase) => !EXPECTED_PHASES.includes(phase));
  if (missing.length > 0 || extra.length > 0) {
    addIssue(issues, "phase_classification_mismatch", { missing, extra });
  }
}

function checkPhaseShape(issues) {
  for (const phase of EXPECTED_PHASES) {
    const entry = PHASE_VERIFICATION[phase];
    if (!entry) continue;
    if (!VERIFICATION_CLASSES.includes(entry.verificationClass)) {
      addIssue(issues, "verification_class_invalid", { phase, verificationClass: entry.verificationClass });
    }
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      addIssue(issues, "verification_evidence_missing", { phase });
    }
    if (!String(entry.reason || "").trim()) {
      addIssue(issues, "verification_reason_missing", { phase });
    }
  }
}

function checkRehearsalAlignment(issues) {
  const rehearsalSet = new Set(REHEARSAL_PHASES);
  for (const phase of REHEARSAL_PHASES) {
    const entry = PHASE_VERIFICATION[phase];
    if (!entry) {
      addIssue(issues, "rehearsal_phase_not_classified", { phase });
    } else if (entry.verificationClass !== "source_rehearsed") {
      addIssue(issues, "rehearsal_phase_class_not_source_rehearsed", {
        phase,
        verificationClass: entry.verificationClass,
      });
    }
  }
  for (const phase of EXPECTED_PHASES) {
    const entry = PHASE_VERIFICATION[phase];
    if (entry?.verificationClass === "source_rehearsed" && !rehearsalSet.has(phase)) {
      addIssue(issues, "source_rehearsed_phase_not_in_rehearsal", { phase });
    }
  }
}

function checkDocs(issues) {
  for (const relativePath of REQUIRED_DOCS) {
    const text = read(relativePath);
    if (!/macos-install-verification-classification\.js/.test(text)) {
      addIssue(issues, "doc_missing_classification_script", { file: relativePath });
    }
    for (const verificationClass of VERIFICATION_CLASSES) {
      if (!new RegExp(`\\b${escapeRegExp(verificationClass)}\\b`).test(text)) {
        addIssue(issues, "doc_missing_verification_class", { file: relativePath, verificationClass });
      }
    }
  }
}

function buildReport() {
  const issues = [];
  checkPhaseCoverage(issues);
  checkPhaseShape(issues);
  checkRehearsalAlignment(issues);
  checkDocs(issues);
  const phases = EXPECTED_PHASES.map((id, index) => ({
    order: index + 1,
    id,
    ...PHASE_VERIFICATION[id],
    sourceRehearsed: REHEARSAL_PHASES.includes(id),
  }));
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    phaseCount: EXPECTED_PHASES.length,
    verificationClasses: VERIFICATION_CLASSES,
    classCounts: classCounts(phases),
    phases,
    checkedDocs: REQUIRED_DOCS,
    issues,
  };
}

function main() {
  const report = buildReport();
  if (process.argv.includes("--markdown")) {
    console.log("# macOS Install Verification Classification");
    console.log("");
    console.log(`- ok: ${report.ok}`);
    console.log(`- phaseCount: ${report.phaseCount}`);
    console.log("");
    console.log("## Class Counts");
    for (const verificationClass of VERIFICATION_CLASSES) {
      console.log(`- ${verificationClass}: ${report.classCounts[verificationClass] || 0}`);
    }
    console.log("");
    console.log("## Phases");
    for (const phase of report.phases) {
      console.log(`${phase.order}. ${phase.id}: ${phase.verificationClass}`);
    }
    if (report.issues.length > 0) {
      console.log("");
      console.log("## Issues");
      for (const issue of report.issues) {
        console.log(`- ${issue.code}: ${JSON.stringify(issue.detail)}`);
      }
    }
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  PHASE_VERIFICATION,
  VERIFICATION_CLASSES,
  buildReport,
};
