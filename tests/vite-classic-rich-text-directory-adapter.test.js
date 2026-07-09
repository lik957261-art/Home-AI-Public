"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-rich-text-directory-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    URL,
    location: { origin: "http://127.0.0.1:8797" },
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportRichTextDirectoryModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    } : undefined,
    localStorage: {
      getItem(key) {
        if (key === "hermesWebWorkspace") return "owner";
        return "";
      },
      setItem(key, value) {
        calls.push(["localStorage.setItem", key, value]);
      },
    },
    state: {
      displayConfig: { ownerDriveRootNames: ["ChatGPT-Drive"] },
      projects: [
        {
          id: "health",
          label: "Health",
          root: "/data/Health",
          children: [{ id: "labs", label: "Labs", root: "/data/Health/Labs" }],
        },
      ],
      currentThread: null,
    },
    currentWorkspace() {
      return { id: "owner", label: "Owner", defaultWorkspace: "/data" };
    },
    projectDisplayLabel(project) {
      return project?.label || project?.id || "Project";
    },
    directoryAliasItemsForAliases() {
      return [
        {
          displayAlias: { label: "Labs", path: "/data/Health/Labs" },
          route: { projectId: "health", subprojectId: "labs", label: "Labs", root: "/data/Health/Labs" },
        },
      ];
    },
    messageDirectoryAliases() {
      return [];
    },
    explicitTaskDirectoryAliases() {
      return [];
    },
    isDeliveryDirectoryAlias() {
      return false;
    },
    isSingleWindowConversationTaskGroupId() {
      return false;
    },
    taskGroupsForThread() {
      return [];
    },
    messageTaskGroup() {
      return null;
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__richTextDirectoryHarness = {
  RICH_TEXT_DIRECTORY_MODEL_ESM_PATH,
  importRichTextDirectoryModel,
  currentRichTextDirectoryModel,
  cleanDisplayText,
  streamingReceiptPreviewText,
  renderInlineMarkdownImage,
  extractDirectoryAliases,
  resolveDirectoryProjectRoute,
  renderDirectoryAliases,
};`, context, { filename: "app-rich-text-directory-ui.js" });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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
  await test("classic rich text directory adapter declares bounded ESM import path", () => {
    assert.match(source, /RICH_TEXT_DIRECTORY_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/rich-text-directory-model\/rich-text-directory-model\.js/);
    assert.match(source, /__homeAiImportRichTextDirectoryModel/);
    assert.match(source, /importRichTextDirectoryModel/);
    assert.match(source, /currentRichTextDirectoryModel/);
    assert.match(source, /inlineMarkdownImagePlan/);
    assert.match(source, /directoryAliasChipPlans/);
  });

  await test("classic adapter consumes ESM text and inline image plans", async () => {
    const fakeModel = {
      cleanDisplayTextPlan() {
        return "model-clean";
      },
      streamingReceiptPreviewTextPlan() {
        return "model-preview";
      },
      inlineMarkdownImagePlan() {
        return {
          visible: true,
          src: `/private/bad"<cover>.jpg`,
          displaySrc: "placeholder",
          authenticatedFetch: true,
          alt: `bad"<alt>`,
          title: `bad"<title>`,
          state: "pending",
        };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__richTextDirectoryHarness.importRichTextDirectoryModel(harness.window);
    assert.equal(harness.__richTextDirectoryHarness.currentRichTextDirectoryModel(), fakeModel);
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/rich-text-directory-model/rich-text-directory-model.js"]);
    assert.equal(harness.__richTextDirectoryHarness.cleanDisplayText("classic"), "model-clean");
    assert.equal(harness.__richTextDirectoryHarness.streamingReceiptPreviewText("classic"), "model-preview");
    const image = harness.__richTextDirectoryHarness.renderInlineMarkdownImage(`alt`, "/private/cover.jpg", "title");
    assert.match(image, /src="placeholder"/);
    assert.match(image, /alt="bad&quot;&lt;alt&gt;"/);
    assert.match(image, /title="bad&quot;&lt;title&gt;"/);
    assert.match(image, /data-hermes-inline-image-src="\/private\/bad&quot;&lt;cover&gt;\.jpg"/);
  });

  await test("classic adapter keeps fallback behavior without ESM", () => {
    const harness = createHarness();
    assert.equal(harness.__richTextDirectoryHarness.cleanDisplayText("A\nMEDIA: `/tmp/x`\n\n\nB"), "A\n\nB");
    assert.equal(harness.__richTextDirectoryHarness.streamingReceiptPreviewText("1\n2\n3\n4\n5\n6\n7"), "2\n3\n4\n5\n6\n7");
    const aliases = harness.__richTextDirectoryHarness.extractDirectoryAliases("目录别名：Health=/data/Health。正文");
    assert.deepEqual(plain(aliases), {
      text: "正文",
      aliases: [{ label: "Health", path: "/data/Health" }],
    });
    const route = harness.__richTextDirectoryHarness.resolveDirectoryProjectRoute({ label: "Health", path: "/data/Health/Labs" });
    assert.equal(route.projectId, "health");
  });

  await test("classic adapter uses ESM alias chip plans while keeping HTML escaping local", async () => {
    const fakeModel = {
      directoryAliasChipPlans() {
        return [
          {
            kind: "route",
            reference: true,
            label: `bad"<route>`,
            title: `bad"<route>`,
            directoryPath: `/data/bad"<path>`,
            projectId: `health"<id>`,
            subprojectId: `labs"<id>`,
          },
        ];
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__richTextDirectoryHarness.importRichTextDirectoryModel(harness.window);
    const html = harness.__richTextDirectoryHarness.renderDirectoryAliases([{ label: "Labs", path: "/data/Health/Labs" }], {});
    assert.match(html, /directory-alias-chip-reference/);
    assert.match(html, /bad&quot;&lt;route&gt;/);
    assert.match(html, /data-project-id="health&quot;&lt;id&gt;"/);
    assert.match(html, /data-directory-path="\/data\/bad&quot;&lt;path&gt;"/);
  });
})();
