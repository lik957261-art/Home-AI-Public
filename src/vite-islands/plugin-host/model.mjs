const PLUGIN_HOST_MODEL_VERSION = "20260703-vite-plugin-host-model-v1";
const PLUGIN_IFRAME_LIFECYCLE_MODEL_VERSION = "20260704-vite-plugin-iframe-lifecycle-v1";
const PLUGIN_HOST_STABLE_ENTRY_DEFAULT_BASE_URL = "http://home-ai.local";

const PLUGIN_HOST_VOLATILE_ENTRY_PARAMS = Object.freeze([
  "launch",
  "codexpluginlaunch",
  "token",
  "key",
  "accesskey",
  "apikey",
  "pluginkey",
  "plugintoken",
  "launchtoken",
  "session",
  "sessionkey",
  "sessiontoken",
  "authtoken",
  "bearertoken",
  "accesskey",
  "access_key",
  "t",
  "_",
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function safePluginId(value) {
  return cleanString(value, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

function booleanValue(...values) {
  return values.some((value) => value === true || value === "true" || value === 1 || value === "1");
}

function pluginEntryParamKey(name = "") {
  return cleanString(name, 120).toLowerCase().replace(/[-_]/g, "");
}

function pluginEntryParamIsVolatile(name = "") {
  return PLUGIN_HOST_VOLATILE_ENTRY_PARAMS.includes(pluginEntryParamKey(name));
}

function pluginAvailable(manifest = {}) {
  return Boolean(manifest?.available && manifest?.entry?.url && manifest?.kind === "embedded_app");
}

function pluginUsesLaunchToken(manifest = {}) {
  const entryUrl = cleanString(manifest?.entry?.url, 2000);
  return Boolean(
    manifest?.embed?.tokenStatus === "launch_token_issued"
    || manifest?.embed?.token_status === "launch_token_issued"
    || /[?&](?:launch|codexPluginLaunch)=/i.test(entryUrl),
  );
}

function pluginRefreshesOnVersionChange(manifest = {}) {
  return booleanValue(
    manifest?.embedding?.refreshOnVersionChange,
    manifest?.embedding?.refresh_on_version_change,
    manifest?.embed?.refreshOnVersionChange,
    manifest?.embed?.refresh_on_version_change,
  );
}

function pluginManifestMaxAgeMs(definition = {}, manifest = {}) {
  const explicit = Number(definition?.manifestMaxAgeMs);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  return pluginRefreshesOnVersionChange(manifest) ? 5000 : 60000;
}

function redactSensitiveUrlParams(urlText = "") {
  const value = cleanString(urlText, 2000);
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value, "http://home-ai.local");
  } catch (_error) {
    return value.replace(/((?:launch|codexPluginLaunch|token|key|access_key)=)[^&#]*/gi, "$1[redacted]");
  }
  const sensitive = ["launch", "codexPluginLaunch", "token", "key", "access_key"];
  for (const name of sensitive) {
    if (parsed.searchParams.has(name)) parsed.searchParams.set(name, "[redacted]");
  }
  const rendered = parsed.toString();
  if (/^https?:\/\/home-ai\.local\//.test(rendered)) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return rendered;
}

function stableEntrySignature(urlText = "", options = {}) {
  const value = cleanString(urlText, 2000);
  if (!value) return "";
  const baseUrl = cleanString(options.baseUrl || PLUGIN_HOST_STABLE_ENTRY_DEFAULT_BASE_URL, 2000)
    || PLUGIN_HOST_STABLE_ENTRY_DEFAULT_BASE_URL;
  let parsed;
  let base;
  try {
    base = new URL(baseUrl, PLUGIN_HOST_STABLE_ENTRY_DEFAULT_BASE_URL);
    parsed = new URL(value, base.href);
  } catch (_error) {
    return value.replace(/([?&](?:launch|codexPluginLaunch|token|key|access_key|session|t)=)[^&#]*/gi, "$1[redacted]");
  }
  const stableParams = [];
  parsed.searchParams.forEach((paramValue, key) => {
    if (!pluginEntryParamIsVolatile(key)) stableParams.push([key, paramValue]);
  });
  stableParams.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyCompare = leftKey.localeCompare(rightKey);
    return keyCompare || leftValue.localeCompare(rightValue);
  });
  parsed.search = "";
  stableParams.forEach(([key, paramValue]) => parsed.searchParams.append(key, paramValue));
  const rendered = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (parsed.origin === base.origin || /^https?:\/\/home-ai\.local$/i.test(parsed.origin)) return rendered;
  return `${parsed.origin}${rendered}`;
}

function pluginEntryUrlsStableEquivalent(left = "", right = "", options = {}) {
  const leftSignature = stableEntrySignature(left, options);
  const rightSignature = stableEntrySignature(right, options);
  return Boolean(leftSignature && rightSignature && leftSignature === rightSignature);
}

function pluginRenderedEntryMatches(left = "", right = "", options = {}) {
  return Boolean(left && (left === right || pluginEntryUrlsStableEquivalent(left, right, options)));
}

function pluginProxyEntryWorkspaceMatches(entryUrl = "", workspaceId = "", options = {}) {
  const targetWorkspaceId = cleanString(workspaceId, 120);
  const baseUrl = cleanString(options.baseUrl || PLUGIN_HOST_STABLE_ENTRY_DEFAULT_BASE_URL, 2000)
    || PLUGIN_HOST_STABLE_ENTRY_DEFAULT_BASE_URL;
  try {
    const parsed = new URL(cleanString(entryUrl, 2000), baseUrl);
    if (!parsed.pathname.startsWith("/api/hermes-plugins/")) return true;
    if (!targetWorkspaceId) return false;
    const entryWorkspaceId = parsed.searchParams.get("workspaceId") || parsed.searchParams.get("workspace_id") || "";
    return entryWorkspaceId === targetWorkspaceId;
  } catch (_error) {
    return false;
  }
}

function pluginManifestLaunchContextPlan(input = {}) {
  const record = input.record && typeof input.record === "object" ? input.record : {};
  const workspaceId = cleanString(input.workspaceId, 120);
  const appearanceKey = cleanString(input.appearanceKey, 120);
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const fetchedAt = Number.isFinite(Number(record.manifestFetchedAt)) ? Number(record.manifestFetchedAt) : 0;
  const maxAgeMs = Number.isFinite(Number(record.manifestMaxAgeMs)) ? Number(record.manifestMaxAgeMs) : 60000;
  const manifestAgeFresh = fetchedAt > 0 && now - fetchedAt < maxAgeMs;
  const manifest = record.manifest && typeof record.manifest === "object" ? record.manifest : null;
  const usesLaunchToken = pluginUsesLaunchToken(manifest);
  const refreshOnVersionChange = pluginRefreshesOnVersionChange(manifest);
  const freshEnough = (!usesLaunchToken && !refreshOnVersionChange) || manifestAgeFresh;
  const manifestUsable = manifest?.ok !== false && manifest?.available !== false;
  const workspaceMatches = manifest?.workspaceId === workspaceId;
  const appearanceMatches = cleanString(record.manifestAppearanceKey, 120) === appearanceKey;
  const entryWorkspaceMatches = pluginProxyEntryWorkspaceMatches(manifest?.entry?.url, workspaceId, {
    baseUrl: input.baseUrl,
  });
  const matches = Boolean(
    record.checked
    && manifestUsable
    && workspaceMatches
    && appearanceMatches
    && freshEnough
    && entryWorkspaceMatches
  );
  return Object.freeze({
    matches,
    manifestAgeFresh,
    freshEnough,
    manifestUsable,
    workspaceMatches,
    appearanceMatches,
    entryWorkspaceMatches,
    usesLaunchToken,
    refreshOnVersionChange,
    boundedEvidence: Object.freeze([
      `matches=${matches}`,
      `manifestAgeFresh=${manifestAgeFresh}`,
      `freshEnough=${freshEnough}`,
      `workspaceMatches=${workspaceMatches}`,
      `appearanceMatches=${appearanceMatches}`,
      `entryWorkspaceMatches=${entryWorkspaceMatches}`,
    ]),
  });
}

function pluginResidentShellContextPlan(input = {}) {
  const workspaceId = cleanString(input.workspaceId, 120);
  const appearanceKey = cleanString(input.appearanceKey, 120);
  const frameUsesEntry = Boolean(input.frameUsesEntry);
  const renderedEntryUrl = cleanString(input.renderedEntryUrl, 2000);
  const renderedWorkspaceId = cleanString(input.renderedWorkspaceId || input.manifestWorkspaceId || "", 120);
  const renderedAppearanceKey = cleanString(input.renderedAppearanceKey || input.manifestAppearanceKey || "", 120);
  const workspaceMatches = renderedWorkspaceId === workspaceId;
  const appearanceMatches = renderedAppearanceKey === appearanceKey;
  const entryWorkspaceMatches = pluginProxyEntryWorkspaceMatches(renderedEntryUrl, workspaceId, {
    baseUrl: input.baseUrl,
  });
  const matches = Boolean(frameUsesEntry && workspaceMatches && appearanceMatches && entryWorkspaceMatches);
  return Object.freeze({
    matches,
    frameUsesEntry,
    workspaceMatches,
    appearanceMatches,
    entryWorkspaceMatches,
    boundedEvidence: Object.freeze([
      `matches=${matches}`,
      `frameUsesEntry=${frameUsesEntry}`,
      `workspaceMatches=${workspaceMatches}`,
      `appearanceMatches=${appearanceMatches}`,
      `entryWorkspaceMatches=${entryWorkspaceMatches}`,
    ]),
  });
}

function pluginResidentShellRequiresFreshManifestPlan(input = {}) {
  return Boolean(input.definition?.residentFrame && pluginRefreshesOnVersionChange(input.manifest));
}

function sameOriginHttpBlocked(manifest = {}, currentProtocol = "https:") {
  const entryUrl = cleanString(manifest?.entry?.url, 2000);
  if (!entryUrl) return false;
  try {
    const url = new URL(entryUrl, "https://home-ai.local");
    return currentProtocol === "https:" && url.protocol === "http:";
  } catch (_error) {
    return false;
  }
}

function buildPluginDefinition(definition = {}) {
  const id = safePluginId(definition.id || definition.pluginId);
  const explicitManifestMaxAgeMs = Number(definition?.manifestMaxAgeMs);
  return Object.freeze({
    id,
    title: cleanString(definition.title || id || "Plugin", 80),
    manifestPath: cleanString(definition.manifestPath || `/api/hermes-plugins/${id}/manifest`, 240),
    residentFrame: definition.residentFrame !== false,
    manifestMaxAgeMs: Number.isFinite(explicitManifestMaxAgeMs) ? explicitManifestMaxAgeMs : undefined,
  });
}

function buildPluginHostViewModel(definition = {}, manifest = {}, options = {}) {
  const def = buildPluginDefinition(definition);
  const isOwner = options.isOwner !== false;
  const currentProtocol = cleanString(options.currentProtocol || "https:", 20) || "https:";
  const available = pluginAvailable(manifest);
  const frameAncestorBlocked = Boolean(manifest?.embed?.blockedByFrameAncestors || manifest?.embed?.blocked_by_frame_ancestors);
  const mixedContentBlocked = sameOriginHttpBlocked(manifest, currentProtocol);
  const securityBlocked = frameAncestorBlocked || mixedContentBlocked;
  const usesLaunchToken = pluginUsesLaunchToken(manifest);
  const refreshOnVersionChange = pluginRefreshesOnVersionChange(manifest);
  const status = !isOwner
    ? "permission_denied"
    : securityBlocked
      ? "blocked"
      : available
        ? "ready"
        : "unavailable";
  const iframeEnabled = status === "ready";
  const manifestVersion = cleanString(manifest?.version || manifest?.pluginVersion || manifest?.plugin_version, 120);
  const entryUrl = cleanString(manifest?.entry?.url, 2000);
  const boundedEntryLabel = redactSensitiveUrlParams(entryUrl);
  const manifestMaxAgeMs = pluginManifestMaxAgeMs(def, manifest);
  const evidence = [
    `plugin=${def.id || "unknown"}`,
    `status=${status}`,
    `available=${available}`,
    `launchToken=${usesLaunchToken ? "present" : "absent"}`,
    `refreshOnVersionChange=${refreshOnVersionChange}`,
    `manifestMaxAgeMs=${manifestMaxAgeMs}`,
  ];
  if (manifestVersion) evidence.push(`version=${manifestVersion}`);
  if (securityBlocked) evidence.push(frameAncestorBlocked ? "frame_ancestors_blocked" : "mixed_content_blocked");

  return Object.freeze({
    modelVersion: PLUGIN_HOST_MODEL_VERSION,
    pluginId: def.id,
    title: cleanString(manifest?.title || def.title, 80),
    workspaceId: cleanString(options.workspaceId || manifest?.workspaceId || "owner", 80),
    status,
    statusLabel: status === "ready"
      ? "可嵌入"
      : status === "blocked"
        ? "安全策略阻止"
        : status === "permission_denied"
          ? "需要 Owner 权限"
          : "Manifest 不可用",
    available,
    iframe: Object.freeze({
      enabled: iframeEnabled,
      src: iframeEnabled ? entryUrl : "",
      title: cleanString(manifest?.title || def.title, 80),
      boundedEntryLabel,
      residentFrame: Boolean(def.residentFrame),
    }),
    manifest: Object.freeze({
      path: def.manifestPath,
      version: manifestVersion,
      kind: cleanString(manifest?.kind, 80),
      ok: manifest?.ok !== false,
      available: Boolean(manifest?.available),
      actionCount: Array.isArray(manifest?.actions) ? manifest.actions.length : Number(manifest?.actionCount || 0) || 0,
    }),
    refresh: Object.freeze({
      usesLaunchToken,
      refreshOnVersionChange,
      manifestMaxAgeMs,
      requiresFreshManifest: Boolean(def.residentFrame && refreshOnVersionChange),
    }),
    security: Object.freeze({
      blocked: securityBlocked,
      frameAncestorBlocked,
      mixedContentBlocked,
    }),
    evidence: Object.freeze(evidence),
  });
}

function buildPluginIframeLifecycleState(input = {}) {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const currentUrl = cleanString(input.currentUrl || input.record?.entryUrl || "", 2000);
  const nextUrl = cleanString(input.nextUrl || input.manifest?.entry?.url || "", 2000);
  const loaded = Boolean(input.loaded || input.record?.loaded);
  const shellLoading = input.shellLoading !== false;
  const frameLoadedAtValue = input.frameLoadedAt ?? input.record?.frameLoadedAt ?? 0;
  const loadingStartedAtValue = input.loadingStartedAt ?? input.record?.loadingStartedAt ?? input.record?.createdAt ?? 0;
  const navigationLastAtValue = input.navigationLastAt ?? input.record?.navigationLastAt ?? 0;
  const frameLoadedAt = Number.isFinite(Number(frameLoadedAtValue)) ? Number(frameLoadedAtValue) : 0;
  const loadingStartedAt = Number.isFinite(Number(loadingStartedAtValue)) ? Number(loadingStartedAtValue) : 0;
  const navigationLastAt = Number.isFinite(Number(navigationLastAtValue)) ? Number(navigationLastAtValue) : 0;
  const healthTimeoutMs = Math.max(1000, Number(input.healthTimeoutMs || 12000) || 12000);
  const ageStart = loadingStartedAt || frameLoadedAt ? (loadingStartedAt || frameLoadedAt) : 0;
  const ageMs = Math.max(0, now - ageStart);
  const currentSignature = stableEntrySignature(currentUrl, { baseUrl: input.baseUrl });
  const nextSignature = stableEntrySignature(nextUrl, { baseUrl: input.baseUrl });
  const sameStableEntry = Boolean(currentSignature && nextSignature && currentSignature === nextSignature);
  return Object.freeze({
    version: PLUGIN_IFRAME_LIFECYCLE_MODEL_VERSION,
    pluginId: safePluginId(input.pluginId || input.record?.pluginId || input.manifest?.id),
    currentSignature,
    nextSignature,
    sameStableEntry,
    loaded,
    shellLoading,
    frameLoadedAt,
    loadingStartedAt,
    navigationLastAt,
    healthTimeoutMs,
    ageMs,
    boundedEvidence: Object.freeze([
      `loaded=${loaded}`,
      `shellLoading=${shellLoading}`,
      `sameStableEntry=${sameStableEntry}`,
      `ageMs=${ageMs}`,
      `healthTimeoutMs=${healthTimeoutMs}`,
    ]),
  });
}

function decidePluginIframeLifecycleAction(input = {}) {
  const state = buildPluginIframeLifecycleState(input);
  const reason = cleanString(input.reason || "manifest_refresh", 120);
  let action = "create_iframe";
  let recover = false;
  let replace = false;
  let preserve = false;
  let explanation = "No reusable iframe record is available.";

  if (state.sameStableEntry && state.loaded) {
    action = "preserve_loaded_iframe";
    preserve = true;
    explanation = "Stable entry matches and iframe is already loaded.";
  } else if (reason === "navigation_health_timeout") {
    if (!state.shellLoading || state.loaded) {
      action = "preserve_visible_iframe";
      preserve = true;
      explanation = "Navigation health timeout must not refresh a visible or loaded iframe.";
    } else if (state.ageMs >= state.healthTimeoutMs) {
      action = "recover_loading_iframe";
      recover = true;
      explanation = "Iframe is still loading past the health timeout.";
    } else {
      action = "wait_for_loading_iframe";
      explanation = "Iframe is still loading but has not exceeded the health timeout.";
    }
  } else if (state.sameStableEntry) {
    action = "reuse_resident_iframe";
    preserve = true;
    explanation = "Stable entry matches after stripping volatile launch/session params.";
  } else if (state.currentSignature && state.nextSignature) {
    action = "replace_iframe_for_entry_change";
    replace = true;
    explanation = "Stable plugin entry changed.";
  }

  return Object.freeze({
    action,
    reason,
    preserve,
    recover,
    replace,
    explanation,
    state,
    boundedEvidence: Object.freeze([
      `action=${action}`,
      `reason=${reason}`,
      ...state.boundedEvidence,
    ]),
  });
}

export {
  PLUGIN_HOST_MODEL_VERSION,
  PLUGIN_IFRAME_LIFECYCLE_MODEL_VERSION,
  buildPluginDefinition,
  buildPluginHostViewModel,
  buildPluginIframeLifecycleState,
  cleanString,
  decidePluginIframeLifecycleAction,
  pluginAvailable,
  pluginEntryParamIsVolatile,
  pluginEntryParamKey,
  pluginEntryUrlsStableEquivalent,
  pluginManifestLaunchContextPlan,
  pluginManifestMaxAgeMs,
  pluginProxyEntryWorkspaceMatches,
  pluginRenderedEntryMatches,
  pluginRefreshesOnVersionChange,
  pluginResidentShellContextPlan,
  pluginResidentShellRequiresFreshManifestPlan,
  pluginUsesLaunchToken,
  redactSensitiveUrlParams,
  sameOriginHttpBlocked,
  safePluginId,
  stableEntrySignature,
};
