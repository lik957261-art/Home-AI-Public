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

const DEFAULT_LABEL = "com.hermesmobile.plugin.wardrobe";
const SPEC = Object.freeze({
  pluginId: "wardrobe",
  sourceDir: "wardrobe",
  label: DEFAULT_LABEL,
  defaultPort: "8765",
});

function parseArgs(argv) {
  return baseParseArgs(argv, {
    port: process.env.WARDROBE_PORT || "8765",
    host: process.env.WARDROBE_HOST || "127.0.0.1",
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
    programArguments: [paths.pythonPath, "app.py"],
    environment: {
      PATH: `${path.posix.dirname(paths.pythonPath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      PYTHONUNBUFFERED: "1",
      WARDROBE_HOST: currentPlan.host,
      WARDROBE_PORT: currentPlan.port,
      WARDROBE_API_TOKEN_SECRET_DIR: path.posix.join(currentPlan.pluginRoot, "data", "api-token-secrets"),
      WARDROBE_ALLOWED_ORIGINS: "http://127.0.0.1:8797",
      WARDROBE_HERMES_PLUGIN_FRAME_ANCESTORS: "http://127.0.0.1:8797",
    },
    stdoutLog: currentPlan.logPaths[0],
    stderrLog: currentPlan.logPaths[1],
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) throw new Error("wardrobe_launchd_execute_not_implemented_use_central_privileged_installer");
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
