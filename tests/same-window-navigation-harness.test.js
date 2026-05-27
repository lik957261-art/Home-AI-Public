"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walk(relativeDir, extensions) {
  const root = path.join(repoRoot, relativeDir);
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") continue;
      files.push(...walk(relativePath, extensions));
      continue;
    }
    if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      files.push(relativePath.replace(/\\/g, "/"));
    }
  }
  return files;
}

for (const file of walk("public", [".js", ".html"])) {
  const text = read(file);
  assert.doesNotMatch(text, /window\.open\s*\(/, `${file} must not open a new browser window; route within the current app window or download in place.`);
  assert.doesNotMatch(text, /target=["']_blank["']/i, `${file} must not use target=_blank for Hermes-owned navigation.`);
  assert.doesNotMatch(text, /linkTarget:\s*["_']_blank["_']/, `${file} must not render Markdown links into new browser windows.`);
}

const serviceWorker = read("public/service-worker.js");
assert.match(serviceWorker, /for \(const client of topLevelClients\.filter\(isAppShellClient\)\)/);
assert.match(serviceWorker, /postNotificationOpenToClient\(client, targetUrl, notificationData\);[\s\S]*?await client\.focus\(\);[\s\S]*?return;/);
assert.match(serviceWorker, /self\.clients\.openWindow\(targetWindowRoute\)/);
assert.doesNotMatch(serviceWorker, /self\.clients\.openWindow\(targetUrl\)/);

const webPushDoc = read("docs/MODULES/web-push.md");
assert.match(webPushDoc, /same app window/i);
assert.match(webPushDoc, /must not use `window\.open`/);

const harnessDoc = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");
assert.match(harnessDoc, /same-window navigation/);
assert.match(harnessDoc, /no `window\.open`/);
