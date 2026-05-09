#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_SKIPPED_FILES = new Set([".usage.json"]);
const DEFAULT_SKIPPED_RELATIVE = new Set([path.join(".hub", "audit.log")]);

function usage() {
  return [
    "Usage: node scripts/link-skill-profile-store.js --shared <dir> --profile <skills-dir> [--profile <skills-dir> ...] [--backup <dir>] [--apply] [--json]",
    "",
    "Merges existing profile Skill stores into one shared directory, backs up each",
    "profile store, then replaces each profile skills directory with a link to the",
    "shared store. Dry-run is the default; pass --apply to modify files.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    shared: "",
    profiles: [],
    backup: "",
    apply: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--shared") {
      args.shared = argv[++i] || "";
    } else if (arg === "--profile") {
      args.profiles.push(argv[++i] || "");
    } else if (arg === "--profiles") {
      const value = argv[++i] || "";
      args.profiles.push(...value.split(path.delimiter).filter(Boolean));
    } else if (arg === "--backup") {
      args.backup = argv[++i] || "";
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.shared) throw new Error("--shared is required");
  if (!args.profiles.length) throw new Error("At least one --profile is required");
  return args;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
}

function normalizeAbs(value) {
  return path.resolve(value);
}

function assertSafeSkillsPath(profilePath) {
  const base = path.basename(profilePath);
  if (base !== "skills") {
    throw new Error(`Refusing to replace non-skills path: ${profilePath}`);
  }
  const parsed = path.parse(profilePath);
  if (profilePath === parsed.root) {
    throw new Error(`Refusing to replace filesystem root: ${profilePath}`);
  }
}

function assertSafeSharedPath(sharedPath) {
  const parsed = path.parse(sharedPath);
  if (sharedPath === parsed.root) {
    throw new Error(`Refusing shared store at filesystem root: ${sharedPath}`);
  }
  if (sharedPath.length < parsed.root.length + 8) {
    throw new Error(`Shared store path is too broad: ${sharedPath}`);
  }
}

function shouldSkip(relPath) {
  const normalized = relPath.split(path.sep).join(path.sep);
  return DEFAULT_SKIPPED_FILES.has(path.basename(normalized)) || DEFAULT_SKIPPED_RELATIVE.has(normalized);
}

function ensureDir(dir, apply, actions) {
  actions.push({ action: "mkdir", path: dir });
  if (apply) fs.mkdirSync(dir, { recursive: true });
}

function copyTree(source, target, apply, actions, stats, mode) {
  if (!fs.existsSync(source)) return;
  const sourceStat = fs.lstatSync(source);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Expected directory: ${source}`);
  }
  const root = source;
  function walk(srcDir) {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const src = path.join(srcDir, entry.name);
      const rel = path.relative(root, src);
      if (shouldSkip(rel)) continue;
      const dst = path.join(target, rel);
      if (entry.isDirectory()) {
        if (!fs.existsSync(dst)) ensureDir(dst, apply, actions);
        walk(src);
      } else if (entry.isFile()) {
        let copy = false;
        if (!fs.existsSync(dst)) {
          copy = true;
        } else {
          const srcStat = fs.statSync(src);
          const dstStat = fs.statSync(dst);
          copy = srcStat.mtimeMs > dstStat.mtimeMs + 1;
        }
        if (copy) {
          ensureDir(path.dirname(dst), apply, actions);
          actions.push({ action: mode, source: src, target: dst });
          stats.filesCopied += 1;
          if (apply) fs.copyFileSync(src, dst);
        }
      }
    }
  }
  walk(source);
}

function linkType() {
  return process.platform === "win32" ? "junction" : "dir";
}

function sameRealPath(left, right) {
  try {
    return fs.realpathSync(left).toLowerCase() === fs.realpathSync(right).toLowerCase();
  } catch {
    return false;
  }
}

function linkProfile(profilePath, sharedPath, backupRoot, apply, actions, stats) {
  assertSafeSkillsPath(profilePath);
  const profileExists = fs.existsSync(profilePath);
  if (profileExists && sameRealPath(profilePath, sharedPath)) {
    actions.push({ action: "already-linked", path: profilePath, target: sharedPath });
    stats.alreadyLinked += 1;
    return;
  }
  if (profileExists) {
    const stat = fs.lstatSync(profilePath);
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new Error(`Profile skills path is not a directory/link: ${profilePath}`);
    }
    const profileName = path.basename(path.dirname(profilePath)) || "profile";
    const backupPath = path.join(backupRoot, profileName, "skills");
    copyTree(profilePath, backupPath, apply, actions, stats, "backup-copy");
    copyTree(profilePath, sharedPath, apply, actions, stats, "merge-copy");
    actions.push({ action: "remove-profile-skills", path: profilePath });
    if (apply) fs.rmSync(profilePath, { recursive: true, force: true });
  }
  ensureDir(path.dirname(profilePath), apply, actions);
  actions.push({ action: "link-profile", path: profilePath, target: sharedPath, type: linkType() });
  stats.linksCreated += 1;
  if (apply) fs.symlinkSync(sharedPath, profilePath, linkType());
}

function run(options) {
  const sharedPath = normalizeAbs(options.shared);
  const profiles = options.profiles.map(normalizeAbs);
  const backupRoot = normalizeAbs(options.backup || path.join(path.dirname(sharedPath), `skill-profile-link-backup-${timestamp()}`));
  assertSafeSharedPath(sharedPath);
  const actions = [];
  const stats = {
    profiles: profiles.length,
    filesCopied: 0,
    linksCreated: 0,
    alreadyLinked: 0,
  };
  ensureDir(sharedPath, options.apply, actions);
  ensureDir(backupRoot, options.apply, actions);
  for (const profile of profiles) {
    linkProfile(profile, sharedPath, backupRoot, options.apply, actions, stats);
  }
  return {
    ok: true,
    applied: options.apply,
    sharedPath,
    backupRoot,
    stats,
    actions,
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = run(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.applied ? "APPLIED" : "DRY_RUN"} shared=${result.sharedPath}`);
      console.log(`backup=${result.backupRoot}`);
      console.log(`profiles=${result.stats.profiles} filesCopied=${result.stats.filesCopied} linksCreated=${result.stats.linksCreated} alreadyLinked=${result.stats.alreadyLinked}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { run };
