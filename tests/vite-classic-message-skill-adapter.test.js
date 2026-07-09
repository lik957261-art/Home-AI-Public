"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-message-skill-ui.js"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportMessageSkillModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    } : {},
    state: {
      currentThread: {
        events: [],
      },
    },
    escapeHtml,
    skillEntryFromText(pathValue) {
      calls.push(["skillEntryFromText", pathValue]);
      const parts = String(pathValue || "").split("/").filter(Boolean);
      return {
        id: parts[parts.length - 1] || pathValue,
        label: `entry:${parts[parts.length - 1] || pathValue}`,
        namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
        path: pathValue,
      };
    },
    skillTitle(skill) {
      calls.push(["skillTitle", skill?.path || skill?.name]);
      return `title:${skill?.label || skill?.name || skill?.id || ""}`;
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__messageSkillHarness = {
  MESSAGE_SKILL_MODEL_ESM_PATH,
  importMessageSkillModel,
  currentMessageSkillModel,
  parseMessageSkillObject,
  normalizeMessageSkillPath,
  messageSkillEntry,
  messageDirectSkillArrays,
  messageRunSkillIds,
  messageSkillEventPayload,
  messageToolNameFromValue,
  collectMessageSkills,
  collectMessageTools,
  renderMessageSkillItem,
  renderMessageToolItem,
  renderMessageSkillPanel,
};`, context, { filename: "app-message-skill-ui.js" });
  return context;
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
  await test("classic message-skill adapter declares bounded ESM import path", () => {
    assert.match(source, /MESSAGE_SKILL_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/message-skill-model\/message-skill-model\.js/);
    assert.match(source, /__homeAiImportMessageSkillModel/);
    assert.match(source, /importMessageSkillModel/);
    assert.match(source, /currentMessageSkillModel/);
    assert.match(source, /messageSkillPanelPlan/);
  });

  await test("classic adapter consumes ESM model for pure skill panel planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      parseMessageSkillObject(value) {
        modelCalls.push(["parseMessageSkillObject", value]);
        return { path: "model/path" };
      },
      normalizeMessageSkillPath(value) {
        modelCalls.push(["normalizeMessageSkillPath", value]);
        return "model/path";
      },
      messageSkillEntry(raw, helpers) {
        modelCalls.push(["messageSkillEntry", raw, typeof helpers.skillEntryFromText]);
        return { id: "model-path", label: "Model Path", path: "model/path", namespace: "model" };
      },
      messageDirectSkillArrays() {
        modelCalls.push(["messageDirectSkillArrays"]);
        return [["model/path"]];
      },
      messageRunSkillIds() {
        modelCalls.push(["messageRunSkillIds"]);
        return new Set(["run-model"]);
      },
      messageSkillEventPayload() {
        modelCalls.push(["messageSkillEventPayload"]);
        return { path: "model/event" };
      },
      messageToolNameFromValue() {
        modelCalls.push(["messageToolNameFromValue"]);
        return "model.tool";
      },
      collectMessageSkills(_message, _thread, helpers) {
        modelCalls.push(["collectMessageSkills", typeof helpers.skillTitle]);
        return [{ id: "skill", label: "Model Skill", path: "model/skill", namespace: "model" }];
      },
      collectMessageTools() {
        modelCalls.push(["collectMessageTools"]);
        return [{ id: "model.tool", label: "Model Tool", name: "model.tool" }];
      },
      messageSkillPanelPlan(_message, _thread, helpers) {
        modelCalls.push(["messageSkillPanelPlan", typeof helpers.skillEntryFromText]);
        return {
          visible: true,
          skills: [{ id: "skill", label: "Model Skill", path: "model/skill", namespace: "model" }],
          tools: [{ id: "model.tool", label: "Model Tool", name: "model.tool" }],
          label: "1 skill, 1 tool",
          summary: "Skill · Tool",
        };
      },
    };
    const context = createHarness(fakeModel);
    const harness = context.__messageSkillHarness;
    await harness.importMessageSkillModel(context.window);
    assert.equal(harness.MESSAGE_SKILL_MODEL_ESM_PATH, "/vite-islands/message-skill-model/message-skill-model.js");
    assert.ok(context.__calls.some((call) => call[0] === "import" && call[1] === "/vite-islands/message-skill-model/message-skill-model.js"));
    assert.deepEqual(harness.parseMessageSkillObject("x"), { path: "model/path" });
    assert.equal(harness.normalizeMessageSkillPath("x"), "model/path");
    assert.deepEqual(harness.messageSkillEntry("x"), { id: "model-path", label: "Model Path", path: "model/path", namespace: "model" });
    assert.deepEqual(JSON.parse(JSON.stringify(harness.messageDirectSkillArrays({}))), [["model/path"]]);
    assert.deepEqual([...harness.messageRunSkillIds({})], ["run-model"]);
    assert.deepEqual(harness.messageSkillEventPayload({}), { path: "model/event" });
    assert.equal(harness.messageToolNameFromValue("x"), "model.tool");
    assert.deepEqual(JSON.parse(JSON.stringify(harness.collectMessageSkills({}, {}).map((item) => item.path))), ["model/skill"]);
    assert.deepEqual(JSON.parse(JSON.stringify(harness.collectMessageTools({}, {}).map((item) => item.name))), ["model.tool"]);
    const html = harness.renderMessageSkillPanel({}, {});
    assert.match(html, /class="message-skills"/);
    assert.match(html, /aria-label="1 skill, 1 tool"/);
    assert.match(html, /Skill · Tool/);
    assert.match(html, /data-skill-path="model\/skill"/);
    assert.match(html, /data-message-tool="Model Tool"/);
    assert.ok(modelCalls.some((call) => call[0] === "messageSkillPanelPlan"));
  });

  await test("classic adapter preserves legacy behavior before model load", () => {
    const context = createHarness(null);
    const harness = context.__messageSkillHarness;
    const message = {
      runId: "run-1",
      loadedSkills: ["skills/music/search/SKILL.md", "response"],
      usage: {
        tools: ["web_search"],
      },
    };
    const thread = {
      events: [
        { runId: "run-1", tool: "skill_view", preview: '{"path":"growth/writing"}' },
        { runId: "run-1", tool: "function_call", preview: '{"name":"calendar.create"}' },
      ],
    };
    assert.equal(harness.normalizeMessageSkillPath("skills/music/search/SKILL.md"), "music/search");
    assert.equal(harness.normalizeMessageSkillPath("response"), "");
    assert.equal(harness.messageSkillEntry("music/search").label, "entry:search");
    assert.deepEqual(JSON.parse(JSON.stringify(harness.collectMessageSkills(message, thread).map((item) => item.path))), ["music/search", "growth/writing"]);
    assert.deepEqual(JSON.parse(JSON.stringify(harness.collectMessageTools(message, thread).map((item) => item.name))), ["calendar.create", "web_search"]);
    const html = harness.renderMessageSkillPanel(message, thread);
    assert.match(html, /title="2 skills, 2 tools"/);
    assert.match(html, /Skill · Tool/);
    assert.match(html, /data-skill-path="music\/search"/);
    assert.match(html, /data-skill-path="growth\/writing"/);
    assert.match(html, /data-message-tool="calendar.create"/);
    assert.match(html, /data-message-tool="web_search"/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
