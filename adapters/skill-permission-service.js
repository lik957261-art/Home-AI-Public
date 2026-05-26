"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function normalizePath(value) {
  return cleanString(value).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
}

function normalizeId(value) {
  return cleanString(value).toLowerCase();
}

function parseFrontmatter(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end < 0) return {};
  const data = {};
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return data;
}

function profileNameFromRoot(root) {
  const normalized = normalizePath(root);
  const match = normalized.match(/(?:^|\/)skill-profiles\/([^/]+)\/skills(?:\/|$)/);
  return match ? match[1] : "";
}

function rootLooksSystemShared(root, filePath = "") {
  const normalizedRoot = normalizePath(root);
  const normalizedFile = normalizePath(filePath);
  const profile = profileNameFromRoot(normalizedRoot);
  if (profile === "owner-full" || profile === "shared-global") return true;
  if (profile) return false;
  if (normalizedRoot.endsWith("/skills") && normalizedFile.includes("/skills/")) return true;
  if (normalizedRoot.includes("/official-clean/skills") || normalizedRoot.includes("/official-clean/optional-skills")) return true;
  if (normalizedRoot.includes("/.codex/skills")) return true;
  if (normalizedRoot.includes("/.hermes/skills")) return true;
  return false;
}

function firstFrontmatterValue(data, keys) {
  for (const key of keys) {
    const direct = data[key];
    if (direct) return cleanString(direct);
    const lowerKey = Object.keys(data).find((item) => item.toLowerCase() === key.toLowerCase());
    if (lowerKey && data[lowerKey]) return cleanString(data[lowerKey]);
  }
  return "";
}

function inferSkillOwnership(input = {}) {
  const data = parseFrontmatter(input.content || "");
  const root = cleanString(input.root);
  const file = cleanString(input.file || input.filePath);
  const profile = profileNameFromRoot(root);
  const creatorWorkspaceId = firstFrontmatterValue(data, [
    "creatorWorkspaceId",
    "createdByWorkspaceId",
    "ownerWorkspaceId",
    "workspaceId",
  ]);
  const creatorPrincipalId = firstFrontmatterValue(data, [
    "creatorPrincipalId",
    "createdByPrincipalId",
    "ownerPrincipalId",
    "principalId",
    "creator",
    "createdBy",
  ]);
  const systemShared = rootLooksSystemShared(root, file);
  return {
    creatorWorkspaceId: creatorWorkspaceId || (profile && !["owner-full", "shared-global"].includes(profile) ? profile : ""),
    creatorPrincipalId,
    systemShared,
    source: creatorWorkspaceId || creatorPrincipalId
      ? "frontmatter"
      : (profile ? "skill-profile" : (systemShared ? "system-shared" : "unknown")),
    profile,
    root,
    file,
  };
}

function authWorkspaceIds(auth = {}) {
  const raw = []
    .concat(Array.isArray(auth.workspaceIds) ? auth.workspaceIds : [])
    .concat(Array.isArray(auth.workspaces) ? auth.workspaces : [])
    .concat(auth.workspaceId ? [auth.workspaceId] : []);
  return [...new Set(raw.map(normalizeId).filter(Boolean))];
}

function skillWriteAccess(ownership = {}, auth = {}) {
  const isOwner = Boolean(auth.isOwner || auth.role === "owner" || auth.kind === "owner");
  const principalId = normalizeId(auth.principalId || auth.principal_id || "");
  const workspaceIds = authWorkspaceIds(auth);
  const creatorPrincipalId = normalizeId(ownership.creatorPrincipalId);
  const creatorWorkspaceId = normalizeId(ownership.creatorWorkspaceId);

  if (ownership.systemShared) {
    return {
      canWrite: isOwner,
      reason: isOwner ? "owner_system_shared" : "system_shared_read_only",
    };
  }
  if (creatorPrincipalId) {
    const allowed = Boolean(principalId && principalId === creatorPrincipalId);
    return {
      canWrite: allowed,
      reason: allowed ? "creator_principal" : "creator_principal_read_only",
    };
  }
  if (creatorWorkspaceId) {
    const allowed = workspaceIds.includes(creatorWorkspaceId);
    return {
      canWrite: allowed,
      reason: allowed ? "creator_workspace" : "creator_workspace_read_only",
    };
  }
  return {
    canWrite: false,
    reason: "creator_required",
  };
}

function skillAccessForAuth(ownership = {}, auth = {}) {
  const write = skillWriteAccess(ownership, auth);
  return {
    canRead: true,
    canWrite: write.canWrite,
    writeReason: write.reason,
    ownership: {
      creatorWorkspaceId: ownership.creatorWorkspaceId || "",
      creatorPrincipalId: ownership.creatorPrincipalId || "",
      systemShared: Boolean(ownership.systemShared),
      source: ownership.source || "",
      profile: ownership.profile || "",
    },
  };
}

function assertSkillWriteAllowed(ownership = {}, auth = {}) {
  const access = skillAccessForAuth(ownership, auth);
  if (access.canWrite) return access;
  const err = new Error("Skill write access is limited to the Skill creator; system shared Skills are writable by Owner only");
  err.status = 403;
  err.access = access;
  throw err;
}

module.exports = {
  assertSkillWriteAllowed,
  inferSkillOwnership,
  parseFrontmatter,
  skillAccessForAuth,
  skillWriteAccess,
};
