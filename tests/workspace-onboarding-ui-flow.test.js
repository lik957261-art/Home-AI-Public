"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-access-key-manager-ui.js"), "utf8");

const calls = [];
const context = {
  console,
  state: {
    workspaceOnboardingPlan: null,
    workspaceOnboardingResult: null,
    workspaceOnboardingLoading: false,
    workspaceOnboardingError: "",
    workspaceOnboardingRun: null,
    workspaceOnboardingDraft: null,
    generatedAccessKey: null,
  },
  document: {
    querySelector(selector) {
      if (selector === "#workspaceOnboardingWorkspaceId") return { value: "XJZ" };
      if (selector === "#workspaceOnboardingDisplayName") return { value: "" };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="workspaceOnboardingPlugin"]:checked') {
        return [{ value: "wardrobe" }, { value: "health" }];
      }
      return [];
    },
  },
  $(id) {
    return id === "accessKeyOverlay" ? context.document : null;
  },
  async api(url, options = {}) {
    calls.push({ url, body: JSON.parse(options.body || "{}") });
    if (url === "/api/workspace-onboarding/plan") {
      return {
        ok: true,
        status: "planned",
        workspaceId: "xjz",
        displayName: "XJZ",
        macUser: "hm-xjz",
        pluginIds: ["wardrobe", "health"],
        steps: [{ id: "workspace.record", status: "planned" }],
      };
    }
    if (url === "/api/workspace-onboarding/apply") {
      return {
        ok: true,
        status: "active",
        workspaceId: "xjz",
        displayName: "XJZ",
        pluginIds: ["wardrobe", "health"],
        credentials: { homeAiAccessKey: "redacted-test-key" },
        steps: [{ id: "workspace.record", status: "ok" }],
      };
    }
    throw new Error(`unexpected api call: ${url}`);
  },
  showError(err) {
    throw err;
  },
  async loadWorkspaces() {},
  async loadProjects() {},
  async loadAccessKeyManager() {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  window: {
    requestAnimationFrame(callback) {
      callback();
    },
  },
};

vm.createContext(context);
vm.runInContext(source, context);
context.renderAccessKeyManager = () => calls.push({ url: "render" });

assert.strictEqual(typeof context.applyWorkspaceOnboardingFromAccessKeyManager, "function");
assert.strictEqual(typeof context.bindWorkspaceOnboardingAction, "function");

(async () => {
  const listeners = {};
  let activated = 0;
  const button = {
    disabled: false,
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
  };
  context.bindWorkspaceOnboardingAction(button, async () => { activated += 1; });
  assert.deepStrictEqual(Object.keys(listeners).sort(), ["click", "pointerup", "touchend"]);
  const event = { prevented: 0, preventDefault() { this.prevented += 1; } };
  listeners.pointerup(event);
  listeners.click(event);
  await Promise.resolve();
  assert.strictEqual(activated, 1);
  assert.strictEqual(event.prevented, 2);

  await context.applyWorkspaceOnboardingFromAccessKeyManager();

  const apiCalls = calls.filter((call) => call.url.startsWith("/api/"));
  assert.deepStrictEqual(apiCalls.map((call) => call.url), [
    "/api/workspace-onboarding/plan",
    "/api/workspace-onboarding/apply",
    "/api/access-keys",
  ]);
  assert.deepStrictEqual(apiCalls[0].body, {
    workspaceId: "xjz",
    displayName: "XJZ",
    label: "XJZ",
    pluginIds: ["wardrobe", "health"],
    runSmokes: true,
  });
  assert.deepStrictEqual(apiCalls[1].body, apiCalls[0].body);
  assert.deepStrictEqual(apiCalls[2].body, {});
  assert.strictEqual(context.state.workspaceOnboardingError, "");
  assert.strictEqual(context.state.workspaceOnboardingResult.credentials.homeAiAccessKey, true);
  assert.strictEqual(context.state.generatedAccessKey.workspaceId, "xjz");
  assert.strictEqual(context.state.generatedAccessKey.key, "redacted-test-key");

  console.log("workspace onboarding UI flow harness passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
