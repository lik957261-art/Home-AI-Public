"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

async function loadModel() {
  return import(path.join(repoRoot, "src/vite-islands/plugin-host/wardrobe-model.mjs"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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

  await test("wardrobe model stays browser-global free", () => {
    const source = read("src/vite-islands/plugin-host/wardrobe-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|localStorage|sessionStorage|fetch|postMessage|setTimeout)\b/);
    assert.match(source, /WARDROBE_MODEL_VERSION/);
  });

  await test("route and directory plans identify wardrobe projects and children", () => {
    const project = {
      id: "project-a",
      label: "Home",
      root: "/fixture-project",
      children: [
        { id: "closet", label: "衣橱", root: "/fixture-project/closet" },
        { id: "notes", label: "Notes", root: "/fixture-project/notes" },
      ],
    };
    const candidates = model.wardrobeDirectoryCandidatesPlan([project]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].child.id, "closet");
    assert.match(model.wardrobeChildRouteText(project.children[0]), /closet|衣橱/);
    assert.equal(model.itemLooksWardrobe({ label: "summer outfit" }), true);
    assert.equal(model.itemLooksWardrobeDirectory({ label: "finance" }), false);
    assert.deepEqual(model.wardrobeDirectoryAttachmentPlan({
      candidate: candidates[0],
      projectLabel: "Home",
    }), {
      projectId: "project-a",
      subprojectId: "closet",
      label: "Home / 衣橱",
      root: "/fixture-project/closet",
      path: "/fixture-project/closet",
    });
  });

  await test("workspace toolset and entry availability plans stay explicit", () => {
    const toolsets = model.workspaceToolsetsPlan({
      localConfig: { allowedToolsets: ["wardrobe", "file"] },
      bindings: { allowedToolsets: ["wardrobe", "vision"] },
    });
    assert.deepEqual(toolsets, ["wardrobe", "file", "vision"]);
    assert.equal(model.wardrobeEntryAvailabilityPlan({
      workspaceId: "owner",
      isOwner: true,
      pluginNavigationAvailable: false,
      directoryAttachmentAvailable: false,
      toolsets,
    }).available, true);
    assert.equal(model.wardrobeEntryAvailabilityPlan({
      workspaceId: "child",
      isOwner: false,
      pluginNavigationAvailable: false,
      directoryAttachmentAvailable: true,
      toolsets,
    }).available, false);
    assert.equal(model.wardrobeEntryAvailabilityPlan({
      workspaceId: "child",
      pluginNavigationAvailable: true,
      toolsets: [],
    }).available, true);
  });

  await test("manifest launch context and proxy workspace matching fail closed", () => {
    const manifest = {
      workspaceId: "owner",
      entry: { url: "/api/hermes-plugins/wardrobe/proxy/?workspaceId=owner&launch=secret" },
    };
    assert.equal(model.wardrobeProxyEntryWorkspaceMatches(manifest.entry.url, "owner"), true);
    assert.equal(model.wardrobeProxyEntryWorkspaceMatches(manifest.entry.url, "family"), false);
    assert.equal(model.wardrobeProxyEntryWorkspaceMatches("/api/hermes-plugins/finance/proxy/?workspaceId=family", "owner"), true);
    assert.equal(model.wardrobeManifestMatchesLaunchContextPlan({ manifest, workspaceId: "owner" }).matches, true);
    assert.equal(model.wardrobeManifestMatchesLaunchContextPlan({ manifest, workspaceId: "family" }).matches, false);
  });

  await test("security, origin, route, and frame plans preserve classic semantics", () => {
    const manifest = {
      available: true,
      kind: "embedded_app",
      entry: { url: "http://wardrobe.example.test/app?workspaceId=owner" },
      embed: { tokenStatus: "launch_token_issued" },
    };
    const security = model.wardrobePluginBlockedByPageSecurityPlan({
      manifest,
      pageProtocol: "https:",
      baseUrl: "https://home.example.test/",
    });
    assert.equal(security.blocked, true);
    assert.equal(security.mixedContentBlocked, true);
    assert.equal(model.wardrobePluginUsesLaunchToken(manifest), true);
    assert.equal(model.wardrobePluginEntryOriginPlan({ manifest }), "http://wardrobe.example.test");
    assert.equal(model.wardrobeLaunchTokenFreshPlan({
      freshForFrame: true,
      fetchedAt: 1000,
      now: 30000,
    }).fresh, true);
    assert.equal(model.wardrobeLaunchTokenFreshPlan({
      freshForFrame: true,
      fetchedAt: 1000,
      now: 90000,
    }).fresh, false);
    const route = model.normalizeWardrobePluginOpenRoute({
      pluginRoute: "item",
      pluginItemId: "coat",
      ignored: "x",
    });
    assert.deepEqual(route, { pluginRoute: "item", pluginItemId: "coat" });
    assert.equal(
      model.wardrobePluginEntryUrlForFramePlan({
        entryUrl: "/api/hermes-plugins/wardrobe/proxy/?workspaceId=owner&launch=abc",
        route,
      }),
      "/api/hermes-plugins/wardrobe/proxy/?workspaceId=owner&launch=abc&pluginRoute=item&pluginItemId=coat&pluginId=wardrobe",
    );
    assert.equal(model.wardrobePluginMessageOriginAllowedPlan({
      expectedOrigin: "https://wardrobe.example.test",
      eventOrigin: "https://wardrobe.example.test",
    }), true);
    assert.equal(model.wardrobePluginFramePreservationPlan({
      usesLaunchToken: true,
      launchTokenFresh: false,
      navigationLastAt: 0,
      currentFrameUsesEntry: false,
    }).preserve, false);
    assert.equal(model.wardrobePluginFramePreservationPlan({
      usesLaunchToken: true,
      launchTokenFresh: false,
      navigationLastAt: 10,
      currentFrameUsesEntry: false,
    }).preserve, true);
  });

  await test("unavailable view plan returns data-only copy for classic escaping", () => {
    const plan = model.wardrobePluginUnavailableViewPlan({
      manifest: {
        code: "blocked",
        warning: "unsafe <copy>",
        entry: { url: "https://wardrobe.example.test/app" },
      },
      security: { blocked: true, frameAncestorBlocked: true },
    });
    assert.equal(plan.code, "blocked");
    assert.equal(plan.warning, "unsafe <copy>");
    assert.equal(plan.securityNoticeVisible, true);
    assert.match(plan.securityReason, /Home AI/);
    assert.equal(plan.entryOrigin, "https://wardrobe.example.test/app");
    assert.equal(plan.retryLabel, "重试");
  });
})();
