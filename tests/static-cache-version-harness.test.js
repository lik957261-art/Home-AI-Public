"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const versionFiles = [
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
  "tests/task-list-ui.test.js",
];

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function git(args) {
  return childProcess.execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function extractCurrentVersion() {
  const indexHtml = read("public/index.html");
  const match = indexHtml.match(/data-client-version="([^"]+)"/);
  assert.ok(match, "index.html must expose data-client-version");
  return match[1];
}

function extractHeadVersion() {
  try {
    const headIndex = git(["show", "HEAD:public/index.html"]);
    const match = headIndex.match(/data-client-version="([^"]+)"/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function changedFilesFromHead() {
  let output = "";
  try {
    output = git(["diff", "--name-only", "HEAD", "--"]);
  } catch {
    return [];
  }
  return output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function isCacheSensitiveFile(relPath) {
  if (relPath === "public/styles.css") return true;
  if (/^public\/app-[^/]+\.js$/.test(relPath)) return true;
  if (/^public\/[^/]+-viewer\.html$/.test(relPath)) return true;
  if (relPath === "public/index.html" || relPath === "public/service-worker.js") return true;
  return false;
}

const currentVersion = extractCurrentVersion();
const headVersion = extractHeadVersion();
const changedFiles = changedFilesFromHead();
const changedCacheSensitiveFiles = changedFiles.filter(isCacheSensitiveFile);
const testMatrix = read("docs/TEST_MATRIX.md");
const harnessMatrix = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");

for (const relPath of versionFiles) {
  const content = read(relPath);
  assert.ok(content.includes(currentVersion), `${relPath} must include current client version`);
  if (headVersion && headVersion !== currentVersion) {
    assert.ok(!content.includes(headVersion), `${relPath} must not retain old client version`);
  }
}

assert.ok(
  read("public/service-worker.js").includes(`/app-embedded-plugin-ui.js?v=${currentVersion}`),
  "service worker shell cache must include versioned embedded plugin host script",
);

if (changedCacheSensitiveFiles.length > 0 && headVersion) {
  assert.notEqual(
    currentVersion,
    headVersion,
    `cache-sensitive static changes require a client/cache version bump: ${changedCacheSensitiveFiles.join(", ")}`,
  );
}

assert.match(testMatrix, /real client loaded the new\s+version after refresh/);
assert.match(testMatrix, /document\.documentElement\.dataset\.clientVersion/);
assert.match(testMatrix, /previous deployed static version returns\s+`refreshRequired=true`/);
assert.match(testMatrix, /production_origin_identity_mismatch/);
assert.match(testMatrix, /must first prove the target origin\s+is Hermes Mobile/);
assert.match(read("docs/RUNBOOKS/static-client-cache-version.md"), /Prove the production origin identity before any API smoke/);
assert.match(read("docs/RUNBOOKS/static-client-cache-version.md"), /do not keep trying common local ports/);
assert.match(harnessMatrix, /verify the client refresh contract on\s+the actual target origin/);
assert.match(harnessMatrix, /read the loaded page's `data-client-version`/);
assert.match(harnessMatrix, /correction must use another static version/);

console.log("static cache version harness passed");
