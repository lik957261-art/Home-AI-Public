"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const richTextDirectoryUi = fs.readFileSync(path.join(repoRoot, "public", "app-rich-text-directory-ui.js"), "utf8");

function createHarness(projects) {
  const sandbox = {
    state: { projects },
    projectDisplayLabel(project) {
      return project?.label || project?.id || "";
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${richTextDirectoryUi}
globalThis.__directoryRouteHarness = {
  resolve: resolveDirectoryProjectRoute,
};`, sandbox);
  return sandbox.__directoryRouteHarness;
}

{
  const harness = createHarness([
    {
      id: "health",
      label: "Health",
      root: "/data/drive/users/weixin_stephen/Hermes-Stephen/Health",
    },
    {
      id: "health",
      label: "Health",
      root: "/data/drive/users/weixin_wuping/Hermes-Wuping/Health",
    },
  ]);

  const route = harness.resolve({
    projectId: "health",
    label: "Health",
    path: "/data/drive/users/weixin_wuping/Hermes-Wuping/Health",
  });

  assert.equal(route.root, "/data/drive/users/weixin_wuping/Hermes-Wuping/Health");
}

console.log("directory-route-ui tests passed");
