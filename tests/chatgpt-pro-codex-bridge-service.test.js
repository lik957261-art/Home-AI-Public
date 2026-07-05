"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildCodexPrompt,
  createChatGptProCodexBridgeService,
  defaultOutputDir,
  defaultWorkspace,
  extractFinalAssistantText,
  isActiveThread,
} = require("../adapters/chatgpt-pro-codex-bridge-service");

async function testStartsCodexMobileThreadAndReturnsFinalAssistantText() {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/threads/new-message")) {
      const body = JSON.parse(options.body);
      assert.equal(body.cwd, "C:\\Work");
      assert.equal(body.model, "gpt-5.5");
      assert.equal(body.effort, "medium");
      assert.equal(body.permissionMode, "auto");
      assert.match(body.text, /must use the Chrome plugin \/ Chrome skill/);
      assert.match(body.text, /Do not impersonate ChatGPT Pro output/);
      assert.match(body.text, /tmp\\chatgpt-pro/);
      assert.match(body.text, /Do not create generated files under the Hermes Mobile source checkout/);
      return { ok: true, text: async () => JSON.stringify({ threadId: "thread_1" }) };
    }
    if (url.endsWith("/api/threads/thread_1/name")) {
      const body = JSON.parse(options.body);
      assert.equal(body.name, "ChatGPT Pro");
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    }
    if (url.endsWith("/api/threads/thread_1")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          thread: {
            status: { type: "completed" },
            turns: [
              { items: [{ role: "assistant", text: "Completed: ChatGPT Pro generated the report. File: C:\\Report.docx" }] },
            ],
          },
        }),
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = createChatGptProCodexBridgeService({
    fetch: fakeFetch,
    key: "test-key",
    baseUrl: "http://codex.local",
    workspace: "C:\\Work",
    outputDir: "C:\\ProgramData\\HermesMobile\\data\\tmp\\chatgpt-pro",
    pollIntervalMs: 1,
    timeoutMs: 1000,
    statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-pro-new-")), "state.json"),
  });
  const result = await service.generate({
    title: "Tesla FSD report",
    prompt: "Generate Word",
    output_format: "docx",
  });
  assert.equal(result.ok, true);
  assert.equal(result.threadId, "thread_1");
  assert.equal(result.threadName, "ChatGPT Pro");
  assert.match(result.result_text, /C:\\Report\.docx/);
  assert.equal(calls[0].options.headers["x-codex-mobile-key"], "test-key");
}

async function testReusesPersistedNamedCodexMobileThread() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-pro-state-"));
  const statePath = path.join(tempDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({ threadId: "thread_existing", threadName: "ChatGPT Pro" }), "utf8");
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/threads/thread_existing") && options.method === "GET") {
      return {
        ok: true,
        text: async () => JSON.stringify({
          thread: { id: "thread_existing", name: "ChatGPT Pro", status: { type: "idle" }, turns: [] },
        }),
      };
    }
    if (url.endsWith("/api/threads/thread_existing/name")) {
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    }
    if (url.endsWith("/api/threads/thread_existing/messages")) {
      const body = JSON.parse(options.body);
      assert.match(body.text, /must use the Chrome plugin \/ Chrome skill/);
      return { ok: true, text: async () => JSON.stringify({ turn: { id: "turn_2" } }) };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = createChatGptProCodexBridgeService({
    fetch: fakeFetch,
    key: "test-key",
    baseUrl: "http://codex.local",
    workspace: "C:\\Work",
    pollIntervalMs: 1,
    timeoutMs: 200,
    statePath,
  });
  const result = await service.generate({ prompt: "Generate text" });
  assert.equal(result.ok, false);
  assert.equal(result.threadId, "thread_existing");
  assert.equal(result.error, "codex_thread_finished_without_result");
  assert.ok(calls.some((call) => call.url.endsWith("/api/threads/thread_existing/messages")));
  assert.ok(!calls.some((call) => call.url.endsWith("/api/threads/new-message")));
}

function testPromptKeepsChatGptProBoundary() {
  const prompt = buildCodexPrompt({
    title: "A",
    prompt: "Generate a report",
    output_format: "docx",
    delivery_mode: "artifact",
    output_dir: "C:\\ProgramData\\HermesMobile\\data\\tmp\\chatgpt-pro",
  });
  assert.match(prompt, /ChatGPT Pro execution thread/);
  assert.match(prompt, /Do not fall back to another model/);
  assert.match(prompt, /temporary output directory/);
  assert.match(prompt, /Do not create generated files under the Hermes Mobile source checkout/);
  assert.match(prompt, /repo-level outputs\/ directory/);
  assert.match(prompt, /create a locally openable \.docx file in the temporary output directory/);
  assert.match(prompt, /Answer in Chinese for parent-facing analysis/);
}

async function testPermissionModeCanBeExplicitlyOverridden() {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/threads/new-message")) {
      return { ok: true, text: async () => JSON.stringify({ threadId: "thread_1" }) };
    }
    if (url.endsWith("/api/threads/thread_1/name")) {
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    }
    if (url.endsWith("/api/threads/thread_1")) {
      return { ok: true, text: async () => JSON.stringify({ thread: { status: { type: "completed" }, turns: [] } }) };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = createChatGptProCodexBridgeService({
    fetch: fakeFetch,
    key: "test-key",
    permissionMode: "full",
    pollIntervalMs: 1,
    timeoutMs: 1000,
    statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-pro-permission-")), "state.json"),
  });
  await service.generate({ prompt: "Generate text" });
  const newMessageCall = calls.find((call) => call.url.endsWith("/api/threads/new-message"));
  assert.ok(newMessageCall);
  const body = JSON.parse(newMessageCall.options.body);
  assert.equal(body.permissionMode, "full");
}

async function testMacEnvironmentDefaultsAreUsedForCodexMobileRequest() {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/threads/new-message")) {
      return { ok: true, text: async () => JSON.stringify({ threadId: "thread_1" }) };
    }
    if (url.endsWith("/api/threads/thread_1/name")) {
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    }
    if (url.endsWith("/api/threads/thread_1")) {
      return { ok: true, text: async () => JSON.stringify({ thread: { status: { type: "completed" }, turns: [] } }) };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = createChatGptProCodexBridgeService({
    env: {
      HERMES_WEB_CHATGPT_PRO_CODEX_MOBILE_URL: "http://codex-web.local",
      HERMES_WEB_CHATGPT_PRO_WORKSPACE: "/Users/example/path",
      HERMES_WEB_CHATGPT_PRO_OUTPUT_DIR: "/Users/example/path",
      HOME: "/Users/example-operator",
    },
    fetch: fakeFetch,
    key: "test-key",
    pollIntervalMs: 1,
    timeoutMs: 1000,
    statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-pro-mac-")), "state.json"),
  });
  await service.generate({ prompt: "Generate text" });
  const newMessageCall = calls.find((call) => call.url.endsWith("/api/threads/new-message"));
  assert.ok(newMessageCall);
  assert.match(newMessageCall.url, /^http:\/\/codex-web\.local\//);
  const body = JSON.parse(newMessageCall.options.body);
  assert.equal(body.cwd, "/Users/example/path");
  assert.match(body.text, /\/Users\/example-operator\/\.codex-mobile-web\/outputs\/chatgpt-pro/);
}

function testDefaultOutputDirStaysOutsideWorkspace() {
  assert.equal(
    defaultOutputDir({ HERMES_MOBILE_DATA_DIR: "C:\\ProgramData\\HermesMobile\\data" }),
    "C:\\ProgramData\\HermesMobile\\data\\tmp\\chatgpt-pro",
  );
  assert.equal(
    defaultOutputDir({ HERMES_MOBILE_DATA_DIR: "/var/lib/hermes-mobile/data" }),
    "/var/lib/hermes-mobile/data/tmp/chatgpt-pro",
  );
}

function testDefaultWorkspaceIsPlatformAware() {
  assert.equal(
    defaultWorkspace({}, "win32"),
    "C:\\Users\\xuxin\\Documents\\Agent",
  );
  assert.equal(
    defaultWorkspace({}, "darwin"),
    "/Users/example/path",
  );
  assert.equal(
    defaultWorkspace({ HERMES_MOBILE_DEV_ROOT: "/Users/example/path" }, "darwin"),
    "/Users/example/path",
  );
}

function testThreadStatusAndExtraction() {
  assert.equal(isActiveThread({ status: { type: "active" } }), true);
  assert.equal(isActiveThread({ status: { type: "completed" } }), false);
  const text = extractFinalAssistantText({
    thread: {
      turns: [
        { items: [{ role: "user", text: "user request should not be extracted" }] },
        { items: [{ type: "agentMessage", phase: "final_answer", text: "This is the final ChatGPT Pro result with enough length to be extracted." }] },
      ],
    },
  });
  assert.match(text, /final ChatGPT Pro result/);
  assert.doesNotMatch(text, /user request/);
}
async function main() {
  await testStartsCodexMobileThreadAndReturnsFinalAssistantText();
  await testReusesPersistedNamedCodexMobileThread();
  testPromptKeepsChatGptProBoundary();
  await testPermissionModeCanBeExplicitlyOverridden();
  await testMacEnvironmentDefaultsAreUsedForCodexMobileRequest();
  testDefaultOutputDirStaysOutsideWorkspace();
  testDefaultWorkspaceIsPlatformAware();
  testThreadStatusAndExtraction();
  console.log("chatgpt-pro-codex-bridge-service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
