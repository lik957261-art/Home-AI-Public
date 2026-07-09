"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/message-skill-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  await test("message-skill model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/message-skill-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis|state)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("parses skill objects and normalizes paths", async () => {
    const model = await loadModel();
    assert.deepEqual(model.parseMessageSkillObject('prefix {"path":"skills/music/search/SKILL.md"} suffix'), {
      path: "skills/music/search/SKILL.md",
    });
    assert.equal(model.normalizeMessageSkillPath("skills/music/search/SKILL.md"), "music/search");
    assert.equal(model.normalizeMessageSkillPath('"growth/writing"'), "growth/writing");
    assert.equal(model.normalizeMessageSkillPath("response"), "");
    assert.equal(model.normalizeMessageSkillPath("unsafe path!"), "");
    assert.equal(model.normalizeMessageSkillPath({ bad: true }), "");
  });

  await test("builds skill entries with injected helper metadata", async () => {
    const model = await loadModel();
    const entry = model.messageSkillEntry({ path: "skills/music/search/SKILL.md", label: "Music Search" }, {
      skillEntryFromText(pathValue) {
        return {
          id: "search",
          label: "Search",
          path: pathValue,
          namespace: "music",
        };
      },
    });
    assert.deepEqual(entry, {
      id: "search",
      label: "Music Search",
      path: "music/search",
      namespace: "music",
    });
    assert.deepEqual(model.messageSkillEntry("growth/writing"), {
      id: "writing",
      label: "writing",
      path: "growth/writing",
      namespace: "growth",
    });
  });

  await test("collects direct and run-event skills with stable dedupe and sorting", async () => {
    const model = await loadModel();
    const message = {
      runId: "run-1",
      loadedSkills: ["music/search", "growth/writing"],
      usage: {
        loaded_skills: ["music/search"],
      },
    };
    const thread = {
      events: [
        { runId: "run-1", tool: "skill_view", preview: '{"path":"tools/research"}' },
        { runId: "run-2", tool: "skill_view", preview: '{"path":"ignored"}' },
      ],
    };
    const skills = model.collectMessageSkills(message, thread, {
      skillTitle(skill) {
        return skill.path === "tools/research" ? "A Research" : skill.label;
      },
    });
    assert.deepEqual(skills.map((skill) => skill.path), ["tools/research", "music/search", "growth/writing"]);
    assert.deepEqual([...model.messageRunSkillIds(message)], ["run-1"]);
    assert.equal(model.messageSkillEventPayload(thread.events[0]).path, "tools/research");
  });

  await test("collects direct and run-event tools", async () => {
    const model = await loadModel();
    const message = {
      runId: "run-1",
      loadedTools: ["web_search", { name: "file.lookup" }],
      usage: {
        tools: ["web_search"],
      },
    };
    const thread = {
      events: [
        { run_id: "run-1", tool: "function_call", preview: '{"name":"calendar.create"}' },
        { run_id: "run-1", tool: "function_call_output", preview: "message" },
      ],
    };
    assert.equal(model.messageToolNameFromValue('{"name":"calendar.create"}'), "calendar.create");
    assert.equal(model.messageToolNameFromValue("function_call"), "");
    assert.deepEqual(model.collectMessageTools(message, thread).map((tool) => tool.name), [
      "calendar.create",
      "file.lookup",
      "web_search",
    ]);
  });

  await test("plans skill panel view state without owning html", async () => {
    const model = await loadModel();
    const plan = model.messageSkillPanelPlan({
      runId: "run-1",
      skills: ["music/search"],
      tools: ["web_search"],
    }, {
      events: [],
    });
    assert.equal(plan.version, model.MESSAGE_SKILL_MODEL_VERSION);
    assert.equal(plan.visible, true);
    assert.equal(plan.label, "1 skill, 1 tool");
    assert.equal(plan.summary, "Skill · Tool");
    assert.deepEqual(plan.skills.map((skill) => skill.path), ["music/search"]);
    assert.deepEqual(plan.tools.map((tool) => tool.name), ["web_search"]);
    assert.equal(model.messageSkillPanelPlan({}, {}).visible, false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
