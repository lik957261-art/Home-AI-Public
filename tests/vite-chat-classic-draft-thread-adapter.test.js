"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-draft-thread-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const apiCalls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatComposerDraftThreadModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    Date: class extends Date {
      constructor(...args) {
        if (args.length) {
          super(...args);
          return;
        }
        super("2026-07-04T06:00:00.000Z");
      }

      static now() {
        return 1783144800000;
      }
    },
    state: {
      draftThreadSeq: 4,
      selectedWorkspaceId: "owner",
      selectedProjectId: "project_1",
      selectedSubprojectId: "sub_1",
      currentThread: {
        id: "draft_1783144800000_5",
        draft: true,
        workspaceId: "owner",
        projectId: "project_1",
        subprojectId: "sub_1",
        title: "New thread",
      },
      currentThreadId: "draft_1783144800000_5",
      threads: [{ id: "draft_1783144800000_5", draft: true }],
    },
    api(url, options = {}) {
      apiCalls.push({ url, options });
      return Promise.resolve({
        thread: {
          id: "thread_1",
          title: "New thread",
          updatedAt: "2026-07-04T06:00:01.000Z",
        },
      });
    },
    summarizeThread(thread) {
      calls.push(["summarizeThread", thread.id]);
      return { id: thread.id, title: thread.title, summarized: true };
    },
    renderThreads() {
      calls.push(["renderThreads"]);
    },
    renderCurrentThread(options = {}) {
      calls.push(["renderCurrentThread", options]);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-draft-thread-ui.js" });
  return { apiCalls, calls, context };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("classic draft thread adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_DRAFT_THREAD_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-draft-thread-model\/chat-composer-draft-thread-model\.js/);
    assert.match(source, /__homeAiImportChatComposerDraftThreadModel/);
    assert.match(source, /currentChatComposerDraftThreadModel/);
    assert.match(source, /createDraftThreadPlan/);
    assert.match(source, /materializeDraftThreadRequestPlan/);
    assert.match(source, /isSharedProjectRecord/);
  });

  await test("classic adapter uses ESM model for draft creation and shared project checks", async () => {
    const fakeModel = {
      isDraftThreadRecord(thread) {
        return thread?.id === "draft_custom";
      },
      createDraftThreadPlan(input = {}) {
        assert.equal(input.sequence, 4);
        assert.equal(input.workspaceId, "owner");
        return {
          sequence: 5,
          thread: {
            id: "draft_custom",
            title: "Model draft",
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            subprojectId: input.subprojectId,
            singleWindow: false,
            draft: true,
            hermesSessionId: "",
            status: "draft",
            activeRunId: null,
            activeRunIds: [],
            createdAt: input.nowIso,
            updatedAt: input.nowIso,
            messages: [],
            events: [],
            preview: "",
          },
        };
      },
      isSharedProjectRecord(project) {
        return project?.source === "shared-model";
      },
    };
    const { context } = createHarness(fakeModel);
    await context.importChatComposerDraftThreadModel(context.window);

    const thread = context.createDraftThread();

    assert.equal(context.importedPath, "/vite-islands/chat-composer-draft-thread-model/chat-composer-draft-thread-model.js");
    assert.equal(thread.id, "draft_custom");
    assert.equal(context.state.draftThreadSeq, 5);
    assert.equal(context.isDraftThread({ id: "draft_custom" }), true);
    assert.equal(context.isSharedProject({ source: "shared-model" }), true);
  });

  await test("classic adapter uses ESM materialize plan while preserving render flow", async () => {
    const fakeModel = {
      isDraftThreadRecord(thread) {
        return Boolean(thread?.draft);
      },
      materializeDraftThreadRequestPlan(thread) {
        return {
          draft: true,
          draftId: thread.id,
          body: {
            workspaceId: "owner",
            projectId: "project_1",
            subprojectId: "sub_1",
            title: "Planned title",
          },
        };
      },
    };
    const { apiCalls, calls, context } = createHarness(fakeModel);
    await context.importChatComposerDraftThreadModel(context.window);

    const materialized = await context.materializeCurrentThread();

    assert.equal(materialized.id, "thread_1");
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].url, "/api/threads");
    assert.equal(apiCalls[0].options.method, "POST");
    assert.equal(apiCalls[0].options.body, JSON.stringify({
      workspaceId: "owner",
      projectId: "project_1",
      subprojectId: "sub_1",
      title: "Planned title",
    }));
    assert.equal(context.state.currentThreadId, "thread_1");
    assert.deepEqual(context.state.threads, [{ id: "thread_1", title: "New thread", summarized: true }]);
    assert.equal(JSON.stringify(calls), JSON.stringify([
      ["summarizeThread", "thread_1"],
      ["renderThreads"],
      ["renderCurrentThread", { stickToBottom: true }],
    ]));
  });

  await test("classic fallback remains usable without loaded ESM model", async () => {
    const { apiCalls, context } = createHarness({});
    const thread = context.createDraftThread();
    assert.equal(thread.id, "draft_1783144800000_5");
    assert.equal(context.isDraftThread(thread), true);
    assert.equal(context.isSharedProject({ source: "shared-allowed-root-owner" }), true);

    await context.materializeCurrentThread();
    assert.equal(apiCalls[0].options.body, JSON.stringify({
      workspaceId: "owner",
      projectId: "project_1",
      subprojectId: "sub_1",
      title: "New thread",
    }));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
