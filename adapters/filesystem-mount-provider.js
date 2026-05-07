"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function stringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(path.delimiter) : (value ? [value] : []));
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function dedupe(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function valueFrom(value) {
  return typeof value === "function" ? value() : value;
}

function createFilesystemMountProvider(options = {}) {
  const wslDistro = String(options.wslDistro || "Ubuntu-24.04");

  function windowsPathToWsl(value) {
    const raw = String(value || "").trim();
    const directMatch = raw.match(/^([A-Za-z]):[\\/](.*)$/);
    if (directMatch) return `/mnt/${directMatch[1].toLowerCase()}/${directMatch[2].replaceAll("\\", "/")}`;
    const resolved = path.resolve(raw);
    const match = resolved.match(/^([A-Za-z]):\\(.*)$/);
    if (!match) return resolved.replaceAll("\\", "/");
    return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
  }

  function volume1WindowsMirrorPath(rawPath) {
    const text = String(rawPath || "").trim().replaceAll("\\", "/");
    const match = text.match(/^\/volume1\/([^/]+)(\/.*)?$/);
    if (!match) return "";
    const disabled = new Set(stringList(valueFrom(options.disabledVolume1Shares)).map((share) => share.toLowerCase()));
    if (disabled.has(String(match[1] || "").toLowerCase())) return "";
    const home = String(options.windowsHome || process.env.USERPROFILE || os.homedir() || "");
    const roots = dedupe([
      valueFrom(options.volume1WindowsRoot),
      home ? path.join(home, "SynologyDrive") : "",
    ].filter(Boolean));
    const suffix = String(match[2] || "").replace(/^\/+/, "").replaceAll("/", "\\");
    for (const root of roots) {
      const local = path.join(root, match[1], suffix);
      if (fs.existsSync(local)) return local;
    }
    return "";
  }

  function normalizeLocalPath(rawPath) {
    let p = String(rawPath || "").trim();
    if (!p) return "";
    if (/^file:\/\//i.test(p)) {
      try {
        p = decodeURIComponent(new URL(p).pathname);
      } catch (_) {}
    }
    const m = p.match(/^\/mnt\/([A-Za-z])\/(.+)$/);
    if (m) return `${m[1].toUpperCase()}:\\${m[2].replaceAll("/", "\\")}`;
    const volume1Mirror = volume1WindowsMirrorPath(p);
    if (volume1Mirror) return volume1Mirror;
    if (p.startsWith("/")) {
      const unc = `\\\\wsl.localhost\\${wslDistro}${p.replaceAll("/", "\\")}`;
      if (fs.existsSync(unc)) return unc;
      const uncLegacy = `\\\\wsl$\\${wslDistro}${p.replaceAll("/", "\\")}`;
      if (fs.existsSync(uncLegacy)) return uncLegacy;
    }
    return p;
  }

  function resolvedAllowedRoots() {
    const configured = stringList(valueFrom(options.allowedArtifactRoots));
    const home = os.homedir();
    const windowsHome = String(options.windowsHome || process.env.USERPROFILE || "");
    const defaults = [
      path.join(String(options.repoRoot || ""), "workspace"),
      path.join(String(options.repoRoot || ""), "outbox"),
      path.join(String(options.dataDir || ""), "artifacts"),
      windowsHome ? path.join(windowsHome, "Documents", "ChatGPT-Drive") : "",
    ];
    if (home) defaults.push(path.join(home, "SynologyDrive"));
    return [...configured, ...defaults]
      .map(normalizeLocalPath)
      .filter(Boolean)
      .map((item) => {
        try {
          return fs.realpathSync.native(item);
        } catch (_) {
          return path.resolve(item);
        }
      });
  }

  function isPathAllowed(filePath) {
    const roots = resolvedAllowedRoots();
    let target;
    try {
      target = fs.realpathSync.native(filePath);
    } catch (_) {
      target = path.resolve(filePath);
    }
    const normTarget = target.toLowerCase();
    return roots.some((root) => {
      const normRoot = root.toLowerCase();
      return normTarget === normRoot || normTarget.startsWith(`${normRoot}${path.sep}`);
    });
  }

  return {
    isPathAllowed,
    normalizeLocalPath,
    resolvedAllowedRoots,
    volume1WindowsMirrorPath,
    windowsPathToWsl,
  };
}

module.exports = {
  createFilesystemMountProvider,
};
