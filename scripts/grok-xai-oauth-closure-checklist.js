"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULTS = Object.freeze({
  root: "<mac-root>",
  app: "<app>",
  profile: "grokgw1",
  provider: "xai-oauth",
  model: "grok-4.3",
  base: "http://127.0.0.1:8797",
  profileAuthFile: "<grok-profile-auth-json>",
  sharedAuthFile: "<shared-auth-json>",
  keyFile: "<owner-web-key-file>",
});

const CLOSURE_ITEMS = [
  {
    id: "manual-reauth-entrypoint",
    title: "Run the bounded Mac xAI OAuth re-auth helper",
    kind: "operator_action",
    command: "bash <app>/scripts/macos-grok-xai-reauth.sh",
    evidenceRequired: [
      "The helper runs under the effective Grok profile environment.",
      "The callback URL or authorization code is pasted only into the Mac terminal.",
      "The helper completes its post-auth metadata smoke.",
    ],
    riskBoundary: "Runs Hermes manual-paste OAuth only; it must not print OAuth codes, tokens, or auth file contents.",
  },
  {
    id: "bounded-auth-metadata",
    title: "Prove xAI OAuth token metadata without printing secrets",
    kind: "source_or_live_check",
    command: "node <app>/scripts/grok-auth-metadata-smoke.js --profile-auth-file <grok-profile-auth-json> --shared-auth-file <shared-auth-json> --require-access-token --json",
    evidenceRequired: [
      "JSON ok=true.",
      "xai.providerPresent=true.",
      "xai.hasAccessToken=true.",
      "Output contains no raw access_token, refresh_token, auth path, or callback URL.",
    ],
    riskBoundary: "Reads auth stores and prints bounded booleans only.",
  },
  {
    id: "profile-provider-config",
    title: "Prove the live Grok profile still routes to xAI",
    kind: "configuration_check",
    command: "node <app>/scripts/macos-production-profile-audit.js --root <mac-root> --json",
    evidenceRequired: [
      "No profile_config_provider_mismatch issue for grokgw1.",
      "No profile_config_model_mismatch issue for grokgw1.",
      "The effective provider is xai-oauth and the model is grok-4.3.",
    ],
    riskBoundary: "Read-only production profile audit; do not edit config.yaml in the audit process.",
  },
  {
    id: "live-provider-smoke",
    title: "Prove Home AI can complete a Grok run through grokgw1",
    kind: "live_runtime_check",
    command: "node <app>/scripts/gateway-pool-production-smoke.js --key-file <owner-web-key-file> --model grok-4.3 --provider xai-oauth --expected-profile grokgw1 --json",
    evidenceRequired: [
      "JSON ok=true.",
      "request.provider=xai-oauth.",
      "run.gatewayProfile or run.gatewayName is grokgw1.",
      "The smoke returns the expected marker through the normal Home AI message path.",
    ],
    riskBoundary: "Creates and deletes a temporary smoke task; use a bounded Owner key file and do not print the key.",
  },
  {
    id: "cron-x-search-path",
    title: "If Automation x_search is in scope, prove it uses the bridge-host Grok proxy",
    kind: "conditional_check",
    command: "node tests/bridge-host-grok-proxy.test.js",
    evidenceRequired: [
      "Bridge-host proxy path /bridge/grok-gateway-proxy/v1/responses remains covered.",
      "The proxy selects the manifest Grok profile instead of an ordinary OpenAI/Codex worker.",
    ],
    riskBoundary: "Source harness only unless a production Automation x_search smoke is explicitly requested.",
  },
];

const REQUIRED_REFERENCES = [
  {
    file: "scripts/grok-auth-metadata-smoke.js",
    patterns: ["--require-access-token", "grok_xai_oauth_access_token_missing"],
  },
  {
    file: "scripts/macos-grok-xai-reauth.sh",
    patterns: ["auth add xai-oauth", "--manual-paste", "grok-auth-metadata-smoke.js"],
  },
  {
    file: "scripts/gateway-pool-production-smoke.js",
    patterns: ["--expected-profile", "--provider <id>"],
  },
  {
    file: "docs/RUNBOOKS/grok-gateway-auth.md",
    patterns: ["grok-auth-metadata-smoke.js", "gateway-pool-production-smoke.js", "grokgw1"],
  },
  {
    file: "docs/MODULES/grok-gateway.md",
    patterns: ["grok-auth-metadata-smoke.js", "macos-grok-xai-reauth.sh", "grokgw1"],
  },
  {
    file: "docs/TEST_MATRIX.md",
    patterns: ["grok-auth-metadata-smoke.js", "gateway-pool-production-smoke.js", "expected-profile grokgw1"],
  },
];

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function renderCommand(template, options) {
  const values = {
    "<mac-root>": options.root || DEFAULTS.root,
    "<app>": options.app || DEFAULTS.app,
    "<grok-profile-auth-json>": options.profileAuthFile || DEFAULTS.profileAuthFile,
    "<shared-auth-json>": options.sharedAuthFile || DEFAULTS.sharedAuthFile,
    "<owner-web-key-file>": options.keyFile || DEFAULTS.keyFile,
  };
  let out = template;
  for (const [needle, replacement] of Object.entries(values)) {
    out = out.split(needle).join(replacement);
  }
  return out;
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

function checkItemShape(issues) {
  const ids = new Set();
  for (const item of CLOSURE_ITEMS) {
    if (!String(item.id || "").trim()) addIssue(issues, "closure_item_id_missing", { item });
    if (ids.has(item.id)) addIssue(issues, "closure_item_id_duplicate", { id: item.id });
    ids.add(item.id);
    if (!String(item.title || "").trim()) addIssue(issues, "closure_item_title_missing", { id: item.id });
    if (!String(item.command || "").trim()) addIssue(issues, "closure_item_command_missing", { id: item.id });
    if (!Array.isArray(item.evidenceRequired) || item.evidenceRequired.length === 0) {
      addIssue(issues, "closure_item_evidence_missing", { id: item.id });
    }
    if (!String(item.riskBoundary || "").trim()) addIssue(issues, "closure_item_risk_boundary_missing", { id: item.id });
  }
}

function buildChecklist(options = {}) {
  const issues = [];
  checkItemShape(issues);
  checkReferences(issues);
  const items = CLOSURE_ITEMS.map((item, index) => ({
    order: index + 1,
    id: item.id,
    title: item.title,
    kind: item.kind,
    command: renderCommand(item.command, options),
    evidenceRequired: item.evidenceRequired,
    riskBoundary: item.riskBoundary,
  }));
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    profile: options.profile || DEFAULTS.profile,
    provider: options.provider || DEFAULTS.provider,
    model: options.model || DEFAULTS.model,
    itemCount: items.length,
    items,
    checkedReferences: REQUIRED_REFERENCES.map((entry) => entry.file),
    issues,
  };
}

function printMarkdown(report) {
  console.log("# Grok/xAI OAuth Closure Checklist");
  console.log("");
  console.log(`- ok: ${report.ok}`);
  console.log(`- profile: ${report.profile}`);
  console.log(`- provider: ${report.provider}`);
  console.log(`- model: ${report.model}`);
  console.log("");
  console.log("## Closure Items");
  for (const item of report.items) {
    console.log("");
    console.log(`${item.order}. ${item.title}`);
    console.log(`   - id: ${item.id}`);
    console.log(`   - kind: ${item.kind}`);
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

function parseArgs(argv) {
  const options = {
    root: "",
    app: "",
    profileAuthFile: "",
    sharedAuthFile: "",
    keyFile: "",
    markdown: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = argv[++index] || "";
    else if (arg === "--app") options.app = argv[++index] || "";
    else if (arg === "--profile-auth-file") options.profileAuthFile = argv[++index] || "";
    else if (arg === "--shared-auth-file") options.sharedAuthFile = argv[++index] || "";
    else if (arg === "--key-file") options.keyFile = argv[++index] || "";
    else if (arg === "--markdown") options.markdown = true;
    else if (arg === "--json") options.markdown = false;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/grok-xai-oauth-closure-checklist.js [options]",
        "  --root <path>                Production root placeholder replacement",
        "  --app <path>                 Production app placeholder replacement",
        "  --profile-auth-file <file>   Grok profile auth placeholder replacement; path is not inspected",
        "  --shared-auth-file <file>    Shared auth placeholder replacement; path is not inspected",
        "  --key-file <file>            Owner key placeholder replacement; path is not inspected",
        "  --json                       Print bounded JSON checklist",
        "  --markdown                   Print operator-readable checklist",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildChecklist(options);
  if (options.markdown) printMarkdown(report);
  else console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  CLOSURE_ITEMS,
  REQUIRED_REFERENCES,
  buildChecklist,
  parseArgs,
};
