"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = [
  fs.readFileSync(path.join(repoRoot, "public", "app-embedded-plugin-ui.js"), "utf8"),
  fs.readFileSync(path.join(repoRoot, "public", "app-wardrobe-ui.js"), "utf8"),
].join("\n");

function classList() {
  const values = new Set();
  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createHarness(overrides = {}) {
  const bottomPluginAvailability = [];
  const nodes = {
    bottomWardrobeMode: {
      hidden: true,
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
    },
    bottomNav: { classList: classList() },
    app: { classList: classList() },
  };
  const sandbox = {
    Date,
    Promise,
    URL,
    URLSearchParams,
    state: Object.assign({
      auth: { isOwner: true },
      selectedWorkspaceId: "weixin_test_1",
      workspaces: [],
      projects: [],
      embeddedPluginList: {
        workspaceId: "weixin_test_1",
        loading: false,
        loaded: true,
        pluginIds: [],
        requestSeq: 0,
        lastAttemptAt: Date.now(),
        error: "",
      },
    }, overrides.state || {}),
    window: {
      location: { origin: "https://hermes.example.test", href: "https://hermes.example.test/" },
      addEventListener() {},
    },
    document: {
      querySelector() {
        return null;
      },
      createElement() {
        return {};
      },
      body: {},
    },
    $: (id) => nodes[id] || null,
    api: overrides.api || (async () => ({ plugins: [] })),
    setBottomPluginMenuItemAvailability(id, available) {
      bottomPluginAvailability.push({ id, available });
    },
    updateBottomPluginMenuAvailability() {},
    updateNavigationControls() {},
  };
  if (typeof overrides.pluginTopicDefForViewMode === "function") sandbox.pluginTopicDefForViewMode = overrides.pluginTopicDefForViewMode;
  if (typeof overrides.pluginTopicBottomButtonId === "function") sandbox.pluginTopicBottomButtonId = overrides.pluginTopicBottomButtonId;
  vm.runInNewContext(source, sandbox);
  return { sandbox, nodes, bottomPluginAvailability };
}

{
  const { sandbox, nodes, bottomPluginAvailability } = createHarness({
    state: {
      embeddedPluginList: {
        workspaceId: "weixin_test_1",
        loading: false,
        loaded: true,
        pluginIds: ["wardrobe", "finance"],
        requestSeq: 1,
        lastAttemptAt: Date.now(),
        error: "",
      },
    },
  });
  assert.equal(sandbox.updateWardrobeNavigationAvailability(), true);
  assert.equal(nodes.bottomWardrobeMode.hidden, true);
  assert.equal(nodes.bottomWardrobeMode.attrs["aria-hidden"], "true");
  assert.equal(nodes.bottomNav.classList.contains("wardrobe-visible"), false);
  assert.deepEqual(bottomPluginAvailability.at(-1), { id: "wardrobe", available: true });
}

{
  const { sandbox, nodes, bottomPluginAvailability } = createHarness({
    state: {
      workspaces: [
        { id: "weixin_test_1", localConfig: { allowedToolsets: ["wardrobe"] } },
      ],
      embeddedPluginList: {
        workspaceId: "weixin_test_1",
        loading: false,
        loaded: true,
        pluginIds: ["finance"],
        requestSeq: 1,
        lastAttemptAt: Date.now(),
        error: "",
      },
    },
  });
  assert.equal(sandbox.updateWardrobeNavigationAvailability(), false);
  assert.equal(nodes.bottomWardrobeMode.hidden, true);
  assert.equal(nodes.bottomWardrobeMode.attrs["aria-hidden"], "true");
  assert.equal(nodes.bottomNav.classList.contains("wardrobe-visible"), false);
  assert.deepEqual(bottomPluginAvailability.at(-1), { id: "wardrobe", available: false });
}

{
  const { sandbox } = createHarness({
    state: {
      selectedWorkspaceId: "weixin_test_1",
      wardrobePluginManifest: {
        workspaceId: "weixin_test_1",
        entry: { url: "/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=stale-owner-style" },
      },
    },
  });
  assert.equal(sandbox.currentWardrobePluginManifest(), null);
  assert.equal(sandbox.wardrobePluginManifestMatchesLaunchContext(), false);
  sandbox.state.wardrobePluginManifest.entry.url = "/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=fresh&workspaceId=weixin_test_1";
  assert.equal(sandbox.wardrobePluginManifestMatchesLaunchContext(), true);
}

{
  const { sandbox } = createHarness({
    state: { selectedWorkspaceId: "weixin_test_1" },
  });
  const record = sandbox.embeddedPluginRecord("finance");
  Object.assign(record, {
    checked: true,
    manifestAppearanceKey: "light/default",
    manifestMaxAgeMs: 60000,
    manifest: {
      workspaceId: "weixin_test_1",
      entry: { url: "/api/hermes-plugins/finance/proxy/finance.html?launch=stale-owner-style" },
    },
  });
  assert.equal(sandbox.embeddedPluginManifestMatchesLaunchContext(record, "weixin_test_1", "light/default"), false);
  record.manifest.entry.url = "/api/hermes-plugins/finance/proxy/finance.html?launch=fresh&workspaceId=weixin_test_1";
  record.manifestFetchedAt = Date.now();
  assert.equal(sandbox.embeddedPluginManifestMatchesLaunchContext(record, "weixin_test_1", "light/default"), true);
}

{
  const { sandbox, nodes, bottomPluginAvailability } = createHarness({
    state: {
      selectedWorkspaceId: "owner",
      embeddedPluginList: {
        workspaceId: "owner",
        loading: false,
        loaded: false,
        pluginIds: [],
        requestSeq: 0,
        lastAttemptAt: 0,
        error: "",
      },
    },
  });
  assert.equal(sandbox.updateWardrobeNavigationAvailability(), true);
  assert.equal(nodes.bottomWardrobeMode.hidden, true);
  assert.equal(nodes.bottomWardrobeMode.attrs["aria-hidden"], "true");
  assert.deepEqual(bottomPluginAvailability.at(-1), { id: "wardrobe", available: true });
}

{
  const { sandbox, nodes } = createHarness({
    state: {
      selectedWorkspaceId: "owner",
      viewMode: "wardrobe",
    },
    pluginTopicDefForViewMode: () => ({ pluginId: "wardrobe" }),
    pluginTopicBottomButtonId: () => "bottomWardrobeMode",
  });
  assert.equal(sandbox.updateWardrobeNavigationAvailability(), true);
  assert.equal(nodes.bottomWardrobeMode.hidden, false);
  assert.equal(nodes.bottomWardrobeMode.attrs["aria-hidden"], "false");
}
