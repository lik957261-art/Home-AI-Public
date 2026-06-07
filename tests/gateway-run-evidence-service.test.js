"use strict";

const assert = require("node:assert/strict");
const evidence = require("../adapters/gateway-run-evidence-service");

function skill(path, namespace, id) {
  return { id, label: id, namespace, path };
}

function testLoadedSkillReferenceNormalization() {
  assert.deepEqual(
    evidence.loadedSkillFromRunEvent({
      tool: "skill_view",
      preview: "{\"name\":\"skills/productivity/wardrobe-style-operations/SKILL.md\"}",
    }),
    skill("productivity/wardrobe-style-operations", "productivity", "wardrobe-style-operations"),
  );
  assert.equal(evidence.loadedSkillFromRunEvent({ tool: "function_call", preview: "{\"name\":\"productivity/write\"}" }), null);
  assert.equal(evidence.loadedSkillFromRunEvent({ tool: "skill_view", preview: "bad path!" }), null);
}

function testLoadedSkillsForRunFiltersAndDedupeByRunId() {
  const thread = {
    events: [
      { runId: "run_1", tool: "skill_view", preview: "{\"name\":\"productivity/write\"}" },
      { runId: "run_1", tool: "skill_view", preview: "{\"name\":\"skills/productivity/write/SKILL.md\"}" },
      { runId: "run_2", tool: "skill_view", preview: "{\"name\":\"productivity/ignore\"}" },
    ],
  };

  assert.deepEqual(evidence.loadedSkillsForRun(thread, ["run_1", "missing"]), [
    skill("productivity/write", "productivity", "write"),
  ]);
}

function testOutputItemPreviewStaysBoundedAndNonSecret() {
  const preview = evidence.outputItemPreview({
    type: "function_call",
    name: "mobile_web_search",
    call_id: "call_1",
    arguments: "{\"query\":\"raw private query should not be stored\"}",
  });
  assert.equal(preview, "{\"name\":\"mobile_web_search\",\"callId\":\"call_1\"}");
  assert.equal(preview.includes("raw private"), false);
  assert.equal(
    evidence.outputItemPreview({ name: "skill_view", arguments: "{\"name\":\"study/template\"}" }),
    "{\"name\":\"study/template\"}",
  );
}

function testOutputItemCallOutputCanResolvePreviousFunctionName() {
  const thread = {
    events: [
      {
        runId: "run_1",
        tool: "function_call",
        preview: "{\"name\":\"schedule_task\",\"callId\":\"call_schedule\"}",
      },
    ],
  };
  assert.equal(evidence.runToolNameForCallId(thread, "run_1", "call_schedule"), "schedule_task");
  assert.equal(evidence.runToolNameForCallId(thread, "run_2", "call_schedule"), "");
}

function testLoadedToolsFromRunAndCompletedResponse() {
  const thread = {
    events: [
      { runId: "run_1", tool: "function_call", preview: "{\"name\":\"x_search\",\"callId\":\"call_1\"}" },
      { runId: "run_1", tool: "function_call_output", preview: "{\"name\":\"x_search\",\"callId\":\"call_1\"}" },
      { runId: "run_2", tool: "function_call", preview: "{\"name\":\"ignore\"}" },
    ],
  };
  assert.deepEqual(evidence.loadedToolsForRun(thread, "run_1"), [
    { id: "x_search", name: "x_search", label: "x_search" },
  ]);
  assert.deepEqual(
    evidence.loadedToolsFromCompletedResponse({
      response: {
        output: [
          { type: "web_search_call", id: "search_1" },
          { type: "function_call", name: "skill_view", arguments: "{\"name\":\"productivity/write\"}" },
        ],
      },
    }),
    [{ id: "web_search_call", name: "web_search_call", label: "web_search_call" }],
  );
}

function testExtractOutputItemTextOnlyReadsMessageOutputText() {
  assert.equal(
    evidence.extractOutputItemText({ type: "message", content: [{ type: "output_text", text: "A" }, { type: "input_text", text: "B" }] }),
    "A",
  );
  assert.equal(evidence.extractOutputItemText({ type: "function_call", text: "private" }), "");
}

testLoadedSkillReferenceNormalization();
testLoadedSkillsForRunFiltersAndDedupeByRunId();
testOutputItemPreviewStaysBoundedAndNonSecret();
testOutputItemCallOutputCanResolvePreviousFunctionName();
testLoadedToolsFromRunAndCompletedResponse();
testExtractOutputItemTextOnlyReadsMessageOutputText();

console.log("gateway run evidence service tests passed");
