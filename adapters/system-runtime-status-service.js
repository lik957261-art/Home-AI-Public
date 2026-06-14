"use strict";

const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const { spawnSync } = require("node:child_process");

const REASONING_EFFORT_OPTIONS = Object.freeze([
  { value: "low", label: "Low", shortLabel: "\u4f4e" },
  { value: "medium", label: "Medium", shortLabel: "\u4e2d" },
  { value: "high", label: "High", shortLabel: "\u9ad8" },
  { value: "xhigh", label: "Xhigh", shortLabel: "Xhigh" },
]);
const VALID_REASONING_EFFORTS = new Set(REASONING_EFFORT_OPTIONS.map((item) => item.value));

function cleanString(value) {
  return String(value || "").trim();
}

function compactText(value, maxChars = 600) {
  const text = String(value || "");
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function redactSensitiveText(value) {
  return cleanString(value)
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
}

function dedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeClientVersion(value) {
  return cleanString(value);
}

function normalizeReasoningEffort(value) {
  const effort = cleanString(value).toLowerCase();
  if (effort === "minimal") return "low";
  if (effort === "none") return "none";
  if (VALID_REASONING_EFFORTS.has(effort)) return effort;
  return "";
}

function unquoteYamlScalar(value) {
  return cleanString(value).replace(/^["']|["']$/g, "").trim();
}

function assignRuntimeConfigYamlValue(result, section, key, value) {
  const normalizedSection = cleanString(section).toLowerCase();
  const normalizedKey = cleanString(key).toLowerCase().replace(/-/g, "_");
  const scalar = unquoteYamlScalar(value);
  if (!scalar) return;
  if (normalizedSection === "agent" && normalizedKey === "reasoning_effort") result.reasoningEffort = scalar;
  if (normalizedSection === "model" && normalizedKey === "default") result.defaultModel = scalar;
  if (normalizedSection === "model" && normalizedKey === "provider") result.provider = scalar;
  if (normalizedSection === "model" && normalizedKey === "base_url") result.baseUrl = scalar;
}

function parseAgentRuntimeConfigFromYaml(text) {
  const result = { reasoningEffort: "", defaultModel: "", provider: "", baseUrl: "" };
  let section = "";
  let sectionIndent = -1;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const noComment = rawLine.replace(/\s+#.*$/, "");
    if (!noComment.trim()) continue;
    const dotted = noComment.match(/^\s*(agent|model)\.([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/i);
    if (dotted) {
      assignRuntimeConfigYamlValue(result, dotted[1], dotted[2], dotted[3]);
      continue;
    }
    const topSection = noComment.match(/^(\s*)(agent|model)\s*:\s*$/i);
    if (topSection) {
      section = topSection[2].toLowerCase();
      sectionIndent = topSection[1].length;
      continue;
    }
    if (section) {
      const indent = (noComment.match(/^(\s*)/) || ["", ""])[1].length;
      if (indent <= sectionIndent) {
        section = "";
        sectionIndent = -1;
      } else {
        const scalar = noComment.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
        if (scalar) assignRuntimeConfigYamlValue(result, section, scalar[1], scalar[2]);
      }
    }
  }
  return result;
}

function assistantLabelForRuntimeConfig(info = {}) {
  const provider = cleanString(info.provider);
  const baseUrl = cleanString(info.baseUrl);
  const model = cleanString(info.defaultModel);
  if (/openai-codex/i.test(provider) || /chatgpt\.com\/backend-api\/codex/i.test(baseUrl)) return "ChatGPT";
  if (/claude/i.test(provider) || /^claude/i.test(model)) return "Claude";
  if (/gemini/i.test(provider) || /^gemini/i.test(model)) return "Gemini";
  if (/qwen/i.test(provider) || /^qwen/i.test(model)) return "Qwen";
  if (/deepseek/i.test(provider) || /^deepseek/i.test(model)) return "DeepSeek";
  if (provider) return provider;
  if (model) return model;
  return "AI";
}

function parseClientVersionFromHtml(html) {
  const explicit = String(html || "").match(/\bdata-client-version=["']([^"']+)["']/i)
    || String(html || "").match(/<meta\s+name=["']hermes-web-client-version["']\s+content=["']([^"']+)["'][^>]*>/i)
    || String(html || "").match(/\/app\.js\?v=([A-Za-z0-9._-]+)/i);
  return normalizeClientVersion(explicit?.[1] || "");
}

function compareClientVersions(a, b) {
  const left = normalizeClientVersion(a);
  const right = normalizeClientVersion(b);
  if (left === right) return 0;
  const parse = (value) => {
    const match = value.match(/^(\d{8})-(\d{4})$/);
    return match ? Number(`${match[1]}${match[2]}`) : NaN;
  };
  const leftNumber = parse(left);
  const rightNumber = parse(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right);
}

function gitRemoteRawIndexUrl(remoteUrl, branch = "main") {
  const raw = cleanString(remoteUrl);
  if (!raw) return "";
  let owner = "";
  let repo = "";
  const sshMatch = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      const url = new URL(raw);
      if (!/github\.com$/i.test(url.hostname)) return "";
      const parts = url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "").split("/");
      owner = parts[0] || "";
      repo = parts[1] || "";
    } catch (_) {
      return "";
    }
  }
  if (!owner || !repo) return "";
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/public/index.html`;
}

function defaultFetchTextWithTimeout(url, timeoutMs = 6000) {
  if (typeof fetch !== "function") return Promise.reject(new Error("fetch is not available"));
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(Math.max(1000, timeoutMs))
    : undefined;
  return fetch(url, { signal, cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  });
}

function defaultRunProcessText(command, args = [], options = {}) {
  const result = spawnSync(command, args.map(String), {
    cwd: options.cwd || undefined,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs || 6000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    code: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || result.error?.message || "").trim(),
  };
}

function shellCommandForPlatform(platform = process.platform) {
  if (platform === "win32") return { command: "cmd.exe", args: ["/d", "/s", "/c"] };
  return { command: "/bin/sh", args: ["-lc"] };
}

function normalizeRunResult(result, deps) {
  const status = result?.status ?? result?.code ?? 0;
  const ok = typeof result?.ok === "boolean" ? result.ok : status === 0;
  return {
    ok,
    status,
    stdout: deps.compactText(redactSensitiveText(result?.stdout), 600),
    stderr: deps.compactText(redactSensitiveText(result?.stderr || result?.error?.message), 600),
  };
}

function normalizeRunError(error, deps) {
  return {
    ok: false,
    status: error?.status ?? error?.code ?? 1,
    stdout: deps.compactText(redactSensitiveText(error?.stdout), 600),
    stderr: deps.compactText(redactSensitiveText(error?.stderr || error?.message || String(error)), 600),
  };
}

function numberFrom(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonSafe(fs, file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function serviceDeps(options = {}) {
  const processLike = options.process || process;
  const env = options.env || processLike.env || process.env;
  const pathApi = options.path || defaultPath;
  const repoRoot = pathApi.resolve(options.repoRoot || env.HERMES_WEB_REPO_ROOT || env.HERMES_MOBILE_ROOT || processLike.cwd?.() || process.cwd());
  const publicRoot = options.publicRoot || pathApi.join(repoRoot, "public");
  const updateCheckTimeoutMs = numberFrom(
    options.updateCheckTimeoutMs
      || env.HERMES_MOBILE_UPDATE_CHECK_TIMEOUT_MS
      || env.HERMES_WEB_UPDATE_CHECK_TIMEOUT_MS,
    6000,
  );
  return {
    fs: options.fs || defaultFs,
    path: pathApi,
    env,
    process: processLike,
    repoRoot,
    indexHtmlPath: options.indexHtmlPath || pathApi.join(publicRoot, "index.html"),
    publicSourceRoot: pathApi.resolve(options.publicSourceRoot || env.HERMES_MOBILE_PUBLIC_SOURCE_ROOT || pathApi.dirname(repoRoot)),
    publicPluginSourcesPath: options.publicPluginSourcesPath || pathApi.join(repoRoot, "config", "public-plugin-sources.json"),
    configPaths: Array.isArray(options.configPaths) ? options.configPaths : [],
    runtimeConfigPathCandidates: options.runtimeConfigPathCandidates,
    updateRemoteName: cleanString(options.updateRemoteName || env.HERMES_MOBILE_UPDATE_REMOTE || env.HERMES_WEB_UPDATE_REMOTE || "origin"),
    updateBranch: cleanString(options.updateBranch || env.HERMES_MOBILE_UPDATE_BRANCH || env.HERMES_WEB_UPDATE_BRANCH || "main"),
    updateVersionUrl: cleanString(options.updateVersionUrl || env.HERMES_MOBILE_UPDATE_VERSION_URL || env.HERMES_WEB_UPDATE_VERSION_URL || ""),
    postUpdateCommand: cleanString(options.postUpdateCommand || env.HERMES_MOBILE_POST_UPDATE_COMMAND || env.HERMES_WEB_POST_UPDATE_COMMAND || ""),
    postUpdateTimeoutMs: numberFrom(
      options.postUpdateTimeoutMs
        || env.HERMES_MOBILE_POST_UPDATE_TIMEOUT_MS
        || env.HERMES_WEB_POST_UPDATE_TIMEOUT_MS,
      30000,
    ),
    updateCheckTimeoutMs,
    fetchText: typeof options.fetchText === "function" ? options.fetchText : defaultFetchTextWithTimeout,
    runProcessText: typeof options.runProcessText === "function" ? options.runProcessText : defaultRunProcessText,
    git: options.git && typeof options.git === "object" ? options.git : {},
    compactText: typeof options.compactText === "function" ? options.compactText : compactText,
    nowIso: typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString()),
    platform: options.platform || processLike.platform || process.platform,
  };
}

function createSystemRuntimeStatusService(options = {}) {
  const deps = serviceDeps(options);
  let defaultReasoningCache = { cacheKey: "", value: null };
  let clientVersionCache = { mtimeMs: 0, version: "" };

  function runtimeConfigPathCandidates() {
    if (typeof deps.runtimeConfigPathCandidates === "function") return dedupe(deps.runtimeConfigPathCandidates());
    return dedupe(deps.configPaths);
  }

  function runtimeModelConfigInfo() {
    const configPaths = runtimeConfigPathCandidates();
    const parts = configPaths.map((item) => {
      try {
        const stat = deps.fs.statSync(item);
        return `${item}:${stat.mtimeMs}`;
      } catch (_) {
        return `${item}:missing`;
      }
    }).join("|");
    if (defaultReasoningCache.value && defaultReasoningCache.cacheKey === parts) return defaultReasoningCache.value;
    const envEffort = normalizeReasoningEffort(deps.env.HERMES_WEB_DEFAULT_REASONING_EFFORT || "");
    for (const configPath of configPaths) {
      try {
        if (!configPath || !deps.fs.existsSync(configPath)) continue;
        const parsed = parseAgentRuntimeConfigFromYaml(deps.fs.readFileSync(configPath, "utf8"));
        const effort = normalizeReasoningEffort(envEffort || parsed.reasoningEffort);
        if (effort || parsed.defaultModel || parsed.provider || parsed.baseUrl) {
          const value = {
            defaultEffort: effort || "medium",
            defaultModel: parsed.defaultModel || "",
            provider: parsed.provider || "",
            baseUrl: parsed.baseUrl || "",
            assistantLabel: assistantLabelForRuntimeConfig(parsed),
            source: configPath,
            efforts: REASONING_EFFORT_OPTIONS,
          };
          defaultReasoningCache = { cacheKey: parts, value };
          return value;
        }
      } catch (_) {}
    }
    const fallback = {
      defaultEffort: envEffort || "medium",
      defaultModel: "",
      provider: "",
      baseUrl: "",
      assistantLabel: "AI",
      source: envEffort ? "env:HERMES_WEB_DEFAULT_REASONING_EFFORT" : "gateway-default",
      efforts: REASONING_EFFORT_OPTIONS,
    };
    defaultReasoningCache = { cacheKey: parts || "no-config", value: fallback };
    return fallback;
  }

  function defaultReasoningInfo() {
    return runtimeModelConfigInfo();
  }

  function readClientVersion() {
    try {
      const stat = deps.fs.statSync(deps.indexHtmlPath);
      if (clientVersionCache.version && clientVersionCache.mtimeMs === stat.mtimeMs) return clientVersionCache.version;
      const html = deps.fs.readFileSync(deps.indexHtmlPath, "utf8");
      clientVersionCache = {
        mtimeMs: stat.mtimeMs,
        version: normalizeClientVersion(parseClientVersionFromHtml(html) || "unknown"),
      };
      return clientVersionCache.version;
    } catch (_) {
      return clientVersionCache.version || "unknown";
    }
  }

  function clientVersionInfo(clientVersion = "") {
    const current = readClientVersion();
    const reported = normalizeClientVersion(clientVersion);
    return {
      version: current,
      clientVersion: reported,
      refreshRequired: Boolean(reported && current && current !== "unknown" && current !== reported),
      checkedAt: deps.nowIso(),
    };
  }

  async function runGit(args, options = {}) {
    const runOptions = {
      cwd: options.cwd || deps.repoRoot,
      timeoutMs: options.timeoutMs || deps.updateCheckTimeoutMs,
    };
    try {
      if (typeof deps.git.run === "function") return normalizeRunResult(await deps.git.run(args, runOptions), deps);
      if (typeof deps.git.runProcessText === "function") return normalizeRunResult(await deps.git.runProcessText(args, runOptions), deps);
      return normalizeRunResult(await deps.runProcessText("git", args, runOptions), deps);
    } catch (err) {
      return normalizeRunError(err, deps);
    }
  }

  async function gitRepositoryStatus(repoRoot = deps.repoRoot) {
    if (typeof deps.git.repositoryStatus === "function") {
      const status = await deps.git.repositoryStatus({
        remoteName: deps.updateRemoteName,
        updateBranch: deps.updateBranch,
        repoRoot,
      });
      return Object.assign({
        available: false,
        clean: false,
        reason: "",
        dirty: "",
        head: "",
        branch: "",
        remoteConfigured: false,
        remoteName: deps.updateRemoteName,
        remoteUrl: "",
        updateBranch: deps.updateBranch,
      }, status || {});
    }

    const inside = await runGit(["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot });
    if (!inside.ok || inside.stdout !== "true") {
      return { available: false, clean: false, reason: "Current app directory is not a git checkout." };
    }
    const head = await runGit(["rev-parse", "HEAD"], { cwd: repoRoot });
    const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
    const remote = await runGit(["remote", "get-url", deps.updateRemoteName], { cwd: repoRoot });
    const dirty = await runGit(["status", "--porcelain", "--untracked-files=normal"], { cwd: repoRoot });
    const clean = dirty.ok && !dirty.stdout;
    return {
      available: true,
      clean,
      dirty: dirty.stdout ? deps.compactText(dirty.stdout, 600) : "",
      head: head.ok ? head.stdout : "",
      branch: branch.ok ? branch.stdout : "",
      remoteConfigured: remote.ok,
      remoteName: deps.updateRemoteName,
      remoteUrl: remote.ok ? remote.stdout : "",
      updateBranch: deps.updateBranch,
    };
  }

  function remoteRawIndexUrl(remoteUrl, branch = deps.updateBranch) {
    if (typeof deps.git.remoteRawIndexUrl === "function") return cleanString(deps.git.remoteRawIndexUrl(remoteUrl, branch));
    return gitRemoteRawIndexUrl(remoteUrl, branch);
  }

  function pluginSourceEntries() {
    const manifest = readJsonSafe(deps.fs, deps.publicPluginSourcesPath, null);
    return Array.isArray(manifest?.plugins) ? manifest.plugins : [];
  }

  async function remoteCommitStatus(ref = {}, repo = {}) {
    const branch = cleanString(ref.ref || ref.branch || repo.updateBranch || deps.updateBranch) || deps.updateBranch;
    const remote = cleanString(ref.repositoryUrl || ref.remoteUrl || repo.remoteName || deps.updateRemoteName) || deps.updateRemoteName;
    const remoteHead = await runGit(["ls-remote", remote, `refs/heads/${branch}`]);
    if (!remoteHead.ok) return { ok: false, commit: "", branch, error: remoteHead.stderr || "Git branch check failed." };
    return { ok: true, commit: String(remoteHead.stdout.split(/\s+/)[0] || ""), branch, error: "" };
  }

  async function pluginUpdateStatus(entry = {}) {
    const id = cleanString(entry.id);
    const sourceDir = cleanString(entry.sourceDir);
    const updateBranch = cleanString(entry.ref || deps.updateBranch) || deps.updateBranch;
    const localPath = sourceDir ? deps.path.resolve(deps.publicSourceRoot, sourceDir) : "";
    const base = {
      id,
      sourceDir,
      currentCommit: "",
      latestCommit: "",
      updateAvailable: false,
      canFastForward: false,
      repository: {
        available: false,
        clean: false,
        dirty: "",
        branch: "",
        remoteName: deps.updateRemoteName,
        updateBranch,
      },
      warning: "",
    };
    if (!id || !localPath) return Object.assign({}, base, { warning: "Plugin source entry is incomplete." });
    try {
      if (!deps.fs.existsSync(localPath)) return Object.assign({}, base, { warning: "Plugin source directory is not present on this installation." });
    } catch (_) {
      return Object.assign({}, base, { warning: "Plugin source directory is not readable." });
    }
    const repo = await gitRepositoryStatus(localPath);
    const remote = await remoteCommitStatus(entry, repo);
    const updateAvailable = Boolean(remote.commit && repo.head && remote.commit !== repo.head);
    return {
      id,
      sourceDir,
      currentCommit: repo.head || "",
      latestCommit: remote.commit || "",
      updateAvailable,
      canFastForward: Boolean(repo.available && repo.clean && updateAvailable),
      repository: {
        available: Boolean(repo.available),
        clean: Boolean(repo.clean),
        dirty: repo.dirty || "",
        branch: repo.branch || "",
        remoteName: repo.remoteName || deps.updateRemoteName,
        updateBranch: remote.branch || updateBranch,
      },
      warning: remote.error || repo.reason || "",
    };
  }

  async function pluginUpdatesStatus() {
    const out = [];
    for (const entry of pluginSourceEntries()) out.push(await pluginUpdateStatus(entry));
    return out;
  }

  async function appUpdateStatus() {
    const currentVersion = readClientVersion();
    const repo = await gitRepositoryStatus();
    let latestVersion = "";
    let latestCommit = "";
    let checkError = "";
    if (repo.available) {
      const versionUrl = deps.updateVersionUrl || remoteRawIndexUrl(repo.remoteUrl, deps.updateBranch);
      if (versionUrl) {
        try {
          latestVersion = parseClientVersionFromHtml(await deps.fetchText(versionUrl, deps.updateCheckTimeoutMs));
        } catch (err) {
          checkError = `Version check failed: ${err.message || String(err)}`;
        }
      } else {
        checkError = "No GitHub raw version URL is configured.";
      }
      const remoteHead = await remoteCommitStatus({}, repo);
      if (remoteHead.ok) latestCommit = remoteHead.commit;
      else if (!checkError) checkError = remoteHead.error;
    }
    const plugins = await pluginUpdatesStatus();
    const appUpdateAvailable = Boolean(latestVersion && compareClientVersions(latestVersion, currentVersion) > 0)
      || Boolean(latestCommit && repo.head && latestCommit !== repo.head);
    const pluginUpdateAvailable = plugins.some((plugin) => plugin.updateAvailable);
    return {
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable: Boolean(appUpdateAvailable || pluginUpdateAvailable),
      appUpdateAvailable,
      pluginUpdateAvailable,
      latestCommit,
      currentCommit: repo.head || "",
      plugins,
      repository: {
        available: Boolean(repo.available),
        clean: Boolean(repo.clean),
        dirty: repo.dirty || "",
        branch: repo.branch || "",
        remoteName: repo.remoteName || deps.updateRemoteName,
        updateBranch: deps.updateBranch,
      },
      mode: "git-fast-forward",
      policy: {
        ownerOnly: true,
        requiresCleanWorktree: true,
        requiresFastForward: true,
        postUpdateCommandConfigured: Boolean(deps.postUpdateCommand),
        autoApplyOnLogin: false,
      },
      canFastForward: Boolean(repo.available && repo.clean && appUpdateAvailable) || plugins.some((plugin) => plugin.canFastForward),
      warning: checkError || repo.reason || "",
      checkedAt: deps.nowIso(),
    };
  }

  async function runPostUpdateCommand() {
    if (!deps.postUpdateCommand) return null;
    const shell = shellCommandForPlatform(deps.platform);
    const result = await deps.runProcessText(shell.command, [...shell.args, deps.postUpdateCommand], {
      cwd: deps.repoRoot,
      timeoutMs: deps.postUpdateTimeoutMs,
    });
    return normalizeRunResult(result, deps);
  }

  async function fastForwardRepository(target = {}) {
    const repoRoot = target.repoRoot || deps.repoRoot;
    const remote = target.remote || deps.updateRemoteName;
    const branch = target.branch || deps.updateBranch;
    const remoteIsUrl = /^(?:https?:\/\/|ssh:\/\/|git@)/i.test(String(remote));
    const fetchResult = await runGit(["fetch", remote, branch], { cwd: repoRoot, timeoutMs: 30000 });
    if (!fetchResult.ok) return { ok: false, error: fetchResult.stderr || "git fetch failed." };

    const remoteRef = remoteIsUrl ? "FETCH_HEAD" : `${remote}/${branch}`;
    const localHead = await runGit(["rev-parse", "HEAD"], { cwd: repoRoot });
    const remoteHead = await runGit(["rev-parse", remoteRef], { cwd: repoRoot });
    if (!remoteHead.ok) return { ok: false, error: `Cannot resolve ${remoteRef}.` };
    if (localHead.ok && localHead.stdout === remoteHead.stdout) {
      return { ok: true, updated: false, upToDate: true, latestCommit: remoteHead.stdout };
    }

    const ancestor = await runGit(["merge-base", "--is-ancestor", "HEAD", remoteRef], { cwd: repoRoot });
    if (!ancestor.ok) return { ok: false, error: "Remote branch is not a fast-forward from the current checkout." };

    const merge = await runGit(["merge", "--ff-only", remoteRef], { cwd: repoRoot, timeoutMs: 30000 });
    if (!merge.ok) return { ok: false, error: merge.stderr || "git fast-forward failed." };
    return { ok: true, updated: true, latestCommit: remoteHead.stdout };
  }

  async function applyAppUpdate() {
    const status = await appUpdateStatus();
    if (status.appUpdateAvailable && !status.repository.available) {
      return Object.assign({}, status, {
        ok: false,
        error: status.warning || "App directory is not a git checkout.",
      });
    }
    if (status.appUpdateAvailable && !status.repository.clean) {
      return Object.assign({}, status, {
        ok: false,
        error: "Working tree is not clean; update was not applied.",
      });
    }

    let appUpdated = false;
    const updatedPlugins = [];
    if (status.appUpdateAvailable) {
      const appUpdate = await fastForwardRepository({ repoRoot: deps.repoRoot, remote: deps.updateRemoteName, branch: deps.updateBranch });
      if (!appUpdate.ok) return Object.assign({}, status, appUpdate);
      appUpdated = Boolean(appUpdate.updated);
    }
    const entries = pluginSourceEntries();
    for (const plugin of status.plugins || []) {
      if (!plugin.canFastForward) continue;
      const entry = entries.find((item) => cleanString(item.id) === plugin.id);
      if (!entry?.sourceDir) continue;
      const repoRoot = deps.path.resolve(deps.publicSourceRoot, entry.sourceDir);
      const pluginUpdate = await fastForwardRepository({
        repoRoot,
        remote: cleanString(entry.repositoryUrl || entry.remoteUrl || deps.updateRemoteName) || deps.updateRemoteName,
        branch: cleanString(entry.ref || deps.updateBranch) || deps.updateBranch,
      });
      if (!pluginUpdate.ok) return Object.assign({}, status, { ok: false, error: `Plugin ${plugin.id}: ${pluginUpdate.error}` });
      if (pluginUpdate.updated) updatedPlugins.push(plugin.id);
    }

    if (!appUpdated && !updatedPlugins.length) {
      return Object.assign({}, status, { ok: true, updated: false, upToDate: true });
    }

    resetCaches();
    const postUpdate = await runPostUpdateCommand();
    if (postUpdate && !postUpdate.ok) {
      return Object.assign({}, await appUpdateStatus(), {
        ok: false,
        updated: true,
        appUpdated,
        updatedPlugins,
        restartRequired: true,
        postUpdate,
        error: postUpdate.stderr || "Post-update command failed.",
      });
    }
    return Object.assign({}, await appUpdateStatus(), {
      ok: true,
      updated: true,
      appUpdated,
      updatedPlugins,
      restartRequired: !postUpdate,
      postUpdate,
      message: postUpdate
        ? "Updated by git fast-forward and ran the configured post-update command."
        : "Updated by git fast-forward. Restart Home AI if server code changed.",
    });
  }

  function resetCaches() {
    defaultReasoningCache = { cacheKey: "", value: null };
    clientVersionCache = { mtimeMs: 0, version: "" };
  }

  return {
    applyAppUpdate,
    appUpdateStatus,
    clientVersionInfo,
    compareClientVersions,
    defaultReasoningInfo,
    gitRemoteRawIndexUrl: remoteRawIndexUrl,
    gitRepositoryStatus,
    parseAgentRuntimeConfigFromYaml,
    parseClientVersionFromHtml,
    readClientVersion,
    resetCaches,
    runtimeConfigPathCandidates,
    runtimeModelConfigInfo,
  };
}

module.exports = {
  REASONING_EFFORT_OPTIONS,
  assistantLabelForRuntimeConfig,
  compareClientVersions,
  createSystemRuntimeStatusService,
  gitRemoteRawIndexUrl,
  normalizeClientVersion,
  normalizeReasoningEffort,
  parseAgentRuntimeConfigFromYaml,
  parseClientVersionFromHtml,
};
