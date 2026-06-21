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

const DEFAULT_LABEL = "com.hermesmobile.plugin.note";
const SPEC = Object.freeze({
  pluginId: "note",
  sourceDir: "note",
  label: DEFAULT_LABEL,
  defaultPort: "4181",
});

function parseArgs(argv) {
  return baseParseArgs(argv, {
    port: process.env.NOTE_PORT || process.env.PORT || "4181",
    host: process.env.NOTE_HOST || process.env.HOST || "127.0.0.1",
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
    programArguments: [paths.nodePath, "scripts/note-server.js"],
    environment: {
      PATH: `${path.posix.dirname(paths.nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      NODE_ENV: "production",
      HOST: currentPlan.host,
      PORT: currentPlan.port,
      NOTE_DB_PATH: path.posix.join(currentPlan.pluginRoot, "data", "note.sqlite3"),
      NOTE_ATTACHMENT_DB_PATH: path.posix.join(currentPlan.pluginRoot, "data", "attachment.sqlite3"),
      NOTE_ATTACHMENT_ROOT: path.posix.join(currentPlan.pluginRoot, "data", "attachments"),
      NOTE_REGISTRATION_KEY_PATH: path.posix.join(paths.macRoot, "data", "plugin-secrets", "note-registration-key.txt"),
    },
    stdoutLog: currentPlan.logPaths[0],
    stderrLog: currentPlan.logPaths[1],
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) throw new Error("note_launchd_execute_not_implemented_use_central_privileged_installer");
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
