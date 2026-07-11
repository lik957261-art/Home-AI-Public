"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/workspace-console-model.mjs");
const classicPath = path.join(repoRoot, "public/app-workspace-console-ui.js");

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
  const source = fs.readFileSync(modelPath, "utf8");
  const classic = fs.readFileSync(classicPath, "utf8");
  const model = await import(`${pathToFileURL(modelPath).href}?test=${Date.now()}`);

  await test("workspace console model stays browser-boundary free", () => {
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.equal(model.workspaceConsoleStatusTonePlan("online"), "ok");
    assert.equal(model.workspaceConsoleStatusTonePlan("blocked"), "critical");
    assert.equal(model.workspaceConsoleStatusLabelPlan({ status: "offline" }), "离线");
  });

  await test("workspace console model renders owner and non-owner views", () => {
    const unavailable = model.renderClassicWorkspaceConsoleView({ isOwner: false });
    assert.match(unavailable, /当前账号没有 Owner 权限/);

    const html = model.renderClassicWorkspaceConsoleView({
      isOwner: true,
      model: {
        status: "ready",
        data: {
          overallStatus: "ok",
          counts: { total: 1, localCodex: 1 },
          sections: {
            localCodex: {
              id: "localCodex",
              title: "本机 Codex 工作区",
              items: [{ id: "home-ai", name: "Home AI", kind: "local_codex", status: "ok" }],
            },
          },
        },
      },
    });
    assert.match(html, /data-workspace-console/);
    assert.match(html, /Home AI/);
    assert.match(html, /本机 Codex 工作区/);
    assert.doesNotMatch(html, /<script/i);
  });

  await test("classic workspace console imports the generated ESM model", () => {
    assert.match(classic, /WORKSPACE_CONSOLE_ESM_MODEL_PATH/);
    assert.match(classic, /\/vite-islands\/workspace-console-model\/workspace-console-model\.js/);
    assert.match(classic, /importWorkspaceConsoleModel/);
    assert.match(classic, /renderClassicWorkspaceConsoleView/);
  });
})();
