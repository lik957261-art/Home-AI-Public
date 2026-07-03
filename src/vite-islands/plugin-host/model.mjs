const PLUGIN_HOST_MODEL_VERSION = "20260703-vite-plugin-host-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function safePluginId(value) {
  return cleanString(value, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

function booleanValue(...values) {
  return values.some((value) => value === true || value === "true" || value === 1 || value === "1");
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
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
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
  return Object.freeze({
    id,
    title: cleanString(definition.title || id || "Plugin", 80),
    manifestPath: cleanString(definition.manifestPath || `/api/hermes-plugins/${id}/manifest`, 240),
    residentFrame: definition.residentFrame !== false,
    manifestMaxAgeMs: Number(definition.manifestMaxAgeMs) || 0,
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

export {
  PLUGIN_HOST_MODEL_VERSION,
  buildPluginDefinition,
  buildPluginHostViewModel,
  cleanString,
  pluginAvailable,
  pluginManifestMaxAgeMs,
  pluginRefreshesOnVersionChange,
  pluginUsesLaunchToken,
  redactSensitiveUrlParams,
  sameOriginHttpBlocked,
  safePluginId,
};
