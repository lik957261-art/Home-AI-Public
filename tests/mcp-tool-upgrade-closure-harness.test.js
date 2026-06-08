"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "mcp-tool-upgrade-closure-smoke.js");

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
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Gateway callable schema closure requires --manifest and --profile/);
  assert.match(result.stderr, /selected profile/);
  assert.match(result.stderr, /--skip-gateway/);
}

function testRepositoryDocsAndHarnessContractMentionUpgradeClosure() {
  const script = read("scripts/mcp-tool-upgrade-closure-smoke.js");
  const gatewaySmoke = read("scripts/gateway-tool-schema-smoke.js");
  const runbook = read("docs/RUNBOOKS/mcp-tool-upgrade-closure.md");
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
  assert.match(script, /Gateway callable schema closure requires/);
  assert.match(script, /skip_gateway_requested/);
  assert.doesNotMatch(script, /console\.log\(.*key/i);
  assert.match(gatewaySmoke, /require-tool-property/);
  assert.match(gatewaySmoke, /missing required property/);

  assert.match(runbook, /mcp-tool-upgrade-closure-smoke\.js/);
  assert.match(runbook, /Gateway worker callable schema/);
  assert.match(runbook, /Only an explicit `--skip-gateway`/);
  assert.match(runbook, /Mobile instruction-service/);
  assert.match(runbook, /GATEWAY_TOOL_SCHEMA_EPOCH/);
  assert.match(runbook, /mcp_finance_add_transaction_attachment/);
  assert.match(docsIndex, /MCP tool upgrade closure/);
  assert.match(testMatrix, /mcp-tool-upgrade-closure-harness\.test\.js/);
  assert.match(testMatrix, /mcp-tool-upgrade-closure-smoke\.js/);
  assert.match(gatewayPool, /mcp-tool-upgrade-closure-smoke\.js/);
  assert.match(harnessMatrix, /mcp-tool-upgrade-closure-smoke\.js/);
}

(async () => {
  await testScriptPassesSourceServiceAndDocsWithoutGateway();
  await testScriptPassesMatchedServiceAndGatewayProperties();
  await testScriptFailsWhenServiceSchemaMissesRequiredAttachmentPathProperty();
  testScriptFailsWhenInstructionHintsMissGatewayTool();
  testScriptFailsWhenSelectedGatewayProfileIsOmittedWithoutExplicitSkip();
  testRepositoryDocsAndHarnessContractMentionUpgradeClosure();
  console.log("mcp tool upgrade closure harness tests passed");
})();
