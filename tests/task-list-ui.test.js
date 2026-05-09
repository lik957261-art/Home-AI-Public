"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(appJs, /function taskGroupsForThread\(thread\)/);
assert.match(appJs, /return \[\.\.\.groups\.values\(\)\]\.sort\(\(a, b\) => String\(b\.updatedAt\)\.localeCompare\(String\(a\.updatedAt\)\)\);/);
assert.match(appJs, /const allGroups = taskListGroupsForThread\(thread\);\s+const displayGroups = allGroups\.slice\(\);/);
assert.equal(appJs.includes("allGroups.slice().reverse()"), false);
assert.ok(appJs.includes("(?:\\/[A-Za-z0-9_.-]+)+"));
assert.equal(appJs.includes("namedSkillPattern"), false);
assert.match(indexHtml, /id="taskRenameOverlay"/);
assert.match(appJs, /function openTaskRenameDialog\(currentTitle\)/);
assert.match(appJs, /function selectTaskRenameInput\(input\)/);
assert.match(appJs, /input\.setSelectionRange\(0, input\.value\.length\)/);
assert.match(appJs, /input\.select\(\)/);
assert.match(appJs, /const nextTitle = await openTaskRenameDialog\(currentTitle\)/);
assert.match(stylesCss, /\.task-rename-sheet/);

console.log("task list UI tests passed");
