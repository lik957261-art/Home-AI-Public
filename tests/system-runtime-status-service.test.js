"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  assistantLabelForRuntimeConfig,
  compareClientVersions,
  createSystemRuntimeStatusService,
  gitRemoteRawIndexUrl,
  normalizeReasoningEffort,
  parseAgentRuntimeConfigFromYaml,
  parseClientVersionFromHtml,
} = require("../adapters/system-runtime-status-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-system-runtime-status-"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function gitRunner(responses, calls = []) {
  return async function run(args, options) {
    const key = args.join(" ");
    calls.push({ key, options });
    const value = responses[key];
    if (value instanceof Error) throw value;
    if (typeof value === "function") return value(args, options);
    if (value) return value;
    return { ok: false, status: 1, stdout: "", stderr: `unexpected git command: ${key}` };
  };
}

function makeIndex(root, version = "20260514-2100") {
  const indexPath = path.join(root, "public", "index.html");
  writeFile(indexPath, `<!doctype html><html data-client-version="${version}"></html>`);
  return indexPath;
}

function testPureHelpersMatchServerRules() {
  assert.equal(normalizeReasoningEffort("minimal"), "low");
  assert.equal(normalizeReasoningEffort("none"), "none");
  assert.equal(normalizeReasoningEffort("XHIGH"), "xhigh");
  assert.equal(normalizeReasoningEffort("custom-secret-value"), "");

  assert.deepEqual(parseAgentRuntimeConfigFromYaml(`
agent.reasoning-effort: high
model:
  default: "claude-3-7"
  provider: anthropic
  base_url: https://api.example.invalid
`), {
    reasoningEffort: "high",
    defaultModel: "claude-3-7",
    provider: "anthropic",
    baseUrl: "https://api.example.invalid",
  });

  assert.equal(assistantLabelForRuntimeConfig({ provider: "openai-codex" }), "ChatGPT");
  assert.equal(assistantLabelForRuntimeConfig({ defaultModel: "gemini-2.5-pro" }), "Gemini");
  assert.equal(parseClientVersionFromHtml('<script src="/app.js?v=20260514-2130"></script>'), "20260514-2130");
  assert.equal(compareClientVersions("20260514-2130", "20260514-2100") > 0, true);
  assert.equal(
    gitRemoteRawIndexUrl("git@github.com:acme/mobile-app.git", "main"),
    "https://raw.githubusercontent.com/acme/mobile-app/main/public/index.html",
  );
  assert.equal(gitRemoteRawIndexUrl("https://example.invalid/acme/app.git", "main"), "");
}

function testRuntimeModelConfigProjectionAndCache() {
  const root = tempRoot();
  const configPath = path.join(root, "config.yaml");
  writeFile(configPath, `
agent:
  reasoning_effort: high
model:
  default: gpt-5
  provider: openai-codex
  base_url: https://chatgpt.com/backend-api/codex
`);
  const service = createSystemRuntimeStatusService({
    configPaths: [path.join(root, "missing.yaml"), configPath],
    env: {},
  });

  const info = service.runtimeModelConfigInfo();
  assert.equal(info.defaultEffort, "high");
  assert.equal(info.defaultModel, "gpt-5");
  assert.equal(info.provider, "openai-codex");
  assert.equal(info.baseUrl, "https://chatgpt.com/backend-api/codex");
  assert.equal(info.assistantLabel, "ChatGPT");
  assert.equal(info.source, configPath);
  assert.deepEqual(info.efforts.map((item) => item.value), ["low", "medium", "high", "xhigh"]);
  assert.equal(service.defaultReasoningInfo(), info);
}

function testRuntimeModelConfigEnvFallbackDoesNotExposeRawEnv() {
  const service = createSystemRuntimeStatusService({
    configPaths: [],
    env: {
      HERMES_WEB_DEFAULT_REASONING_EFFORT: "minimal",
      HERMES_MOBILE_UPDATE_VERSION_URL: "https://example.invalid/index.html?token=raw-secret",
    },
  });

  const info = service.runtimeModelConfigInfo();
  assert.equal(info.defaultEffort, "low");
  assert.equal(info.defaultModel, "");
  assert.equal(info.assistantLabel, "AI");
  assert.equal(info.source, "env:HERMES_WEB_DEFAULT_REASONING_EFFORT");
  assert.equal(JSON.stringify(info).includes("raw-secret"), false);
}

async function testAppUpdateStatusProjectsRepositoryWithoutRemoteUrl() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const calls = [];
  const service = createSystemRuntimeStatusService({
    repoRoot: root,
    indexHtmlPath,
    env: {},
    git: {
      run: gitRunner({
        "rev-parse --is-inside-work-tree": { ok: true, status: 0, stdout: "true", stderr: "" },
        "rev-parse HEAD": { ok: true, status: 0, stdout: "local-sha", stderr: "" },
        "rev-parse --abbrev-ref HEAD": { ok: true, status: 0, stdout: "main", stderr: "" },
        "remote get-url origin": { ok: true, status: 0, stdout: "https://github.com/acme/mobile.git", stderr: "" },
        "status --porcelain --untracked-files=normal": { ok: true, status: 0, stdout: "", stderr: "" },
        "ls-remote origin refs/heads/main": { ok: true, status: 0, stdout: "remote-sha\trefs/heads/main", stderr: "" },
      }, calls),
    },
    fetchText(url, timeoutMs) {
      assert.equal(url, "https://raw.githubusercontent.com/acme/mobile/main/public/index.html");
      assert.equal(timeoutMs, 6000);
      return Promise.resolve('<meta name="hermes-web-client-version" content="20260514-2130">');
    },
    nowIso: () => "2026-05-15T00:00:00.000Z",
  });

  assert.equal(service.readClientVersion(), "20260514-2100");
  const status = await service.appUpdateStatus();
  assert.deepEqual(status, {
    ok: true,
    currentVersion: "20260514-2100",
    latestVersion: "20260514-2130",
    updateAvailable: true,
    latestCommit: "remote-sha",
    currentCommit: "local-sha",
    repository: {
      available: true,
      clean: true,
      dirty: "",
      branch: "main",
      remoteName: "origin",
      updateBranch: "main",
    },
    canFastForward: true,
    warning: "",
    checkedAt: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(calls.some((call) => call.key === "ls-remote origin refs/heads/main"), true);
  assert.equal(JSON.stringify(status).includes("github.com"), false);
}

async function testAppUpdateStatusNotGitFallback() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const service = createSystemRuntimeStatusService({
    repoRoot: root,
    indexHtmlPath,
    git: {
      run: gitRunner({
        "rev-parse --is-inside-work-tree": { ok: true, status: 0, stdout: "false", stderr: "" },
      }),
    },
    fetchText() {
      throw new Error("network should not be called");
    },
    nowIso: () => "2026-05-15T00:01:00.000Z",
  });

  const status = await service.appUpdateStatus();
  assert.equal(status.ok, true);
  assert.equal(status.updateAvailable, false);
  assert.equal(status.canFastForward, false);
  assert.deepEqual(status.repository, {
    available: false,
    clean: false,
    dirty: "",
    branch: "",
    remoteName: "origin",
    updateBranch: "main",
  });
  assert.equal(status.warning, "Current app directory is not a git checkout.");
}

async function testAppUpdateStatusPreservesVersionCheckFailureFirst() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const service = createSystemRuntimeStatusService({
    repoRoot: root,
    indexHtmlPath,
    updateVersionUrl: "https://updates.example.invalid/public/index.html?token=raw-secret",
    git: {
      run: gitRunner({
        "rev-parse --is-inside-work-tree": { ok: true, status: 0, stdout: "true", stderr: "" },
        "rev-parse HEAD": { ok: true, status: 0, stdout: "local-sha", stderr: "" },
        "rev-parse --abbrev-ref HEAD": { ok: true, status: 0, stdout: "main", stderr: "" },
        "remote get-url origin": { ok: true, status: 0, stdout: "https://github.com/acme/mobile.git", stderr: "" },
        "status --porcelain --untracked-files=normal": { ok: true, status: 0, stdout: " M server.js", stderr: "" },
        "ls-remote origin refs/heads/main": { ok: false, status: 128, stdout: "", stderr: "fatal token raw-secret" },
      }),
    },
    fetchText() {
      throw new Error("timeout");
    },
    nowIso: () => "2026-05-15T00:02:00.000Z",
  });

  const status = await service.appUpdateStatus();
  assert.equal(status.latestVersion, "");
  assert.equal(status.latestCommit, "");
  assert.equal(status.repository.clean, false);
  assert.equal(status.repository.dirty, "M server.js");
  assert.equal(status.canFastForward, false);
  assert.equal(status.warning, "Version check failed: timeout");
  assert.equal(JSON.stringify(status).includes("raw-secret"), false);
}

async function testApplyAppUpdateRejectsDirtyRepository() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const calls = [];
  const service = createSystemRuntimeStatusService({
    repoRoot: root,
    indexHtmlPath,
    git: {
      run: gitRunner({
        "rev-parse --is-inside-work-tree": { ok: true, status: 0, stdout: "true", stderr: "" },
        "rev-parse HEAD": { ok: true, status: 0, stdout: "local-sha", stderr: "" },
        "rev-parse --abbrev-ref HEAD": { ok: true, status: 0, stdout: "main", stderr: "" },
        "remote get-url origin": { ok: true, status: 0, stdout: "https://github.com/acme/mobile.git", stderr: "" },
        "status --porcelain --untracked-files=normal": { ok: true, status: 0, stdout: " M server.js", stderr: "" },
        "ls-remote origin refs/heads/main": { ok: true, status: 0, stdout: "remote-sha\trefs/heads/main", stderr: "" },
      }, calls),
    },
    fetchText: async () => '<meta name="hermes-web-client-version" content="20260514-2130">',
    nowIso: () => "2026-05-15T00:04:00.000Z",
  });

  const result = await service.applyAppUpdate();
  assert.equal(result.ok, false);
  assert.equal(result.error, "Working tree is not clean; update was not applied.");
  assert.equal(calls.some((call) => call.key === "fetch origin main"), false);
}

async function testApplyAppUpdateRejectsNonFastForward() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const calls = [];
  const service = createSystemRuntimeStatusService({
    repoRoot: root,
    indexHtmlPath,
    git: {
      run: gitRunner({
        "rev-parse --is-inside-work-tree": { ok: true, status: 0, stdout: "true", stderr: "" },
        "rev-parse HEAD": { ok: true, status: 0, stdout: "local-sha", stderr: "" },
        "rev-parse --abbrev-ref HEAD": { ok: true, status: 0, stdout: "main", stderr: "" },
        "remote get-url origin": { ok: true, status: 0, stdout: "https://github.com/acme/mobile.git", stderr: "" },
        "status --porcelain --untracked-files=normal": { ok: true, status: 0, stdout: "", stderr: "" },
        "ls-remote origin refs/heads/main": { ok: true, status: 0, stdout: "remote-sha\trefs/heads/main", stderr: "" },
        "fetch origin main": { ok: true, status: 0, stdout: "", stderr: "" },
        "rev-parse origin/main": { ok: true, status: 0, stdout: "remote-sha", stderr: "" },
        "merge-base --is-ancestor HEAD origin/main": { ok: false, status: 1, stdout: "", stderr: "" },
      }, calls),
    },
    fetchText: async () => '<meta name="hermes-web-client-version" content="20260514-2130">',
    nowIso: () => "2026-05-15T00:05:00.000Z",
  });

  const result = await service.applyAppUpdate();
  assert.equal(result.ok, false);
  assert.equal(result.error, "Remote branch is not a fast-forward from the current checkout.");
  assert.equal(calls.some((call) => call.key === "merge --ff-only origin/main"), false);
}

async function testApplyAppUpdateFastForwardSuccess() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const calls = [];
  const service = createSystemRuntimeStatusService({
    repoRoot: root,
    indexHtmlPath,
    git: {
      run: gitRunner({
        "rev-parse --is-inside-work-tree": { ok: true, status: 0, stdout: "true", stderr: "" },
        "rev-parse HEAD": { ok: true, status: 0, stdout: "local-sha", stderr: "" },
        "rev-parse --abbrev-ref HEAD": { ok: true, status: 0, stdout: "main", stderr: "" },
        "remote get-url origin": { ok: true, status: 0, stdout: "https://github.com/acme/mobile.git", stderr: "" },
        "status --porcelain --untracked-files=normal": { ok: true, status: 0, stdout: "", stderr: "" },
        "ls-remote origin refs/heads/main": { ok: true, status: 0, stdout: "remote-sha\trefs/heads/main", stderr: "" },
        "fetch origin main": { ok: true, status: 0, stdout: "", stderr: "" },
        "rev-parse origin/main": { ok: true, status: 0, stdout: "remote-sha", stderr: "" },
        "merge-base --is-ancestor HEAD origin/main": { ok: true, status: 0, stdout: "", stderr: "" },
        "merge --ff-only origin/main": { ok: true, status: 0, stdout: "fast-forward", stderr: "" },
      }, calls),
    },
    fetchText: async () => '<meta name="hermes-web-client-version" content="20260514-2130">',
    nowIso: () => "2026-05-15T00:06:00.000Z",
  });

  const result = await service.applyAppUpdate();
  assert.equal(result.ok, true);
  assert.equal(result.updated, true);
  assert.equal(result.restartRequired, true);
  assert.match(result.message, /Restart Hermes Mobile/);
  assert.equal(calls.some((call) => call.key === "merge --ff-only origin/main"), true);
}

async function testClientVersionInfoUsesCachedFallback() {
  const root = tempRoot();
  const indexHtmlPath = makeIndex(root, "20260514-2100");
  const service = createSystemRuntimeStatusService({
    indexHtmlPath,
    nowIso: () => "2026-05-15T00:03:00.000Z",
  });

  assert.deepEqual(service.clientVersionInfo("20260514-2000"), {
    version: "20260514-2100",
    clientVersion: "20260514-2000",
    refreshRequired: true,
    checkedAt: "2026-05-15T00:03:00.000Z",
  });
  fs.rmSync(indexHtmlPath);
  assert.equal(service.readClientVersion(), "20260514-2100");
}

async function run() {
  testPureHelpersMatchServerRules();
  testRuntimeModelConfigProjectionAndCache();
  testRuntimeModelConfigEnvFallbackDoesNotExposeRawEnv();
  await testAppUpdateStatusProjectsRepositoryWithoutRemoteUrl();
  await testAppUpdateStatusNotGitFallback();
  await testAppUpdateStatusPreservesVersionCheckFailureFirst();
  await testApplyAppUpdateRejectsDirtyRepository();
  await testApplyAppUpdateRejectsNonFastForward();
  await testApplyAppUpdateFastForwardSuccess();
  await testClientVersionInfoUsesCachedFallback();
  console.log("system runtime status service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
