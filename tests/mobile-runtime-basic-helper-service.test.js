"use strict";

const assert = require("node:assert/strict");

const {
  createMobileRuntimeBasicHelperService,
} = require("../adapters/mobile-runtime-basic-helper-service");

const helper = createMobileRuntimeBasicHelperService({
  crypto: {
    createHash() {
      return {
        update(value) {
          this.value = value;
          return this;
        },
        digest() {
          return `hash:${this.value}`;
        },
      };
    },
    randomBytes(size) {
      assert.equal(size, 4);
      return Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    },
  },
  normalizeStringList(value) {
    return Array.isArray(value) ? value : String(value || "").split(",");
  },
  nowDate: () => new Date("2026-06-07T01:02:03.000Z"),
  nowMs: () => 123456789,
});

assert.equal(helper.hashValue("abc"), "hash:abc");
assert.deepEqual(helper.dedupe([" a ", "b", "a", "", null, " b "]), ["a", "b"]);
assert.equal(helper.isUncPath("\\\\server\\share"), true);
assert.equal(helper.isUncPath("C:\\\\Users"), false);
assert.equal(helper.makeId("msg"), "msg_21i3v9_deadbeef");
assert.equal(helper.nowIso(), "2026-06-07T01:02:03.000Z");
assert.deepEqual(helper.normalizeOwnerElevationDurations("60,15,15,241,0,5.7"), [6, 15, 60]);
assert.deepEqual(helper.normalizeOwnerElevationDurations("bad"), [5, 15, 30, 60]);
assert.equal(helper.normalizeSingleWindowMode(" CHAT "), "chat");
assert.equal(helper.normalizeSingleWindowMode("task"), "task");
assert.equal(helper.boolParam("yes"), true);
assert.equal(helper.boolParam("0"), false);
assert.equal(helper.responseTextFromValue({ output: [{ text: "a" }, { message: { content: "b" } }] }), "ab");
assert.equal(helper.responseTextFromValue({ response: { output_text: "done" } }), "done");

console.log("mobile runtime basic helper service tests passed");
