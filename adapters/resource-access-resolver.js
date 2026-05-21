"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const KNOWN_PERMISSIONS = new Set(["read", "write", "delete", "share", "forward"]);
const MANAGE_PERMISSIONS = new Set(["delete", "share"]);
const KNOWN_ROLES = new Set(["owner", "workspace", "shared_manager", "shared_performer", "shared_viewer", "performer", "viewer", "anonymous"]);

function stringValue(value) {
  return String(value || "").trim();
}

function stableHash(value) {
  const text = stringValue(value);
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function stringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return [...new Set(raw.map(stringValue).filter(Boolean))];
}

function normalizeRole(value) {
  const role = stringValue(value).toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  if (role === "shared_manager" || role === "manager") return "shared_manager";
  if (role === "shared_performer") return "performer";
  if (role === "shared_viewer") return "viewer";
  if (KNOWN_ROLES.has(role)) return role;
  return "";
}

function normalizeResourceType(value) {
  const type = stringValue(value).toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  if (type === "file" || type === "local_file") return "file";
  if (type === "artifact") return "artifact";
  if (type === "automation" || type === "cron") return "automation";
  if (type === "kanban" || type === "kanban_card" || type === "kanban_case") return "kanban";
  if (type === "shared_directory" || type === "shared_dir") return "shared_directory";
  return type || "resource";
}

function pathKindFor(descriptor) {
  if (descriptor.pathKind) return stringValue(descriptor.pathKind);
  if (descriptor.type === "artifact") return "artifact";
  if (descriptor.type === "automation") return "automation";
  if (descriptor.type === "kanban") return "kanban";
  if (descriptor.type === "shared_directory") return "shared_directory";
  if (descriptor.localPath) return "local";
  return descriptor.type || "resource";
}

function pathLabelFor(descriptor) {
  const explicit = stringValue(descriptor.pathLabel || descriptor.label || descriptor.name || descriptor.title);
  if (explicit) return explicit;
  const rawPath = stringValue(descriptor.localPath || descriptor.path || descriptor.rootPath);
  if (rawPath) {
    const normalized = rawPath.replaceAll("\\", "/");
    const base = path.posix.basename(normalized);
    if (base && base !== "." && base !== "/") return base;
  }
  return stringValue(descriptor.id || descriptor.resourceId || descriptor.type || "resource");
}

function normalizeSharedAccess(value = {}) {
  return {
    managers: stringList(value.managers || value.managerWorkspaceIds || value.sharedManagers),
    performers: stringList(value.performers || value.performerWorkspaceIds || value.sharedPerformers),
    viewers: stringList(value.viewers || value.viewerWorkspaceIds || value.sharedViewers),
  };
}

function normalizeResourceDescriptor(input = {}) {
  const type = normalizeResourceType(input.type || input.resourceType || input.kind);
  const localPath = stringValue(input.localPath || input.path || input.rootPath || input.filePath);
  const ownerWorkspaceId = stringValue(input.ownerWorkspaceId || input.owner || input.createdByWorkspaceId);
  const workspaceId = stringValue(input.workspaceId || input.workspace || input.actorWorkspaceId || ownerWorkspaceId);
  const descriptor = {
    id: stringValue(input.id || input.resourceId || input.cardId || input.threadId),
    type,
    ownerWorkspaceId,
    workspaceId,
    protected: Boolean(input.protected || input.protectedResource || input.sensitive),
    localPath,
    pathKind: pathKindFor({ type, localPath, pathKind: input.pathKind }),
    pathLabel: pathLabelFor(Object.assign({}, input, { type, localPath })),
    shared: normalizeSharedAccess(input.shared || input.share || input.access || {}),
    metadata: Object.assign({}, input.metadata || {}),
  };
  descriptor.pathHash = stableHash(localPath || `${descriptor.type}:${descriptor.id}:${descriptor.pathLabel}`);
  return descriptor;
}

function publicResourceDescriptor(input = {}) {
  const descriptor = normalizeResourceDescriptor(input);
  return {
    id: descriptor.id,
    type: descriptor.type,
    ownerWorkspaceId: descriptor.ownerWorkspaceId,
    workspaceId: descriptor.workspaceId,
    protected: descriptor.protected,
    pathKind: descriptor.pathKind,
    pathLabel: descriptor.pathLabel,
    pathHash: descriptor.pathHash,
    shared: {
      managers: descriptor.shared.managers.length,
      performers: descriptor.shared.performers.length,
      viewers: descriptor.shared.viewers.length,
    },
  };
}

function redactResourceDescriptor(input = {}) {
  return publicResourceDescriptor(input);
}

function normalizeActor(input = {}) {
  const workspaceId = stringValue(input.workspaceId || input.actorWorkspaceId || input.id || input.principalId);
  const role = normalizeRole(input.role || input.actorRole || (workspaceId ? "workspace" : "anonymous")) || "anonymous";
  return {
    id: stringValue(input.id || input.actorId || input.principalId || workspaceId),
    workspaceId,
    role,
  };
}

function sharedRoleForWorkspace(descriptor, workspaceId) {
  if (!workspaceId) return "";
  if (descriptor.shared.managers.includes(workspaceId)) return "shared_manager";
  if (descriptor.shared.performers.includes(workspaceId)) return "performer";
  if (descriptor.shared.viewers.includes(workspaceId)) return "viewer";
  return "";
}

function effectiveActorRole(actorInput, descriptorInput) {
  const descriptor = normalizeResourceDescriptor(descriptorInput);
  const actor = normalizeActor(actorInput);
  if (actor.role === "owner") return "owner";
  if (!actor.workspaceId) return "anonymous";
  if (actor.workspaceId === descriptor.ownerWorkspaceId || actor.workspaceId === descriptor.workspaceId) return "workspace";
  const sharedRole = sharedRoleForWorkspace(descriptor, actor.workspaceId);
  return sharedRole || "unshared";
}

function allow(reason, details = {}) {
  return Object.assign({ allowed: true, reason }, details);
}

function deny(reason, details = {}) {
  return Object.assign({ allowed: false, reason }, details);
}

function resolveResourceAccess(actorInput, descriptorInput, permissionInput) {
  const permission = stringValue(permissionInput).toLowerCase();
  const descriptor = normalizeResourceDescriptor(descriptorInput);
  const actor = normalizeActor(actorInput);
  const role = effectiveActorRole(actor, descriptor);
  const base = {
    permission,
    actorRole: role,
    resourceId: descriptor.id,
    resourceType: descriptor.type,
    pathKind: descriptor.pathKind,
    pathHash: descriptor.pathHash,
  };

  if (!KNOWN_PERMISSIONS.has(permission)) return deny("unsupported_permission", base);
  if (role === "anonymous") return deny("anonymous", base);
  if (descriptor.protected && role !== "owner") return deny("protected_resource", base);
  if (role === "owner") return allow("owner", base);
  if (role === "workspace") return allow("workspace_owner", base);
  if (role === "shared_manager") return allow("shared_manager", base);
  if (role === "viewer") {
    return permission === "read"
      ? allow("shared_viewer_read", base)
      : deny("viewer_read_only", base);
  }
  if (role === "performer") {
    if (permission === "read" || permission === "write" || permission === "forward") {
      return allow("shared_performer_submit", base);
    }
    return deny(MANAGE_PERMISSIONS.has(permission) ? "performer_not_manager" : "role_not_allowed", base);
  }
  return deny("not_shared", base);
}

function canAccessResource(actor, descriptor, permission) {
  return resolveResourceAccess(actor, descriptor, permission).allowed;
}

module.exports = {
  canAccessResource,
  effectiveActorRole,
  normalizeActor,
  normalizeResourceDescriptor,
  publicResourceDescriptor,
  redactResourceDescriptor,
  resolveResourceAccess,
};
