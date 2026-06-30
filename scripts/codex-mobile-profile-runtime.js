"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CODEX_MOBILE_USER = "xuxin";

function userHomeFor(serviceUser = DEFAULT_CODEX_MOBILE_USER) {
  return `/Users/${String(serviceUser || DEFAULT_CODEX_MOBILE_USER).trim() || DEFAULT_CODEX_MOBILE_USER}`;
}

function defaultRuntimeRoot(serviceUser = DEFAULT_CODEX_MOBILE_USER) {
  return path.posix.join(userHomeFor(serviceUser), ".codex-mobile-web");
}

function defaultProfileFile(serviceUser = DEFAULT_CODEX_MOBILE_USER) {
  return path.posix.join(defaultRuntimeRoot(serviceUser), "codex-profiles.json");
}

function defaultCodexHome(serviceUser = DEFAULT_CODEX_MOBILE_USER) {
  return path.posix.join(userHomeFor(serviceUser), ".codex");
}

function normalizePosixPath(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return path.posix.normalize(text.replace(/\\/g, "/"));
}

function profileRows(doc = {}) {
  const profiles = doc && typeof doc === "object" ? doc.profiles : null;
  if (Array.isArray(profiles)) return profiles.filter((item) => item && typeof item === "object");
  if (profiles && typeof profiles === "object") return Object.values(profiles).filter((item) => item && typeof item === "object");
  return [];
}

function safeCodexHome(candidate, serviceUser = DEFAULT_CODEX_MOBILE_USER) {
  const normalized = normalizePosixPath(candidate);
  const home = userHomeFor(serviceUser);
  if (!normalized.startsWith(`${home}/`)) return "";
  if (normalized === path.posix.join(home, ".codex")) return normalized;
  if (normalized.startsWith(path.posix.join(home, ".codex-homes") + "/")) return normalized;
  return "";
}

function readJsonIfExists(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (["EACCES", "EPERM", "ENOENT", "ENOTDIR", "EISDIR"].includes(error?.code)) return null;
    throw error;
  }
}

function resolveCodexMobileProfileRuntime(options = {}) {
  const serviceUser = String(options.serviceUser || DEFAULT_CODEX_MOBILE_USER).trim() || DEFAULT_CODEX_MOBILE_USER;
  const runtimeRoot = normalizePosixPath(options.runtimeRoot) || defaultRuntimeRoot(serviceUser);
  const profileFile = normalizePosixPath(options.profileFile) || path.posix.join(runtimeRoot, "codex-profiles.json");
  const fallbackCodexHome = safeCodexHome(options.fallbackCodexHome, serviceUser) || defaultCodexHome(serviceUser);
  const doc = readJsonIfExists(profileFile);
  const activeProfileId = String(doc?.activeProfileId || "").trim();
  let activeProfile = null;
  if (activeProfileId) {
    activeProfile = profileRows(doc).find((profile) => String(profile.id || "").trim() === activeProfileId);
  }
  const activeCodexHome = safeCodexHome(activeProfile?.codexHome, serviceUser);
  const codexHome = activeCodexHome || fallbackCodexHome;
  const source = activeCodexHome ? "profile-store" : (doc ? "profile-store-fallback" : "default-fallback");
  return {
    serviceUser,
    runtimeRoot,
    profileFile,
    activeProfileId,
    activeProfileLabel: activeProfile ? String(activeProfile.label || activeProfile.id || "").trim() : "",
    codexHome,
    source,
    muxEndpointFile: path.posix.join(codexHome, "app-server-mux", "endpoint.json"),
  };
}

module.exports = {
  DEFAULT_CODEX_MOBILE_USER,
  defaultCodexHome,
  defaultProfileFile,
  defaultRuntimeRoot,
  profileRows,
  resolveCodexMobileProfileRuntime,
  safeCodexHome,
  userHomeFor,
};
