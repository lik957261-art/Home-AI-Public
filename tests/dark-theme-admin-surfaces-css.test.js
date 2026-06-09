const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const styles = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const staticClientDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "static-client.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

function assertTokenizedSurface(selector) {
  const rule = ruleFor(selector);
  assert.doesNotMatch(rule, /background:\s*(?:#fff|white|rgba\(255,\s*255,\s*255|rgba\(255,\s*255,\s*252|rgba\(232,\s*244,\s*235|#d8efe6)/i, `${selector} must not use hard-coded pale backgrounds`);
  assert.doesNotMatch(rule, /color:\s*#(?:0f5f4d|145f4a|7a5a18|426a5a)\b/i, `${selector} must not use low-contrast green/brown text`);
  assert.match(rule, /var\(--(?:ui-|ink|muted|line|danger|text|accent)/, `${selector} must consume theme tokens`);
}

[
  ".access-key-sheet",
  ".workspace-gateway-status",
  ".runtime-config-form",
  ".runtime-config-actions button",
  ".plugin-admin-expand",
  ".plugin-admin-risk,\n.plugin-admin-workspace-state,\n.plugin-admin-owner-only",
  ".plugin-admin-contract span",
  ".plugin-admin-owner-only-panel",
  ".plugin-admin-workspace-row button",
  ".access-key-login-button",
  ".access-key-value-row code",
  ".access-key-empty",
  ".group-member-option",
  ".group-member-actions button",
].forEach(assertTokenizedSurface);

[
  ".owner-workspace-actions button.danger",
  ".runtime-config-status",
  ".runtime-config-status.error",
  ".workspace-onboarding-status.ok",
  ".workspace-onboarding-status.failed",
  ".workspace-onboarding-status.manual",
  ".workspace-onboarding-status.running",
  ".workspace-onboarding-step.running",
  ".plugin-admin-risk.is-critical",
  ".plugin-admin-workspace-state.is-enabled",
].forEach(assertTokenizedSurface);

assert.match(staticClientDoc, /settings\/access-key sheet/i);
assert.match(staticClientDoc, /Floating menus, context menus, inline details popovers, and action panels must\n  use theme tokens/);
assert.match(testMatrix, /Floating menus and inline popovers are part of this dark-mode matrix/);
assert.match(testMatrix, /Settings-sheet grouped controls must also have dark\/system-dark selected-state\ncoverage/);

console.log("dark theme admin surfaces CSS tests passed");
