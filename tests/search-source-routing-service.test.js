"use strict";

const assert = require("node:assert/strict");
const {
  SEARCH_SOURCE_LOCAL,
  SEARCH_SOURCE_WEB,
  SEARCH_SOURCE_X,
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

  assert.deepEqual(searchSourceFromCommand("#X\u641c\u7d22 \u770b\u4e00\u4e0b\u8fd9\u4e2a\u4e8b"), {
    source: SEARCH_SOURCE_X,
    explicit: true,
  });
  assert.deepEqual(searchSourceFromCommand("\u8bf7 #\u7f51\u7edc\u641c\u7d22 \u6838\u5bf9"), {
    source: SEARCH_SOURCE_WEB,
    explicit: true,
  });
  assert.deepEqual(searchSourceFromCommand("#\u672c\u5730\u6570\u636e \u7ee7\u7eed"), {
    source: SEARCH_SOURCE_LOCAL,
    explicit: true,
  });
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
}

function testResolvePrecedence() {
  const fromBody = resolveSearchSourceForMessage({ search_source: "web" }, "plain text");
  assert.equal(fromBody.source, SEARCH_SOURCE_WEB);
  assert.equal(fromBody.sourceIntent, "web_search");
  assert.equal(fromBody.explicit, true);
  assert.equal(fromBody.bodyExplicit, true);
  assert.equal(fromBody.commandExplicit, false);

  const commandWins = resolveSearchSourceForMessage({ search_source: "web" }, "#X\u641c\u7d22 latest");
  assert.equal(commandWins.source, SEARCH_SOURCE_X);
  assert.equal(commandWins.sourceIntent, "x_search");
  assert.equal(commandWins.commandExplicit, true);
  assert.deepEqual(commandWins.accessPolicyContext.allowed_toolsets, ["x_search", "web", "search"]);
}

testNormalizeAndCommands();
testPolicyAndInstructions();
testResolvePrecedence();

console.log("search-source-routing-service tests passed");
