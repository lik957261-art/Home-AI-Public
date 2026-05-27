"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
  assert.doesNotMatch(text, /(?:\b(?:global|self|globalThis|window)\s*\.\s*)?open\s*\([^)]*["']_blank["']/, `${file} must not open a new browser window through open(..., "_blank"); use same-window routing, an in-app overlay, iframe, or download fallback.`);
  assert.doesNotMatch(text, /target=["']_blank["']/i, `${file} must not use target=_blank for Hermes-owned navigation.`);
  assert.doesNotMatch(text, /linkTarget:\s*["_']_blank["_']/, `${file} must not render Markdown links into new browser windows.`);
}

const serviceWorker = read("public/service-worker.js");
assert.match(serviceWorker, /for \(const client of topLevelClients\.filter\(isAppShellClient\)\)/);
assert.match(serviceWorker, /postNotificationOpenToClient\(client, targetUrl, notificationData\);[\s\S]*?await client\.focus\(\);[\s\S]*?return;/);
assert.match(serviceWorker, /self\.clients\.openWindow\(targetWindowRoute\)/);
assert.match(serviceWorker, /function normalizeAppShellPath\(pathname = ""\)/);
assert.match(serviceWorker, /function appShellRouteForParams\(params, shellPath = "\/"\)/);
assert.match(serviceWorker, /appWindowRouteForUrl\(parsedTargetUrl, client\)/);
assert.doesNotMatch(serviceWorker, /self\.clients\.openWindow\(targetUrl\)/);
assert.doesNotMatch(serviceWorker, /return `\/\?\$\{params\.toString\(\)\}`/);

const indexHtml = read("public/index.html");
assert.match(indexHtml, /window\.__hermesMobileBrowserShellBlocked = true/);
assert.match(indexHtml, /preflight\.id = "mobileBrowserShellPreflight"/);
assert.match(indexHtml, /mode=preflight-browser/);
assert.match(indexHtml, /index_mobile_browser_shell_preflight/);
assert.match(indexHtml, /data-mobile-browser-shell-copy/);
assert.ok(
  indexHtml.indexOf("__hermesMobileBrowserShellBlocked") > 0
    && indexHtml.indexOf("__hermesMobileBrowserShellBlocked") < indexHtml.indexOf("/app.js?"),
  "index.html must run the mobile browser-shell preflight before app bundles load.",
);

const pwaPushUi = read("public/app-pwa-settings-push-ui.js");
assert.match(pwaPushUi, /function currentDisplayMode\(\)/);
assert.match(pwaPushUi, /function pushClientContext\(\)/);
assert.match(pwaPushUi, /function hermesBrowserShellNavigationBlocked\(\)/);
assert.match(pwaPushUi, /function requireHermesAppWindowForNavigation\(\)/);
assert.match(pwaPushUi, /function mobileBrowserShellClient\(\)/);
assert.match(pwaPushUi, /mobileBrowserShellClient\(\) && !isStandalonePwa\(\)/);
assert.match(pwaPushUi, /clientContext,[\s\S]*displayMode: clientContext\.displayMode,[\s\S]*standalone: clientContext\.standalone/);

const platformUi = read("public/app-platform-ui.js");
assert.match(platformUi, /function sameOriginRouteUrl\(value\)/);
assert.match(platformUi, /function normalizeHermesAppShellPath\(pathname = ""\)/);
assert.match(platformUi, /function hermesAppShellRouteForParams\(params, options = \{\}\)/);
assert.match(platformUi, /function hermesAppShellRouteForUrl\(value\)/);
assert.match(platformUi, /function routeParamsHaveHermesOwnedDetailTarget\(params\)/);
assert.match(platformUi, /function requireHermesAppWindowForRoute\(params\)/);
assert.match(platformUi, /function hermesRouteMobileBrowserShell\(\)/);
assert.match(platformUi, /function showMobileBrowserShellBlocked\(\)/);
assert.match(platformUi, /function blockMobileBrowserShellAppLaunch\(\)/);
assert.match(platformUi, /window\.__hermesMobileBrowserShellBlocked === true \|\| hermesRouteMobileBrowserShell\(\)/);
assert.match(platformUi, /getElementById\("mobileBrowserShellPreflight"\)\?\.remove/);
assert.match(platformUi, /function guardHermesOwnedSelectedDetailNavigation\(\)/);
assert.match(platformUi, /function clearHermesOwnedDetailStateAfterBrowserShellBlock\(\)/);
assert.match(platformUi, /function showApp\(\) \{[\s\S]*?shouldBlockMobileBrowserShellApp\(\)[\s\S]*?showMobileBrowserShellBlocked\(\);[\s\S]*?return;/);
assert.match(platformUi, /await loadPushStatus\(\)\.catch\(\(\) => updatePushButton\(\)\);[\s\S]*?if \(blockMobileBrowserShellAppLaunch\(\)\) return;/);
assert.match(platformUi, /if \(hermesRouteMobileBrowserShell\(\)\) \{[\s\S]*?replaceBlockedBrowserShellRoute\(\);[\s\S]*?return false;/);
assert.match(platformUi, /state\.viewMode === "automation"[\s\S]*?state\.selectedAutomationId/);
assert.match(platformUi, /selectedAutomationId: ""[\s\S]*?automationRouteTargetPending: false/);
const automationUi = read("public/app-automation-ui.js");
assert.match(automationUi, /function loadSelectedView\(\) \{[\s\S]*?guardHermesOwnedSelectedDetailNavigation\(\);/);
assert.match(platformUi, /function applyRouteFromUrl\(value\) \{[\s\S]*?const params = new URLSearchParams\(parsed\.search \|\| ""\);[\s\S]*?if \(!requireHermesAppWindowForRoute\(params\)\) return false;[\s\S]*?return applyRouteParams\(params\);/);
assert.match(platformUi, /async function openHermesInternalRoute\(value\) \{/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_start"/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_blocked"/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_noop"/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_applied"/);
assert.match(platformUi, /const nextRoute = hermesAppShellRouteForUrl\(parsed\)/);
assert.match(platformUi, /await loadSelectedView\(\);/);
assert.match(platformUi, /async function openNotificationRoute\(value\) \{[\s\S]*?return openHermesInternalRoute\(value\);[\s\S]*?\}/);
assert.match(platformUi, /function recordNavigationDiagnostic\(eventName, fields = \{\}\)/);
assert.match(platformUi, /hermesNavigationDiagnostics/);
assert.match(platformUi, /async function copyNavigationDiagnostics\(\)/);
assert.match(platformUi, /data-mobile-browser-shell-copy/);
assert.match(platformUi, /copyNavigationDiagnostics\(\)\.catch/);

const actionInboxUi = read("public/app-action-inbox-ui.js");
assert.match(actionInboxUi, /data-action-inbox-open-source-id/);
assert.match(actionInboxUi, /function openActionInboxItemSource\(item\) \{[\s\S]*?openHermesInternalRoute\(link\)/);
assert.match(actionInboxUi, /recordNavigationDiagnostic\("action_inbox_open_source"/);
assert.match(actionInboxUi, /actionInboxAppShellRouteForParams\(params\)/);
assert.doesNotMatch(actionInboxUi, /openNotificationRoute\(link\)/);
const navigationSearchUi = read("public/app-navigation-search-ui.js");
assert.match(navigationSearchUi, /topCopyNavigationDiagnostics/);
const wireStartUi = read("public/app-wire-start-ui.js");
assert.match(wireStartUi, /copyNavigationDiagnostics\(\)\.catch\(showError\)/);

{
  const toasts = [];
  const alerts = [];
  const storage = new Map();
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id,
        textContent: "",
        innerHTML: "",
        scrollTop: 0,
        classList: {
          add: (...names) => names.forEach((name) => classes.add(name)),
          remove: (...names) => names.forEach((name) => classes.delete(name)),
          contains: (name) => classes.has(name),
        },
        querySelector: () => ({ addEventListener: () => {} }),
      });
    }
    return elements.get(id);
  }
  const sandbox = {
    URL,
    URLSearchParams,
    AppApiClient: { createApiClient: () => () => Promise.resolve({}) },
    document: {
      cookie: "",
      body: { classList: { remove: () => {} } },
      getElementById: (id) => element(id),
    },
    localStorage: {
      setItem: (key, value) => storage.set(key, String(value)),
      getItem: (key) => storage.get(key) || "",
      removeItem: (key) => storage.delete(key),
    },
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
      standalone: false,
    },
    window: {
      innerWidth: 390,
      screen: { width: 390 },
      location: { origin: "https://example.test", pathname: "/hermes-mobile/" },
      matchMedia: () => ({ matches: false }),
      history: {
        state: {},
        replacedUrl: "",
        replaceState(state, _title, url) {
          this.state = state;
          this.replacedUrl = url;
        },
      },
      alert: (message) => alerts.push(message),
    },
    state: {
      key: "",
      clientVersion: "test",
      viewMode: "automation",
      selectedAutomationId: "job-1",
      automationReturnRoute: "inbox",
      automationReturnScope: "detail",
      automationReturnInboxItemId: "inbox-1",
      automationRouteTargetId: "job-1",
      automationRouteTargetPending: true,
      automationEditOpen: true,
      automationEditJobId: "job-1",
      automationOutputHistoryOpen: true,
    },
    $: element,
    escapeHtml: (value) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;"),
    configureComposer: () => {},
    showPushToast: (message, tone) => toasts.push({ message, tone }),
    hermesAppWindowRequiredText: () => "open from PWA",
  };
  vm.runInNewContext(platformUi, sandbox);
  assert.equal(sandbox.guardHermesOwnedSelectedDetailNavigation(), false);
  assert.equal(sandbox.state.mobileBrowserShellBlocked, true);
  assert.equal(sandbox.state.viewMode, "inbox");
  assert.equal(sandbox.state.selectedAutomationId, "");
  assert.equal(sandbox.state.automationRouteTargetPending, false);
  assert.equal(storage.get("hermesWebViewMode"), "inbox");
  assert.equal(sandbox.window.history.replacedUrl, "/hermes-mobile/?source=pwa");
  assert.equal(alerts[0], "open from PWA");
  assert.deepEqual(toasts[0], { message: "open from PWA", tone: "error" });
  assert.equal(element("app").classList.contains("mobile-browser-shell-blocked"), true);
  assert.match(element("conversation").innerHTML, /mobile-browser-shell-block/);

  sandbox.state.mobileBrowserShellBlocked = false;
  sandbox.state.viewMode = "inbox";
  sandbox.state.selectedAutomationId = "";
  element("conversation").innerHTML = "INBOX UI SHOULD NOT REMAIN";
  assert.equal(sandbox.blockMobileBrowserShellAppLaunch(), true);
  assert.equal(sandbox.state.mobileBrowserShellBlocked, true);
  assert.match(element("conversation").innerHTML, /mobile-browser-shell-block/);
  assert.doesNotMatch(element("conversation").innerHTML, /INBOX UI SHOULD NOT REMAIN/);
}

{
  const routeCalls = [];
  const item = {
    id: "inbox-1",
    sourceType: "automation",
    itemType: "error",
    status: "open",
    title: "Automation failed",
    workspaceId: "owner",
    sourceRef: { automationId: "job-1" },
  };
  const sandbox = {
    URL,
    URLSearchParams,
    state: {
      selectedWorkspaceId: "owner",
      actionInboxItems: [item],
      selectedActionInboxItemId: "",
    },
    window: {
      location: { origin: "https://example.test", pathname: "/hermes-mobile/" },
      open: () => { throw new Error("Action Inbox source navigation must not open a browser window."); },
    },
    formatTime: () => "",
    escapeHtml: (value) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;"),
    openHermesInternalRoute: (value) => {
      routeCalls.push(value);
      return Promise.resolve(value);
    },
    openNotificationRoute: () => {
      throw new Error("Action Inbox direct-source navigation must use the shared internal route helper, not the Web Push wrapper.");
    },
    Promise,
  };
  vm.runInNewContext(actionInboxUi, sandbox);
  const rowHtml = sandbox.renderActionInboxItem(item);
  assert.match(rowHtml, /<button class="action-inbox-item-main" type="button" data-action-inbox-open-source-id="inbox-1">/);
  assert.doesNotMatch(rowHtml, /href=/);
  sandbox.openActionInboxItemSourceById("inbox-1");
  assert.deepEqual(routeCalls, ["/hermes-mobile/?view=automation&workspaceId=owner&automationId=job-1&returnTo=inbox&returnScope=detail&sourceInboxItemId=inbox-1&source=pwa"]);
}

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
assert.match(harnessDoc, /same-window\s+navigation/);
assert.match(harnessDoc, /(?:no|not call) `window\.open`/);
assert.match(harnessDoc, /PWA standalone/);
