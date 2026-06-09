const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const styles = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const visualHarness = fs.readFileSync(path.join(repoRoot, "scripts", "ios-pwa-visual-harness.js"), "utf8");
const staticClientDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "static-client.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");
const visualContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-mobile-ui-visual-contract.md"), "utf8");

function assertDarkRuleCovers(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const darkRule = new RegExp(`:root\\[data-theme="dark"\\][^{}]*${escaped}[^{}]*\\{[\\s\\S]*?\\}`, "m");
  const systemRule = new RegExp(`:root\\[data-theme="system"\\][^{}]*${escaped}[^{}]*\\{[\\s\\S]*?\\}`, "m");
  assert.match(styles, darkRule, `${selector} must have a dark-mode override`);
  assert.match(styles, systemRule, `${selector} must have a system-dark override`);
}

[
  ".learning-growth-teaching-stepper button.active",
  ".learning-growth-card-detail-shell .learning-growth-teaching-worked-example",
  ".learning-growth-teaching-section",
  ".learning-growth-teaching-feedback",
  ".learning-native-growth-question",
  ".learning-native-growth-choice",
  ".learning-program-card",
  ".learning-program-report-grid span",
  ".learning-coin-stats span",
  ".learning-readiness-grid span",
].forEach(assertDarkRuleCovers);

assert.match(styles, /:root\[data-theme="dark"\]\s+\.learning-growth-tab-list button\.active,[\s\S]*?background:\s*var\(--ui-accent-fill\)/);
assert.match(styles, /:root\[data-theme="dark"\]\s+\.learning-growth-answer-card,[\s\S]*?background:\s*var\(--ui-card-surface\)/);
assert.match(styles, /:root\[data-theme="dark"\]\s+\.learning-growth-card-detail-shell \.learning-growth-teaching-worked-example,[\s\S]*?background:\s*var\(--ui-card-surface\)/);
assert.match(styles, /:root\[data-theme="dark"\]\s+\.learning-growth-teaching-why,[\s\S]*?background:\s*var\(--ui-accent-soft\)/);
assert.match(styles, /@media \(prefers-color-scheme: dark\)[\s\S]*:root\[data-theme="system"\]\s+\.learning-growth-tab-list button\.active,[\s\S]*?background:\s*var\(--ui-accent-fill\)/);

assert.match(visualHarness, /dark-growth-surfaces/);
assert.match(visualHarness, /growth_surfaces_have_no_pale_solid_backgrounds/);
assert.match(visualHarness, /growth_surfaces_have_no_low_contrast_semantic_text/);
assert.match(visualHarness, /\.learning-growth-teaching-worked-example/);
assert.match(visualHarness, /\.learning-native-growth-question/);
assert.match(visualHarness, /\.learning-program-card/);
assert.match(visualHarness, /\.learning-coin-stats span/);

assert.match(staticClientDoc, /Growth teaching card detail, native Growth submission, program, coin, and\s+readiness surfaces/);
assert.match(testMatrix, /dark-growth-surfaces/);
assert.match(visualContract, /dark-growth-surfaces/);

console.log("dark theme growth surfaces CSS tests passed");
