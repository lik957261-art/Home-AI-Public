"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const runnerPath = path.join(repoRoot, "scripts", "visual-polish-audit-runner.js");
const runnerText = fs.readFileSync(runnerPath, "utf8");
const cronScriptText = fs.readFileSync(path.join(repoRoot, "scripts", "homeai-visual-polish-audit-cron.sh"), "utf8");
const deployScriptText = fs.readFileSync(path.join(repoRoot, "scripts", "deploy-macos-production.js"), "utf8");
const implementationNote = fs.readFileSync(
  path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "visual-polish-controller.md"),
  "utf8",
);

const {
  argsForScenario,
  parseArgs,
  plannedScenarios,
} = require("../scripts/visual-polish-audit-runner");

assert.match(runnerText, /ChatGPT 5\.5 X Hi/);
assert.match(runnerText, /Only fix UI and interaction issues/);
assert.match(runnerText, /Do not change plugin business logic/);
assert.match(runnerText, /xcrun", \["simctl", "io", "booted", "recordVideo"/);
assert.match(runnerText, /HOMEAI_VISUAL_AUDIT_RECORD_VIDEO/);
assert.match(runnerText, /HOMEAI_VISUAL_AUDIT_CODEX_TASK_CARD_SCRIPT/);
assert.match(runnerText, /HOMEAI_VISUAL_AUDIT_APP_URL/);
assert.match(runnerText, /HOMEAI_VISUAL_AUDIT_EXPECTED_CLIENT_VERSION/);
assert.match(runnerText, /data-client-version="([^"]+)"/);
assert.match(runnerText, /resetClient/);
assert.match(runnerText, /targetVersion/);
assert.match(runnerText, /\/Users\/hermes-host\/HermesMobile\/plugins\/codex-mobile-web\/scripts\/create-thread-task-card\.js/);
assert.match(runnerText, /new URL\("\/api\/lease", debugUrl\)/);
assert.match(runnerText, /Cards skipped:/);
assert.doesNotMatch(runnerText, /\/api\/status/);
assert.match(runnerText, /"--lock-file"/);
assert.match(runnerText, /\["music", "finance", "wardrobe", "health", "growth", "note", "email", "codex-mobile"\]/);
assert.doesNotMatch(runnerText, /owner-web-key|api-server-key|Authorization.*Bearer.*process\.env/i);

assert.match(cronScriptText, /\*host\*\) JOB_KEY="host"/);
assert.match(cronScriptText, /\*music\*\) JOB_KEY="music"/);
assert.match(cronScriptText, /\*finance\*\) JOB_KEY="finance"/);
assert.match(cronScriptText, /\*wardrobe\*\) JOB_KEY="wardrobe"/);
assert.match(cronScriptText, /\*global\*\) JOB_KEY="global-interactions"/);
assert.match(cronScriptText, /\*core\*\) JOB_KEY="core-plugins"/);
assert.match(cronScriptText, /visual-polish-task-cards\.json/);

assert.match(deployScriptText, /installHomeAiVisualPolishCronJobs/);
assert.match(deployScriptText, /home-ai-visual-polish-cron-jobs/);
assert.match(deployScriptText, /homeai-visual-polish-host\.sh/);
assert.match(deployScriptText, /homeai-visual-polish-music\.sh/);
assert.match(deployScriptText, /homeai-visual-polish-finance\.sh/);
assert.match(deployScriptText, /homeai-visual-polish-wardrobe\.sh/);
assert.match(deployScriptText, /homeai-visual-polish-global\.sh/);
assert.match(deployScriptText, /homeai-visual-polish-core\.sh/);
assert.match(deployScriptText, /homeai_visual_host/);
assert.match(deployScriptText, /homeai_visual_music/);
assert.match(deployScriptText, /homeai_visual_finance/);
assert.match(deployScriptText, /homeai_visual_wardrobe/);
assert.match(deployScriptText, /homeai_visual_global_interactions/);
assert.match(deployScriptText, /homeai_visual_core/);
assert.match(deployScriptText, /global-interactions/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "visual-polish-audit-runner-test-"));
try {
  const configFile = path.join(tempRoot, "visual-polish-task-cards.json");
  fs.writeFileSync(configFile, `${JSON.stringify({
    sourceThreadId: "source-home-ai-thread",
    targetThreads: {
      "home-ai": "source-home-ai-thread",
      music: "music-thread",
      finance: "finance-thread",
    },
    jobs: {
      music: {
        scope: "plugin",
        pluginIds: ["music"],
        targetThreads: { music: "music-thread" },
      },
      host: {
        scope: "host",
        scenarios: ["global-plugin-dock-gesture-stability"],
      },
    },
  }, null, 2)}\n`, "utf8");

  const musicOptions = parseArgs(["--config-file", configFile, "--job-key", "music", "--run-id", "unit-run", "--output-root", tempRoot]);
  assert.equal(musicOptions.sourceThreadId, "source-home-ai-thread");
  assert.equal(musicOptions.appUrl, "http://127.0.0.1:8797/?source=pwa");
  assert.equal(musicOptions.expectedClientVersion, "20260621-plugin-topic-async-v899");
  assert.equal(musicOptions.scope, "plugin");
  assert.deepEqual(musicOptions.pluginIds, ["music"]);
  assert.equal(musicOptions.targetThreads.music, "music-thread");
  assert.equal(musicOptions.runId, "unit-run");
  const musicScenarios = plannedScenarios(musicOptions);
  assert.ok(musicScenarios.length > 0);
  assert.ok(musicScenarios.every((item) => item.pluginId === "music"));
  assert.ok(musicScenarios.some((item) => item.scenario === "embedded-plugin-shell"));

  const hostOptions = parseArgs(["--config-file", configFile, "--job-key", "host", "--run-id", "host-run", "--output-root", tempRoot]);
  assert.equal(hostOptions.scope, "host");
  assert.deepEqual(hostOptions.scenarioNames, ["global-plugin-dock-gesture-stability"]);
  const hostScenarios = plannedScenarios(hostOptions);
  assert.equal(hostScenarios.length, 1);
  assert.equal(hostScenarios[0].owner, "home-ai");

  const args = argsForScenario({ scenario: "embedded-plugin-shell", pluginId: "music" }, musicOptions, "/tmp/artifacts");
  assert.deepEqual(args.slice(0, 6), [
    "scripts/ios-pwa-visual-harness.js",
    "--scenario",
    "embedded-plugin-shell",
    "--debug-url",
    "http://127.0.0.1:19073/",
    "--app-url",
  ]);
  assert.ok(args.includes("--plugin-id"));
  assert.ok(args.includes("music"));
  assert.ok(args.includes("--app-url"));
  assert.ok(args.includes("--expected-client-version"));
  const appUrl = args[args.indexOf("--app-url") + 1];
  assert.match(appUrl, /^http:\/\/127\.0\.0\.1:8797\//);
  assert.match(appUrl, /resetClient=1/);
  assert.match(appUrl, /hard=1/);
  assert.match(appUrl, /targetVersion=20260621-plugin-topic-async-v899/);
  assert.ok(args.includes("--lock-file"));
  assert.ok(args.some((item) => item.includes("visual-polish-audit-runner-test-") && item.endsWith(".lock")));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

assert.match(implementationNote, /visual-polish-audit-runner\.js/);
assert.match(implementationNote, /visual-polish-task-cards\.json/);
assert.match(implementationNote, /ChatGPT 5\.5 X Hi/);

console.log("visual polish audit runner tests passed");
