"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunContentService,
  defaultAppendBounded,
  defaultCompactText,
} = require("../adapters/gateway-run-content-service");

assert.equal(defaultAppendBounded("abc", "def", 10), "abcdef");
assert.equal(
  defaultAppendBounded("abcdefghijk", "lmno", 10),
  "abcd\n\n[content truncated live: 15 chars total]\n\nlmno",
);

assert.equal(defaultCompactText("abcdef", 10), "abcdef");
assert.equal(
  defaultCompactText("abcdefghijklmno", 10),
  "abcd\n\n[truncated: 15 chars total]\n\njklmno",
);

{
  const calls = [];
  const service = createGatewayRunContentService({
    compactText(value, maxChars) {
      calls.push({ value, maxChars });
      return `compact:${String(value).slice(0, maxChars)}`;
    },
    maxMessageChars: 8,
  });

  assert.equal(service.appendBounded("abc", "def"), "abcdef");
  assert.equal(
    service.appendBounded("abcdefghijk", "lmno", 10),
    "abcd\n\n[content truncated live: 15 chars total]\n\nlmno",
  );
  assert.equal(service.compactFullContent("abcdefghij"), "compact:abcdefgh");
  assert.deepEqual(calls, [{ value: "abcdefghij", maxChars: 8 }]);
}

{
  const service = createGatewayRunContentService();
  assert.equal(typeof service.appendBounded, "function");
  assert.equal(typeof service.compactFullContent, "function");
  assert.equal(service.compactFullContent("ok"), "ok");
}

console.log("gateway-run-content-service tests passed");
