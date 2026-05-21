"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSkillAnalysisService } = require("./skill-analysis-service");

function defaultCompactText(value, maxChars = 800) {
  const text = String(value || "");
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function errorWithStatus(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function cleanString(value) {
  return String(value || "").trim();
}

function wslPathToUnc(value, distro = "Ubuntu-24.04") {
  const text = cleanString(value);
  if (!text.startsWith("/")) return text;
  return `\\\\wsl.localhost\\${distro}\\${text.replace(/^\/+/, "").replaceAll("/", "\\")}`;
}

function normalizeSkillPath(value) {
  let text = cleanString(value).replaceAll("\\", "/").replace(/^["'`]+|["'`]+$/g, "");
  const lower = text.toLowerCase();
  for (const marker of [".hermes/skills/", "/optional-skills/", "/skills/", "skills/"]) {
    const index = lower.lastIndexOf(marker);
    if (index >= 0) {
      text = text.slice(index + marker.length);
      break;
    }
  }
  text = text.replace(/\/SKILL\.md$/i, "").replace(/^\/+|\/+$/g, "").trim();
  if (!text || text.toLowerCase() === "skill.md" || text.toLowerCase() === "skills") return "";
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) return "";
  if (!parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))) return "";
  return parts.join("/");
}

function dedupeRoots(values) {
  const seen = new Set();
  const roots = [];
  for (const value of values || []) {
    const resolved = cleanString(value);
    if (!resolved) continue;
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(resolved);
  }
  return roots;
}

function isUncPath(value) {
  return /^\\\\/.test(cleanString(value));
}

function localSkillProfileRoots(options = {}) {
  const env = options.env || process.env;
  const dataDirs = [
    env.HERMES_WEB_DATA_DIR,
    env.HERMES_MOBILE_DATA_DIR,
    env.HERMES_WEB_DATA_ROOT,
    env.HERMES_MOBILE_DATA_ROOT,
  ];
  if (process.platform === "win32") dataDirs.push("C:\\ProgramData\\HermesMobile\\data");
  const roots = [];
  for (const value of dedupeRoots(dataDirs)) {
    if (!value || isUncPath(value)) continue;
    const profilesRoot = path.join(value, "skill-profiles");
    for (const profile of ["owner-full", "shared-global"]) {
      roots.push(path.join(profilesRoot, profile, "skills"));
    }
    try {
      if (!fs.existsSync(profilesRoot) || !fs.statSync(profilesRoot).isDirectory()) continue;
      for (const entry of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) roots.push(path.join(profilesRoot, entry.name, "skills"));
      }
    } catch (_err) {
      // Profile roots are best-effort. A bad data dir must not slow or break startup.
    }
  }
  return roots;
}

function defaultSkillRoots(options = {}) {
  const env = options.env || process.env;
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const distro = cleanString(options.wslDistro || env.HERMES_WEB_WSL_DISTRO || env.HERMES_MOBILE_WSL_DISTRO || "Ubuntu-24.04");
  const hermesHome = cleanString(env.HERMES_HOME || env.HERMES_WEB_HERMES_HOME);
  const roots = [
    env.HERMES_WEB_SKILLS_ROOT,
    env.HERMES_MOBILE_SKILLS_ROOT,
    ...localSkillProfileRoots(options),
    path.join(repoRoot, "skills"),
    path.join(os.homedir(), ".codex", "skills"),
  ];
  if (hermesHome) {
    roots.push(hermesHome.startsWith("/") ? path.join(wslPathToUnc(hermesHome, distro), "skills") : path.join(hermesHome, "skills"));
  }
  for (const user of ["xuxin", "hermes"]) {
    roots.push(wslPathToUnc(`/${["home", user, ".hermes", "skills"].join("/")}`, distro));
  }
  roots.push(
    wslPathToUnc(`/${["opt", "hermes-gateway-runtime", "official-clean", "skills"].join("/")}`, distro),
    wslPathToUnc(`/${["opt", "hermes-gateway-runtime", "official-clean", "optional-skills"].join("/")}`, distro),
  );
  return dedupeRoots(roots);
}

function usableSkillRoot(root, options = {}) {
  if (!root) return false;
  if (!options.allowRemoteSkillRoots && isUncPath(root)) return false;
  try {
    return fs.existsSync(root) && fs.statSync(root).isDirectory();
  } catch (_err) {
    return false;
  }
}

function directSkillCandidate(root, skillPath) {
  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, skillPath, "SKILL.md");
  if (!(candidate === rootResolved || candidate.startsWith(`${rootResolved}${path.sep}`))) return null;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return { path: skillPath, file: candidate };
}

function collectNamedSkillCandidates(root, skillPath, options = {}) {
  const matches = [];
  const rootResolved = path.resolve(root);
  const direct = directSkillCandidate(root, skillPath);
  if (direct) matches.push(direct);
  if (skillPath.includes("/")) return matches;
  const maxDirs = Math.max(1, Number(options.maxNamedSkillScanDirs || 1500));
  const deadlineMs = Math.max(1, Number(options.maxNamedSkillScanMs || 200));
  const startedAt = Date.now();
  let scannedDirs = 0;
  const stack = [rootResolved];
  while (stack.length) {
    if (++scannedDirs > maxDirs || Date.now() - startedAt > deadlineMs) break;
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_err) {
      continue;
    }
    if (path.basename(current) === skillPath) {
      const relativePath = path.relative(rootResolved, current).split(path.sep).join("/");
      const candidate = directSkillCandidate(rootResolved, relativePath);
      if (candidate) matches.push(candidate);
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if ([".archive", ".git", "__pycache__", "node_modules", "cache", "workspace", "public-export"].includes(entry.name)) continue;
      const next = path.join(current, entry.name);
      if (fs.existsSync(path.join(next, "SKILL.md")) && entry.name !== skillPath) continue;
      stack.push(next);
    }
  }
  return matches;
}

function skillDetailFromFile(filePath, resolvedPath, maxChars) {
  const content = fs.readFileSync(filePath, "utf8");
  const totalChars = content.length;
  const truncated = totalChars > maxChars;
  const parts = resolvedPath.split("/");
  return {
    id: parts[parts.length - 1],
    label: parts[parts.length - 1],
    namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
    path: resolvedPath,
    content: truncated ? content.slice(0, maxChars).trimEnd() : content,
    totalChars,
    truncated,
  };
}

function createDirectSkillResolver(options = {}) {
  const roots = Array.isArray(options.skillRoots) ? options.skillRoots : defaultSkillRoots(options);
  const maxChars = Number(options.maxSkillChars || 60000);
  const scanOptions = {
    allowRemoteSkillRoots: Boolean(options.allowRemoteSkillRoots),
    maxNamedSkillScanDirs: options.maxNamedSkillScanDirs,
    maxNamedSkillScanMs: options.maxNamedSkillScanMs,
  };

  function resolve(skill) {
    const skillPath = normalizeSkillPath(skill);
    if (!skillPath) return null;
    for (const root of roots) {
      if (!usableSkillRoot(root, scanOptions)) continue;
      const direct = directSkillCandidate(root, skillPath);
      if (direct) return direct;
    }
    if (skillPath.includes("/")) return null;
    const matches = new Map();
    for (const root of roots) {
      if (!usableSkillRoot(root, scanOptions)) continue;
      for (const match of collectNamedSkillCandidates(root, skillPath, scanOptions)) {
        matches.set(match.path.toLowerCase(), match);
      }
    }
    if (!matches.size) return null;
    if (matches.size > 1) {
      throw errorWithStatus("Skill path is ambiguous", 409, {
        skill: skillPath,
        matches: [...matches.values()].map((item) => item.path).slice(0, 20),
      });
    }
    const match = [...matches.values()][0];
    return match;
  }

  function detail(skill) {
    const match = resolve(skill);
    return match ? skillDetailFromFile(match.file, match.path, maxChars) : null;
  }

  return { detail, resolve };
}

function createChildBridge(options) {
  const spawnFn = options.spawn;
  if (typeof spawnFn !== "function") throw new TypeError("spawn is required");
  const bridgeCommand = options.bridgeCommand;
  if (typeof bridgeCommand !== "function") throw new TypeError("bridgeCommand is required");
  const timeoutMs = Number(options.timeoutMs ?? 12000);
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const maxStdoutChars = Number(options.maxStdoutChars ?? 1_000_000);
  const maxStderrChars = Number(options.maxStderrChars ?? 200_000);

  return function runBridge(payload) {
    return new Promise((resolve, reject) => {
      const spec = bridgeCommand(payload) || {};
      const command = spec.command;
      const args = Array.isArray(spec.args) ? spec.args : [];
      if (!command) {
        reject(errorWithStatus("Skill bridge command is not configured", 500));
        return;
      }
      const child = spawnFn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(errorWithStatus("Skill bridge timed out", 504));
      }, timeoutMs > 0 ? timeoutMs : 12000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > maxStdoutChars) stdout = stdout.slice(-maxStdoutChars);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > maxStderrChars) stderr = stderr.slice(-maxStderrChars);
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let result = null;
        try {
          result = JSON.parse(stdout.trim() || "{}");
        } catch (err) {
          reject(errorWithStatus(`Skill bridge returned invalid JSON: ${err.message || String(err)}`, 502));
          return;
        }
        if (code !== 0 && !result.error) {
          reject(errorWithStatus(stderr.trim() || `Skill bridge exited with ${code}`, 502));
          return;
        }
        if (stderr.trim()) result.stderr = compactText(stderr.trim(), 1200);
        resolve(result);
      });
      child.stdin.end(JSON.stringify(payload || {}));
    });
  };
}

function createSkillDetailProvider(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const runBridge = typeof options.runBridge === "function" ? options.runBridge : createChildBridge(options);
  const directResolver = options.directResolver || createDirectSkillResolver(options);
  const skillAnalysisService = options.skillAnalysisService || createSkillAnalysisService(options);
  const maxChars = Number(options.maxSkillChars || 60000);

  async function detail(skill) {
    const requestedSkill = String(skill || "").trim();
    if (!requestedSkill) {
      throw errorWithStatus("Skill is required", 400);
    }
    const direct = directResolver?.detail?.(requestedSkill);
    if (direct) return direct;
    let bridgeError = null;
    try {
      const result = await runBridge({ skill: requestedSkill });
      if (result?.ok) return result.skill || null;
      bridgeError = errorWithStatus(
        compactText(result?.error || "Skill was not found", 800),
        result?.status || 404,
        { skill: result?.skill || requestedSkill },
      );
    } catch (err) {
      bridgeError = err;
    }
    throw bridgeError || errorWithStatus("Skill was not found", 404, { skill: requestedSkill });
  }

  async function analyze(skill) {
    return await skillAnalysisService.analyze(await detail(skill));
  }

  async function applyFix(skill, fixId) {
    const requestedSkill = String(skill || "").trim();
    if (!requestedSkill) throw errorWithStatus("Skill is required", 400);
    const match = directResolver?.resolve?.(requestedSkill);
    if (!match?.file) {
      throw errorWithStatus("Skill can only be modified when it resolves to a local SKILL.md", 404, { skill: requestedSkill });
    }
    const current = skillDetailFromFile(match.file, match.path, maxChars);
    const applied = await skillAnalysisService.applyFix(current, fixId);
    if (applied.changed) fs.writeFileSync(match.file, applied.content, "utf8");
    const next = skillDetailFromFile(match.file, match.path, maxChars);
    return {
      ok: true,
      changed: Boolean(applied.changed),
      fix: applied.fix,
      detail: next,
      analysis: applied.analysis || await skillAnalysisService.analyze(next),
    };
  }

  return { detail, analyze, applyFix };
}

module.exports = {
  createDirectSkillResolver,
  createSkillDetailProvider,
  defaultSkillRoots,
};
