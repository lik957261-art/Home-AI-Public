"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CACHE_POLICY_CHECK_VERSION,
  runVitePreviewCachePolicyCheck,
} = require("../scripts/vite-preview-cache-policy-check");

const repoRoot = path.resolve(__dirname, "..");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function writeFile(root, relativePath, text = "") {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, text);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-cache-policy-"));
  writeFile(root, "public/index.html", "<html><body>classic</body></html>");
  writeFile(root, "public/service-worker.js", "const HERMES_SW_VERSION = 'fixture';");
  writeFile(root, "public/vite-preview/home-ai-app.html", '<script type="module" src="/vite-islands/home-ai-app-preview/home-ai-app-preview.js"></script>');
  writeFile(root, "public/vite-islands/home-ai-app-preview/home-ai-app-preview.js", "console.log('preview');");
  writeFile(root, "public/vite-islands/.vite/manifest.json", JSON.stringify({
    "src/vite-app/main.mjs": {
      file: "home-ai-app-preview/home-ai-app-preview.js",
      name: "home-ai-app-preview",
      isEntry: true,
    },
  }, null, 2));
  return root;
}

test("current repository passes source-only Vite preview cache policy check", () => {
  const result = runVitePreviewCachePolicyCheck({ repoRoot });
  assert.equal(result.ok, true);
  assert.equal(result.checkVersion, CACHE_POLICY_CHECK_VERSION);
  assert.equal(result.sourceOnly, true);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.productionDeployAuthorized, false);
  assert.equal(result.productionCutoverCacheReady, false);
  assert.ok(result.summary.previewFileCount >= 10);
  assert.ok(result.summary.manifestAssetCount >= 10);
  assert.equal(
    result.residuals.some((entry) => entry.id === "vite_entry_assets_not_content_fingerprinted" && entry.status === "open_for_cutover"),
    true,
  );
});

test("fixture passes while recording non-fingerprinted entries as cutover residuals", () => {
  const result = runVitePreviewCachePolicyCheck({ repoRoot: createFixture() });
  assert.equal(result.ok, true);
  assert.equal(result.summary.previewFileCount, 1);
  assert.equal(result.summary.manifestEntryCount, 1);
  assert.equal(result.residuals[0].status, "open_for_cutover");
});

test("production shell references to Vite assets fail", () => {
  const root = createFixture();
  writeFile(root, "public/service-worker.js", "const urls = ['/vite-islands/home-ai-app-preview/home-ai-app-preview.js'];");
  const result = runVitePreviewCachePolicyCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const check = result.checks.find((entry) => entry.id === "production_shell_exclusion");
  assert.equal(check.ok, false);
  assert.equal(check.findings[0].id, "vite-islands-resource");
});

test("preview HTML source paths and runtime API markers fail", () => {
  const root = createFixture();
  writeFile(root, "public/vite-preview/home-ai-app.html", '<script type="module" src="/src/vite-app/main.mjs"></script><p>X-Hermes-Web-Key /api/status</p>');
  const result = runVitePreviewCachePolicyCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const check = result.checks.find((entry) => entry.id === "preview_html_entries");
  assert.equal(check.ok, false);
  assert.equal(check.findings.some((finding) => finding.id === "script_not_vite_asset"), true);
  assert.equal(check.findings.some((finding) => finding.id === "script_uses_source_path"), true);
  assert.equal(check.findings.some((finding) => finding.id === "preview_html_contains_runtime_secret_or_api_marker"), true);
});

test("manifest references to missing assets fail", () => {
  const root = createFixture();
  writeFile(root, "public/vite-islands/.vite/manifest.json", JSON.stringify({
    "src/vite-app/main.mjs": {
      file: "missing/missing.js",
      name: "home-ai-app-preview",
      isEntry: true,
    },
  }, null, 2));
  const result = runVitePreviewCachePolicyCheck({ repoRoot: root });
  assert.equal(result.ok, false);
  const check = result.checks.find((entry) => entry.id === "manifest_asset_readback");
  assert.equal(check.ok, false);
  assert.deepEqual(check.missingAssets, ["public/vite-islands/missing/missing.js"]);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
