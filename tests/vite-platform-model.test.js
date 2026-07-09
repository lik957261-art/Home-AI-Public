"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/platform-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("platform model stays browser-global free", () => {
    const source = read("src/vite-islands/navigation-shell/platform-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|navigator|history)\s*[\.\[]/);
    assert.doesNotMatch(source, /\b(?:fetch|setTimeout)\s*\(/);
    assert.match(source, /PLATFORM_MODEL_VERSION/);
  });

  await test("platform model normalizes route aliases and plugin context candidates", () => {
    assert.equal(model.normalizedRouteViewPlan("owner-console"), "system-console");
    assert.equal(model.normalizedRouteViewPlan("codex-mobile"), "codex");
    assert.equal(model.normalizedRouteViewPlan("projects"), "projects");
    assert.equal(model.normalizedRouteViewPlan("unknown", "tasks"), "tasks");
    assert.equal(model.pluginContextIdFromTaskGroupIdPlan("plugin:finance"), "finance");
    assert.deepEqual(model.routePluginContextCandidatesPlan({
      explicit: "",
      taskGroupId: "plugin:email",
      pluginId: "finance",
      routeView: "tasks",
    }), ["email", "finance", "tasks"]);
    assert.equal(model.routePluginContextIdPlan({ pluginId: "codex-mobile" }), "");
    assert.equal(model.routePluginContextIdPlan({ pluginId: "wardrobe" }), "wardrobe");
  });

  await test("platform model plans same-origin shell routes without raw side effects", () => {
    assert.deepEqual(model.sameOriginRouteUrlPlan({
      value: "/hermes-mobile/?view=tasks#reply",
      origin: "https://home.example.test",
    }), {
      ok: true,
      href: "https://home.example.test/hermes-mobile/?view=tasks#reply",
      pathname: "/hermes-mobile/",
      search: "?view=tasks",
      hash: "#reply",
    });
    assert.equal(model.sameOriginRouteUrlPlan({
      value: "https://other.example.test/?view=tasks",
      origin: "https://home.example.test",
    }).ok, false);
    assert.equal(model.normalizeHermesAppShellPathPlan("/hermes-mobile/index.html"), "/");
    assert.equal(model.normalizeHermesAppShellPathPlan("/hermes-mobile"), "/hermes-mobile/");
    assert.equal(model.hermesAppShellPathPlan({
      currentPathname: "/hermes-mobile/",
      pathname: "/",
    }), "/hermes-mobile/");
    assert.equal(model.hermesAppShellRouteForSearchPlan({
      currentPathname: "/hermes-mobile/",
      search: "view=tasks",
    }), "/hermes-mobile/?view=tasks&source=pwa");
  });

  await test("platform model identifies protected detail routes and startup reset plans", () => {
    assert.equal(model.routeParamsHaveHermesOwnedDetailTargetPlan(new URLSearchParams("messageId=m1")), true);
    assert.equal(model.routeParamsHaveHermesOwnedDetailTargetPlan(new URLSearchParams("view=tasks")), false);
    assert.equal(model.startupErrorMessagePlan({
      message: "Failed to fetch",
      stage: "状态",
    }), "无法载入工作区（状态），请检查网络后重试。");
    assert.equal(model.startupAutoResetPlan({
      message: "network",
      targetVersion: "20260705",
      clientVersion: "20260704",
      alreadyReset: false,
    }).shouldReset, true);
    assert.equal(model.startupAutoResetPlan({
      message: "unauthorized",
    }).shouldReset, false);
  });

  await test("platform model detects mobile browser-shell metadata from explicit inputs", () => {
    assert.equal(model.mobileBrowserShellDetectionPlan({
      standalone: true,
      userAgent: "iPhone",
      maxTouchPoints: 5,
      widths: [390],
    }), false);
    assert.equal(model.mobileBrowserShellDetectionPlan({
      standalone: false,
      userAgent: "Mozilla/5.0 (iPhone)",
      maxTouchPoints: 5,
      widths: [390],
    }), true);
    assert.equal(model.mobileBrowserShellDetectionPlan({
      standalone: false,
      userAgent: "Desktop",
      coarsePointer: false,
      touchCapable: false,
      widths: [1280],
    }), false);
    assert.equal(model.mobileBrowserShellDiagnosticTextPlan({
      clientVersion: "v1",
      standalone: false,
      width: 390,
      maxTouchPoints: 5,
    }), "client=v1 mode=browser width=390 touch=5");
  });

  await test("route apply inputs stay data-only", () => {
    const plan = model.routeApplyInputsPlan(new URLSearchParams("taskGroupId=chat&groupChat=1"));
    assert.equal(plan.taskGroupId, "chat");
    assert.equal(plan.groupChatRequested, true);
    assert.equal(plan.routeView, "tasks");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
