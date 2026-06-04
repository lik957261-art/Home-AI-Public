"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const wrapperPath = path.join(repoRoot, "scripts", "email-mcp-wrapper.py");

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function startFakeEmailService() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || "",
        session: req.headers["x-email-session"] || "",
        body: bodyText ? JSON.parse(bodyText) : null,
      });
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      if (req.method === "POST" && req.url === "/api/v1/hermes/plugin/launch") {
        res.end(JSON.stringify({
          launch_token: "launch-test-token",
          expires_in: 300,
          entry_path: "/?embed=hermes&launch=launch-test-token",
        }));
        return;
      }
      if (req.method === "GET" && req.url === "/api/accounts") {
        res.end(JSON.stringify({
          accounts: [{
            id: "acct-1",
            provider: "gmail",
            displayAddress: "user@example.com",
            accountLabel: "Primary",
            status: "connected",
          }],
        }));
        return;
      }
      if (req.method === "GET" && req.url === "/api/messages/msg-1") {
        res.end(JSON.stringify({
          message: {
            id: "msg-1",
            accountId: "acct-1",
            folderId: "inbox",
            subject: "Bounded message",
            bodyText: "full private body should not be returned",
            bodyExcerpt: "short excerpt",
            rawMime: "raw mime should not be returned",
            headers: { private: "header" },
            attachments: [{
              id: "att-1",
              filename: "report.pdf",
              contentType: "application/pdf",
              sizeBytes: 1234,
              availabilityState: "metadata-only",
            }],
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not_found" }));
    });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function runWrapper({ workspace, apiBaseUrl, input }) {
  const python = process.env.PYTHON || "python";
  return new Promise((resolve, reject) => {
    const child = spawn(python, [
      wrapperPath,
      "--workspace",
      workspace,
      "--no-workspace-override",
      "--api-base-url",
      apiBaseUrl,
    ], { cwd: repoRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "email-mcp-wrapper-"));
  const workspace = path.join(dir, "drive", "users", "owner");
  writeText(path.join(workspace, ".hermes-email", "config.json"), JSON.stringify({
    workspace_id: "owner",
    plugin_launch: "/api/v1/hermes/plugin/launch",
    access_key_file: "access-key.txt",
  }));
  writeText(path.join(workspace, ".hermes-email", "access-key.txt"), "workspace-secret-key\n");

  const fakeEmail = await startFakeEmailService();
  try {
    const input = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_accounts", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_message", arguments: { messageId: "msg-1" } } },
    ].map((item) => JSON.stringify(item)).join("\n") + "\n";
    const result = await runWrapper({ workspace, apiBaseUrl: fakeEmail.baseUrl, input });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes("workspace-secret-key"), false);
    assert.equal(result.stdout.includes("launch-test-token"), false);
    assert.equal(result.stdout.includes("full private body should not be returned"), false);
    assert.equal(result.stdout.includes("raw mime should not be returned"), false);
    const lines = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(lines[0].result.serverInfo.name, "email");
    assert.equal(lines[1].result.tools.some((tool) => tool.name === "search_messages"), true);
    const accounts = JSON.parse(lines[2].result.content[0].text);
    assert.deepEqual(accounts.accounts.map((item) => item.id), ["acct-1"]);
    const message = JSON.parse(lines[3].result.content[0].text);
    assert.equal(message.message.fullBodyAvailable, true);
    assert.equal(message.message.bodyExcerpt, "short excerpt");
    assert.equal(message.message.bodyText, undefined);
    assert.equal(fakeEmail.requests[0].authorization, "Bearer workspace-secret-key");
    assert.equal(fakeEmail.requests[1].session, "launch-test-token");
  } finally {
    await fakeEmail.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("email mcp wrapper tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
