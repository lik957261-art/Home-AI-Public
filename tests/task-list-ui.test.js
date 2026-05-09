"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const serverJs = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");

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
assert.match(appJs, /function renderOwnerElevationPanel\(\)/);
assert.match(appJs, /\/api\/owner-elevation/);
assert.match(appJs, /body\.maintenanceMode = true/);
assert.match(appJs, /owner_high_privilege/);
assert.match(stylesCss, /\.workspace-permission-panel/);
assert.match(serverJs, /function publicOwnerElevationStatus\(auth\)/);
assert.match(serverJs, /url\.pathname === "\/api\/owner-elevation"/);
assert.match(serverJs, /url\.pathname === "\/api\/owner-elevation\/once"/);
assert.match(serverJs, /function grantOwnerElevationOnce\(auth\)/);
assert.match(serverJs, /function consumeOwnerElevationOnce\(auth, token\)/);
assert.match(serverJs, /consumeOwnerElevationOnce\(auth, onceToken\) \|\| isOwnerElevationActive\(auth\)/);
assert.match(serverJs, /isOwnerElevationActive\(auth\)/);
assert.match(serverJs, /gatewaySecurityLevel: gatewayRouting\.securityLevel/);
assert.match(serverJs, /gatewayMaintenance: Boolean\(gatewayRouting\.maintenance/);
assert.match(serverJs, /gatewayMaintenanceCategory: gatewayRouting\.maintenanceCategory/);

console.log("task list UI tests passed");
