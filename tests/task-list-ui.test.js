"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");

assert.match(appJs, /function taskGroupsForThread\(thread\)/);
assert.match(appJs, /return \[\.\.\.groups\.values\(\)\]\.sort\(\(a, b\) => String\(b\.updatedAt\)\.localeCompare\(String\(a\.updatedAt\)\)\);/);
assert.match(appJs, /const allGroups = taskListGroupsForThread\(thread\);\s+const displayGroups = allGroups\.slice\(\);/);
assert.equal(appJs.includes("allGroups.slice().reverse()"), false);
assert.ok(appJs.includes("(?:\\/[A-Za-z0-9_.-]+)+"));
assert.equal(appJs.includes("namedSkillPattern"), false);

console.log("task list UI tests passed");
