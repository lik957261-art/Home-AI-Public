"use strict";

const TONGBAO_CURRENCY = "TONGBAO";

function normalizeWorkspaceId(value, fallback = "owner") {
  const text = String(value || "").trim();
  return text || fallback;
}

function createZeroWallet(workspaceId) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return {
    walletId: `wallet:${normalizedWorkspaceId}`,
    workspaceId: normalizedWorkspaceId,
    currency: TONGBAO_CURRENCY,
    status: "active",
    availableBalance: 0,
    heldBalance: 0,
    totalBalance: 0,
    createdAt: "",
    updatedAt: "",
  };
}

function publicWallet(wallet = {}) {
  const availableBalance = Number(wallet.availableBalance || 0);
  const heldBalance = Number(wallet.heldBalance || 0);
  return {
    walletId: String(wallet.walletId || ""),
    workspaceId: normalizeWorkspaceId(wallet.workspaceId),
    currency: String(wallet.currency || TONGBAO_CURRENCY),
    status: String(wallet.status || "active"),
    availableBalance,
    heldBalance,
    totalBalance: availableBalance + heldBalance,
    createdAt: String(wallet.createdAt || ""),
    updatedAt: String(wallet.updatedAt || ""),
  };
}

function createPlatformCurrencyService(options = {}) {
  const storeFactory = typeof options.store === "function"
    ? options.store
    : (() => options.store || null);
  const nowIso = typeof options.nowIso === "function"
    ? options.nowIso
    : (() => new Date().toISOString());

  function requireStore() {
    const store = storeFactory();
    if (!store || typeof store.ensurePlatformCurrencyWallet !== "function") {
      const err = new Error("Platform currency store is not available");
      err.status = 503;
      throw err;
    }
    return store;
  }

  function ensureWallet(input = {}) {
    const workspaceId = normalizeWorkspaceId(input.workspaceId);
    const store = requireStore();
    const wallet = store.ensurePlatformCurrencyWallet(workspaceId, {
      currency: TONGBAO_CURRENCY,
      nowIso: input.nowIso || nowIso(),
    }) || createZeroWallet(workspaceId);
    return publicWallet(wallet);
  }

  function walletSummary(input = {}) {
    return ensureWallet(input);
  }

  function listLedger(input = {}) {
    const workspaceId = normalizeWorkspaceId(input.workspaceId);
    const store = requireStore();
    if (typeof store.listPlatformCurrencyLedger !== "function") return [];
    return store.listPlatformCurrencyLedger(workspaceId, { limit: input.limit });
  }

  return Object.freeze({
    currency: TONGBAO_CURRENCY,
    ensureWallet,
    listLedger,
    walletSummary,
  });
}

module.exports = {
  TONGBAO_CURRENCY,
  createPlatformCurrencyService,
};
