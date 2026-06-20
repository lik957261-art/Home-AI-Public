"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptText = fs.readFileSync(path.join(repoRoot, "scripts", "visual-polish-controller.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const architectureMap = fs.readFileSync(path.join(repoRoot, "docs", "ARCHITECTURE_CODE_TEST_HARNESS_MAP.md"), "utf8");
const docsIndex = fs.readFileSync(path.join(repoRoot, "docs", "DOCS_INDEX.md"), "utf8");
const implementationNote = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "visual-polish-controller.md"), "utf8");

const {
  DEFAULT_PLUGINS,
  buildCardFromReport,
  buildPlan,
  classifyOwner,
  classifySeverity,
  ingestReports,
  isEnvironmentFailureReport,
  parseArgs,
  redact,
  sendCards,
  visualCommand,
} = require("../scripts/visual-polish-controller");

assert.equal(packageJson.scripts["visual:polish"], "node scripts/visual-polish-controller.js");
assert.match(scriptText, /create-thread-task-card\.js/);
assert.match(scriptText, /send-cards/);
assert.match(scriptText, /sourceThreadId/);
assert.match(scriptText, /targetThreadIds/);
assert.match(scriptText, /targetThreadId = request\.targetThreadIds\[0\]/);
assert.match(scriptText, /autoApprove: !options\.pending/);
assert.match(scriptText, /workflowId: "home-ai-visual-polish-controller"/);
assert.match(scriptText, /source_thread_self_target/);
assert.match(scriptText, /screenshot_meets_min_bytes/);
assert.doesNotMatch(scriptText, /owner-web-key|api-server-key|Authorization.*Bearer.*process\.env/i);

const args = parseArgs(["plan", "--all-default-plugins", "--plugin-id", "music", "--debug-url", "http://127.0.0.1:19073"]);
assert.equal(args.mode, "plan");
assert.ok(args.pluginIds.includes("music"));
assert.ok(DEFAULT_PLUGINS.includes("finance"));

const plan = buildPlan({ pluginIds: ["music"], debugUrl: "http://127.0.0.1:19073/" });
assert.equal(plan.ok, true);
assert.ok(plan.scenarios.some((item) => item.owner === "home-ai" && item.scenario === "global-plugin-dock-gesture-stability"));
assert.ok(plan.scenarios.some((item) => item.owner === "music" && item.scenario === "embedded-plugin-shell"));
assert.ok(plan.scenarios.every((item) => item.command.includes("--json")));

assert.deepEqual(
  visualCommand({ scenario: "embedded-plugin-shell", pluginId: "music", debugUrl: "http://127.0.0.1:19073/" }).slice(0, 7),
  ["npm", "run", "ios:pwa:visual", "--", "--scenario", "embedded-plugin-shell", "--plugin-id"],
);

const pluginReport = {
  ok: false,
  scenario: "embedded-plugin-shell",
  pluginId: "music",
  debugUrl: "http://127.0.0.1:19073/?access_token=secret-value",
  screenshot: { path: "/tmp/music.png", bytes: 4200 },
  assertions: [
    { name: "plugin_frame_has_no_horizontal_overflow", pass: false, details: { right: 430, viewportWidth: 390 } },
  ],
};
assert.equal(classifyOwner(pluginReport), "music");
assert.equal(classifySeverity(pluginReport), "medium");
const pluginCard = buildCardFromReport(pluginReport, {
  sourceThreadId: "source-thread",
  targetThreads: { music: "Music Plugin Thread" },
});
assert.equal(pluginCard.owner, "music");
assert.equal(pluginCard.request.sourceThreadId, "source-thread");
assert.deepEqual(pluginCard.request.targetThreadIds, ["Music Plugin Thread"]);
assert.equal(pluginCard.request.targetThreadId, "Music Plugin Thread");
assert.equal(pluginCard.request.autoApprove, true);
assert.ok(pluginCard.body.includes("embedded-plugin-shell"));
assert.ok(!JSON.stringify(pluginCard).includes("secret-value"));

const hostReport = {
  ok: false,
  scenario: "embedded-plugin-shell",
  pluginId: "finance",
  screenshot: { path: "/tmp/finance.png", bytes: 10 },
  assertions: [
    { name: "screenshot_meets_min_bytes", pass: false, details: { bytes: 10 } },
  ],
};
assert.equal(classifyOwner(hostReport), "home-ai");
assert.equal(classifySeverity(hostReport), "high");
assert.equal(isEnvironmentFailureReport(hostReport), true);

assert.equal(redact("http://x.test/?launchKey=abc&safe=1"), "http://x.test/?launchKey=REDACTED&safe=1");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "visual-polish-controller-test-"));
try {
  const reportFile = path.join(tempRoot, "report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(pluginReport, null, 2)}\n`, "utf8");
  const output = ingestReports({
    reports: [reportFile],
    outputDir: path.join(tempRoot, "out"),
    sourceThreadId: "source-thread",
    targetThreads: { music: "Music Plugin Thread" },
    debugUrl: "http://127.0.0.1:19073/",
    runId: "test-run",
  });
  assert.equal(output.cardCount, 1);
  assert.equal(output.skippedEnvironmentFailureCount, 0);
  assert.ok(fs.existsSync(path.join(tempRoot, "out", "report.json")));
  assert.ok(fs.readdirSync(path.join(tempRoot, "out", "task-cards")).some((name) => name.endsWith(".request.json")));

  const envReportFile = path.join(tempRoot, "environment-report.json");
  fs.writeFileSync(envReportFile, `${JSON.stringify({
    ok: false,
    scenario: "global-plugin-dock-gesture-stability",
    pluginId: "",
    failureKind: "environment",
    assertions: [
      { name: "client_freshness_ready", pass: false, details: { expectedClientVersion: "new", actualClientVersion: "old" } },
    ],
  }, null, 2)}\n`, "utf8");
  const envOutput = ingestReports({
    reports: [envReportFile],
    outputDir: path.join(tempRoot, "env-out"),
    sourceThreadId: "source-thread",
    targetThreads: { "home-ai": "home-ai-thread" },
    debugUrl: "http://127.0.0.1:19073/",
    runId: "env-run",
  });
  assert.equal(envOutput.cardCount, 0);
  assert.equal(envOutput.skippedEnvironmentFailureCount, 1);
  assert.equal(fs.existsSync(path.join(tempRoot, "env-out", "task-cards")), true);
  assert.equal(fs.readdirSync(path.join(tempRoot, "env-out", "task-cards")).length, 0);

  const sentRequests = [];
  const fakeScript = path.join(tempRoot, "fake-create-thread-task-card.js");
  const captureFile = path.join(tempRoot, "captured-requests.jsonl");
  fs.writeFileSync(fakeScript, [
    "#!/usr/bin/env node",
    "\"use strict\";",
    "const fs = require('node:fs');",
    "const path = process.argv[process.argv.indexOf('--json-file') + 1];",
    "fs.appendFileSync(process.env.CAPTURE_FILE, JSON.stringify(JSON.parse(fs.readFileSync(path, 'utf8'))) + '\\n', 'utf8');",
    "process.stdout.write(JSON.stringify({ ok: true, cards: [{ id: 'card-1' }] }));",
  ].join("\n"), "utf8");
  const mixedReport = {
    cards: [
      Object.assign({}, output.cards[0], { owner: "music" }),
      Object.assign({}, output.cards[0], { owner: "home-ai" }),
    ],
  };
  const mixedReportFile = path.join(tempRoot, "mixed-controller-report.json");
  fs.writeFileSync(mixedReportFile, `${JSON.stringify(mixedReport, null, 2)}\n`, "utf8");
  const oldCaptureFile = process.env.CAPTURE_FILE;
  process.env.CAPTURE_FILE = captureFile;
  try {
    const result = sendCards({
      controllerReport: mixedReportFile,
      sourceThreadId: "source-thread",
      targetThreads: { music: "music-thread", "home-ai": "source-thread" },
      codexTaskCardScript: fakeScript,
    });
    assert.equal(result.ok, true);
    assert.equal(result.sent, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.results[1].reason, "source_thread_self_target");
  } finally {
    if (oldCaptureFile === undefined) delete process.env.CAPTURE_FILE;
    else process.env.CAPTURE_FILE = oldCaptureFile;
  }
  for (const line of fs.readFileSync(captureFile, "utf8").trim().split("\n")) {
    sentRequests.push(JSON.parse(line));
  }
  assert.equal(sentRequests.length, 1);
  assert.deepEqual(sentRequests[0].targetThreadIds, ["music-thread"]);
  assert.equal(sentRequests[0].targetThreadId, "music-thread");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

assert.match(implementationNote, /send-cards/);
assert.match(implementationNote, /create-thread-task-card\.js/);
assert.match(implementationNote, /visual-polish-controller\.js/);
assert.match(architectureMap, /visual-polish-controller\.js/);
assert.match(architectureMap, /visual-polish-controller\.test\.js/);
assert.match(docsIndex, /visual-polish-controller\.md/);

console.log("visual polish controller tests passed");
