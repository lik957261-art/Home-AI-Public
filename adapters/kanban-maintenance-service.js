"use strict";

function cleanWorkspaceId(value) {
  return String(value || "owner").trim() || "owner";
}

function createKanbanMaintenanceService(deps = {}) {
  const dependencyLastRun = new Map();
  const cardListCache = new Map();
  const dependencyIntervalMs = Number(deps.dependencyReconcileIntervalMs || 0);
  const cacheTtlMs = Number(deps.cardListCacheTtlMs || 0);
  const nowMs = typeof deps.nowMs === "function" ? deps.nowMs : () => Date.now();
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const fileExists = typeof deps.fileExists === "function" ? deps.fileExists : () => false;
  let cardListCacheStoreLoaded = false;

  function cacheKey(args = {}) {
    return [
      String(args.workspaceId || "owner"),
      String(args.scope || "mine"),
      args.includeCompleted ? "all" : "open",
      String(args.assignee || ""),
      String(args.limit || 120),
      String(args.search || ""),
      String(args.cacheVariant || ""),
    ].join("\0");
  }

  function loadCardListCacheStore() {
    if (cardListCacheStoreLoaded) return;
    const store = typeof deps.readJsonStore === "function"
      ? deps.readJsonStore(deps.cardListCachePath, { entries: {} })
      : { entries: {} };
    const entries = store?.entries && typeof store.entries === "object" ? store.entries : {};
    for (const [entryKey, entry] of Object.entries(entries)) {
      if (entry && typeof entry === "object") cardListCache.set(entryKey, entry);
    }
    cardListCacheStoreLoaded = true;
  }

  function readCardListCache(args = {}) {
    if (!cacheTtlMs) return null;
    const key = cacheKey(args);
    loadCardListCacheStore();
    const cached = cardListCache.get(key);
    if (!cached) return null;
    const ageMs = nowMs() - Number(cached.savedAt || 0);
    if (ageMs > cacheTtlMs) {
      cardListCache.delete(key);
      return null;
    }
    return Object.assign({}, cached.payload, {
      cache: { hit: true, ageMs },
    });
  }

  function persistCardListCache({ onlyIfExists = false } = {}) {
    if (onlyIfExists && !fileExists(deps.cardListCachePath)) return;
    const entries = {};
    const now = nowMs();
    for (const [key, value] of cardListCache.entries()) {
      if (now - Number(value?.savedAt || 0) <= cacheTtlMs) entries[key] = value;
    }
    if (typeof deps.writeJsonStore === "function") {
      deps.writeJsonStore(deps.cardListCachePath, { schemaVersion: 1, updatedAt: nowIso(), entries });
    }
  }

  function writeCardListCache(args = {}, payload = {}) {
    if (!cacheTtlMs) return;
    cardListCache.set(cacheKey(args), {
      savedAt: nowMs(),
      payload,
    });
    persistCardListCache();
  }

  function clearCardListCache(workspaceId = "") {
    const prefix = workspaceId ? `${String(workspaceId)}\0` : "";
    for (const key of cardListCache.keys()) {
      if (!prefix || key.startsWith(prefix) || key.includes("\0shared:") || key.includes("\0owner-growth")) {
        cardListCache.delete(key);
      }
    }
    persistCardListCache({ onlyIfExists: true });
  }

  async function maybeReconcileDependencyBlocks(workspaceId, options = {}) {
    if (!deps.useKanbanTodoBackend?.()) return { ok: true, skipped: true, reason: "kanban_backend_disabled" };
    const id = cleanWorkspaceId(workspaceId);
    const now = nowMs();
    const last = dependencyLastRun.get(id) || 0;
    if (!options.force && now - last < dependencyIntervalMs) {
      return { ok: true, skipped: true, reason: "recent", workspaceId: id };
    }
    dependencyLastRun.set(id, now);
    const result = await deps.kanbanCardProvider?.reconcileDependencyBlocks?.({
      workspaceId: id,
      limit: options.limit || 500,
    });
    const released = Array.isArray(result?.released) ? result.released : [];
    for (const item of released) {
      const cardId = String(item?.id || "");
      deps.broadcast?.({ type: "kanban.updated", workspaceId: id, cardId, action: "dependency-unblocked" });
      deps.broadcast?.({ type: "todos.updated", workspaceId: id, todoId: cardId, action: "dependency-unblocked" });
    }
    if (released.length) clearCardListCache(id);
    if (released.length) {
      deps.logger?.info?.(`Hermes Kanban dependency reconcile released ${released.length} card(s) for workspace ${id}.`);
    }
    return Object.assign({ workspaceId: id }, result || {});
  }

  function scheduleDependencyReconcile(workspaceId) {
    maybeReconcileDependencyBlocks(workspaceId)
      .catch((err) => deps.logger?.warn?.(`Hermes Kanban dependency reconcile failed for workspace ${workspaceId}: ${err.message || err}`));
    return { ok: true, skipped: true, reason: "background" };
  }

  return {
    cacheKey,
    readCardListCache,
    writeCardListCache,
    clearCardListCache,
    maybeReconcileDependencyBlocks,
    scheduleDependencyReconcile,
  };
}

module.exports = {
  createKanbanMaintenanceService,
};
