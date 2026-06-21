#!/usr/bin/env node
"use strict";

const path = require("node:path");
const {
  argValue,
  baseParseArgs,
  buildLaunchdPlist,
  createPlan,
  payloadFor,
  servicePaths,
} = require("./plugin-launchd-service-helper");
const {
  defaultRuntimeRoot,
  resolveCodexMobileProfileRuntime,
  userHomeFor,
} = require("./codex-mobile-profile-runtime");

const DEFAULT_LABEL = "com.hermesmobile.plugin.codex-mobile";
const SPEC = Object.freeze({
  pluginId: "codex-mobile",
  sourceDir: "codex-mobile-web",
  label: DEFAULT_LABEL,
  defaultPort: "8787",
  serviceUser: "xuxin",
});

function parseArgs(argv) {
  const parsed = baseParseArgs(argv, {
    port: process.env.CODEX_MOBILE_PORT || "8787",
    host: process.env.CODEX_MOBILE_HOST || "127.0.0.1",
    serviceUser: process.env.CODEX_MOBILE_SERVICE_USER || "xuxin",
  });
  parsed.profileFile = argValue(argv, "--profile-file", process.env.CODEX_MOBILE_PROFILE_FILE || "");
  parsed.runtimeRoot = argValue(argv, "--runtime-root", process.env.CODEX_MOBILE_RUNTIME_DIR || "");
  parsed.codexHomeFallback = argValue(argv, "--codex-home-fallback", process.env.CODEX_HOME || "");
  return parsed;
}

function plan(options = {}) {
  return createPlan(Object.assign({ serviceUser: "xuxin" }, options), SPEC);
}

function plistFor(options = {}) {
  const currentPlan = plan(options);
  const paths = servicePaths(options, SPEC);
  const userHome = userHomeFor(currentPlan.serviceUser);
  const runtime = resolveCodexMobileProfileRuntime({
    serviceUser: currentPlan.serviceUser,
    runtimeRoot: options.runtimeRoot || process.env.CODEX_MOBILE_RUNTIME_DIR || defaultRuntimeRoot(currentPlan.serviceUser),
    profileFile: options.profileFile || process.env.CODEX_MOBILE_PROFILE_FILE || "",
    fallbackCodexHome: options.codexHomeFallback || process.env.CODEX_HOME || "",
  });
  const runtimeRoot = runtime.runtimeRoot;
  const codexHome = runtime.codexHome;
  return buildLaunchdPlist({
    label: DEFAULT_LABEL,
    userName: currentPlan.serviceUser,
    workingDirectory: currentPlan.pluginRoot,
    programArguments: [paths.nodePath, "server.js"],
    environment: {
      PATH: `${path.posix.dirname(paths.nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      NODE_ENV: "production",
      HOME: userHome,
      CODEX_HOME: codexHome,
      CODEX_MOBILE_RUNTIME_DIR: runtimeRoot,
      CODEX_MOBILE_PROFILE_FILE: runtime.profileFile,
      CODEX_MOBILE_HOST: currentPlan.host,
      CODEX_MOBILE_PORT: currentPlan.port,
      CODEX_MOBILE_KEY_FILE: path.posix.join(runtimeRoot, "access_key"),
      CODEX_MOBILE_REQUIRE_SHARED_APP_SERVER: "1",
      CODEX_MOBILE_DISABLE_OWNED_MUX: "1",
      CODEX_MOBILE_MUX_ENDPOINT_FILE: runtime.muxEndpointFile,
      CODEX_MOBILE_HERMES_PLUGIN_BASE_URL: `http://${currentPlan.host}:${currentPlan.port}`,
      CODEX_MOBILE_HERMES_PLUGIN_FRAME_ORIGINS: "http://127.0.0.1:8797",
    },
    stdoutLog: currentPlan.logPaths[0],
    stderrLog: currentPlan.logPaths[1],
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) throw new Error("codex_mobile_launchd_execute_not_implemented_use_central_privileged_installer");
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
