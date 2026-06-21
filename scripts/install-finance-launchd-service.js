#!/usr/bin/env node
"use strict";

const path = require("node:path");
const {
  baseParseArgs,
  buildLaunchdPlist,
  createPlan,
  payloadFor,
  servicePaths,
} = require("./plugin-launchd-service-helper");

const DEFAULT_LABEL = "com.hermesmobile.plugin.finance";
const SPEC = Object.freeze({
  pluginId: "finance",
  sourceDir: "finance",
  label: DEFAULT_LABEL,
  defaultPort: "8791",
});

function parseArgs(argv) {
  return baseParseArgs(argv, {
    port: process.env.FINANCE_MCP_PORT || "8791",
    host: process.env.FINANCE_MCP_HOST || "127.0.0.1",
  });
}

function plan(options = {}) {
  return createPlan(options, SPEC);
}

function plistFor(options = {}) {
  const currentPlan = plan(options);
  const paths = servicePaths(options, SPEC);
  return buildLaunchdPlist({
    label: DEFAULT_LABEL,
    userName: currentPlan.serviceUser,
    workingDirectory: currentPlan.pluginRoot,
    programArguments: [paths.nodePath, "server.js"],
    environment: {
      PATH: `${path.posix.dirname(paths.nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      NODE_ENV: "production",
      FINANCE_MCP_HOST: currentPlan.host,
      FINANCE_MCP_PORT: currentPlan.port,
      FINANCE_MCP_DB_PATH: path.posix.join(currentPlan.pluginRoot, "data", "finance.sqlite3"),
      FINANCE_IMAGE_DB_PATH: path.posix.join(currentPlan.pluginRoot, "data", "finance-images.sqlite3"),
      FINANCE_HERMES_OWNER_WORKSPACE_ID: "owner",
      FINANCE_HERMES_ALLOWED_WORKSPACES: "owner",
    },
    stdoutLog: currentPlan.logPaths[0],
    stderrLog: currentPlan.logPaths[1],
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) throw new Error("finance_launchd_execute_not_implemented_use_central_privileged_installer");
  const currentPlan = plan(options);
  const plist = plistFor(options);
  console.log(JSON.stringify(payloadFor(options, SPEC, currentPlan, plist), null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_LABEL,
  parseArgs,
  plan,
  plistFor,
};
