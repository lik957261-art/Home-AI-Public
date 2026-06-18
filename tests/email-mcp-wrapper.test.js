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
      if (req.method === "GET" && req.url.startsWith("/api/messages?")) {
        const url = new URL(req.url, "http://127.0.0.1");
        const query = String(url.searchParams.get("query") || "");
        const messages = [
          {
            id: "msg-1",
            accountId: "acct-1",
            folderId: "inbox",
            subject: "Bounded message",
            sender: "sender@example.com",
            receivedAt: "2026-06-10T00:00:00.000Z",
          },
          {
            id: "msg-invoice",
            accountId: "acct-1",
            folderId: "inbox",
            subject: "Cathay invoice",
            sender: "booking@cathaypacific.com",
            receivedAt: "2026-06-09T00:00:00.000Z",
          },
        ].filter((message) => !query || message.subject.toLowerCase().includes(query.toLowerCase()) || message.sender.toLowerCase().includes(query.toLowerCase()));
        res.end(JSON.stringify({ messages, hasMore: false, nextOffset: messages.length }));
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
      if (req.method === "GET" && req.url.startsWith("/api/mcp/messages/msg-1/body")) {
        const url = new URL(req.url, "http://127.0.0.1");
        const fullBody = "full private body returned only by explicit body tool";
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 20);
        const chunk = fullBody.slice(offset, offset + limit);
        const nextOffset = offset + chunk.length;
        const truncated = nextOffset < fullBody.length;
        res.end(JSON.stringify({
          ok: true,
          messageId: "msg-1",
          bodyText: chunk,
          offset,
          limit,
          returnedChars: chunk.length,
          totalChars: fullBody.length,
          truncated,
          hasMore: truncated,
          nextOffset: truncated ? nextOffset : null,
          remainingChars: Math.max(fullBody.length - nextOffset, 0),
          attachmentContentIncluded: false,
          auditId: "act-body-1",
        }));
        return;
      }
      if (req.method === "GET" && req.url.startsWith("/api/mcp/attachments/att-1/content")) {
        res.end(JSON.stringify({
          ok: true,
          attachmentId: "att-1",
          messageId: "msg-1",
          filename: "report.pdf",
          contentType: "application/pdf",
          encoding: "base64",
          data: Buffer.from("pdf").toString("base64"),
          offset: 0,
          limit: 3,
          returnedBytes: 3,
          totalBytes: 3,
          truncated: false,
          localOnly: true,
          auditId: "act-att-1",
        }));
        return;
      }
      if (req.method === "DELETE" && req.url === "/api/messages/msg-1") {
        res.end(JSON.stringify({
          changed: true,
          actionId: "act-1",
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
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
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
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "apply_mail_action", arguments: { action: "delete_local", messageId: "msg-1" } } },
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "delete_local_by_search", arguments: { query: "Cathay OR invoice", exclude_keywords: ["invoice"] } } },
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "apply_mail_action_bulk", arguments: { action: "delete_local", messageIds: ["msg-1"], dry_run: false } } },
      { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "get_message_body", arguments: { messageId: "msg-1", purpose: "inspect selected message", limit: 20, readAll: true } } },
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_attachment_content", arguments: { attachmentId: "att-1", purpose: "inspect selected attachment", limit: 3 } } },
    ].map((item) => JSON.stringify(item)).join("\n") + "\n";
    const result = await runWrapper({ workspace, apiBaseUrl: fakeEmail.baseUrl, input });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes("workspace-secret-key"), false);
    assert.equal(result.stdout.includes("launch-test-token"), false);
    assert.equal(result.stdout.includes("raw mime should not be returned"), false);
    const lines = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(lines[0].result.serverInfo.name, "email");
    assert.equal(lines[1].result.tools.some((tool) => tool.name === "search_messages"), true);
    assert.equal(lines[1].result.tools.some((tool) => tool.name === "get_message_body"), true);
    const bodyTool = lines[1].result.tools.find((tool) => tool.name === "get_message_body");
    assert.equal(bodyTool.inputSchema.properties.readAll.type, "boolean");
    assert.equal(bodyTool.inputSchema.properties.maxChars.maximum, 100000);
    assert.equal(lines[1].result.tools.some((tool) => tool.name === "get_attachment_content"), true);
    assert.equal(lines[1].result.tools.some((tool) => tool.name === "delete_local_by_search"), true);
    assert.equal(lines[1].result.tools.some((tool) => tool.name === "apply_mail_action_bulk"), true);
    const accounts = JSON.parse(lines[2].result.content[0].text);
    assert.deepEqual(accounts.accounts.map((item) => item.id), ["acct-1"]);
    const message = JSON.parse(lines[3].result.content[0].text);
    assert.equal(message.message.fullBodyAvailable, true);
    assert.equal(message.message.bodyExcerpt, "short excerpt");
    assert.equal(message.message.bodyText, undefined);
    assert.equal(lines[3].result.content[0].text.includes("full private body should not be returned"), false);
    const action = JSON.parse(lines[4].result.content[0].text);
    assert.equal(action.ok, true);
    assert.equal(action.action, "delete_local");
    assert.equal(action.remoteApplied, false);
    assert.equal(action.localOnly, true);
    const searchDelete = JSON.parse(lines[5].result.content[0].text);
    assert.equal(searchDelete.ok, true);
    assert.equal(searchDelete.dry_run, true);
    assert.equal(searchDelete.deleted_count, 0);
    assert.equal(searchDelete.skipped_samples[0].reason, "matched exclude keyword: invoice");
    const bulkDelete = JSON.parse(lines[6].result.content[0].text);
    assert.equal(bulkDelete.ok, true);
    assert.equal(bulkDelete.deleted_count, 1);
    assert.equal(bulkDelete.remoteApplied, false);
    const body = JSON.parse(lines[7].result.content[0].text);
    assert.equal(body.ok, true);
    assert.equal(body.bodyText, "full private body returned only by explicit body tool");
    assert.equal(body.readAll, true);
    assert.equal(body.chunksRead, 3);
    assert.equal(body.truncated, false);
    assert.equal(body.nextOffset, null);
    assert.equal(body.attachmentContentIncluded, false);
    const attachment = JSON.parse(lines[8].result.content[0].text);
    assert.equal(attachment.ok, true);
    assert.equal(attachment.encoding, "base64");
    assert.equal(attachment.localOnly, true);
    const deleteRequest = fakeEmail.requests.find((request) => request.method === "DELETE" && request.url === "/api/messages/msg-1");
    assert.deepEqual(deleteRequest.body, { accountId: "acct-1" });
    const bodyRequests = fakeEmail.requests.filter((request) => request.method === "GET" && request.url.startsWith("/api/mcp/messages/msg-1/body"));
    assert.equal(bodyRequests.length, 3);
    assert.equal(bodyRequests[0].url.includes("offset=0"), true);
    assert.equal(bodyRequests[1].url.includes("offset=20"), true);
    assert.equal(bodyRequests[2].url.includes("offset=40"), true);
    assert.equal(fakeEmail.requests[0].authorization, "Bearer workspace-secret-key");
    assert.deepEqual(fakeEmail.requests[0].body, { workspace_id: "owner", capabilities: ["full_content"] });
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
