"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-workspace-console-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const appAutomation = fs.readFileSync(path.join(repoRoot, "public", "app-automation-ui.js"), "utf8");
const appNavigationSearch = fs.readFileSync(path.join(repoRoot, "public", "app-navigation-search-ui.js"), "utf8");
const appWireStart = fs.readFileSync(path.join(repoRoot, "public", "app-wire-start-ui.js"), "utf8");
const appPlatform = fs.readFileSync(path.join(repoRoot, "public", "app-platform-ui.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");

function makeElement() {
  return {
    innerHTML: "",
    textContent: "",
    disabled: false,
    classList: {
      toggle() {},
      add() {},
      remove() {},
    },
  };
}

const elements = new Map();
function $(id) {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
}

let apiCalls = [];
let facadeEvents = [];
const sandbox = {
  state: {
    auth: { isOwner: false },
  },
  $,
  api(endpoint) {
    apiCalls.push(endpoint);
    return Promise.resolve({});
  },
  HomeAiRuntimeFacade: {
    api(endpoint) {
      apiCalls.push(endpoint);
      return Promise.resolve({
        ok: true,
        workspaceConsole: {
          ok: true,
          overallStatus: "ok",
          overallStatusLabel: "正常",
          counts: {
            total: 2,
            localCodex: 1,
            remoteCodex: 1,
            activeTaskCards: 1,
            pendingApprovals: 0,
            blocked: 0,
            offline: 0,
            stale: 0,
          },
          sections: {
            localCodex: {
              id: "localCodex",
              title: "本机 Codex 工作区",
              status: "warning",
              statusLabel: "注意",
              count: 2,
              items: [
                {
                  id: "home-ai",
                  kind: "local_codex",
                  kindLabel: "本机 Codex",
                  name: "Home AI",
                  status: "ok",
                  statusLabel: "正常",
                  cwdLabel: ".../HermesMobileDev/app",
                  mainThread: { status: "ok", statusLabel: "正常", label: "Home AI 07-05" },
                  workerLane: { status: "ok", statusLabel: "正常", label: "Home AI Worker Lane A" },
                  deployLane: { status: "ok", statusLabel: "正常", label: "Home AI Deploy lane pool" },
                  activeTaskCardCount: 0,
                  pendingApprovalCount: 0,
                  escalationCount: 0,
                  issueCodes: [],
                },
                {
                  id: "codex-mobile",
                  kind: "local_codex",
                  kindLabel: "本机 Codex",
                  name: "Codex Mobile Web",
                  status: "warning",
                  statusLabel: "注意",
                  cwdLabel: ".../plugins/codex-mobile-web",
                  mainThread: { status: "ok", statusLabel: "正常", label: "codex mobile" },
                  workerLane: { status: "warning", statusLabel: "注意", label: "未配置" },
                  deployLane: { status: "ok", statusLabel: "正常", label: "Codex Mobile Deploy Lane" },
                  activeTaskCardCount: 0,
                  pendingApprovalCount: 0,
                  escalationCount: 0,
                  issueCodes: ["worker_lane_missing"],
                },
              ],
            },
            remoteCodex: {
              id: "remoteCodex",
              title: "远程 Codex 工作区",
              status: "online",
              statusLabel: "在线",
              count: 1,
              items: [
                {
                  id: "lane-a",
                  kind: "remote_codex",
                  kindLabel: "远程 Codex",
                  name: "Lane A",
                  status: "online",
                  statusLabel: "在线",
                  cwdLabel: "HermesMobileDev/app",
                  nodeId: "node-a",
                  sessionState: "connected",
                  lastHeartbeatAt: "2026-07-08T03:00:00.000Z",
                  activeTaskCardCount: 1,
                  pendingApprovalCount: 0,
                  escalationCount: 0,
                  issueCodes: [],
                  latestTaskCard: {
                    taskCardId: "ttc_remote_1",
                    title: "Bounded task",
                  },
                },
              ],
            },
          },
        },
      });
    },
    events: {
      emit(type, detail) {
        facadeEvents.push({ type, detail });
      },
    },
  },
  configureComposer(options) {
    sandbox.lastComposerOptions = options;
  },
  updateNavigationControls() {},
  ensureVerticalScrollAffordance() {},
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },
  module: { exports: {} },
};

vm.runInNewContext(`${source}
this.WorkspaceConsoleUiTest = {
  renderWorkspaceConsoleView,
  loadWorkspaceConsole,
  renderWorkspaceConsoleRow,
  renderWorkspaceConsoleSection,
};`, sandbox);

const ui = sandbox.WorkspaceConsoleUiTest;

assert.equal(typeof ui.renderWorkspaceConsoleView, "function");
assert.equal(typeof ui.loadWorkspaceConsole, "function");
assert.equal(typeof sandbox.module.exports.loadWorkspaceConsole, "function");
assert.match(source, /WORKSPACE_CONSOLE_API_PATH = "\/api\/owner\/workspace-console"/);
assert.match(source, /data-workspace-console/);
assert.match(source, /data-workspace-console-refresh/);
assert.match(source, /data-workspace-console-section/);
assert.doesNotMatch(source, /\blocalStorage\b/);
assert.match(styles, /\.workspace-console \{/);
assert.match(styles, /\.workspace-console-grid/);
assert.match(styles, /\.nav-workspace-icon::before/);
assert.match(indexHtml, /id="bottomWorkspaceMode"[\s\S]*aria-label="工作区"/);
assert.match(indexHtml, /app-workspace-console-ui\.js\?v=20260709-owner-workspace-tab-v1138/);
assert.match(appAutomation, /workspaceConsole: state\.viewMode === "workspace-console"/);
assert.match(appAutomation, /const ownerWorkspaceConsoleAvailable = Boolean\(state\.auth\?\.isOwner\)/);
assert.match(appAutomation, /bottomWorkspaceMode"\)\.hidden = !ownerWorkspaceConsoleAvailable/);
assert.match(appAutomation, /if \(workspaceConsole && !ownerWorkspaceConsoleAvailable\) \{[\s\S]*?state\.viewMode = "inbox"/);
assert.match(appAutomation, /state\.viewMode === "workspace-console"[\s\S]*loadWorkspaceConsole/);
assert.match(appNavigationSearch, /if \(!state\.auth\?\.isOwner\) hiddenBottomTabs\.add\("bottomWorkspaceMode"\)/);
assert.match(appWireStart, /bottomWorkspaceMode"\)\?\.addEventListener\("click", async \(\) => \{/);
assert.match(appWireStart, /if \(!state\.auth\?\.isOwner\) \{[\s\S]*?工作区控制台仅限 Owner 使用[\s\S]*?return;/);
assert.match(appPlatform, /view === "workspace-console" \|\| view === "workspace" \|\| view === "workspaces"/);

const sampleRow = ui.renderWorkspaceConsoleRow({
  id: "lane-a",
  kind: "remote_codex",
  kindLabel: "远程 Codex",
  name: "Lane A",
  status: "online",
  statusLabel: "在线",
  activeTaskCardCount: 1,
  issueCodes: [],
}, "lane-a");
assert.match(sampleRow, /data-workspace-kind="remote_codex"/);
assert.match(sampleRow, /aria-expanded="true"/);
assert.match(sampleRow, /Issue/);
assert.match(sampleRow, /Worker/);
assert.doesNotMatch(sampleRow, /个目录/);
assert.doesNotMatch(sampleRow, /插件绑定/);

(async () => {
  await ui.loadWorkspaceConsole();
  assert.deepEqual(apiCalls, [], "non-owner gate must not call workspace console API");
  assert.match($("conversation").innerHTML, /当前账号没有 Owner 权限/);
  assert.equal(sandbox.lastComposerOptions.enabled, false);

  sandbox.state.auth.isOwner = true;
  apiCalls = [];
  facadeEvents = [];
  await ui.loadWorkspaceConsole({ refresh: true });
  assert.deepEqual(apiCalls, ["/api/owner/workspace-console"]);
  assert.match($("conversation").innerHTML, /Codex 工作区/);
  assert.match($("conversation").innerHTML, /本机 Codex 工作区/);
  assert.match($("conversation").innerHTML, /远程 Codex 工作区/);
  assert.match($("conversation").innerHTML, /data-workspace-console-row/);
  assert.match($("conversation").innerHTML, /Codex Mobile Web/);
  assert.match($("conversation").innerHTML, /Lane A/);
  assert.doesNotMatch($("conversation").innerHTML, /位置 /);
  assert.doesNotMatch($("conversation").innerHTML, /个目录/);
  assert.doesNotMatch($("conversation").innerHTML, /插件绑定/);
  assert.ok(facadeEvents.some((event) => event.type === "workspace-console:loaded" && event.detail.status === "ok"));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
