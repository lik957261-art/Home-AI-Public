"use strict";

const path = require("node:path");

function valueFrom(value) {
  return typeof value === "function" ? value() : value;
}

function stringList(value) {
  const rawValue = valueFrom(value);
  const raw = Array.isArray(rawValue)
    ? rawValue
    : (typeof rawValue === "string" ? rawValue.split(path.delimiter) : (rawValue ? [rawValue] : []));
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function dedupe(values, keyFn = (value) => String(value || "")) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = keyFn(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function decodeFileUrl(value) {
  const text = String(value || "").trim();
  if (!/^file:\/\//i.test(text)) return text;
  try {
    const parsed = new URL(text);
    const pathname = decodeURIComponent(parsed.pathname || "");
    if (/^\/[A-Za-z]:\//.test(pathname)) return pathname.slice(1);
    return pathname || text;
  } catch (_) {
    return text;
  }
}

function normalizeComparablePath(value) {
  let text = decodeFileUrl(value).trim();
  if (!text) return "";
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!text) return "";
  text = text.replaceAll("\\", "/");

  const wslUnc = text.match(/^\/\/wsl(?:\.localhost|\$)\/[^/]+(\/.*)$/i);
  if (wslUnc) text = wslUnc[1];

  const wslDrive = text.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
  if (wslDrive) text = `${wslDrive[1]}:/${wslDrive[2]}`;

  const drive = text.match(/^([A-Za-z]):(?:\/(.*))?$/);
  if (drive) {
    const rest = String(drive[2] || "")
      .split("/")
      .filter(Boolean)
      .join("/");
    text = `${drive[1].toLowerCase()}:/${rest}`;
  } else if (text.startsWith("//")) {
    text = `//${text.slice(2).split("/").filter(Boolean).join("/")}`;
  } else {
    text = text.replace(/\/+/g, "/");
    if (!text.startsWith("/") && /^[A-Za-z]:/.test(text)) text = text.slice(0, 1).toLowerCase() + text.slice(1);
  }

  text = text.replace(/\/+$/g, "");
  if (/^[a-z]:$/i.test(text)) return `${text.toLowerCase()}/`;
  return text.toLowerCase();
}

function pathInside(candidate, root) {
  const key = normalizeComparablePath(candidate);
  const rootKey = normalizeComparablePath(root);
  const prefix = rootKey.endsWith("/") ? rootKey : `${rootKey}/`;
  return Boolean(key && rootKey && (key === rootKey || key.startsWith(prefix)));
}

function pathAncestorOf(candidate, child) {
  const key = normalizeComparablePath(candidate);
  const childKey = normalizeComparablePath(child);
  const prefix = key.endsWith("/") ? key : `${key}/`;
  return Boolean(key && childKey && key !== childKey && childKey.startsWith(prefix));
}

function envFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(valueFrom(value) || "").trim());
}

function classifySharedSkillWriteIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const mentionsSkill = /SKILL\.md|skills?|\u6280\u80fd/i.test(raw);
  if (!mentionsSkill) return null;
  const hasWriteAction = (
    /create|write|update|modify|edit|install|publish|share|generate|copy/i.test(raw)
    || /[\u521b\u65b0]\u5efa|\u5199\u5165|\u66f4\u65b0|\u4fee\u6539|\u7f16\u8f91|\u5b89\u88c5|\u53d1\u5e03|\u5171\u4eab|\u751f\u6210|\u590d\u5236/.test(raw)
  );
  const hasSharedScope = (
    /shared?|common|global|system|public|all\s+users?|all\s+workspaces?|everyone/i.test(raw)
    || /\u901a\u7528|\u5171\u4eab|\u516c\u7528|\u516c\u5171|\u5168\u5c40|\u7cfb\u7edf\u7ea7|\u6240\u6709\u7528\u6237|\u5168\u90e8\u7528\u6237|\u6240\u6709\u5de5\u4f5c\u533a|\u5168\u90e8\u5de5\u4f5c\u533a|\u5168\u5458|\u5927\u5bb6\u90fd\u80fd\u7528|\u7ed9\u6240\u6709\u4eba\u7528/.test(raw)
  );
  if (!hasWriteAction || !hasSharedScope) return null;
  return {
    category: "shared_skill_write",
    elevationRequired: true,
    elevationScope: "shared_skill_write",
    message: "This looks like a shared/system Skill write. Confirm elevation to route this one run to an Owner maintenance Gateway.",
  };
}

function createSecurityBoundaryProvider(options = {}) {
  const allowUnrestricted = () => envFlag(options.allowUnrestricted);
  const allowDeveloperToolsets = () => envFlag(options.allowDeveloperToolsets);
  const protectedRoots = () => dedupe([
    ...stringList(options.protectedRoots),
  ], normalizeComparablePath);
  const protectedFiles = () => dedupe([
    ...stringList(options.protectedFiles),
  ], normalizeComparablePath);
  const allowedExceptionRoots = () => dedupe([
    ...stringList(options.allowedExceptionRoots),
  ], normalizeComparablePath);

  function isAllowedExceptionPath(value) {
    const key = normalizeComparablePath(value);
    if (!key) return false;
    return allowedExceptionRoots().some((root) => pathInside(key, root));
  }

  function isProtectedFile(value) {
    const key = normalizeComparablePath(value);
    return Boolean(key && protectedFiles().some((filePath) => key === normalizeComparablePath(filePath)));
  }

  function isProtectedPath(value) {
    const key = normalizeComparablePath(value);
    if (!key) return false;
    if (isProtectedFile(key)) return true;
    if (isAllowedExceptionPath(key)) return false;
    return protectedRoots().some((root) => pathInside(key, root));
  }

  function rootConflictsWithProtected(value) {
    const key = normalizeComparablePath(value);
    if (!key) return false;
    if (isProtectedFile(key)) return true;
    if (isAllowedExceptionPath(key)) return false;
    if (isProtectedPath(key)) return true;
    return [...protectedRoots(), ...protectedFiles()].some((protectedPath) => pathAncestorOf(key, protectedPath));
  }

  function filterRoots(values) {
    return dedupe(values || [], normalizeComparablePath).filter((root) => !rootConflictsWithProtected(root));
  }

  function filterScalarRoot(value) {
    const text = String(value || "").trim();
    return text && !rootConflictsWithProtected(text) ? text : "";
  }

  function filterToolsets(values) {
    const raw = dedupe(values || []);
    if (allowDeveloperToolsets()) return raw;
    return raw.filter((item) => !/(?:^|[-_])(?:shell|terminal|cmd|powershell|bash|git|codex|developer|source)(?:$|[-_])/i.test(item));
  }

  function hardenAccessPolicy(policy = {}) {
    const source = policy && typeof policy === "object" ? policy : {};
    const out = Object.assign({}, source);
    const accessMode = String(out.access_mode || out.accessMode || "").trim().toLowerCase();
    out.access_mode = accessMode === "unrestricted" && !allowUnrestricted() ? "restricted" : (accessMode || "restricted");
    out.allowed_roots = filterRoots(out.allowed_roots || out.allowedRoots || []);
    out.delivery_roots = filterRoots(out.delivery_roots || out.deliveryRoots || []);
    out.cache_roots = filterRoots(out.cache_roots || out.cacheRoots || []);
    out.default_workspace = filterScalarRoot(out.default_workspace || out.defaultWorkspace || "");
    out.sync_root = filterScalarRoot(out.sync_root || out.syncRoot || "");
    out.download_root = filterScalarRoot(out.download_root || out.downloadRoot || "");
    out.allowed_toolsets = filterToolsets(out.allowed_toolsets || out.allowedToolsets || []);

    const rootCandidates = [
      out.default_workspace,
      out.sync_root,
      out.download_root,
      ...(out.delivery_roots || []),
    ].filter(Boolean);
    out.allowed_roots = filterRoots([...(out.allowed_roots || []), ...rootCandidates]);
    if (!allowDeveloperToolsets()) {
      out.allow_shell = false;
      out.can_delegate_codex = false;
      out.blocked_toolsets = dedupe([
        ...(out.blocked_toolsets || []),
        "shell",
        "terminal",
        "git",
        "codex",
        "source",
      ]);
    }
    return out;
  }

  function assertRootNotProtected(value, message = "Path is blocked by the Hermes Mobile security boundary") {
    if (rootConflictsWithProtected(value)) {
      const err = new Error(message);
      err.status = 403;
      throw err;
    }
    return value;
  }

  function classifyMaintenanceIntent(text) {
    const compact = String(text || "").toLowerCase();
    if (!compact.trim()) return null;
    const product = /(hermes\s*(?:mobile|web)|server\.js|cron_bridge|todo_bridge|skill_bridge|directory_bridge|service[-_ ]worker|gateway\s*pool|listener|source\s*checkout|productization|源码|源代码|代码库|私有库|public\s*repo|private\s*repo|生产版本|部署|提交|推送|重启)/i.test(compact);
    const action = /(fix|change|modify|patch|commit|push|deploy|restart|publish|refactor|migrate|upgrade|修|改|提交|推送|发布|重启|迁移|升级|清理|产品化|打不开|不显示|排序|通知)/i.test(compact);
    if (product && action) {
      return {
        category: "product_maintenance",
        message: "Product/source maintenance must be handled through the operator channel, not through Hermes Mobile model runs.",
      };
    }
    return null;
  }

  return {
    allowedExceptionRoots,
    assertRootNotProtected,
    classifyMaintenanceIntent,
    classifySharedSkillWriteIntent,
    filterRoots,
    hardenAccessPolicy,
    isProtectedPath,
    normalizeComparablePath,
    pathInside,
    protectedFiles,
    protectedRoots,
    rootConflictsWithProtected,
  };
}

module.exports = {
  classifySharedSkillWriteIntent,
  createSecurityBoundaryProvider,
  normalizeComparablePath,
  pathInside,
};
