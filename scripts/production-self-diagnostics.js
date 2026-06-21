"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const BASELINE_DIAGNOSTICS = [
  {
    id: "status-smoke",
    title: "Authenticated production status smoke",
    script: "scripts/production-status-smoke.js",
    sourceHarness: "tests/production-status-smoke-harness.test.js",
    command: [
      "<node>",
      "<app>/scripts/production-status-smoke.js",
      "--access-key-file",
      "<owner-web-key-file>",
      "--base",
      "http://127.0.0.1:8797",
      "--expected-version",
      "<client-version>",
      "--json",
    ],
    requiredFor: ["deployment", "public update", "auth", "static client"],
  },
  {
    id: "profile-audit",
    title: "Mac profile, Skill, Memory, Soul, and provider auth audit",
    script: "scripts/macos-production-profile-audit.js",
    sourceHarness: "tests/macos-production-profile-audit.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-production-profile-audit.js",
      "--root",
      "<mac-root>",
      "--json",
    ],
    requiredFor: ["profile migration", "Gateway profile repair", "Skill or Memory access"],
  },
  {
    id: "grok-xai-oauth-metadata",
    title: "Grok/xAI OAuth bounded metadata smoke",
    script: "scripts/grok-auth-metadata-smoke.js",
    sourceHarness: "tests/grok-auth-metadata-smoke-harness.test.js",
    command: [
      "<node>",
      "<app>/scripts/grok-auth-metadata-smoke.js",
      "--profile-auth-file",
      "<grok-profile-auth-json>",
      "--shared-auth-file",
      "<shared-auth-json>",
      "--require-access-token",
      "--json",
    ],
    requiredFor: ["Grok/xAI provider auth", "Gateway provider repair", "manual OAuth closure"],
  },
  {
    id: "grok-xai-oauth-closure",
    title: "Grok/xAI OAuth operator closure checklist",
    script: "scripts/grok-xai-oauth-closure-checklist.js",
    sourceHarness: "tests/grok-xai-oauth-closure-checklist.test.js",
    command: [
      "<node>",
      "<app>/scripts/grok-xai-oauth-closure-checklist.js",
      "--markdown",
    ],
    requiredFor: ["Grok/xAI provider auth", "manual OAuth closure", "Gateway provider smoke"],
  },
  {
    id: "windows-dev-services-boundary",
    title: "Windows development task boundary checklist",
    script: "scripts/windows-dev-services-boundary-checklist.js",
    sourceHarness: "tests/windows-dev-services-boundary-checklist.test.js",
    command: [
      "<node>",
      "<app>/scripts/windows-dev-services-boundary-checklist.js",
      "--markdown",
    ],
    requiredFor: ["Mac production rollback boundary", "Windows development services", "public update readiness"],
  },
  {
    id: "workspace-file-broker-boundary",
    title: "Mac workspace file broker boundary checklist",
    script: "scripts/macos-workspace-file-broker-boundary-checklist.js",
    sourceHarness: "tests/macos-workspace-file-broker-boundary-checklist.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-workspace-file-broker-boundary-checklist.js",
      "--markdown",
    ],
    requiredFor: ["workspace isolation", "file access", "public update readiness"],
  },
  {
    id: "deployment-drift-gate",
    title: "Mac Home AI deployment drift gate plan",
    script: "scripts/deploy-macos-production.js",
    sourceHarness: "tests/macos-production-deploy-script.test.js",
    command: [
      "npm",
      "run",
      "--silent",
      "deploy:macos",
      "--",
      "--target",
      "home-ai",
      "--json",
    ],
    requiredFor: ["deployment", "public update", "configuration drift prevention"],
  },
  {
    id: "first-start-preflight",
    title: "Mac first-start install readiness preflight",
    script: "scripts/macos-first-start-preflight.js",
    sourceHarness: "tests/macos-first-start-preflight.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-first-start-preflight.js",
      "--root",
      "<mac-root>",
      "--network-mode",
      "direct|proxy",
      "--base",
      "http://127.0.0.1:8797",
      "--json",
    ],
    requiredFor: ["fresh install", "recovery install", "public update readiness"],
  },
  {
    id: "macos-install-phase-coverage",
    title: "Mac install phase coverage audit",
    script: "scripts/macos-install-phase-coverage-audit.js",
    sourceHarness: "tests/macos-install-phase-coverage-audit.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-install-phase-coverage-audit.js",
    ],
    requiredFor: ["fresh install", "public update readiness", "configuration drift prevention"],
  },
  {
    id: "macos-fresh-install-rehearsal",
    title: "Mac fresh install source rehearsal",
    script: "scripts/macos-fresh-install-rehearsal.js",
    sourceHarness: "tests/macos-fresh-install-rehearsal.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-fresh-install-rehearsal.js",
      "--json",
    ],
    requiredFor: ["fresh install", "public update readiness", "configuration drift prevention"],
  },
  {
    id: "macos-install-verification-classification",
    title: "Mac install verification classification audit",
    script: "scripts/macos-install-verification-classification.js",
    sourceHarness: "tests/macos-install-verification-classification.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-install-verification-classification.js",
    ],
    requiredFor: ["fresh install", "public update readiness", "configuration drift prevention"],
  },
  {
    id: "macos-install-operator-closure",
    title: "Mac install operator closure checklist",
    script: "scripts/macos-install-operator-closure-checklist.js",
    sourceHarness: "tests/macos-install-operator-closure-checklist.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-install-operator-closure-checklist.js",
      "--markdown",
    ],
    requiredFor: ["fresh install", "operator handoff", "public update readiness"],
  },
  {
    id: "production-self-diagnostics-coverage",
    title: "Production self-diagnostics coverage audit",
    script: "scripts/production-self-diagnostics-coverage-audit.js",
    sourceHarness: "tests/production-self-diagnostics-coverage-audit.test.js",
    command: [
      "<node>",
      "<app>/scripts/production-self-diagnostics-coverage-audit.js",
    ],
    requiredFor: ["production diagnostics", "configuration drift prevention", "public update readiness"],
  },
  {
    id: "production-drift-reconcile",
    title: "Mac bounded production drift reconcile",
    script: "scripts/macos-production-drift-reconcile.js",
    sourceHarness: "tests/macos-production-drift-reconcile.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-production-drift-reconcile.js",
      "--root",
      "<mac-root>",
      "--json",
    ],
    requiredFor: ["Gateway profile repair", "LaunchDaemon drift", "configuration drift prevention"],
  },
  {
    id: "production-drift-watchdog",
    title: "Mac periodic production drift audit watchdog",
    script: "scripts/homeai-production-drift-audit-watchdog.sh",
    sourceHarness: "tests/macos-production-deploy-script.test.js",
    command: [
      "sudo",
      "env",
      "HERMES_MOBILE_ROOT=<mac-root>",
      "HERMES_MOBILE_APP_DIR=<app>",
      "HERMES_MOBILE_NODE_EXE=<node>",
      "HOMEAI_PRODUCTION_DRIFT_AUDIT_OUTPUT_DIR=<mac-root>/data/production-drift-audit",
      "<app>/scripts/homeai-production-drift-audit-watchdog.sh",
    ],
    requiredFor: ["production monitoring", "configuration drift prevention", "Gateway profile repair"],
  },
  {
    id: "web-push-production-audit",
    title: "Mac Web Push production state audit",
    script: "scripts/macos-web-push-production-audit.js",
    sourceHarness: "tests/macos-web-push-production-audit.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-web-push-production-audit.js",
      "--root",
      "<mac-root>",
      "--public-origin",
      "<external-origin>",
      "--require-public-origin",
      "--require-active-external-subscription",
      "--json",
    ],
    requiredFor: ["Web Push", "public update readiness", "device re-registration"],
  },
  {
    id: "worker-filesystem-access",
    title: "Mac worker filesystem access and cross-user deny audit",
    script: "scripts/macos-worker-filesystem-access-harness.js",
    sourceHarness: "tests/macos-worker-filesystem-access-harness.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-worker-filesystem-access-harness.js",
      "--root",
      "<mac-root>",
      "--json",
    ],
    requiredFor: ["workspace isolation", "ACL repair", "file access"],
  },
  {
    id: "gateway-manifest-toolset",
    title: "Mac Gateway manifest toolset projection smoke",
    script: "scripts/macos-gateway-manifest-toolset-smoke.js",
    sourceHarness: "tests/macos-gateway-manifest-toolset-smoke.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-gateway-manifest-toolset-smoke.js",
      "--root",
      "<mac-root>",
      "--json",
    ],
    requiredFor: ["Gateway toolsets", "plugin MCP exposure", "profile materialization"],
  },
  {
    id: "plugin-directory",
    title: "Mac plugin delivery-directory production smoke",
    script: "scripts/macos-plugin-directory-production-smoke.js",
    sourceHarness: "tests/macos-plugin-directory-production-smoke-harness.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-plugin-directory-production-smoke.js",
      "--root",
      "<mac-root>",
      "--base",
      "http://127.0.0.1:8797",
      "--json",
    ],
    requiredFor: ["plugin topics", "delivery directories", "workspace catalog migration"],
  },
  {
    id: "bound-directory-preview",
    title: "Mac bound-directory preview smoke",
    script: "scripts/macos-bound-directory-preview-smoke.js",
    sourceHarness: "tests/macos-bound-directory-preview-smoke-harness.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-bound-directory-preview-smoke.js",
      "--root",
      "<mac-root>",
      "--all-workspaces",
      "--simulate-ui-route",
      "--json",
    ],
    requiredFor: ["directory topics", "artifact preview", "migration repair"],
  },
  {
    id: "automation-cron",
    title: "Mac Automation cron audit",
    script: "scripts/macos-automation-cron-audit.js",
    sourceHarness: "tests/macos-automation-cron-audit.test.js",
    command: [
      "<node>",
      "<app>/scripts/macos-automation-cron-audit.js",
      "--root",
      "<mac-root>",
      "--strict-config",
      "--json",
    ],
    requiredFor: ["Automation", "scheduled jobs", "backup jobs"],
  },
  {
    id: "plugin-workspace-audit",
    title: "Mac plugin workspace audit runner and task-card handoff",
    script: "scripts/plugin-workspace-audit-runner.js",
    sourceHarness: "tests/plugin-workspace-audit-runner.test.js",
    command: [
      "<node>",
      "<app>/scripts/plugin-workspace-audit-runner.js",
      "--job-file",
      "<plugin-workspace-audit-job.json>",
      "--output-root",
      "<mac-root>/data/hermes-home/cron/output",
      "--json",
    ],
    requiredFor: ["plugin workspace audit", "cross-thread task cards", "scheduled UI review"],
  },
  {
    id: "plugin-provisioning-coverage",
    title: "Host plugin provisioning coverage audit",
    script: "scripts/plugin-provisioning-coverage-audit.js",
    sourceHarness: "tests/plugin-provisioning-coverage-audit.test.js",
    command: [
      "<node>",
      "<app>/scripts/plugin-provisioning-coverage-audit.js",
    ],
    requiredFor: ["plugin provisioning", "public install", "workspace onboarding"],
  },
  {
    id: "production-closure",
    title: "Mac aggregate production closure validation",
    script: "scripts/macos-production-closure-validation.js",
    sourceHarness: "tests/macos-production-closure-validation-harness.test.js",
    command: [
      "sudo",
      "<node>",
      "<app>/scripts/macos-production-closure-validation.js",
      "--json",
    ],
    requiredFor: ["release closure", "broad production repair", "migration"],
  },
];

const FORBIDDEN_OUTPUT = [
  "raw Access Keys",
  "provider keys",
  "OAuth tokens",
  "push endpoints",
  "full prompts",
  "full model responses",
  "private file contents",
  "long logs",
];

function fileExists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function buildReport() {
  const diagnostics = BASELINE_DIAGNOSTICS.map((entry) => ({
    ...entry,
    scriptExists: fileExists(entry.script),
    sourceHarnessExists: fileExists(entry.sourceHarness),
    outputPolicy: "bounded metadata only",
    forbiddenOutput: FORBIDDEN_OUTPUT,
  }));
  const issues = [];
  for (const entry of diagnostics) {
    if (!entry.scriptExists) {
      issues.push({ code: "diagnostic_script_missing", id: entry.id, path: entry.script });
    }
    if (!entry.sourceHarnessExists) {
      issues.push({ code: "diagnostic_source_harness_missing", id: entry.id, path: entry.sourceHarness });
    }
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    diagnosticCount: diagnostics.length,
    diagnostics,
    issues,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Production Self-Diagnostics",
    "",
    "These commands are the maintained baseline for Home AI production closure.",
    "Replace `<node>`, `<app>`, `<mac-root>`, and key-file placeholders with deployment-local values.",
    "",
  ];
  for (const entry of report.diagnostics) {
    lines.push(`## ${entry.title}`);
    lines.push("");
    lines.push(`- id: \`${entry.id}\``);
    lines.push(`- script: \`${entry.script}\``);
    lines.push(`- source harness: \`${entry.sourceHarness}\``);
    lines.push(`- required for: ${entry.requiredFor.join(", ")}`);
    lines.push("");
    lines.push("```bash");
    lines.push(entry.command.join(" "));
    lines.push("```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const report = buildReport();
  if (process.argv.includes("--markdown")) {
    process.stdout.write(renderMarkdown(report));
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  BASELINE_DIAGNOSTICS,
  FORBIDDEN_OUTPUT,
  buildReport,
  renderMarkdown,
};
