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

const pwaPushUi = read("public/app-pwa-settings-push-ui.js");
assert.match(pwaPushUi, /function currentDisplayMode\(\)/);
assert.match(pwaPushUi, /function pushClientContext\(\)/);
assert.match(pwaPushUi, /function hermesBrowserShellNavigationBlocked\(\)/);
assert.match(pwaPushUi, /function requireHermesAppWindowForNavigation\(\)/);
assert.match(pwaPushUi, /isIosPushClient\(\) && !isStandalonePwa\(\)/);
assert.match(pwaPushUi, /clientContext,[\s\S]*displayMode: clientContext\.displayMode,[\s\S]*standalone: clientContext\.standalone/);

const platformUi = read("public/app-platform-ui.js");
assert.match(platformUi, /function sameOriginRouteUrl\(value\)/);
assert.match(platformUi, /typeof requireHermesAppWindowForNavigation === "function"[\s\S]*!requireHermesAppWindowForNavigation\(\)/);

const pushApiRoutes = read("server-routes/push-api-routes.js");
assert.match(pushApiRoutes, /const clientContext = body\.clientContext/);
assert.match(pushApiRoutes, /displayMode: body\.displayMode \|\| clientContext\.displayMode/);
assert.match(pushApiRoutes, /standalone: body\.standalone \?\? clientContext\.standalone/);

const webPushDeliveryService = read("adapters/web-push-delivery-service.js");
assert.match(webPushDeliveryService, /function assertPushSubscriptionClientAllowed/);
assert.match(webPushDeliveryService, /ios_pwa_standalone_required/);
assert.match(webPushDeliveryService, /function shouldSkipPushSubscriptionForClient/);

const webPushDoc = read("docs/MODULES/web-push.md");
assert.match(webPushDoc, /same app window/i);
assert.match(webPushDoc, /must not use `window\.open`/);
assert.match(webPushDoc, /iOS Web Push/i);

const harnessDoc = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");
assert.match(harnessDoc, /same-window navigation/);
assert.match(harnessDoc, /no `window\.open`/);
assert.match(harnessDoc, /PWA standalone/);
