"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "mcp-tool-upgrade-closure-smoke.js");
const runtimeSmokePath = path.join(repoRoot, "scripts", "gateway-mcp-runtime-call-smoke.js");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function write(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf8");
}

function run(args, cwd = repoRoot) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function runAsync(args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("mcp upgrade closure smoke timed out"));
    }, 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

function runRuntimeSmoke(args, cwd = repoRoot) {
  return spawnSync(process.execPath, [runtimeSmokePath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function runRuntimeSmokeAsync(args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runtimeSmokePath, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("gateway runtime MCP smoke timed out"));
    }, 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

async function withSchemaServer(handler, schema = null) {
  const responseSchema = schema || {
    tools: [{
      name: "finance.add_transaction_attachment",
      inputSchema: {
        properties: {
          transaction_id: { type: "string" },
          data_base64: { type: "string" },
          data_url: { type: "string" },
          file_path: { type: "string" },
          upload_path: { type: "string" },
          attachments: { type: "array" },
        },
      },
    }],
  };
  const server = http.createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(responseSchema));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    await handler(`http://127.0.0.1:${port}/api/finance/mcp/schemas`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-mcp-upgrade-"));
  write(path.join(root, "adapters", "gateway-run-instruction-service.js"), [
    'const DEFAULT_TOOL_SCHEMA_EPOCH = "20260606-finance-reference-mcp-v1";',
    'const finance = ["mcp_finance_create_transaction", "mcp_finance_add_transaction_attachment"];',
    'const override = "mcp_finance_add_transaction_attachment";',
  ].join("\n"));
  write(path.join(root, "mobile-server-runtime.js"), 'const GATEWAY_TOOL_SCHEMA_EPOCH = "20260606-finance-reference-mcp-v1";\n');
  write(path.join(root, "docs", "RUNBOOK.md"), [
    "MCP upgrade closure.",
    "mcp_finance_add_transaction_attachment",
    "20260606-finance-reference-mcp-v1",
  ].join("\n"));
  return root;
}

async function testScriptPassesSourceServiceAndDocsWithoutGateway() {
  const root = makeFixtureRoot();
  await withSchemaServer(async (url) => {
    const result = await runAsync([
      "--repo-root", root,
      "--skip-gateway",
      "--service-schema-url", url,
      "--require-service-tool", "finance.add_transaction_attachment",
      "--service-schema-contains", "attachments",
      "--gateway-tool", "mcp_finance_add_transaction_attachment",
      "--epoch", "20260606-finance-reference-mcp-v1",
      "--doc-contains", `${path.join(root, "docs", "RUNBOOK.md")}::mcp_finance_add_transaction_attachment`,
      "--doc-contains", `${path.join(root, "docs", "RUNBOOK.md")}::20260606-finance-reference-mcp-v1`,
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.service.skipped, false);
    assert.deepEqual(parsed.service.requiredProperties, [
      { tool: "finance.add_transaction_attachment", property: "file_path" },
      { tool: "finance.add_transaction_attachment", property: "upload_path" },
    ]);
    assert.equal(parsed.gateway.skipped, true);
    assert.deepEqual(parsed.source.gatewayTools, ["mcp_finance_add_transaction_attachment"]);
  });
}

async function testScriptPassesMatchedServiceAndGatewayProperties() {
  const root = makeFixtureRoot();
  const fakeGatewaySmoke = path.join(root, "scripts", "fake-gateway-smoke.js");
  write(fakeGatewaySmoke, [
    '"use strict";',
    'const args = process.argv.slice(2).join("\\n");',
    'if (!args.includes("--require-tool-property")) throw new Error("missing require-tool-property");',
    'if (!args.includes("mcp_finance_add_transaction_attachment:file_path")) throw new Error("missing matched gateway property");',
    'console.log(JSON.stringify({ requiredTools: ["mcp_finance_add_transaction_attachment"], workers: [{ worker: "lowgw-fixture", evidence: "fixture", agentSchemaToolCount: 1, agentSchemaEnabledToolsets: ["finance"] }] }));',
  ].join("\n"));
  await withSchemaServer(async (url) => {
    const result = await runAsync([
      "--repo-root", root,
      "--service-schema-url", url,
      "--require-service-tool", "finance.add_transaction_attachment",
      "--gateway-tool", "mcp_finance_add_transaction_attachment",
      "--require-schema-property-match", "finance.add_transaction_attachment=mcp_finance_add_transaction_attachment:file_path",
      "--manifest", path.join(root, "gateway-manifest.json"),
      "--profile", "lowgw-fixture",
      "--gateway-smoke-script", fakeGatewaySmoke,
      "--epoch", "20260606-finance-reference-mcp-v1",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.schemaPropertyMatches, [{
      serviceTool: "finance.add_transaction_attachment",
      gatewayTool: "mcp_finance_add_transaction_attachment",
      property: "file_path",
    }]);
    assert.ok(parsed.service.requiredProperties.some((item) => (
      item.tool === "finance.add_transaction_attachment" && item.property === "file_path"
    )));
    assert.ok(parsed.gateway.requiredProperties.some((item) => (
      item.tool === "mcp_finance_add_transaction_attachment" && item.property === "file_path"
    )));
  });
}

async function testScriptAcceptsExplicitLiveGatewayEvidenceWhenSchemaProbeFails() {
  const root = makeFixtureRoot();
  const fakeGatewaySmoke = path.join(root, "scripts", "fake-gateway-smoke-fails.js");
  const fakeLiveSmoke = path.join(root, "scripts", "fake-live-gateway-smoke.js");
  write(fakeGatewaySmoke, [
    '"use strict";',
    'console.error("agent schema probe returned only built-in tools");',
    'process.exit(1);',
  ].join("\n"));
  write(fakeLiveSmoke, [
    '"use strict";',
    'const args = process.argv.slice(2).join("\\n");',
    'if (!args.includes("--call")) throw new Error("missing live call");',
    'if (!args.includes("mcp_finance_add_transaction_attachment")) throw new Error("missing live tool");',
    'console.log(JSON.stringify({ ok: true, requiredTools: ["mcp_finance_add_transaction_attachment"], workers: [{ worker: "lowgw-fixture", evidence: "gateway-runtime-tool-executor", observedTools: ["mcp_finance_add_transaction_attachment"], sessionFound: true, rawContainsMarker: true }] }));',
  ].join("\n"));
  await withSchemaServer(async (url) => {
    const result = await runAsync([
      "--repo-root", root,
      "--service-schema-url", url,
      "--require-service-tool", "finance.add_transaction_attachment",
      "--gateway-tool", "mcp_finance_add_transaction_attachment",
      "--manifest", path.join(root, "gateway-manifest.json"),
      "--profile", "lowgw-fixture",
      "--gateway-smoke-script", fakeGatewaySmoke,
      "--live-gateway-smoke-script", fakeLiveSmoke,
      "--allow-live-gateway-substitute",
      "--live-gateway-call", 'mcp_finance_add_transaction_attachment={"file_path":"/tmp/receipt.png"}',
      "--epoch", "20260606-finance-reference-mcp-v1",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.gateway.schema.ok, false);
    assert.match(parsed.gateway.schema.error, /Gateway callable schema smoke failed/);
    assert.equal(parsed.gateway.live.ok, true);
    assert.equal(parsed.gateway.workers[0].evidence, "gateway-runtime-tool-executor");
    assert.deepEqual(parsed.gateway.workers[0].observedTools, ["mcp_finance_add_transaction_attachment"]);
  });
}

async function testGatewayRuntimeCallSmokeObservesToolExecutorEvidence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-mcp-runtime-smoke-"));
  const profile = "hm-owner-openai-1";
  const telemetryRoot = path.join(root, "profiles");
  const logDir = path.join(telemetryRoot, profile, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const manifestPath = path.join(root, "manifest.json");
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const marker = String(parsed.input || "").match(/marker ([^ .]+)/)?.[1] || "missing-marker";
      const sessionId = "11111111-2222-4333-8444-555555555555";
      fs.appendFileSync(path.join(logDir, "agent.log"), [
        `INFO [${sessionId}] agent.conversation_loop: msg='${marker}'`,
        `INFO [${sessionId}] agent.tool_executor: tool mcp_movie_search_sources completed (0.01s, 100 chars)`,
        "",
      ].join("\n"));
      res.setHeader("content-type", "text/plain");
      res.end(`${marker} ok`);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    write(manifestPath, JSON.stringify({
      workers: [{
        profile,
        name: profile,
        enabled: true,
        port,
        telemetryProfile: profile,
      }],
    }));
    const result = await runRuntimeSmokeAsync([
      "--manifest", manifestPath,
      "--profile", profile,
      "--telemetry-root", telemetryRoot,
      "--call", 'mcp_movie_search_sources={"query":"movie","limit":1,"actor":"actor"}',
      "--timeout-ms", "30000",
      "--log-delay-ms", "10",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.requiredTools, ["mcp_movie_search_sources"]);
    assert.equal(parsed.workers[0].evidence, "gateway-runtime-tool-executor");
    assert.equal(parsed.workers[0].sessionFound, true);
    assert.deepEqual(parsed.workers[0].observedTools, ["mcp_movie_search_sources"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testScriptFailsWhenServiceSchemaMissesRequiredAttachmentPathProperty() {
  const root = makeFixtureRoot();
  await withSchemaServer(async (url) => {
    const result = await runAsync([
      "--repo-root", root,
      "--skip-gateway",
      "--service-schema-url", url,
      "--require-service-tool", "finance.add_transaction_attachment",
      "--gateway-tool", "mcp_finance_add_transaction_attachment",
      "--epoch", "20260606-finance-reference-mcp-v1",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required property: file_path/);
  }, {
    tools: [{
      name: "finance.add_transaction_attachment",
      inputSchema: {
        properties: {
          transaction_id: { type: "string" },
          data_base64: { type: "string" },
          data_url: { type: "string" },
        },
      },
    }],
  });
}

function testScriptFailsWhenInstructionHintsMissGatewayTool() {
  const root = makeFixtureRoot();
  write(path.join(root, "adapters", "gateway-run-instruction-service.js"), 'const DEFAULT_TOOL_SCHEMA_EPOCH = "20260606-finance-reference-mcp-v1";\n');
  const result = run([
    "--repo-root", root,
    "--skip-gateway",
    "--gateway-tool", "mcp_finance_add_transaction_attachment",
    "--epoch", "20260606-finance-reference-mcp-v1",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Mobile instruction-service missing required text/);
  assert.match(result.stderr, /mcp_finance_add_transaction_attachment/);
}

function testScriptFailsWhenSelectedGatewayProfileIsOmittedWithoutExplicitSkip() {
  const root = makeFixtureRoot();
  const result = run([
    "--repo-root", root,
    "--gateway-tool", "mcp_finance_add_transaction_attachment",
    "--epoch", "20260606-finance-reference-mcp-v1",
    "--require-gateway",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Gateway callable schema closure requires --manifest and --profile/);
  assert.match(result.stderr, /selected profile/);
  assert.match(result.stderr, /--skip-gateway/);
}

function testDefaultNoArgSmokeUsesCurrentSourceClosure() {
  const result = run(["--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.toolset, "wardrobe");
  assert.equal(parsed.epoch, "20260629-wardrobe-wear-intent-v970");
  assert.deepEqual(parsed.source.gatewayTools, ["mcp_wardrobe_wardrobe_execute_outfit_wear_intent"]);
  assert.equal(parsed.gateway.skipped, true);
  assert.equal(parsed.gateway.reason, "gateway_manifest_profile_not_provided_default_source_check");
}

function testRepositoryDocsAndHarnessContractMentionUpgradeClosure() {
  const script = read("scripts/mcp-tool-upgrade-closure-smoke.js");
  const runtimeSmoke = read("scripts/gateway-mcp-runtime-call-smoke.js");
  const gatewaySmoke = read("scripts/gateway-tool-schema-smoke.js");
  const runbook = read("docs/RUNBOOKS/mcp-tool-upgrade-closure.md");
  const platformContract = read("docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md");
  const docsIndex = read("docs/DOCS_INDEX.md");
  const testMatrix = read("docs/TEST_MATRIX.md");
  const gatewayPool = read("docs/MODULES/gateway-pool.md");
  const harnessMatrix = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");

  assert.match(script, /gateway-tool-schema-smoke\.js/);
  assert.match(script, /--require/);
  assert.match(script, /service-schema-url/);
  assert.match(script, /service-header-file/);
  assert.match(script, /require-service-tool-property/);
  assert.match(script, /require-gateway-tool-property/);
  assert.match(script, /require-schema-property-match/);
  assert.match(script, /file_path/);
  assert.match(script, /upload_path/);
  assert.match(script, /mcp_finance_add_transaction_attachment/);
  assert.match(script, /mcp_wardrobe_wardrobe_execute_outfit_wear_intent/);
  assert.match(script, /20260629-wardrobe-wear-intent-v970/);
  assert.match(script, /requireGateway/);
  assert.match(script, /Gateway callable schema closure requires/);
  assert.match(script, /skip_gateway_requested/);
  assert.match(script, /gateway_manifest_profile_not_provided_default_source_check/);
  assert.match(script, /macos-production-defaults/);
  assert.match(script, /allow-live-gateway-substitute/);
  assert.match(script, /live-gateway-call/);
  assert.doesNotMatch(script, /console\.log\(.*key/i);
  assert.match(runtimeSmoke, /gateway-runtime-tool-executor/);
  assert.match(runtimeSmoke, /agent\.tool_executor/);
  assert.match(runtimeSmoke, /Missing --call/);
  assert.doesNotMatch(runtimeSmoke, /console\.log\(.*key/i);
  assert.match(gatewaySmoke, /require-tool-property/);
  assert.match(gatewaySmoke, /missing required property/);

  assert.match(runbook, /mcp-tool-upgrade-closure-smoke\.js/);
  assert.match(runbook, /Gateway worker callable schema/);
  assert.match(runbook, /The no-argument daily smoke is a current source\/default closure check/);
  assert.match(runbook, /`--require-gateway`/);
  assert.match(runbook, /gateway_manifest_profile_not_provided_default_source_check/);
  assert.match(runbook, /Mobile instruction-service/);
  assert.match(runbook, /GATEWAY_TOOL_SCHEMA_EPOCH/);
  assert.match(runbook, /mcp_finance_add_transaction_attachment/);
  assert.match(runbook, /Cross-Workspace Ownership And Task Cards/);
  assert.match(runbook, /must not patch, test, deploy, commit/);
  assert.match(runbook, /Codex Mobile[\s\S]*cross-thread task card/);
  assert.match(runbook, /Home AI MCP callable schema sync for <plugin id>/);
  assert.match(runbook, /mcp_music_music_demo_generate_narrations/);
  assert.match(runbook, /mcp_music_music_demo_cleanup_narrations/);
  assert.match(runbook, /20260623-music-demo-narration-cleanup-v1/);
  assert.match(runbook, /gateway-mcp-runtime-call-smoke\.js/);
  assert.match(runbook, /--macos-production-defaults/);
  assert.match(runbook, /--allow-live-gateway-substitute/);
  assert.match(platformContract, /Cross-workspace ownership boundary/);
  assert.match(platformContract, /must not inspect, edit, patch, test, deploy, or commit[\s\S]*Home AI source files/);
  assert.match(platformContract, /Codex Mobile cross-thread task card/);
  assert.match(docsIndex, /MCP tool upgrade closure/);
  assert.match(testMatrix, /mcp-tool-upgrade-closure-harness\.test\.js/);
  assert.match(testMatrix, /mcp-tool-upgrade-closure-smoke\.js/);
  assert.match(gatewayPool, /mcp-tool-upgrade-closure-smoke\.js/);
  assert.match(harnessMatrix, /mcp-tool-upgrade-closure-smoke\.js/);
}

(async () => {
  await testScriptPassesSourceServiceAndDocsWithoutGateway();
  await testScriptPassesMatchedServiceAndGatewayProperties();
  await testScriptAcceptsExplicitLiveGatewayEvidenceWhenSchemaProbeFails();
  await testGatewayRuntimeCallSmokeObservesToolExecutorEvidence();
  await testScriptFailsWhenServiceSchemaMissesRequiredAttachmentPathProperty();
  testScriptFailsWhenInstructionHintsMissGatewayTool();
  testScriptFailsWhenSelectedGatewayProfileIsOmittedWithoutExplicitSkip();
  testDefaultNoArgSmokeUsesCurrentSourceClosure();
  testRepositoryDocsAndHarnessContractMentionUpgradeClosure();
  console.log("mcp tool upgrade closure harness tests passed");
})();
