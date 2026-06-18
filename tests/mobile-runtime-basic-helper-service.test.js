"use strict";

const assert = require("node:assert/strict");

const {
  createMobileRuntimeBasicHelperService,
} = require("../adapters/mobile-runtime-basic-helper-service");

const fixtureNow = new Date("2026-06-07T01:02:03.000Z");
const fixtureTaskStamp = [
  fixtureNow.getFullYear(),
  String(fixtureNow.getMonth() + 1).padStart(2, "0"),
  String(fixtureNow.getDate()).padStart(2, "0"),
  "_",
  String(fixtureNow.getHours()).padStart(2, "0"),
  String(fixtureNow.getMinutes()).padStart(2, "0"),
  String(fixtureNow.getSeconds()).padStart(2, "0"),
].join("");

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
      if (size === 3) return Buffer.from([0xca, 0xfe, 0x01]);
      assert.equal(size, 4);
      return Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    },
  },
  normalizeStringList(value) {
    return Array.isArray(value) ? value : String(value || "").split(",");
  },
  nowDate: () => fixtureNow,
  nowMs: () => 123456789,
});

assert.equal(helper.hashValue("abc"), "hash:abc");
assert.deepEqual(helper.dedupe([" a ", "b", "a", "", null, " b "]), ["a", "b"]);
assert.equal(helper.isUncPath("\\\\server\\share"), true);
assert.equal(helper.isUncPath("C:\\\\Users"), false);
assert.equal(helper.makeId("msg"), "msg_21i3v9_deadbeef");
assert.equal(helper.makePublicTaskId("task"), `task_${fixtureTaskStamp}_cafe01`);
assert.equal(helper.nowIso(), "2026-06-07T01:02:03.000Z");
assert.deepEqual(helper.normalizeOwnerElevationDurations("60,15,15,241,0,5.7"), [6, 15, 60]);
assert.deepEqual(helper.normalizeOwnerElevationDurations("bad"), [5, 15, 30, 60]);
assert.equal(helper.normalizeSingleWindowMode(" CHAT "), "chat");
assert.equal(helper.normalizeSingleWindowMode("task"), "task");
assert.equal(helper.boolParam("yes"), true);
assert.equal(helper.boolParam("0"), false);
assert.equal(helper.compactText("abcdef", 10), "abcdef");
assert.equal(helper.compactText("abcdefghij", 6), "ab\n\n[truncated: 10 chars total]\n\nghij");
assert.equal(helper.searchableText(" A b\tC "), "abc");
assert.equal(helper.responseTextFromValue({ output: [{ text: "a" }, { message: { content: "b" } }] }), "ab");
assert.equal(helper.responseTextFromValue({ response: { output_text: "done" } }), "done");

console.log("mobile runtime basic helper service tests passed");
