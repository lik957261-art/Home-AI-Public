"use strict";

const {
  EXPECTED_PHASES,
} = require("./macos-install-phase-coverage-audit");
const {
  PHASE_VERIFICATION,
  VERIFICATION_CLASSES,
  buildReport: buildClassificationReport,
} = require("./macos-install-verification-classification");

const OPERATOR_CLOSURE_CLASSES = new Set(["external_input", "privileged_apply", "live_runtime"]);

const PHASE_CLOSURE = {
  "system-preflight": {
    closureType: "source-only",
    actionRequired: false,
    commands: ["node scripts/public-install-preflight.js --source-only --json"],
    evidenceRequired: ["preflight JSON ok=true"],
    operatorInput: [],
    riskBoundary: "Read-only source metadata check.",
  },
  "install-dependencies": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "bash scripts/install-macos-production.sh --execute --phase install-dependencies --root <mac-root> --npm-command <npm> --json",
    ],
    evidenceRequired: ["phase JSON ok=true", "production app node_modules installed under <mac-root>/app"],
    operatorInput: ["supported npm command", "network/cache access for package resolution"],
    riskBoundary: "Installs production app dependencies only after the app tree exists.",
  },
  "create-service-users": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "bash scripts/install-macos-production.sh --execute --phase create-service-users --root <mac-root> --json",
      "sudo HOMEAI_INSTALL_ALLOW_USER_CREATE=1 bash scripts/install-macos-production.sh --execute --phase create-service-users --root <mac-root> --json",
    ],
    evidenceRequired: ["all required macOS service users exist", "no conflicting user records were modified"],
    operatorInput: ["administrator approval before creating missing service users"],
    riskBoundary: "Audits by default; user creation requires explicit sudo gate.",
  },
  "install-hermes-mobile": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "bash scripts/install-macos-production.sh --execute --phase install-hermes-mobile --root <mac-root> --app-source <source-checkout> --json",
    ],
    evidenceRequired: ["phase JSON ok=true", "<mac-root>/app contains source-controlled Home AI files"],
    operatorInput: ["source checkout path", "empty target app directory"],
    riskBoundary: "Fresh install only; existing production updates must use deploy-macos-production.js.",
  },
  "install-official-hermes-runtime": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "bash scripts/install-macos-production.sh --execute --phase install-official-hermes-runtime --root <mac-root> --node-command <node22> --json",
    ],
    evidenceRequired: ["runtime/node-current resolves to supported Node.js 22+"],
    operatorInput: ["operator-provided Node.js 22+ command"],
    riskBoundary: "Pins runtime executable; does not install provider credentials.",
  },
  "configure-workspace-isolation": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "bash scripts/install-macos-production.sh --execute --phase configure-workspace-isolation --root <mac-root> --workspace-map <map> --json",
      "sudo HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 bash scripts/install-macos-production.sh --execute --phase configure-workspace-isolation --root <mac-root> --workspace-map <map> --json",
    ],
    evidenceRequired: ["workspace data roots exist", "ACL/ownership repair report has no issues"],
    operatorInput: ["workspaceId:macUser:driveName map", "administrator approval for ACL apply"],
    riskBoundary: "Scaffold is non-privileged; ownership/ACL mutation requires explicit sudo gate.",
  },
  "repair-gateway-worker-acl": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "bash scripts/install-macos-production.sh --execute --phase repair-gateway-worker-acl --root <mac-root> --json",
      "sudo HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 bash scripts/install-macos-production.sh --execute --phase repair-gateway-worker-acl --root <mac-root> --json",
    ],
    evidenceRequired: ["data/gateway-worker-acl-plan.json reviewed", "applied ACL report has no issues"],
    operatorInput: ["administrator approval for Gateway worker ACL apply"],
    riskBoundary: "Writes an ACL plan by default; filesystem mutation requires explicit sudo gate.",
  },
  "run-first-start-preflight": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "node scripts/macos-first-start-preflight.js --root <mac-root> --network-mode direct|proxy --base http://127.0.0.1:8797 --json",
    ],
    evidenceRequired: ["first-start preflight ok=true for the selected network mode"],
    operatorInput: ["selected network mode", "listener base URL"],
    riskBoundary: "Read-only runtime readiness check before first service use.",
  },
  "run-smoke-tests": {
    closureType: "operator",
    actionRequired: true,
    commands: [
      "node scripts/macos-production-closure-validation.js --root <mac-root> --base http://127.0.0.1:8797 --json",
    ],
    evidenceRequired: ["production closure validation ok=true", "listener and supporting runtime services reachable"],
    operatorInput: ["running production listener", "owner access key and configured provider/runtime prerequisites"],
    riskBoundary: "Validates live services; does not repair production state.",
  },
  "print-access-info": {
    closureType: "source-only",
    actionRequired: false,
    commands: ["bash scripts/install-macos-production.sh --execute --phase print-access-info --root <mac-root> --json"],
    evidenceRequired: ["bounded access metadata printed without secrets"],
    operatorInput: ["production root and listener base URL"],
    riskBoundary: "Prints bounded metadata only.",
  },
};

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function classCounts(items) {
  const counts = Object.fromEntries(VERIFICATION_CLASSES.map((name) => [name, 0]));
  for (const item of items) {
    counts[item.verificationClass] = (counts[item.verificationClass] || 0) + 1;
  }
  return counts;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => String(item || "").trim()) : [];
}

function checkClosureShape(issues) {
  for (const phase of EXPECTED_PHASES) {
    const verification = PHASE_VERIFICATION[phase];
    if (!verification) continue;
    const closure = PHASE_CLOSURE[phase];
    const needsOperatorClosure = OPERATOR_CLOSURE_CLASSES.has(verification.verificationClass);
    if (needsOperatorClosure && !closure) {
      addIssue(issues, "operator_phase_missing_closure", { phase, verificationClass: verification.verificationClass });
      continue;
    }
    if (!closure) continue;
    if (!["operator", "source-only"].includes(closure.closureType)) {
      addIssue(issues, "closure_type_invalid", { phase, closureType: closure.closureType });
    }
    if (needsOperatorClosure && closure.actionRequired !== true) {
      addIssue(issues, "operator_phase_not_action_required", { phase });
    }
    if (!needsOperatorClosure && verification.verificationClass !== "source_check") {
      addIssue(issues, "source_rehearsed_phase_should_not_have_operator_closure", {
        phase,
        verificationClass: verification.verificationClass,
      });
    }
    if (normalizeArray(closure.commands).length === 0) {
      addIssue(issues, "closure_commands_missing", { phase });
    }
    if (normalizeArray(closure.evidenceRequired).length === 0) {
      addIssue(issues, "closure_evidence_missing", { phase });
    }
    if (!String(closure.riskBoundary || "").trim()) {
      addIssue(issues, "closure_risk_boundary_missing", { phase });
    }
  }
}

function buildChecklist() {
  const issues = [];
  const classification = buildClassificationReport();
  if (!classification.ok) {
    for (const issue of classification.issues) {
      addIssue(issues, "classification_issue", issue);
    }
  }
  checkClosureShape(issues);

  const items = EXPECTED_PHASES.map((phase, index) => {
    const verification = PHASE_VERIFICATION[phase];
    const closure = PHASE_CLOSURE[phase] || null;
    return {
      order: index + 1,
      id: phase,
      verificationClass: verification?.verificationClass || null,
      sourceRehearsed: Boolean(classification.phases.find((item) => item.id === phase)?.sourceRehearsed),
      requiresOperatorClosure: OPERATOR_CLOSURE_CLASSES.has(verification?.verificationClass),
      closureType: closure?.closureType || "source-rehearsed",
      actionRequired: Boolean(closure?.actionRequired),
      commands: normalizeArray(closure?.commands),
      evidenceRequired: normalizeArray(closure?.evidenceRequired),
      operatorInput: normalizeArray(closure?.operatorInput),
      riskBoundary: closure?.riskBoundary || verification?.reason || "",
    };
  });

  const operatorItems = items.filter((item) => item.requiresOperatorClosure);
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    phaseCount: items.length,
    operatorClosureCount: operatorItems.length,
    classCounts: classCounts(items),
    operatorClosureClasses: Array.from(OPERATOR_CLOSURE_CLASSES),
    items,
    operatorItems,
    issues,
  };
}

function printMarkdown(report) {
  console.log("# macOS Install Operator Closure Checklist");
  console.log("");
  console.log(`- ok: ${report.ok}`);
  console.log(`- phaseCount: ${report.phaseCount}`);
  console.log(`- operatorClosureCount: ${report.operatorClosureCount}`);
  console.log("");
  console.log("## Operator Closure Items");
  for (const item of report.operatorItems) {
    console.log("");
    console.log(`${item.order}. ${item.id} (${item.verificationClass})`);
    console.log(`   - riskBoundary: ${item.riskBoundary}`);
    console.log(`   - commands: ${item.commands.join(" ; ")}`);
    console.log(`   - evidenceRequired: ${item.evidenceRequired.join(" ; ")}`);
    if (item.operatorInput.length > 0) {
      console.log(`   - operatorInput: ${item.operatorInput.join(" ; ")}`);
    }
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
  if (process.argv.includes("--markdown")) {
    printMarkdown(report);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  OPERATOR_CLOSURE_CLASSES,
  PHASE_CLOSURE,
  buildChecklist,
};
