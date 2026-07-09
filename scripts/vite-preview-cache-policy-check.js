"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CACHE_POLICY_CHECK_VERSION = "20260704-vite-preview-cache-policy-v1";
const VITE_MANIFEST_PATH = "public/vite-islands/.vite/manifest.json";
const VITE_PREVIEW_DIR = "public/vite-preview";
const VITE_ASSET_ROOT = "public/vite-islands";
const CLASSIC_PRODUCTION_FILES = Object.freeze([
  "public/index.html",
  "public/service-worker.js",
]);
const PRODUCTION_FORBIDDEN_PATTERNS = Object.freeze([
  { id: "vite-preview-resource", pattern: /\/vite-preview\// },
  { id: "vite-islands-resource", pattern: /\/vite-islands\// },
  { id: "vite-dev-preview-route", pattern: /\/vite-[a-z0-9-]+-preview\// },
]);

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(readText(repoRoot, relativePath));
}

function exists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function fileList(repoRoot, relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir)
    .filter((name) => !name.startsWith("."))
    .map((name) => path.posix.join(relativeDir, name))
    .sort();
}

function findLine(text, pattern) {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) return index + 1;
  }
  return null;
}

function manifestAssetPaths(manifest = {}) {
  const out = new Set();
  for (const entry of Object.values(manifest || {})) {
    if (entry?.file) out.add(path.posix.join(VITE_ASSET_ROOT, entry.file));
    for (const importKey of Array.isArray(entry?.imports) ? entry.imports : []) {
      const imported = manifest[importKey];
      if (imported?.file) out.add(path.posix.join(VITE_ASSET_ROOT, imported.file));
    }
    for (const asset of Array.isArray(entry?.assets) ? entry.assets : []) {
      out.add(path.posix.join(VITE_ASSET_ROOT, asset));
    }
    for (const css of Array.isArray(entry?.css) ? entry.css : []) {
      out.add(path.posix.join(VITE_ASSET_ROOT, css));
    }
  }
  return Array.from(out).sort();
}

function scriptSources(html) {
  const sources = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match = pattern.exec(html);
  while (match) {
    sources.push(match[1]);
    match = pattern.exec(html);
  }
  return sources;
}

function checkProductionShellExclusion(repoRoot) {
  const findings = [];
  for (const relativePath of CLASSIC_PRODUCTION_FILES) {
    let text = "";
    try {
      text = readText(repoRoot, relativePath);
    } catch (error) {
      findings.push({ file: relativePath, id: "unreadable", line: null, error: error.message });
      continue;
    }
    for (const entry of PRODUCTION_FORBIDDEN_PATTERNS) {
      const line = findLine(text, new RegExp(entry.pattern.source));
      if (line) findings.push({ file: relativePath, id: entry.id, line });
    }
  }
  return {
    ok: findings.length === 0,
    findings,
  };
}

function checkPreviewHtml(repoRoot) {
  const findings = [];
  const previewFiles = fileList(repoRoot, VITE_PREVIEW_DIR)
    .filter((relativePath) => relativePath.endsWith(".html"));
  for (const relativePath of previewFiles) {
    const html = readText(repoRoot, relativePath);
    const sources = scriptSources(html);
    if (sources.length !== 1) {
      findings.push({ file: relativePath, id: "unexpected_script_count", count: sources.length });
    }
    for (const source of sources) {
      if (!source.startsWith("/vite-islands/")) {
        findings.push({ file: relativePath, id: "script_not_vite_asset", source });
      }
      if (source.includes("/src/")) {
        findings.push({ file: relativePath, id: "script_uses_source_path", source });
      }
    }
    if (/X-Hermes-Web-Key|launchToken|hermes_web_key|\/api\//i.test(html)) {
      findings.push({ file: relativePath, id: "preview_html_contains_runtime_secret_or_api_marker" });
    }
  }
  return {
    ok: findings.length === 0,
    previewFileCount: previewFiles.length,
    previewFiles,
    findings,
  };
}

function checkManifestAssets(repoRoot) {
  let manifest = {};
  try {
    manifest = readJson(repoRoot, VITE_MANIFEST_PATH);
  } catch (error) {
    return {
      ok: false,
      manifestEntryCount: 0,
      assetCount: 0,
      missingAssets: [{ file: VITE_MANIFEST_PATH, error: error.message }],
      nonFingerprintedEntryFiles: [],
    };
  }
  const assetPaths = manifestAssetPaths(manifest);
  const missingAssets = assetPaths.filter((assetPath) => !exists(repoRoot, assetPath));
  const nonFingerprintedEntryFiles = Object.values(manifest || {})
    .filter((entry) => entry?.isEntry && entry?.file && !/[.-][a-f0-9]{8,}\.m?js$/i.test(path.basename(entry.file)))
    .map((entry) => entry.file)
    .sort();
  return {
    ok: missingAssets.length === 0,
    manifestEntryCount: Object.keys(manifest || {}).length,
    assetCount: assetPaths.length,
    missingAssets,
    nonFingerprintedEntryFiles,
  };
}

function runVitePreviewCachePolicyCheck(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const productionShell = checkProductionShellExclusion(repoRoot);
  const previewHtml = checkPreviewHtml(repoRoot);
  const manifestAssets = checkManifestAssets(repoRoot);
  const checks = [
    {
      id: "production_shell_exclusion",
      ok: productionShell.ok,
      summary: "Classic production shell and service worker do not reference Vite preview assets.",
      findings: productionShell.findings,
    },
    {
      id: "preview_html_entries",
      ok: previewHtml.ok,
      summary: "Built preview HTML pages reference one Vite built asset and no runtime secret/API markers.",
      previewFileCount: previewHtml.previewFileCount,
      findings: previewHtml.findings,
    },
    {
      id: "manifest_asset_readback",
      ok: manifestAssets.ok,
      summary: "Vite manifest references files present under public/vite-islands.",
      manifestEntryCount: manifestAssets.manifestEntryCount,
      assetCount: manifestAssets.assetCount,
      missingAssets: manifestAssets.missingAssets,
    },
  ];
  const failedChecks = checks.filter((check) => !check.ok);
  return {
    ok: failedChecks.length === 0,
    status: failedChecks.length ? "vite_preview_cache_policy_failed" : "vite_preview_cache_policy_passed",
    checkVersion: CACHE_POLICY_CHECK_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    productionCutoverCacheReady: false,
    cachePolicy: {
      previewHtml: "no-cache-required-for-cutover",
      viteManifest: "no-cache-required-for-cutover",
      viteBuiltAssets: "development-preview-built-assets",
      productionClassicShell: "unchanged-classic-cache-policy",
    },
    residuals: [
      {
        id: "vite_entry_assets_not_content_fingerprinted",
        status: manifestAssets.nonFingerprintedEntryFiles.length ? "open_for_cutover" : "closed",
        fileCount: manifestAssets.nonFingerprintedEntryFiles.length,
        files: manifestAssets.nonFingerprintedEntryFiles.slice(0, 20),
      },
    ],
    summary: {
      failedCount: failedChecks.length,
      previewFileCount: previewHtml.previewFileCount,
      manifestEntryCount: manifestAssets.manifestEntryCount,
      manifestAssetCount: manifestAssets.assetCount,
    },
    checks,
  };
}

function formatText(result) {
  const lines = [
    `Vite preview cache policy: ${result.ok ? "ok" : "failed"}`,
    `version: ${result.checkVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionCutoverCacheReady: ${result.productionCutoverCacheReady}`,
  ];
  for (const check of result.checks) {
    lines.push(`- ${check.ok ? "pass" : "fail"}: ${check.id} - ${check.summary}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const result = runVitePreviewCachePolicyCheck();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : formatText(result));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  CACHE_POLICY_CHECK_VERSION,
  runVitePreviewCachePolicyCheck,
};
