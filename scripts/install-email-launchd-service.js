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

const DEFAULT_LABEL = "com.hermesmobile.plugin.email";
const SPEC = Object.freeze({
  pluginId: "email",
  sourceDir: "email",
  label: DEFAULT_LABEL,
  defaultPort: "5175",
});

function parseArgs(argv) {
  return baseParseArgs(argv, {
    port: process.env.EMAIL_SERVICE_PORT || "5175",
    host: process.env.EMAIL_SERVICE_HOST || "127.0.0.1",
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
    programArguments: ["/usr/bin/env", "npm", "run", "service"],
    environment: {
      PATH: `${path.posix.dirname(paths.nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      NODE_ENV: "production",
      EMAIL_SERVICE_HOST: currentPlan.host,
      EMAIL_SERVICE_PORT: currentPlan.port,
      EMAIL_PLUGIN_RUNTIME_DIR: path.posix.join(currentPlan.pluginRoot, "runtime"),
      EMAIL_SERVICE_STATIC_ROOT: path.posix.join(currentPlan.pluginRoot, "dist", "web"),
      EMAIL_HERMES_OWNER_KEY_FILE: path.posix.join(paths.macRoot, "data", "plugin-secrets", "email-registration-key.txt"),
    },
    stdoutLog: currentPlan.logPaths[0],
    stderrLog: currentPlan.logPaths[1],
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) throw new Error("email_launchd_execute_not_implemented_use_central_privileged_installer");
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
