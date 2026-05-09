"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const serverJs = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const fileViewer = fs.readFileSync(path.join(repoRoot, "public", "file-viewer.html"), "utf8");
const adapterJs = fs.readFileSync(path.join(repoRoot, "adapters", "automation-provider.js"), "utf8");
const cronBridge = fs.readFileSync(path.join(repoRoot, "cron_bridge.py"), "utf8");

assert.match(serverJs, /AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS = new Set\(\["\.md", "\.pdf"/);
assert.match(serverJs, /Write final document deliverables as Markdown by default/);
assert.match(serverJs, /Markdown\/PDF\/Office file/);
assert.match(serverJs, /const localPath = artifact\.localPath \|\| artifact\.path/);
assert.match(serverJs, /stat = fs\.statSync\(localPath\)/);
assert.match(serverJs, /function compactArtifactsForMessage\(message, thread = null\)/);
assert.match(serverJs, /HERMES_MOBILE_SOURCE_MARKDOWN_SEARCH_LIMIT/);
assert.match(serverJs, /function findSourceMarkdownForArtifact\(thread, value\)/);
assert.match(serverJs, /source_md_\$\{crypto\.createHash\("sha1"\)/);
assert.match(serverJs, /\/api\/files\/preview\?\$\{params\.toString\(\)\}/);

assert.match(appJs, /function isMarkdownArtifact\(artifact\)/);
assert.match(appJs, /function displayArtifacts\(artifacts\)/);
assert.match(appJs, /const markdownDocuments = artifacts\.filter\(isMarkdownArtifact\)/);
assert.match(appJs, /markdownStems\.has\(artifactStem\(artifact\)\)/);
assert.match(appJs, /displayArtifacts\(artifacts\)\.map/);
assert.match(appJs, /return "markdown"/);
assert.match(appJs, /if \(kind === "markdown"\) return "MD"/);

assert.match(fileViewer, /function renderMarkdownDocument\(text\)/);
assert.match(fileViewer, /function markdownExportHtml\(\)/);
assert.match(fileViewer, /function shareGeneratedMarkdownFile\(format\)/);
assert.match(fileViewer, /function printMarkdownAsPdf\(\)/);
assert.match(fileViewer, /Share raw \.md explicitly/);
assert.match(fileViewer, /if \(isMarkdownDocument\(\)\) \{/);
assert.match(fileViewer, /loadTextPreview\("Markdown preview", \{ markdown: true \}\)/);
assert.match(fileViewer, /if \(src && !isMarkdownDocument\(\)\) window\.setTimeout\(\(\) => prepareShareBlob/);

assert.ok(adapterJs.includes("const aMarkdown = /\\.md$/i.test(a) ? 0 : 1;"));
assert.match(cronBridge, /MEDIA_DOCUMENT_EXTENSIONS = \{"\.md"\} \| EXPORT_DOCUMENT_EXTENSIONS/);
assert.match(cronBridge, /def deliverable_items_from_run\(path: Path\)/);
assert.match(cronBridge, /def source_markdown_for_delivery\(run_path: Path, delivery_path: Path\)/);
assert.match(cronBridge, /"source-markdown"/);
assert.match(cronBridge, /document_source_rank\(item\)/);

console.log("markdown delivery UI tests passed");
