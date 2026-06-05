"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(repoRoot, "scripts", "playwright-visual-smoke.js"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");
const staticClientDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "static-client.md"), "utf8");
const mapDoc = fs.readFileSync(path.join(repoRoot, "docs", "ARCHITECTURE_CODE_TEST_HARNESS_MAP.md"), "utf8");

assert.match(script, /getBoundingClientRect\(\)/);
assert.match(script, /HERMES_VISUAL_SMOKE_STRICT/);
assert.match(script, /horizontal_overflow/);
assert.match(script, /bottom_nav_out_of_view/);
assert.match(script, /bottom_nav_too_tall/);
assert.match(script, /composer_bottom_nav_overlap/);
assert.match(script, /top_bar_bottom_nav_overlap/);
assert.match(script, /no_tracked_shell_surface_visible/);
assert.match(script, /strictLayout/);
assert.match(script, /layout\.failures/);
assert.match(script, /fs\.mkdirSync\(path\.dirname\(screenshotPath\), \{ recursive: true \}\)/);
assert.match(testMatrix, /playwright-visual-smoke-harness\.test\.js/);
assert.match(testMatrix, /scripts\\playwright-visual-smoke\.js/);
assert.match(staticClientDoc, /bounding rectangles/);
assert.match(staticClientDoc, /horizontal overflow/);
assert.match(mapDoc, /playwright-visual-smoke-harness\.test\.js/);

console.log("playwright visual smoke harness tests passed");
