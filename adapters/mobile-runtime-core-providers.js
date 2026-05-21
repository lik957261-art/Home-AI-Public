"use strict";

const { createAccessPolicyProvider } = require("./access-policy-provider");
const { createAuthProvider } = require("./auth-provider");
const { createAuditEventProvider } = require("./audit-event-provider");
const { createBridgeCommandProvider } = require("./bridge-command-provider");
const { createEgressPolicyProvider } = require("./egress-policy-provider");
const { createFileArtifactAccessService } = require("./file-artifact-access-service");
const { createFileArtifactResolverService } = require("./file-artifact-resolver-service");
const { createFileResponseService } = require("./file-response-service");
const { createFilesystemMountProvider } = require("./filesystem-mount-provider");
const { createGatewayStatusProjection } = require("./gateway-status-projection");
const { createLearningCoinService } = require("./learning-coin-service");
const { createPathPolicyProvider } = require("./path-policy-provider");
const { createProjectDiscoveryProvider } = require("./project-discovery-provider");
const { createRunConcurrencyPolicy } = require("./run-concurrency-policy");
const { createSecurityBoundaryProvider } = require("./security-boundary-provider");
const { createSharedDirectoryProvider } = require("./shared-directory-provider");

function createMobileRuntimeCoreProviders(deps = {}) {
  const env = deps.env || process.env;
  const runtimeEnv = deps.runtimeEnv || {};
  const runConcurrencyPolicy = createRunConcurrencyPolicy({
    maxGlobal: () => runtimeEnv.RUN_CONCURRENCY_MAX_GLOBAL,
    maxPerWorkspace: () => runtimeEnv.RUN_CONCURRENCY_MAX_PER_WORKSPACE,
  });
  deps.bootTrace?.("concurrency ready");

  const authProvider = createAuthProvider({
    disableAuth: () => runtimeEnv.DISABLE_AUTH,
    envKey: () => env.HERMES_WEB_KEY || "",
    authKeyPath: () => runtimeEnv.AUTH_KEY_PATH,
    accessKeysPath: () => runtimeEnv.ACCESS_KEYS_PATH,
    allowMemoryKey: () => /^(1|true|yes|on)$/i.test(env.HERMES_WEB_ALLOW_MEMORY_KEY || ""),
    nowIso: deps.nowIso,
    ensureDataDir: deps.ensureDataDir,
    findWorkspace: deps.findWorkspace,
    workspacePrincipal: deps.workspacePrincipal,
    listWorkspaces: () => deps.loadCatalog().workspaces,
  });
  deps.bootTrace?.("auth ready");

  const gatewayStatusProjection = createGatewayStatusProjection({ isOwnerAuth: deps.isOwnerAuth });
  const filesystemMountProvider = createFilesystemMountProvider({
    wslDistro: runtimeEnv.WSL_DISTRO,
    windowsHome: runtimeEnv.WINDOWS_HOME,
    repoRoot: runtimeEnv.REPO_ROOT,
    dataDir: runtimeEnv.DATA_DIR,
    volume1WindowsRoot: () => env.HERMES_WEB_VOLUME1_WINDOWS_ROOT || "",
    disabledVolume1Shares: () => deps.normalizeStringList(env.HERMES_WEB_DISABLED_VOLUME1_WINDOWS_MIRROR_SHARES || ""),
    allowedArtifactRoots: () => String(env.HERMES_WEB_ALLOWED_ARTIFACT_ROOTS || ""),
  });
  deps.bootTrace?.("filesystem mount ready");

  const securityBoundaryProvider = createSecurityBoundaryProvider({
    allowUnrestricted: () => env.HERMES_MOBILE_SECURITY_ALLOW_UNRESTRICTED || env.HERMES_WEB_SECURITY_ALLOW_UNRESTRICTED || "",
    allowDeveloperToolsets: () => env.HERMES_MOBILE_SECURITY_ALLOW_DEVELOPER_TOOLSETS || env.HERMES_WEB_SECURITY_ALLOW_DEVELOPER_TOOLSETS || "",
    protectedRoots: () => deps.dedupe([
      runtimeEnv.REPO_ROOT,
      runtimeEnv.TOOL_ROOT,
      runtimeEnv.PUBLIC_ROOT,
      runtimeEnv.LOCAL_CONFIG_ROOT,
      deps.path.dirname(runtimeEnv.AUTH_KEY_PATH),
      runtimeEnv.WINDOWS_HOME ? deps.path.join(runtimeEnv.WINDOWS_HOME, ".hermes-windows") : "",
      env.HERMES_WEB_HERMES_HOME,
      env.HERMES_MOBILE_HERMES_HOME,
      env.HERMES_WEB_HERMES_REPO,
      env.HERMES_MOBILE_HERMES_REPO,
      runtimeEnv.WSL_HERMES_HOME,
      `${runtimeEnv.WSL_HOME}/.hermes-update-sandboxes`,
      ...runtimeEnv.GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
      ...deps.normalizeStringList(env.HERMES_MOBILE_SECURITY_PROTECTED_ROOTS || env.HERMES_WEB_SECURITY_PROTECTED_ROOTS || ""),
    ].filter(Boolean)),
    protectedFiles: () => deps.dedupe([
      runtimeEnv.STATE_PATH,
      runtimeEnv.ACCESS_KEYS_PATH,
      runtimeEnv.LOCAL_WORKSPACES_PATH,
      runtimeEnv.RUNTIME_CONFIG_PATH,
      runtimeEnv.LEARNING_COIN_STORE_PATH,
      runtimeEnv.SHARED_DIRECTORIES_PATH,
      runtimeEnv.AUTH_KEY_PATH,
      runtimeEnv.WEB_PUSH_VAPID_PATH,
      runtimeEnv.LOCAL_TODO_STORE_PATH,
      runtimeEnv.LOCAL_AUTOMATION_STORE_PATH,
      runtimeEnv.MOBILE_SQLITE_DB_PATH,
      ...runtimeEnv.WEIXIN_INGRESS_KEY_PATHS,
      ...runtimeEnv.HERMES_ENV_PATHS,
      ...runtimeEnv.HERMES_API_KEY_PATHS,
      ...runtimeEnv.WORKSPACE_USERS_PATHS,
      ...runtimeEnv.WORKSPACE_ROUTE_MAP_PATHS,
      ...runtimeEnv.HERMES_CONFIG_PATHS,
      ...runtimeEnv.GATEWAY_POOL_MANIFEST_PATHS,
      ...runtimeEnv.GOOGLE_TOKEN_PATHS,
      ...runtimeEnv.GOOGLE_CLIENT_SECRET_PATHS,
      ...runtimeEnv.OUTLOOK_GRAPH_TOKEN_PATHS,
      ...runtimeEnv.GITHUB_CLI_HOSTS_PATHS,
      ...deps.normalizeStringList(env.HERMES_MOBILE_SECURITY_PROTECTED_FILES || env.HERMES_WEB_SECURITY_PROTECTED_FILES || ""),
    ].filter(Boolean)),
    allowedExceptionRoots: () => deps.dedupe([
      runtimeEnv.OWNER_DEFAULT_WORKSPACE,
      deps.path.join(runtimeEnv.DATA_DIR, "drive"),
      deps.path.join(runtimeEnv.DATA_DIR, "artifacts"),
      deps.path.join(runtimeEnv.DATA_DIR, "uploads"),
      runtimeEnv.GROUP_DELIVERIES_DIR,
      runtimeEnv.CRON_OUTPUT_ROOT,
      runtimeEnv.CRON_RUN_LOG_ROOT,
      ...deps.normalizeStringList(env.HERMES_MOBILE_SECURITY_ALLOWED_EXCEPTIONS || env.HERMES_WEB_SECURITY_ALLOWED_EXCEPTIONS || ""),
    ].filter(Boolean)),
  });
  deps.bootTrace?.("security boundary ready");

  const fileArtifactAccessService = createFileArtifactAccessService({
    dataDir: runtimeEnv.DATA_DIR,
    workspaceUploadDirName: runtimeEnv.WORKSPACE_UPLOAD_DIR_NAME,
    workspaceUploadSubdir: runtimeEnv.WORKSPACE_UPLOAD_SUBDIR,
    state: deps.state,
    findWorkspace: deps.findWorkspace,
    normalizeLocalPath: deps.normalizeLocalPath,
    rootConflictsWithProtected: (value) => securityBoundaryProvider.rootConflictsWithProtected(value),
    pathInsideAnyRoot: deps.pathInsideAnyRoot,
    chatGroupMemberWorkspaceIds: deps.chatGroupMemberWorkspaceIds,
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    mimeFor: deps.mimeFor,
  });

  const fileResponseService = createFileResponseService({
    contentDisposition: deps.contentDisposition,
    extractDocxText: deps.extractDocxText,
    mimeFor: deps.mimeFor,
    sendJson: deps.sendJson,
    textBufferPreview: deps.textBufferPreview,
    textFilePreview: deps.textFilePreview,
  });

  const fileArtifactResolverService = createFileArtifactResolverService({
    state: deps.state,
    normalizeLocalPath: deps.normalizeLocalPath,
    resolveBrowserPath: deps.resolveBrowserPath,
    logicalUserPathFallback: deps.logicalUserPathFallback,
    logicalDirectoryDisplayPath: deps.logicalDirectoryDisplayPath,
    mimeFor: deps.mimeFor,
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    artifactAccessibleToAuth: deps.artifactAccessibleToAuth,
    isPathAllowedForThread: deps.isPathAllowedForThread,
    isPathAllowed: deps.isPathAllowed,
    isOwnerAuth: deps.isOwnerAuth,
    findArtifactReferenceById: deps.findArtifactReferenceById,
    findArtifactReference: deps.findArtifactReference,
    resolveArtifactPathFromMessage: deps.resolveArtifactPathFromMessage,
  });

  const bridgeCommandProvider = createBridgeCommandProvider({
    wslDistro: () => runtimeEnv.WSL_DISTRO,
    windowsPathToWsl: deps.windowsPathToWsl,
  });
  const TODO_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_TODO_BRIDGE_SCRIPT", runtimeEnv.DEFAULT_TODO_BRIDGE_SCRIPT);
  const CRON_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_CRON_BRIDGE_SCRIPT", runtimeEnv.DEFAULT_CRON_BRIDGE_SCRIPT);
  const DIRECTORY_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_DIRECTORY_BRIDGE_SCRIPT", runtimeEnv.DEFAULT_DIRECTORY_BRIDGE_SCRIPT);
  const SKILL_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_SKILL_BRIDGE_SCRIPT", runtimeEnv.DEFAULT_SKILL_BRIDGE_SCRIPT);
  deps.bootTrace?.("bridge commands ready");

  const sharedDirectoryProvider = createSharedDirectoryProvider({
    storagePath: runtimeEnv.SHARED_DIRECTORIES_PATH,
    ensureDataDir: deps.ensureDataDir,
    nowIso: deps.nowIso,
    readJsonFirst: deps.readJsonFirst,
    usersPaths: runtimeEnv.WORKSPACE_USERS_PATHS,
    loadCatalog: deps.loadCatalog,
    findWorkspace: deps.findWorkspace,
    workspacePrincipal: deps.workspacePrincipal,
    isRootAllowed: (root) => !securityBoundaryProvider.rootConflictsWithProtected(root),
  });
  deps.bootTrace?.("shared directories ready");

  const auditEventProvider = createAuditEventProvider({
    sink: (eventType, event) => {
      if (deps.useSqliteServiceStore()) {
        deps.mobileSqliteStore().audit(eventType, event);
        return;
      }
      deps.ensureDataDir();
      deps.fs.appendFileSync(runtimeEnv.AUDIT_EVENT_LOG_PATH, `${JSON.stringify(event)}\n`, "utf8");
    },
    onError: (err, event) => {
      console.warn("[audit] failed to record event", event?.eventType || "event", err?.message || String(err));
    },
  });
  deps.bootTrace?.("audit events ready");

  const egressPolicyProvider = createEgressPolicyProvider({
    audit: (eventType, payload) => auditEventProvider.audit(eventType, payload),
  });
  deps.bootTrace?.("egress policy ready");

  const learningCoinService = createLearningCoinService({
    fs: deps.fs,
    path: deps.path,
    storagePath: runtimeEnv.LEARNING_COIN_STORE_PATH,
    ensureDataDir: deps.ensureDataDir,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    audit: (eventType, payload) => auditEventProvider.audit(eventType, payload),
  });
  deps.bootTrace?.("learning coins ready");

  const pathPolicyProvider = createPathPolicyProvider({
    normalizeLocalPath: deps.normalizeLocalPath,
    isProtectedPath: (value) => securityBoundaryProvider.isProtectedPath(value),
    isGloballyAllowedPath: deps.isPathAllowed,
    uploadRootsForThread: deps.uploadRootsForThread,
    policyForThread: deps.policyForThread,
    ownerRootsForThread: (thread) => deps.dedupe([
      ...deps.loadCatalog().projects
        .filter((project) => project.workspaceId === "owner")
        .map((project) => project.root)
        .filter(Boolean),
      ...deps.sharedDirectoryRoots(thread?.workspaceId),
    ]),
    directoryOwnerRootsForThread: (thread) => {
      const home = deps.os.homedir();
      return [
        home ? deps.path.join(home, "Documents") : "",
        home ? deps.path.join(home, "SynologyDrive") : "",
        deps.path.join(runtimeEnv.REPO_ROOT, "workspace"),
        deps.path.join(runtimeEnv.REPO_ROOT, "outbox"),
        ...deps.sharedDirectoryRoots(thread?.workspaceId),
        ...deps.loadCatalog().projects
          .filter((project) => project.workspaceId === "owner")
          .flatMap((project) => [project.root, ...(project.children || []).map((child) => child.root)]),
      ].filter((root) => root && !securityBoundaryProvider.rootConflictsWithProtected(root));
    },
    audit: (eventType, payload) => {
      if (payload?.decision === "deny") auditEventProvider.audit(eventType, payload);
    },
  });
  deps.bootTrace?.("path policy ready");

  const accessPolicyProvider = createAccessPolicyProvider({
    uploadCacheRoot: () => deps.path.join(runtimeEnv.DATA_DIR, "uploads"),
    sharedRoots: (principalId) => deps.sharedDirectoryRoots(principalId),
  });
  deps.bootTrace?.("access policy ready");

  const projectDiscoveryProvider = createProjectDiscoveryProvider({
    repoRoot: runtimeEnv.REPO_ROOT,
    singleWindowProjectId: runtimeEnv.SINGLE_WINDOW_PROJECT_ID,
    singleWindowThreadTitle: runtimeEnv.SINGLE_WINDOW_THREAD_TITLE,
    ownerDriveRootNames: runtimeEnv.OWNER_DRIVE_ROOT_NAMES,
    normalizeLocalPath: deps.normalizeLocalPath,
    runDirectoryBridge: deps.runDirectoryBridge,
    sharedProjectsForWorkspace: deps.sharedDirectoryProjectsForWorkspace,
    workspacePrincipal: deps.workspacePrincipal,
    findWorkspace: deps.findWorkspace,
    makeId: deps.makeId,
  });
  deps.bootTrace?.("project discovery ready");

  return {
    accessPolicyProvider,
    auditEventProvider,
    authProvider,
    bridgeCommandProvider,
    CRON_BRIDGE_SCRIPT,
    DIRECTORY_BRIDGE_SCRIPT,
    egressPolicyProvider,
    fileArtifactAccessService,
    fileArtifactResolverService,
    fileResponseService,
    filesystemMountProvider,
    gatewayStatusProjection,
    learningCoinService,
    pathPolicyProvider,
    projectDiscoveryProvider,
    runConcurrencyPolicy,
    securityBoundaryProvider,
    sharedDirectoryProvider,
    SKILL_BRIDGE_SCRIPT,
    TODO_BRIDGE_SCRIPT,
  };
}

module.exports = {
  createMobileRuntimeCoreProviders,
};
