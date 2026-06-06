"use strict";

const path = require("node:path");

function wslUncPathCandidates(options = {}, root, ...parts) {
  const env = options.env || process.env;
  const wslDistro = options.wslDistro || "Ubuntu-24.04";
  const allowWslUnc = /^(1|true|yes|on)$/i.test(
    env.HERMES_MOBILE_ALLOW_WSL_UNC_PROBES
    || env.HERMES_WEB_ALLOW_WSL_UNC_PROBES
    || "",
  );
  if (!allowWslUnc) return [];
  const normalizedRoot = String(root || "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalizedRoot) return [];
  const suffix = parts
    .map((part) => String(part || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  const full = [normalizedRoot, suffix].filter(Boolean).join("/").replaceAll("/", "\\");
  return [
    `\\\\wsl.localhost\\${wslDistro}\\${full}`,
    `\\\\wsl$\\${wslDistro}\\${full}`,
  ];
}

function createMobileRuntimePathCandidateEnvironment(options = {}) {
  const env = options.env || process.env;
  const localConfigRoot = options.localConfigRoot || path.resolve("config");
  const windowsHome = options.windowsHome || "";
  const wslDistro = options.wslDistro || "Ubuntu-24.04";
  const wslHome = options.wslHome || "";
  const wslHermesHome = options.wslHermesHome || "";
  const wslCandidates = (root, ...parts) => wslUncPathCandidates({ env, wslDistro }, root, ...parts);
  const ENABLE_LEGACY_WEIXIN_COMPAT = /^(1|true|yes|on)$/i.test(
    env.HERMES_WEB_ENABLE_LEGACY_WEIXIN_COMPAT || env.HERMES_WEB_LEGACY_WEIXIN_COMPAT || "",
  );
  const HERMES_ENV_PATHS = [
    env.HERMES_WEB_HERMES_ENV_PATH,
    ...wslCandidates(wslHermesHome, ".env"),
  ].filter(Boolean);
  const HERMES_API_KEY_PATHS = [
    env.HERMES_WEB_HERMES_API_KEY_PATH,
    path.join(windowsHome, ".hermes-windows", "hermes-api-server-key.secret"),
  ].filter(Boolean);
  const WORKSPACE_USERS_PATHS = [
    env.HERMES_WEB_WORKSPACE_USERS_PATH,
    ...wslCandidates(wslHermesHome, "access-control", "workspace-users.json"),
    path.join(localConfigRoot, "access-control", "workspace-users.json"),
    env.HERMES_WEB_WEIXIN_USERS_PATH,
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslCandidates(wslHermesHome, "access-control", "weixin-users.json") : []),
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(localConfigRoot, "access-control", "weixin-users.json")] : []),
  ].filter(Boolean);
  const WORKSPACE_ROUTE_MAP_PATHS = [
    env.HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH,
    ...wslCandidates(wslHermesHome, "access-control", "workspace-routing-map.json"),
    path.join(localConfigRoot, "access-control", "workspace-routing-map.json"),
    env.HERMES_WEB_WEIXIN_ROUTE_MAP_PATH,
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslCandidates(wslHermesHome, "access-control", "weixin-routing-map.json") : []),
    ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(localConfigRoot, "access-control", "weixin-routing-map.json")] : []),
  ].filter(Boolean);
  const HERMES_CONFIG_PATHS = [
    env.HERMES_WEB_HERMES_CONFIG_PATH,
    env.HERMES_CONFIG_PATH,
    ...wslCandidates(wslHermesHome, "config.yaml"),
    path.join(localConfigRoot, "hermes-config.yaml"),
    path.join(localConfigRoot, "config.yaml"),
  ].filter(Boolean);
  const EXPLICIT_HERMES_CONFIG_PATHS = new Set([
    env.HERMES_WEB_HERMES_CONFIG_PATH,
    env.HERMES_CONFIG_PATH,
  ].map((item) => String(item || "").trim()).filter(Boolean));
  const ALLOW_WSL_REASONING_CONFIG_LOOKUP = /^(1|true|yes|on)$/i.test(
    env.HERMES_MOBILE_ALLOW_WSL_REASONING_CONFIG_LOOKUP
    || env.HERMES_WEB_ALLOW_WSL_REASONING_CONFIG_LOOKUP
    || "",
  );
  const STATUS_INCLUDE_CATALOG = /^(1|true|yes|on)$/i.test(
    env.HERMES_MOBILE_STATUS_INCLUDE_CATALOG
    || env.HERMES_WEB_STATUS_INCLUDE_CATALOG
    || "",
  );
  const GATEWAY_POOL_MANIFEST_PATHS = [
    env.HERMES_WEB_GATEWAY_POOL_MANIFEST,
    ...wslCandidates(wslHermesHome, "worker-pool.json"),
  ].filter(Boolean);
  const GOOGLE_TOKEN_PATHS = [
    env.HERMES_WEB_GOOGLE_TOKEN_PATH,
    ...wslCandidates(wslHermesHome, "google_token.json"),
  ].filter(Boolean);
  const GOOGLE_CLIENT_SECRET_PATHS = [
    env.HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH,
    ...wslCandidates(wslHermesHome, "google_client_secret.json"),
  ].filter(Boolean);
  const OUTLOOK_GRAPH_TOKEN_PATHS = [
    env.HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH,
    ...wslCandidates(wslHermesHome, "microsoft-graph-outlook-mail", "token.json"),
  ].filter(Boolean);
  const GITHUB_CLI_HOSTS_PATHS = [
    env.HERMES_WEB_GITHUB_CLI_HOSTS_PATH,
    path.join(windowsHome, "AppData", "Roaming", "GitHub CLI", "hosts.yml"),
    ...wslCandidates(wslHome, ".config", "gh", "hosts.yml"),
  ].filter(Boolean);
  const PROJECT_MAP_PATHS = [
    env.HERMES_WEB_PROJECT_MAP_PATH,
    path.join(localConfigRoot, "project-directory-map.json"),
  ].filter(Boolean);

  return Object.freeze({
    ALLOW_WSL_REASONING_CONFIG_LOOKUP,
    ENABLE_LEGACY_WEIXIN_COMPAT,
    EXPLICIT_HERMES_CONFIG_PATHS,
    GATEWAY_POOL_MANIFEST_PATHS,
    GITHUB_CLI_HOSTS_PATHS,
    GOOGLE_CLIENT_SECRET_PATHS,
    GOOGLE_TOKEN_PATHS,
    HERMES_API_KEY_PATHS,
    HERMES_CONFIG_PATHS,
    HERMES_ENV_PATHS,
    OUTLOOK_GRAPH_TOKEN_PATHS,
    PROJECT_MAP_PATHS,
    STATUS_INCLUDE_CATALOG,
    WORKSPACE_ROUTE_MAP_PATHS,
    WORKSPACE_USERS_PATHS,
  });
}

module.exports = {
  createMobileRuntimePathCandidateEnvironment,
  wslUncPathCandidates,
};
