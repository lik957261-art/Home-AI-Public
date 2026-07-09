"use strict";

export const RUNTIME_FACADE_COMPAT_MODEL_VERSION = "20260705-runtime-facade-compat-model-v1";

export function safeRuntimeStringPlan(value = "") {
  return String(value == null ? "" : value);
}

export function normalizeNativeShellParamPlan(value = "") {
  const normalized = safeRuntimeStringPlan(value).trim().toLowerCase();
  return normalized === "ios" || normalized === "android" ? normalized : "";
}

export function nativeShareFileCountPlan(payload = null) {
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload?.files)) return payload.files.length;
  return 0;
}

export function searchParamEntriesPlan(search = "") {
  const entries = [];
  const text = safeRuntimeStringPlan(search || "").replace(/^\?/, "");
  for (const part of text.split("&")) {
    if (!part) continue;
    const splitAt = part.indexOf("=");
    const rawKey = splitAt >= 0 ? part.slice(0, splitAt) : part;
    const rawValue = splitAt >= 0 ? part.slice(splitAt + 1) : "";
    try {
      entries.push([
        decodeURIComponent(rawKey.replace(/\+/g, " ")),
        decodeURIComponent(rawValue.replace(/\+/g, " ")),
      ]);
    } catch (_error) {
      entries.push([rawKey, rawValue]);
    }
  }
  return entries;
}

export function runtimeScopedStorageKeyPlan({ scope = "dedupe", key = "", prefix = "homeai" } = {}) {
  const safeScope = safeRuntimeStringPlan(scope || "dedupe").replace(/[^\w.-]/g, "").slice(0, 80) || "dedupe";
  const safeKey = safeRuntimeStringPlan(key || "").replace(/[^\w.-]/g, "").slice(0, 180);
  return `${safeRuntimeStringPlan(prefix || "homeai")}.${safeScope}.${safeKey}`;
}

export function routeSnapshotPlan({ href = "", pathname = "/", search = "", hash = "" } = {}) {
  return Object.freeze({
    href: safeRuntimeStringPlan(href),
    pathname: safeRuntimeStringPlan(pathname || "/"),
    search: safeRuntimeStringPlan(search),
    hash: safeRuntimeStringPlan(hash),
  });
}

export function runtimeSnapshotPlan({ version = "", mode = "classic-shell-compat", hasAccessKey = false, route = null } = {}) {
  return Object.freeze({
    version: safeRuntimeStringPlan(version),
    mode: safeRuntimeStringPlan(mode) || "classic-shell-compat",
    hasAccessKey: Boolean(hasAccessKey),
    route: routeSnapshotPlan(route || {}),
  });
}
