"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const INSTALLER = path.join(REPO_ROOT, "scripts", "install-macos-production.sh");
const PRODUCTION_APP_ROOT = "/Users/example/path";
const PRODUCTION_SERVICE_USER = "hermes-host";

const REHEARSAL_PHASES = [
  "create-directory-layout",
  "install-hermes-mobile",
  "configure-owner",
  "configure-gateway-profiles",
  "install-gateway-launchd-services",
  "configure-cron",
  "configure-plugins",
  "plan-plugin-workspace-provisioning",
  "install-launchd-services",
];

const REQUIRED_ARTIFACTS = [
  "app/gateway-plugins/hermes-mobile-docx/plugin.yaml",
  "data/secrets/owner-web-key.secret",
  "data/gateway-pool-manifest-mac.json",
  "data/gateway-launchd-services-plan.json",
  "data/cron-config-plan.json",
  "data/plugin-source-plan.json",
  "data/plugin-workspace-provisioning-plan.json",
  "data/launchd-services-plan.json",
];

function parseArgs(argv) {
  const options = {
    keepTemp: false,
    root: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep-temp") {
      options.keepTemp = true;
    } else if (arg === "--root") {
      options.root = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--json") {
      // JSON is the default output; accept this for command symmetry.
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  return options;
}

function makeRoot(options) {
  if (options.root) {
    fs.mkdirSync(options.root, { recursive: true, mode: 0o755 });
    return { root: path.resolve(options.root), temporary: false };
  }
  return {
    root: fs.mkdtempSync(path.join(os.tmpdir(), "homeai-fresh-install-rehearsal-")),
    temporary: true,
  };
}

function runPhase(root, phase) {
  const env = {
    ...process.env,
    HOMEAI_LAUNCH_DAEMONS_DIR: path.join(root, "launchd-system"),
    HOMEAI_LISTENER_USER: process.env.HOMEAI_LISTENER_USER || os.userInfo().username,
  };
  const stdout = execFileSync("bash", [
    INSTALLER,
    "--execute",
    "--phase",
    phase,
    "--root",
    root,
    "--json",
  ], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(stdout);
  return {
    phase,
    ok: Boolean(parsed.ok),
    issueCodes: (parsed.execution?.issueCodes || parsed.issues || [])
      .map((issue) => (typeof issue === "string" ? issue : issue?.code))
      .filter(Boolean),
  };
}

function artifactStatus(root) {
  return REQUIRED_ARTIFACTS.map((relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(root, relativePath)),
  }));
}

function currentUsername() {
  try {
    return os.userInfo().username || "";
  } catch (_err) {
    return "";
  }
}

function productionServiceUserIssue(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const productionRoot = path.resolve(options.productionAppRoot || PRODUCTION_APP_ROOT);
  const username = options.username || currentUsername();
  const allow = options.allowNonServiceUserProductionRehearsal === true
    || process.env.HOMEAI_ALLOW_NON_SERVICE_USER_PRODUCTION_REHEARSAL === "1";
  if (repoRoot !== productionRoot || allow || username === PRODUCTION_SERVICE_USER) return null;
  return {
    code: "production_rehearsal_requires_service_user",
    currentUser: username,
    requiredUser: PRODUCTION_SERVICE_USER,
    productionAppRoot: productionRoot,
  };
}

function buildReport(options = {}) {
  const issues = [];
  const serviceUserIssue = productionServiceUserIssue(options);
  if (serviceUserIssue) {
    return {
      ok: false,
      schemaVersion: 1,
      root: "",
      temporaryRoot: false,
      phaseCount: REHEARSAL_PHASES.length,
      phases: [],
      artifacts: [],
      issues: [serviceUserIssue],
    };
  }
  const rootInfo = makeRoot(options);
  const phaseResults = [];
  let report = null;
  try {
    for (const phase of REHEARSAL_PHASES) {
      const result = runPhase(rootInfo.root, phase);
      phaseResults.push(result);
      if (!result.ok) {
        issues.push({ code: "phase_failed", phase, issueCodes: result.issueCodes });
        break;
      }
    }
    const artifacts = artifactStatus(rootInfo.root);
    for (const artifact of artifacts) {
      if (!artifact.exists) {
        issues.push({ code: "artifact_missing", path: artifact.path });
      }
    }
    report = {
      ok: issues.length === 0,
      schemaVersion: 1,
      root: rootInfo.root,
      temporaryRoot: rootInfo.temporary,
      tempRemoved: false,
      phaseCount: REHEARSAL_PHASES.length,
      phases: phaseResults,
      artifacts,
      issues,
    };
  } finally {
    if (rootInfo.temporary && !options.keepTemp) {
      fs.rmSync(rootInfo.root, { recursive: true, force: true });
    }
    if (report) {
      report.tempRemoved = rootInfo.temporary && !options.keepTemp
        ? !fs.existsSync(rootInfo.root)
        : false;
      if (rootInfo.temporary && !options.keepTemp && !report.tempRemoved) {
        issues.push({ code: "temporary_root_cleanup_failed" });
        report.ok = false;
        report.issues = issues;
      }
    }
  }
  return report;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      schemaVersion: 1,
      issues: [{ code: String(error?.message || error).slice(0, 240) }],
    }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = {
  REHEARSAL_PHASES,
  REQUIRED_ARTIFACTS,
  buildReport,
  productionServiceUserIssue,
};
