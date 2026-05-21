"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createWeixinRuntimeCompositionService,
} = require("../adapters/weixin-runtime-composition-service");

function safeFileName(value) {
  const name = path.basename(String(value || "file")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return name || "file";
}

function mimeFor(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function makeDeps(root) {
  const state = { threads: [], artifacts: [] };
  const broadcasts = [];
  let nextId = 0;

  function makeId(prefix) {
    nextId += 1;
    return `${prefix}-${nextId}`;
  }

  return {
    broadcasts,
    state,
    service: createWeixinRuntimeCompositionService({
      authCanAccessWorkspace(auth, workspaceId) {
        return Boolean(auth?.ok && (auth.workspaceId === "owner" || auth.workspaceId === workspaceId));
      },
      bridgeFileBuffer(file) {
        return Buffer.from(String(file?.contentBase64 || ""), "base64");
      },
      broadcast(event) {
        broadcasts.push(event);
      },
      chatGroupMemberWorkspaceIds() {
        return [];
      },
      compactMessage(message) {
        return {
          id: message.id,
          artifacts: message.artifacts,
          externalDelivery: message.externalDelivery,
        };
      },
      compactText(text, max) {
        return String(text || "").slice(0, max);
      },
      compactThread(thread) {
        return {
          id: thread.id,
          messages: thread.messages.map((message) => ({ id: message.id })),
        };
      },
      dataDir: root,
      deliveryId(threadId, messageId) {
        return `${threadId}:${messageId}`;
      },
      egressPolicyProvider: {
        decide() {
          return { allowed: true, reason: "allowed" };
        },
      },
      ensureWeixinSingleWindowThread(workspaceId) {
        let thread = state.threads.find((item) => item.id === "weixin-thread");
        if (!thread) {
          thread = {
            id: "weixin-thread",
            workspaceId,
            projectId: "",
            subprojectId: "",
            messages: [],
            activeRunIds: [],
          };
          state.threads.push(thread);
        }
        return thread;
      },
      findThreadForAuth() {
        return null;
      },
      findWorkspace(workspaceId) {
        return {
          id: workspaceId,
          label: workspaceId,
          policy: {
            adapter_account_id: "wx-account",
            chat_id: "wx-chat",
          },
        };
      },
      forwardMarkdownMaxBytes: 1024 * 1024,
      isOwnerAuth(auth) {
        return auth?.workspaceId === "owner";
      },
      isWeixinSingleWindowThread(thread) {
        return Boolean(thread && thread.id === "weixin-thread");
      },
      makeId,
      mimeFor,
      normalizeExternalDelivery(value) {
        return value && typeof value === "object" ? Object.assign({}, value) : null;
      },
      normalizeLocalPath(value) {
        return String(value || "");
      },
      nowIso() {
        return "2026-05-18T00:00:00.000Z";
      },
      resolveArtifactForRequest() {
        return { status: 404, error: "Artifact not found" };
      },
      resolveFileForBrowserRequest() {
        return { status: 404, error: "File not found" };
      },
      resolveKanbanOutputFile() {
        return { status: 404, error: "Kanban output not found" };
      },
      safeFileName,
      saveState() {
        state.saved = true;
      },
      spawnSync(_browser, args) {
        const target = args.find((arg) => String(arg).startsWith("--print-to-pdf="));
        if (!target) return { status: 1 };
        const pdfPath = target.slice("--print-to-pdf=".length);
        fs.writeFileSync(pdfPath, Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(700, "x")]));
        return { status: 0 };
      },
      threadAccessibleToAuth() {
        return true;
      },
      threadSummary(thread) {
        return { id: thread.id, workspaceId: thread.workspaceId };
      },
      workspaceLabel(workspaceId) {
        return `Workspace ${workspaceId}`;
      },
    }),
  };
}

async function testInlineMarkdownForwardUsesRuntimeTargetAndPdfMaterialization() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-weixin-runtime-"));
  try {
    const { service, state, broadcasts } = makeDeps(root);
    const result = await service.createWeixinFileForwardDelivery(
      { ok: true, workspaceId: "child" },
      {
        workspaceId: "child",
        inlineFile: {
          filename: "notes.md",
          contentType: "text/markdown; charset=utf-8",
          contentBase64: Buffer.from("# Notes\n", "utf8").toString("base64"),
        },
        caption: "Forward notes",
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.target.accountId, "wx-account");
    assert.equal(result.target.chatId, "wx-chat");
    assert.equal(state.saved, true);
    assert.equal(broadcasts.length, 2);
    assert.equal(state.threads.length, 1);
    assert.equal(state.threads[0].messages.length, 1);

    const message = state.threads[0].messages[0];
    assert.equal(message.externalDelivery.terminalStatus, "manual_forward");
    assert.equal(message.externalDelivery.status, "pending");
    assert.equal(message.artifacts.length, 1);
    assert.equal(message.artifacts[0].mime, "application/pdf");
    assert.match(message.artifacts[0].name, /^notes\.pdf$/);
    assert.ok(fs.existsSync(message.artifacts[0].path));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  await testInlineMarkdownForwardUsesRuntimeTargetAndPdfMaterialization();
  console.log("weixin runtime composition service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
