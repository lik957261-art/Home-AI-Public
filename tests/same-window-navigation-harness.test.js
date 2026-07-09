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
  assert.doesNotMatch(text, /return\s+`\/\?\$\{params\.toString\(\)\}`/, `${file} must not hardcode root app-shell routes; preserve the current app shell path.`);
  assert.doesNotMatch(text, /`\/\?\$\{params/, `${file} must not build Hermes-owned routes from a hardcoded root prefix.`);
  assert.doesNotMatch(text, /["']\/\?view=/, `${file} must not hardcode root second-level view routes; use an app-shell route helper.`);
}

const serviceWorker = read("public/service-worker.js");
assert.match(serviceWorker, /for \(const client of topLevelClients\.filter\(isAppShellClient\)\)/);
assert.match(serviceWorker, /postNotificationOpenToClient\(client, targetUrl, notificationData\);[\s\S]*?await client\.focus\(\);[\s\S]*?return;/);
assert.match(serviceWorker, /self\.clients\.openWindow\(targetWindowRoute\)/);
assert.match(serviceWorker, /function normalizeAppShellPath\(pathname = ""\)/);
assert.match(serviceWorker, /function appShellRouteForParams\(params, shellPath = "\/"\)/);
assert.match(serviceWorker, /appWindowRouteForUrl\(parsedTargetUrl, client\)/);
assert.ok(
  serviceWorker.indexOf("requestedView === \"single\"") < serviceWorker.indexOf("if (taskGroupId)"),
  "Web Push chat/group routes must preserve single-window view before generic taskGroup routing.",
);
assert.match(serviceWorker, /function notificationRouteFlagEnabled\(value\)/);
assert.match(serviceWorker, /if \(data\.threadId\) params\.set\("threadId", String\(data\.threadId\)\)/);
assert.match(serviceWorker, /if \(data\.messageId\) params\.set\("messageId", String\(data\.messageId\)\)/);
assert.doesNotMatch(serviceWorker, /self\.clients\.openWindow\(targetUrl\)/);
assert.doesNotMatch(serviceWorker, /return `\/\?\$\{params\.toString\(\)\}`/);

const indexHtml = read("public/index.html");
assert.match(indexHtml, /window\.__hermesMobileBrowserShellDetected = true/);
assert.match(indexHtml, /index_mobile_browser_shell_detected/);
assert.match(indexHtml, /preflightBlocked: false/);
assert.doesNotMatch(indexHtml, /preflight\.id = "mobileBrowserShellPreflight"/);
assert.doesNotMatch(indexHtml, /data-mobile-browser-shell-close/);
assert.ok(
  indexHtml.indexOf("__hermesMobileBrowserShellDetected") > 0
    && indexHtml.indexOf("__hermesMobileBrowserShellDetected") < indexHtml.indexOf("/app.js?"),
  "index.html must record mobile browser-shell diagnostics before app bundles load.",
);

const pwaPushUi = [
  read("public/app-pwa-settings-push-ui.js"),
  read("public/app-pwa-push-ui.js"),
].join("\n");
assert.match(pwaPushUi, /function currentDisplayMode\(\)/);
assert.match(pwaPushUi, /function pushClientContext\(\)/);
assert.match(pwaPushUi, /function hermesBrowserShellNavigationBlocked\(\)/);
assert.match(pwaPushUi, /function requireHermesAppWindowForNavigation\(\)/);
assert.match(pwaPushUi, /function mobileBrowserShellClient\(\)/);
assert.match(pwaPushUi, /mobileBrowserShellClient\(\) && !isStandalonePwa\(\)/);
assert.match(pwaPushUi, /clientContext,[\s\S]*displayMode: clientContext\.displayMode,[\s\S]*standalone: clientContext\.standalone/);

const platformUi = read("public/app-platform-ui.js");
const routeSnapshotUi = read("public/app-route-snapshot-ui.js");
const wireStartUi = read("public/app-wire-start-ui.js");
assert.match(platformUi, /function sameOriginRouteUrl\(value\)/);
assert.match(platformUi, /function normalizeHermesAppShellPath\(pathname = ""\)/);
assert.match(platformUi, /function hermesAppShellRouteForParams\(params, options = \{\}\)/);
assert.match(platformUi, /function hermesAppShellRouteForUrl\(value\)/);
assert.match(platformUi, /function routeParamsHaveHermesOwnedDetailTarget\(params\)/);
assert.match(platformUi, /function requireHermesAppWindowForRoute\(params\)/);
assert.match(platformUi, /function hermesRouteMobileBrowserShell\(\)/);
assert.match(platformUi, /function showMobileBrowserShellBlocked\(\)/);
assert.match(platformUi, /function blockMobileBrowserShellAppLaunch\(\)/);
assert.match(platformUi, /return window\.__hermesMobileBrowserShellBlocked === true;/);
assert.match(platformUi, /getElementById\("mobileBrowserShellPreflight"\)\?\.remove/);
assert.match(platformUi, /function guardHermesOwnedSelectedDetailNavigation\(\)/);
assert.match(platformUi, /function clearHermesOwnedDetailStateAfterBrowserShellBlock\(\)/);
assert.match(platformUi, /function showApp\(\) \{[\s\S]*?state\.mobileBrowserShellBlocked = false;[\s\S]*?mobile-browser-shell-blocked/);
assert.match(platformUi, /await startupPerfStep\("push-status", \(\) => loadPushStatus\(\{ subscription: false \}\)\)\.catch\(\(\) => updatePushButton\(\)\);[\s\S]*?if \(blockMobileBrowserShellAppLaunch\(\)\) return;/);
assert.match(platformUi, /refreshPushSubscriptionAfterStartup\(\)/);
assert.match(pwaPushUi, /function refreshPushSubscriptionAfterStartup\(\)/);
assert.match(platformUi, /if \(hermesRouteMobileBrowserShell\(\)\) \{[\s\S]*?mobile_browser_shell_internal_route_allowed[\s\S]*?return true;/);
assert.match(platformUi, /state\.viewMode === "automation"[\s\S]*?state\.selectedAutomationId/);
assert.match(platformUi, /selectedAutomationId: ""[\s\S]*?automationRouteTargetPending: false/);
const automationUi = read("public/app-automation-ui.js");
assert.match(automationUi, /async function loadSelectedView\(options = \{\}\) \{[\s\S]*?guardHermesOwnedSelectedDetailNavigation\(\);/);
assert.match(platformUi, /function applyRouteFromUrl\(value\) \{[\s\S]*?const params = new URLSearchParams\(parsed\.search \|\| ""\);[\s\S]*?if \(!requireHermesAppWindowForRoute\(params\)\) return false;[\s\S]*?return applyRouteParams\(params\);/);
assert.match(platformUi, /function routePluginContextId\(params, routeView = "", taskGroupId = ""\)/);
assert.match(platformUi, /pluginContextIdFromTaskGroupId\(taskGroupId\)/);
assert.match(platformUi, /state\.pluginContextNavPluginId = pluginContextNavPluginId;/);
assert.match(platformUi, /async function openHermesInternalRoute\(value\) \{/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_start"/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_blocked"/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_noop"/);
assert.match(platformUi, /recordNavigationDiagnostic\("open_hermes_internal_route_applied"/);
assert.match(platformUi, /const nextRoute = hermesAppShellRouteForUrl\(parsed\)/);
assert.match(platformUi, /await loadSelectedView\(\{ forceTaskListReload: true, skipSingleWindowCache: true \}\);/);
assert.match(routeSnapshotUi, /function applyRestoredAppRouteSnapshot\(\)/);
assert.match(routeSnapshotUi, /params\.set\("pluginContextNavPluginId", pluginContextId\)/);
assert.match(routeSnapshotUi, /if \(routeParamsHaveExplicitLaunchTarget\(currentParams\)\) return false/);
assert.doesNotMatch(platformUi, /function applyRestoredAppRouteSnapshot\(\)/);
assert.match(platformUi, /async function openNotificationRoute\(value\) \{[\s\S]*?return openHermesInternalRoute\(value\);[\s\S]*?\}/);
assert.match(wireStartUi, /window\.HomeAINativeNotifications = \{/);
assert.match(wireStartUi, /return openNotificationRoute\(route\)\.then\(\(\) => true\);/);
assert.match(wireStartUi, /window\.__homeAIPendingNativeNotifications/);
assert.match(platformUi, /function recordNavigationDiagnostic\(eventName, fields = \{\}\)/);
assert.match(platformUi, /hermesNavigationDiagnostics/);
assert.match(platformUi, /async function copyNavigationDiagnostics\(\)/);
assert.match(platformUi, /data-mobile-browser-shell-copy/);
assert.match(platformUi, /copyNavigationDiagnostics\(\)\.catch/);

const actionInboxUi = read("public/app-action-inbox-ui.js");
const chatComposerUi = [
  read("public/app-navigation-view-ui.js"),
  read("public/app-chat-composer-ui.js"),
].join("\n");
const automationControllerUi = read("public/app-automation-controller-ui.js");
assert.match(actionInboxUi, /data-action-inbox-open-source-id/);
assert.match(actionInboxUi, /function openActionInboxItemSource\(item\) \{[\s\S]*?openHermesInternalRoute\(link\)/);
assert.match(actionInboxUi, /recordNavigationDiagnostic\("action_inbox_open_source"/);
assert.match(actionInboxUi, /actionInboxAppShellRouteForParams\(params\)/);
assert.match(actionInboxUi, /function openActionInboxList\(\) \{[\s\S]*?state\.viewMode = "inbox";[\s\S]*?localStorage\.setItem\("hermesWebViewMode", state\.viewMode\);/);
assert.doesNotMatch(actionInboxUi, /openNotificationRoute\(link\)/);
assert.match(chatComposerUi, /function cancelAutomationViewLoads\(\) \{[\s\S]*?state\.automationRequestSeq = \(state\.automationRequestSeq \|\| 0\) \+ 1;[\s\S]*?state\.automationRouteTargetPending = false;/);
assert.match(automationControllerUi, /if \(seq !== state\.automationRequestSeq \|\| state\.viewMode !== "automation"\) return;/);
const navigationSearchUi = read("public/app-navigation-search-ui.js");
assert.match(navigationSearchUi, /topCopyNavigationDiagnostics/);
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
  assert.equal(sandbox.guardHermesOwnedSelectedDetailNavigation(), true);
  assert.equal(sandbox.state.mobileBrowserShellBlocked, undefined);
  assert.equal(sandbox.state.viewMode, "automation");
  assert.equal(sandbox.state.selectedAutomationId, "job-1");
  assert.equal(sandbox.state.automationRouteTargetPending, true);
  assert.equal(storage.get("hermesWebViewMode"), undefined);
  assert.equal(sandbox.window.history.replacedUrl, "");
  assert.equal(alerts.length, 0);
  assert.equal(toasts.length, 0);
  assert.equal(element("app").classList.contains("mobile-browser-shell-blocked"), false);

  sandbox.state.mobileBrowserShellBlocked = false;
  sandbox.state.viewMode = "inbox";
  sandbox.state.selectedAutomationId = "";
  element("conversation").innerHTML = "INBOX UI SHOULD NOT REMAIN";
  assert.equal(sandbox.blockMobileBrowserShellAppLaunch(), false);
  assert.equal(sandbox.state.mobileBrowserShellBlocked, false);
  assert.equal(element("conversation").innerHTML, "INBOX UI SHOULD NOT REMAIN");

  sandbox.window.__hermesMobileBrowserShellBlocked = true;
  assert.equal(sandbox.blockMobileBrowserShellAppLaunch(), false);
  assert.equal(sandbox.state.mobileBrowserShellBlocked, false);
  assert.equal(sandbox.window.__hermesMobileBrowserShellBlocked, false);
  assert.equal(element("conversation").innerHTML, "INBOX UI SHOULD NOT REMAIN");
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

{
  const routeCalls = [];
  const item = {
    id: "todo-inbox-1",
    sourceType: "manual",
    itemType: "todo",
    status: "open",
    title: "Manual todo",
    workspaceId: "owner",
    deepLink: "/?view=todos&workspaceId=owner&todoId=legacy-todo-1",
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
      open: () => { throw new Error("Manual Inbox Todo must not open the legacy Todo browser route."); },
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
    Promise,
  };
  vm.runInNewContext(actionInboxUi, sandbox);
  const rowHtml = sandbox.renderActionInboxItem(item);
  assert.match(rowHtml, /data-action-inbox-id="todo-inbox-1"/);
  assert.doesNotMatch(rowHtml, /data-action-inbox-open-source-id="todo-inbox-1"/);
  sandbox.openActionInboxItemSourceById("todo-inbox-1");
  assert.deepEqual(routeCalls, []);
}

{
  const storage = new Map();
  const renderCalls = [];
  const sandbox = {
    URLSearchParams,
    state: {
      viewMode: "automation",
      selectedAutomationId: "job-1",
      automationReturnRoute: "inbox",
      automationReturnScope: "detail",
      automationReturnInboxItemId: "inbox-1",
      automationRouteTargetId: "job-1",
      automationRouteTargetPending: true,
      automationRequestSeq: 3,
      automationDetailRequestSeq: 7,
      automationLoading: true,
      automationDetailLoading: true,
      automationCreateOpen: false,
      automationEditOpen: true,
      automationEditJobId: "job-1",
      automationOutputHistoryOpen: true,
    },
    localStorage: {
      setItem: (key, value) => storage.set(key, String(value)),
      getItem: (key) => storage.get(key) || "",
    },
    renderActionInboxView: () => renderCalls.push({ viewMode: sandbox.state.viewMode }),
    actionInboxFilterQuery: () => "",
    api: async () => ({ items: [] }),
    showError: (err) => { throw err; },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`${chatComposerUi}\n${actionInboxUi}`, sandbox);
  sandbox.renderActionInboxView = () => renderCalls.push({ viewMode: sandbox.state.viewMode });
  sandbox.closeAutomationSecondarySurface();
  assert.equal(sandbox.state.viewMode, "inbox");
  assert.equal(storage.get("hermesWebViewMode"), "inbox");
  assert.equal(sandbox.state.automationRequestSeq, 4);
  assert.equal(sandbox.state.automationDetailRequestSeq, 8);
  assert.equal(sandbox.state.automationLoading, false);
  assert.equal(sandbox.state.automationDetailLoading, false);
  assert.equal(sandbox.state.automationRouteTargetPending, false);
  assert.ok(renderCalls.length >= 1);
  assert.equal(renderCalls.every((call) => call.viewMode === "inbox"), true);
}

const pushApiRoutes = read("server-routes/push-api-routes.js");
assert.match(pushApiRoutes, /const clientContext = body\.clientContext/);
assert.match(pushApiRoutes, /displayMode: body\.displayMode \|\| clientContext\.displayMode/);
assert.match(pushApiRoutes, /standalone: body\.standalone \?\? clientContext\.standalone/);

const webPushDeliveryService = read("adapters/web-push-delivery-service.js");
const webPushNormalizationService = read("adapters/web-push-delivery-normalization-service.js");
assert.match(webPushDeliveryService, /createWebPushDeliveryNormalizationService/);
assert.match(webPushNormalizationService, /function assertPushSubscriptionClientAllowed/);
assert.match(webPushNormalizationService, /ios_pwa_standalone_required/);
assert.match(webPushNormalizationService, /function shouldSkipPushSubscriptionForClient/);

const webPushDoc = read("docs/MODULES/web-push.md");
assert.match(webPushDoc, /same app window/i);
assert.match(webPushDoc, /must not use `window\.open`/);
assert.match(webPushDoc, /iOS Web Push/i);
assert.match(webPushDoc, /exact external app entry/i);
assert.match(webPushDoc, /derive the app-shell path/i);

const wrongPageRunbook = read("docs/RUNBOOKS/web-push-wrong-page.md");
assert.match(wrongPageRunbook, /Diagnosis Record: 2026-05-27 Scoped App-Shell Route/);
assert.match(wrongPageRunbook, /root `\/\?\.\.\.` routes/);
assert.match(wrongPageRunbook, /exact external URL\/path/i);
assert.match(wrongPageRunbook, /route\/scope problem/i);

const harnessDoc = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");
assert.match(harnessDoc, /same-window\s+navigation/);
assert.match(harnessDoc, /(?:no|not call) `window\.open`/);
assert.match(harnessDoc, /PWA standalone/);
assert.match(harnessDoc, /root-mounted and prefix-mounted app shell/);
assert.match(harnessDoc, /exact external entry path/);
assert.match(harnessDoc, /return ids for Inbox-to-Automation navigation/);

const testMatrixDoc = read("docs/TEST_MATRIX.md");
assert.match(testMatrixDoc, /root-mounted and prefix-mounted app-shell paths/);
assert.match(testMatrixDoc, /local root smoke alone is insufficient/);

Promise.resolve().then(async () => {
  const renderCalls = [];
  const sandbox = {
    URLSearchParams,
    state: {
      viewMode: "automation",
      selectedAutomationId: "job-1",
      automationRouteTargetId: "job-1",
      automationRouteTargetPending: true,
      automationRequestSeq: 0,
      automationDetailRequestSeq: 0,
      automations: [],
      automationLoading: false,
      automationLastLoadedAt: 0,
      automationCacheKey: "",
      automationFullCacheKey: "",
    },
    currentSearchText: () => "",
    automationRequestCacheKey: (params) => params.toString(),
    automationSummaryCacheKey: (params) => params.toString(),
    readAutomationFullCache: () => null,
    renderAutomationView: () => renderCalls.push(sandbox.state.viewMode),
    api: async () => {
      sandbox.state.viewMode = "inbox";
      return { data: [{ id: "job-1" }], source: {} };
    },
    mergeAutomationJobs: () => {
      throw new Error("stale Automation load must not merge after returning to Inbox.");
    },
    writeAutomationFullCache: () => {
      throw new Error("stale Automation load must not write cache after returning to Inbox.");
    },
    updateSearchButton: () => {},
    scheduleAutomationDetailHydration: () => {},
    setComposerEnabled: () => {},
    $: () => ({ textContent: "" }),
  };
  vm.runInNewContext(automationControllerUi, sandbox);
  sandbox.renderAutomationView = () => renderCalls.push(sandbox.state.viewMode);
  await sandbox.loadAutomations({ detail: "full", refresh: true, routeTarget: true });
  assert.deepEqual(renderCalls, ["automation"]);
  assert.deepEqual(sandbox.state.automations, []);
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
