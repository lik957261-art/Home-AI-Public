"use strict";

function defaultDedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

const DEFAULT_LOW_PERMISSION_TOOLSETS = Object.freeze([
  "web",
  "search",
  "x_search",
  "http",
  "weather",
  "browser",
  "file",
  "vision",
  "video",
  "image_gen",
  "messaging",
  "tts",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
]);

function createAccessPolicyProvider(options = {}) {
  const dedupe = options.dedupe || defaultDedupe;
  const uploadCacheRoot = () => String(
    typeof options.uploadCacheRoot === "function" ? options.uploadCacheRoot() : (options.uploadCacheRoot || ""),
  ).trim();
  const sharedRoots = (principalId) => {
    if (typeof options.sharedRoots !== "function") return [];
    return dedupe(options.sharedRoots(principalId) || []);
  };

  const listKeys = new Set([
    "allowed_roots",
    "delivery_roots",
    "cache_roots",
    "allowed_toolsets",
    "blocked_toolsets",
    "allowed_skills",
    "blocked_skills",
    "accessible_workspace_ids",
  ]);
  const boolKeys = new Set(["can_delegate_codex", "allow_shell", "show_task_id"]);
  const intKeys = new Set(["context_window_turns", "max_parallel_tasks"]);
  const allowed = [
    "principal_id", "principal_label", "access_mode", "default_workspace",
    "allowed_roots", "delivery_roots", "sync_root", "download_root", "cache_roots",
    "can_delegate_codex", "allow_shell", "allowed_toolsets", "blocked_toolsets",
    "allowed_skills", "blocked_skills", "connector_profiles", "cron_scope",
    "interaction_mode", "session_mode", "response_style", "background_mode",
    "show_task_id", "context_window_turns", "max_parallel_tasks", "source_platform",
    "source_chat_id", "source_chat_id_alt", "source_user_id", "source_user_id_alt",
    "accessible_workspace_ids",
    "reason",
  ];

  function sanitize(policy) {
    if (!policy || typeof policy !== "object") return {};
    const out = {};
    for (const key of allowed) {
      const value = policy[key];
      if (value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
      if (listKeys.has(key)) out[key] = dedupe((Array.isArray(value) ? value : [value]).map(String).filter(Boolean));
      else if (boolKeys.has(key)) out[key] = Boolean(value);
      else if (intKeys.has(key)) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
      } else if (key === "connector_profiles" && value && typeof value === "object") {
        out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [String(k), String(v)]));
      } else {
        out[key] = String(value);
      }
    }
    return out;
  }

  function build(route, user, project) {
    const merged = Object.assign({}, route || {}, user || {});
    const source = {
      source_platform: "web",
      source_chat_id: project?.id || route?.chat_id || user?.user_id || route?.principal_id,
      source_chat_id_alt: route?.adapter_account_id || user?.account_id || "",
      source_user_id: route?.user_id || user?.user_id || route?.principal_id || "",
      source_user_id_alt: route?.principal_id || user?.principal_id || "",
      reason: "hermes_web",
    };
    const policy = sanitize(Object.assign({}, merged, source));
    policy.allowed_toolsets = dedupe([
      ...(policy.allowed_toolsets || []),
      ...DEFAULT_LOW_PERMISSION_TOOLSETS,
    ]);
    if (project && project.root) {
      policy.default_workspace = project.root;
    }
    const cacheRoot = uploadCacheRoot();
    const addCacheRoot = () => {
      policy.cache_roots = dedupe([...(policy.cache_roots || []), cacheRoot].filter(Boolean));
    };
    const principalId = policy.principal_id || route?.principal_id || user?.principal_id || "";
    if (policy.principal_id === "owner" || policy.access_mode === "unrestricted") {
      policy.access_mode = "unrestricted";
      addCacheRoot();
      return policy;
    }
    policy.allowed_roots = dedupe([
      ...(policy.allowed_roots || []),
      policy.default_workspace,
      ...sharedRoots(principalId),
    ].filter(Boolean));
    policy.delivery_roots = dedupe([
      ...(policy.delivery_roots || []),
      policy.sync_root,
      policy.download_root,
    ].filter(Boolean));
    addCacheRoot();
    return policy;
  }

  return {
    build,
    sanitize,
  };
}

module.exports = {
  createAccessPolicyProvider,
};
