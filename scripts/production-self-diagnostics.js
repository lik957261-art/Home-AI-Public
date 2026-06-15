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
