"use strict";

const fs = require("node:fs");
const path = require("node:path");

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function defaultDedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeSkillPath(value = "") {
  const text = cleanString(value).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!text) return "";
  const parts = text.split("/").filter(Boolean);
  if (!parts.length) return "";
  if (parts.some((part) => part === "." || part === ".." || !/^[A-Za-z0-9_.-]+$/.test(part))) return "";
  return parts.join("/");
}

function skillIdForPath(skillPath = "") {
  const parts = normalizeSkillPath(skillPath).split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function skillNamespaceForPath(skillPath = "") {
  const parts = normalizeSkillPath(skillPath).split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function defaultDataDirs(env = process.env) {
  return defaultDedupe([
    env.HERMES_WEB_DATA_DIR,
    env.HERMES_MOBILE_DATA_DIR,
    env.HERMES_WEB_DATA_ROOT,
    env.HERMES_MOBILE_DATA_ROOT,
    process.platform === "win32" ? "C:\\ProgramData\\HermesMobile\\data" : "",
  ]);
}

function skillProfilesForWorkspace(workspaceId = "") {
  const workspace = cleanString(workspaceId, "owner");
  if (workspace === "owner") return ["owner-full", "shared-global"];
  return [workspace, "shared-global"];
}

function createPluginRequiredSkillPreloadService(options = {}) {
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const dataDirs = defaultDedupe(options.dataDirs || defaultDataDirs(options.env || process.env));
  const maxSkillChars = Math.max(1000, Math.floor(Number(options.maxSkillChars || 80000) || 80000));
  const maxTotalChars = Math.max(maxSkillChars, Math.floor(Number(options.maxTotalChars || 120000) || 120000));

  function resolveSkill(skillPath = "", workspaceId = "") {
    const normalized = normalizeSkillPath(skillPath);
    if (!normalized) return null;
    for (const dataDir of dataDirs) {
      for (const profile of skillProfilesForWorkspace(workspaceId)) {
        const root = pathImpl.join(dataDir, "skill-profiles", profile, "skills");
        const file = pathImpl.join(root, ...normalized.split("/"), "SKILL.md");
        try {
          if (fsImpl.existsSync(file) && fsImpl.statSync(file).isFile()) {
            return { file, root, profileId: profile, path: normalized };
          }
        } catch (_err) {
          // A bad profile root should not block other profile roots.
        }
      }
    }
    return null;
  }

  function preloadRequiredSkills(input = {}) {
    const skills = defaultDedupe(input.skills || input.requiredSkills || input.required_skills || []);
    const workspaceId = cleanString(input.workspaceId || input.workspace_id, "owner");
    const out = [];
    let total = 0;
    for (const skill of skills) {
      const skillPath = normalizeSkillPath(skill);
      if (!skillPath) continue;
      const resolved = resolveSkill(skillPath, workspaceId);
      const id = skillIdForPath(skillPath);
      const namespace = skillNamespaceForPath(skillPath);
      if (!resolved) {
        out.push({
          id,
          label: id || skillPath,
          namespace,
          path: skillPath,
          missing: true,
          error: "required_skill_not_found",
        });
        continue;
      }
      const remaining = Math.max(0, maxTotalChars - total);
      if (!remaining) {
        out.push({
          id,
          label: id || skillPath,
          namespace,
          path: skillPath,
          profileId: resolved.profileId,
          missing: true,
          error: "required_skill_preload_budget_exhausted",
        });
        continue;
      }
      try {
        const content = fsImpl.readFileSync(resolved.file, "utf8");
        const limit = Math.min(maxSkillChars, remaining);
        const truncated = content.length > limit;
        const preloadedContent = truncated ? content.slice(0, limit).trimEnd() : content;
        total += preloadedContent.length;
        out.push({
          id,
          label: id || skillPath,
          namespace,
          path: skillPath,
          profileId: resolved.profileId,
          content: preloadedContent,
          totalChars: content.length,
          loadedChars: preloadedContent.length,
          truncated,
        });
      } catch (err) {
        out.push({
          id,
          label: id || skillPath,
          namespace,
          path: skillPath,
          profileId: resolved.profileId,
          missing: true,
          error: cleanString(err?.code || err?.message, "required_skill_read_failed"),
        });
      }
    }
    return out;
  }

  return Object.freeze({
    preloadRequiredSkills,
    resolveSkill,
  });
}

module.exports = {
  createPluginRequiredSkillPreloadService,
  normalizeSkillPath,
  skillProfilesForWorkspace,
};
