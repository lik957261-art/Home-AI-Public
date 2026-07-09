"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-wardrobe-ui.js"), "utf8");

function createClassList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const nodes = {
    bottomWardrobeMode: {
      hidden: true,
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
    },
    bottomNav: { classList: createClassList() },
    app: { classList: createClassList() },
    conversation: { innerHTML: "" },
  };
  const context = {
    console,
    Promise,
    URL,
    URLSearchParams,
    Date: { now: () => 100000 },
    globalThis: null,
    window: {
      location: { origin: "https://home.example.test", protocol: "https:", href: "https://home.example.test/" },
      addEventListener() {},
      __homeAiImportWardrobeModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    document: {
      createElement() {
        return {
          hidden: true,
          classList: createClassList(),
          setAttribute() {},
          querySelector() {
            return null;
          },
        };
      },
      querySelector() {
        return null;
      },
      body: { appendChild() {} },
    },
    state: {
      auth: { isOwner: true },
      selectedWorkspaceId: "owner",
      workspaces: [
        { id: "owner", localConfig: { allowedToolsets: ["wardrobe"] } },
      ],
      projects: [],
      embeddedPluginList: {
        workspaceId: "owner",
        loading: false,
        loaded: true,
        pluginIds: [],
        lastAttemptAt: 100000,
      },
      wardrobePluginManifest: null,
    },
    $(id) {
      return nodes[id] || null;
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    projectDisplayLabel(project) {
      return project?.label || project?.id || "";
    },
    directoryAttachmentFromRoute(projectId, subprojectId, root, label) {
      return { projectId, subprojectId, root, path: root, label, fromHelper: true };
    },
    embeddedPluginListedForWorkspace(pluginId) {
      return pluginId === "wardrobe" && context.state.embeddedPluginList.pluginIds.includes("wardrobe");
    },
    embeddedPluginListState() {
      return context.state.embeddedPluginList;
    },
    refreshEmbeddedPluginList: async () => calls.push(["refresh-list"]),
    setBottomPluginMenuItemAvailability(id, available) {
      calls.push(["bottom-availability", id, available]);
    },
    updateBottomPluginMenuAvailability() {},
    updateNavigationControls() {},
    __calls: calls,
    __nodes: nodes,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__wardrobeHarness = {
  WARDROBE_MODEL_ESM_PATH,
  importWardrobeModel,
  currentWardrobeModel,
  wardrobeRouteText,
  itemLooksWardrobeDirectory,
  wardrobeChildRouteText,
  selectedWorkspaceToolsets,
  wardrobeDirectoryCandidates,
  wardrobeDirectoryAttachment,
  wardrobeEntryAvailable,
  wardrobePluginProxyEntryWorkspaceMatches,
  wardrobePluginManifestMatchesLaunchContext,
  wardrobePluginAvailable,
  wardrobePluginUsesLaunchToken,
  wardrobeLaunchTokenIsFreshForFrame,
  wardrobePluginBlockedByPageSecurity,
  wardrobePluginEntryOrigin,
  normalizeWardrobePluginOpenRoute,
  wardrobePluginEntryUrlForFrame,
  wardrobePluginMessageOriginAllowed,
  renderWardrobePluginUnavailable,
};`, context, { filename: "app-wardrobe-ui.js" });
  return context;
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
  await test("classic wardrobe adapter declares bounded ESM markers", () => {
    assert.match(source, /WARDROBE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/wardrobe-model\/wardrobe-model\.js/);
    assert.match(source, /__homeAiImportWardrobeModel/);
    assert.match(source, /importWardrobeModel/);
    assert.match(source, /currentWardrobeModel/);
    assert.match(source, /wardrobeEntryAvailabilityPlan/);
    assert.match(source, /wardrobePluginFramePreservationPlan/);
  });

  await test("classic adapter imports and delegates pure plans to wardrobe model", async () => {
    const fakeModel = {
      wardrobeRouteText() {
        return "model-route";
      },
      itemLooksWardrobeDirectory() {
        return true;
      },
      wardrobeChildRouteText() {
        return "model-child";
      },
      workspaceToolsetsPlan() {
        return ["model-toolset"];
      },
      wardrobeDirectoryCandidatesPlan() {
        return [{
          project: { id: "p1", label: "Project", root: "/root" },
          child: { id: "c1", label: "Closet", root: "/root/closet" },
          score: 4,
        }];
      },
      wardrobeDirectoryAttachmentPlan() {
        return { projectId: "p1", subprojectId: "c1", label: "Planned", root: "/root/closet", path: "/root/closet" };
      },
      wardrobeEntryAvailabilityPlan() {
        return { available: true };
      },
      wardrobeProxyEntryWorkspaceMatches() {
        return "workspace-match";
      },
      wardrobeManifestMatchesLaunchContextPlan() {
        return { matches: "manifest-match" };
      },
      wardrobePluginAvailable() {
        return "available";
      },
      wardrobePluginUsesLaunchToken() {
        return "uses-token";
      },
      wardrobeLaunchTokenFreshPlan() {
        return { fresh: "fresh" };
      },
      wardrobePluginBlockedByPageSecurityPlan() {
        return { blocked: true, frameAncestorBlocked: true };
      },
      wardrobePluginEntryOriginPlan() {
        return "https://model.example.test";
      },
      normalizeWardrobePluginOpenRoute() {
        return { pluginRoute: "model" };
      },
      wardrobePluginEntryUrlForFramePlan() {
        return "/planned-frame";
      },
      wardrobePluginMessageOriginAllowedPlan() {
        return "origin-allowed";
      },
      wardrobePluginUnavailableViewPlan() {
        return {
          code: "model-code",
          warning: "model <warning>",
          securityTitle: "model-title",
          securityReason: "model-reason",
          entryOrigin: "https://model.example.test",
          retryLabel: "model-retry",
        };
      },
    };
    const harness = createHarness(fakeModel);
    const api = harness.__wardrobeHarness;
    assert.equal(api.WARDROBE_MODEL_ESM_PATH, "/vite-islands/wardrobe-model/wardrobe-model.js");
    assert.equal(await api.importWardrobeModel(harness.window), fakeModel);
    assert.equal(api.currentWardrobeModel(), fakeModel);
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/wardrobe-model/wardrobe-model.js"]);
    assert.equal(api.wardrobeRouteText({}), "model-route");
    assert.equal(api.itemLooksWardrobeDirectory({}), true);
    assert.equal(api.wardrobeChildRouteText({}), "model-child");
    assert.deepEqual(api.selectedWorkspaceToolsets(), ["model-toolset"]);
    assert.equal(api.wardrobeDirectoryCandidates()[0].child.id, "c1");
    assert.deepEqual(api.wardrobeDirectoryAttachment(), {
      projectId: "p1",
      subprojectId: "c1",
      root: "/root/closet",
      path: "/root/closet",
      label: "Planned",
      fromHelper: true,
    });
    assert.equal(api.wardrobeEntryAvailable(), true);
    assert.equal(api.wardrobePluginProxyEntryWorkspaceMatches("/x", "owner"), "workspace-match");
    assert.equal(api.wardrobePluginManifestMatchesLaunchContext({}, "owner"), "manifest-match");
    assert.equal(api.wardrobePluginAvailable({}), "available");
    assert.equal(api.wardrobePluginUsesLaunchToken({}), "uses-token");
    assert.equal(api.wardrobeLaunchTokenIsFreshForFrame(), "fresh");
    assert.equal(api.wardrobePluginBlockedByPageSecurity({}), true);
    assert.equal(api.wardrobePluginEntryOrigin({}), "https://model.example.test");
    assert.deepEqual(api.normalizeWardrobePluginOpenRoute({}), { pluginRoute: "model" });
    assert.equal(api.wardrobePluginEntryUrlForFrame("/x"), "/planned-frame");
    assert.equal(api.wardrobePluginMessageOriginAllowed({ origin: "x" }), "origin-allowed");
    const html = api.renderWardrobePluginUnavailable({});
    assert.match(html, /model-code/);
    assert.match(html, /model &lt;warning&gt;/);
    assert.match(html, /model-retry/);
  });

  await test("classic adapter fallback preserves wardrobe plugin behavior without model", async () => {
    const harness = createHarness(null);
    const api = harness.__wardrobeHarness;
    await api.importWardrobeModel(harness.window);
    assert.equal(api.currentWardrobeModel(), null);
    assert.match(api.wardrobeRouteText({ label: "衣橱" }), /衣橱/);
    assert.equal(api.itemLooksWardrobeDirectory({ label: "closet" }), true);
    assert.deepEqual(Array.from(api.selectedWorkspaceToolsets()), ["wardrobe"]);
    harness.state.projects = [{
      id: "p1",
      label: "Project",
      root: "/root",
      children: [{ id: "closet", label: "Closet", root: "/root/closet" }],
    }];
    assert.equal(api.wardrobeDirectoryCandidates().length, 1);
    assert.equal(api.wardrobeEntryAvailable(), true);
    assert.equal(
      api.wardrobePluginProxyEntryWorkspaceMatches("/api/hermes-plugins/wardrobe/proxy/?workspaceId=owner", "owner"),
      true,
    );
    assert.equal(
      api.wardrobePluginManifestMatchesLaunchContext({
        workspaceId: "owner",
        entry: { url: "/api/hermes-plugins/wardrobe/proxy/?workspaceId=owner" },
      }, "owner"),
      true,
    );
    assert.equal(api.wardrobePluginAvailable({
      available: true,
      kind: "embedded_app",
      entry: { url: "/x" },
    }), true);
    assert.equal(api.wardrobePluginUsesLaunchToken({ entry: { url: "/x?launch=abc" } }), true);
    harness.state.wardrobePluginManifestFreshForFrame = true;
    harness.state.wardrobePluginManifestFetchedAt = 90000;
    assert.equal(api.wardrobeLaunchTokenIsFreshForFrame(), true);
    assert.equal(api.wardrobePluginBlockedByPageSecurity({
      available: true,
      kind: "embedded_app",
      entry: { url: "http://wardrobe.example.test/" },
    }), true);
    assert.equal(api.wardrobePluginEntryOrigin({
      entry: { url: "https://wardrobe.example.test/app" },
    }), "https://wardrobe.example.test");
    harness.state.wardrobePluginOpenRoute = { pluginRoute: "item", pluginItemId: "coat" };
    assert.match(api.wardrobePluginEntryUrlForFrame("/api/hermes-plugins/wardrobe/proxy/?workspaceId=owner"), /pluginId=wardrobe/);
    assert.equal(api.wardrobePluginMessageOriginAllowed({ origin: "https://wardrobe.example.test" }), false);
    const html = api.renderWardrobePluginUnavailable({ warning: "unsafe <warning>" });
    assert.match(html, /unsafe &lt;warning&gt;/);
    assert.match(html, /data-wardrobe-plugin-refresh/);
  });
})();
