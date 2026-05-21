"use strict";

const assert = require("node:assert/strict");
const {
  SEARCH_SOURCE_LOCAL,
  SEARCH_SOURCE_MODE_AUTO,
  SEARCH_SOURCE_MODE_LOCAL,
  SEARCH_SOURCE_MODE_MANUAL,
  SEARCH_SOURCE_WEB,
  SEARCH_SOURCE_X,
  normalizeSearchSourceMode,
  normalizeSearchSource,
  resolveSearchSourceForMessage,
  searchSourceAccessPolicyContext,
  searchSourceFromCommand,
  searchSourceInstructions,
} = require("../adapters/search-source-routing-service");

function testNormalizeAndCommands() {
  assert.equal(normalizeSearchSource(""), SEARCH_SOURCE_LOCAL);
  assert.equal(normalizeSearchSource("web_search"), SEARCH_SOURCE_WEB);
  assert.equal(normalizeSearchSource("\u7f51\u7edc\u641c\u7d22"), SEARCH_SOURCE_WEB);
  assert.equal(normalizeSearchSource("x_search"), SEARCH_SOURCE_X);
  assert.equal(normalizeSearchSource("Twitter Search"), SEARCH_SOURCE_X);
  assert.equal(normalizeSearchSource("\u672c\u5730\u6570\u636e"), SEARCH_SOURCE_LOCAL);
  assert.equal(normalizeSearchSourceMode("auto"), SEARCH_SOURCE_MODE_AUTO);
  assert.equal(normalizeSearchSourceMode("\u624b\u52a8"), SEARCH_SOURCE_MODE_MANUAL);
  assert.equal(normalizeSearchSourceMode("default"), SEARCH_SOURCE_MODE_LOCAL);

  assert.deepEqual(searchSourceFromCommand("#X\u641c\u7d22 \u770b\u4e00\u4e0b\u8fd9\u4e2a\u4e8b"), {
    source: SEARCH_SOURCE_X,
    explicit: true,
    mode: SEARCH_SOURCE_MODE_AUTO,
    commandExplicit: true,
    autoDetected: true,
  });
  assert.deepEqual(searchSourceFromCommand("\u8bf7 #\u7f51\u7edc\u641c\u7d22 \u6838\u5bf9"), {
    source: SEARCH_SOURCE_WEB,
    explicit: true,
    mode: SEARCH_SOURCE_MODE_AUTO,
    commandExplicit: true,
    autoDetected: true,
  });
  assert.deepEqual(searchSourceFromCommand("#\u672c\u5730\u6570\u636e \u7ee7\u7eed"), {
    source: SEARCH_SOURCE_LOCAL,
    explicit: true,
    mode: SEARCH_SOURCE_MODE_LOCAL,
    commandExplicit: true,
    autoDetected: false,
  });
  const semantic = searchSourceFromCommand("\u5728 X \u4e0a\u641c\u6700\u65b0\u8ba8\u8bba");
  assert.equal(semantic.source, SEARCH_SOURCE_X);
  assert.equal(semantic.mode, SEARCH_SOURCE_MODE_AUTO);
  assert.equal(semantic.autoDetected, true);
}

function testPolicyAndInstructions() {
  assert.equal(searchSourceAccessPolicyContext("local"), null);
  assert.deepEqual(searchSourceAccessPolicyContext("web"), {
    allowed_toolsets: ["web", "search"],
  });
  assert.deepEqual(searchSourceAccessPolicyContext("x"), {
    allowed_toolsets: ["x_search", "web", "search"],
  });
  assert.match(searchSourceInstructions("web"), /Web search/);
  assert.match(searchSourceInstructions("x"), /`x_search`/);
  assert.match(searchSourceInstructions("x", "auto"), /inferred/);
}

function testResolvePrecedence() {
  const fromBody = resolveSearchSourceForMessage({ search_source: "web" }, "plain text");
  assert.equal(fromBody.source, SEARCH_SOURCE_WEB);
  assert.equal(fromBody.sourceIntent, "web_search");
  assert.equal(fromBody.explicit, true);
  assert.equal(fromBody.sourceMode, SEARCH_SOURCE_MODE_MANUAL);
  assert.equal(fromBody.manualExplicit, true);
  assert.equal(fromBody.bodyExplicit, true);
  assert.equal(fromBody.commandExplicit, false);

  const manualBodyWins = resolveSearchSourceForMessage({ search_source: "web" }, "#X\u641c\u7d22 latest");
  assert.equal(manualBodyWins.source, SEARCH_SOURCE_WEB);
  assert.equal(manualBodyWins.sourceMode, SEARCH_SOURCE_MODE_MANUAL);
  assert.equal(manualBodyWins.manualExplicit, true);
  assert.equal(manualBodyWins.commandExplicit, true);
  assert.deepEqual(manualBodyWins.accessPolicyContext.allowed_toolsets, ["web", "search"]);

  const autoFromText = resolveSearchSourceForMessage({}, "\u8bf7\u5728 X \u4e0a\u641c\u6700\u65b0\u8ba8\u8bba");
  assert.equal(autoFromText.source, SEARCH_SOURCE_X);
  assert.equal(autoFromText.sourceMode, SEARCH_SOURCE_MODE_AUTO);
  assert.equal(autoFromText.autoDetected, true);
  assert.match(autoFromText.instructions, /inferred.*X search/);
}

testNormalizeAndCommands();
testPolicyAndInstructions();
testResolvePrecedence();

console.log("search-source-routing-service tests passed");
