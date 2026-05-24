"use strict";

const DEFAULT_CURRENCY = "CNY";
const DEFAULT_STORE = Object.freeze({
  schemaVersion: 1,
  settlement: Object.freeze({
    currency: DEFAULT_CURRENCY,
    rulesStatus: "unset",
    coinsPerCny: null,
    updatedAt: "",
  }),
  ledger: Object.freeze([]),
  rewards: Object.freeze([]),
  redemptions: Object.freeze([]),
});

const LEARNING_COIN_LEVELS = Object.freeze([
  Object.freeze({ id: "lv1", level: 1, title: "新手探险家", minCoins: 0 }),
  Object.freeze({ id: "lv2", level: 2, title: "稳定闯关者", minCoins: 200 }),
  Object.freeze({ id: "lv3", level: 3, title: "错题修复师", minCoins: 500 }),
  Object.freeze({ id: "lv4", level: 4, title: "逻辑训练师", minCoins: 1000 }),
  Object.freeze({ id: "lv5", level: 5, title: "项目建造者", minCoins: 2000 }),
  Object.freeze({ id: "lv6", level: 6, title: "自主学习者", minCoins: 4000 }),
]);

function compactText(value, maxChars = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 3))}...` : text;
}

function normalizeId(value, fallback = "") {
  const text = String(value ?? "").trim();
  return (text || fallback).replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function normalizePositiveInteger(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error(`${fieldName} must be a positive integer`);
    err.status = 400;
    throw err;
  }
  return Math.round(amount);
}

function normalizeInteger(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) {
    const err = new Error(`${fieldName} must be a non-zero integer`);
    err.status = 400;
    throw err;
  }
  return Math.round(amount);
}

function normalizeOptionalCents(value) {
  if (value === undefined || value === null || value === "") return null;
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents < 0) {
    const err = new Error("rmbCents must be a non-negative integer");
    err.status = 400;
    throw err;
  }
  return Math.round(cents);
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    const safeKey = normalizeId(key, "");
    if (!safeKey) continue;
    if (item === null || item === undefined) continue;
    if (typeof item === "number" || typeof item === "boolean") {
      result[safeKey] = item;
    } else {
      result[safeKey] = compactText(item, 120);
    }
  }
  return result;
}

function normalizeLedgerEntry(entry = {}) {
  const workspaceId = normalizeId(entry.workspaceId, "owner");
  return {
    id: normalizeId(entry.id, ""),
    studentId: normalizeId(entry.studentId, workspaceId),
    workspaceId,
    type: normalizeId(entry.type, "adjustment"),
    coinDelta: Math.round(Number(entry.coinDelta) || 0),
    reason: compactText(entry.reason || "", 140),
    sourceType: normalizeId(entry.sourceType, ""),
    sourceId: normalizeId(entry.sourceId, ""),
    redemptionId: normalizeId(entry.redemptionId, ""),
    idempotencyKey: compactText(entry.idempotencyKey || "", 180),
    createdAt: compactText(entry.createdAt || "", 60),
    createdByPrincipalId: compactText(entry.createdByPrincipalId || "", 120),
    metadata: normalizeMetadata(entry.metadata),
  };
}

function normalizeReward(reward = {}) {
  const coinCost = Math.max(0, Math.round(Number(reward.coinCost) || 0));
  return {
    id: normalizeId(reward.id, ""),
    title: compactText(reward.title || "未命名奖励", 80),
    description: compactText(reward.description || "", 240),
    coinCost,
    rmbCents: normalizeOptionalCents(reward.rmbCents),
    active: reward.active !== false,
    createdAt: compactText(reward.createdAt || "", 60),
    updatedAt: compactText(reward.updatedAt || "", 60),
    createdByPrincipalId: compactText(reward.createdByPrincipalId || "", 120),
  };
}

function normalizeRedemption(redemption = {}) {
  const workspaceId = normalizeId(redemption.workspaceId, "owner");
  return {
    id: normalizeId(redemption.id, ""),
    studentId: normalizeId(redemption.studentId, workspaceId),
    workspaceId,
    rewardId: normalizeId(redemption.rewardId, ""),
    rewardTitle: compactText(redemption.rewardTitle || "", 80),
    coinCost: Math.max(0, Math.round(Number(redemption.coinCost) || 0)),
    rmbCents: normalizeOptionalCents(redemption.rmbCents),
    currency: compactText(redemption.currency || DEFAULT_CURRENCY, 12),
    status: normalizeId(redemption.status, "requested"),
    idempotencyKey: compactText(redemption.idempotencyKey || "", 180),
    requestedAt: compactText(redemption.requestedAt || "", 60),
    requestedByPrincipalId: compactText(redemption.requestedByPrincipalId || "", 120),
    approvedAt: compactText(redemption.approvedAt || "", 60),
    approvedByPrincipalId: compactText(redemption.approvedByPrincipalId || "", 120),
    settledAt: compactText(redemption.settledAt || "", 60),
    settledByPrincipalId: compactText(redemption.settledByPrincipalId || "", 120),
    cancelledAt: compactText(redemption.cancelledAt || "", 60),
    cancelledByPrincipalId: compactText(redemption.cancelledByPrincipalId || "", 120),
    rejectedAt: compactText(redemption.rejectedAt || "", 60),
    rejectedByPrincipalId: compactText(redemption.rejectedByPrincipalId || "", 120),
    note: compactText(redemption.note || "", 160),
  };
}

function normalizeStore(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const settlement = Object.assign({}, DEFAULT_STORE.settlement, source.settlement || {});
  return {
    schemaVersion: 1,
    settlement: {
      currency: compactText(settlement.currency || DEFAULT_CURRENCY, 12),
      rulesStatus: compactText(settlement.rulesStatus || "unset", 40),
      coinsPerCny: settlement.coinsPerCny === null || settlement.coinsPerCny === undefined
        ? null
        : Number(settlement.coinsPerCny),
      updatedAt: compactText(settlement.updatedAt || "", 60),
    },
    ledger: Array.isArray(source.ledger) ? source.ledger.map(normalizeLedgerEntry).filter((entry) => entry.id && entry.coinDelta) : [],
    rewards: Array.isArray(source.rewards) ? source.rewards.map(normalizeReward).filter((reward) => reward.id) : [],
    redemptions: Array.isArray(source.redemptions) ? source.redemptions.map(normalizeRedemption).filter((item) => item.id) : [],
  };
}

function isActiveRedemption(redemption) {
  return ["requested", "approved"].includes(String(redemption?.status || ""));
}

function redemptionMatchesScope(redemption, scope = {}) {
  if (!redemption) return false;
  const workspaceId = normalizeId(scope.workspaceId, "");
  const studentId = normalizeId(scope.studentId, "");
  if (workspaceId && redemption.workspaceId !== workspaceId) return false;
  if (studentId && redemption.studentId !== studentId) return false;
  return true;
}

function publicLedgerEntry(entry) {
  return {
    id: entry.id,
    studentId: entry.studentId,
    workspaceId: entry.workspaceId,
    type: entry.type,
    coinDelta: entry.coinDelta,
    reason: entry.reason,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    redemptionId: entry.redemptionId,
    createdAt: entry.createdAt,
  };
}

function publicReward(reward) {
  return {
    id: reward.id,
    title: reward.title,
    description: reward.description,
    coinCost: reward.coinCost,
    rmbCents: reward.rmbCents,
    active: reward.active,
    updatedAt: reward.updatedAt || reward.createdAt,
  };
}

function publicRedemption(redemption) {
  return {
    id: redemption.id,
    studentId: redemption.studentId,
    workspaceId: redemption.workspaceId,
    rewardId: redemption.rewardId,
    rewardTitle: redemption.rewardTitle,
    coinCost: redemption.coinCost,
    rmbCents: redemption.rmbCents,
    currency: redemption.currency,
    status: redemption.status,
    requestedAt: redemption.requestedAt,
    approvedAt: redemption.approvedAt,
    settledAt: redemption.settledAt,
    cancelledAt: redemption.cancelledAt,
    rejectedAt: redemption.rejectedAt,
    note: redemption.note,
  };
}

function balancesFor(store, studentId, workspaceId) {
  const entries = store.ledger.filter((entry) => entry.studentId === studentId && entry.workspaceId === workspaceId);
  const availableCoins = entries.reduce((sum, entry) => sum + entry.coinDelta, 0);
  const heldCoins = store.redemptions
    .filter((item) => item.studentId === studentId && item.workspaceId === workspaceId && isActiveRedemption(item))
    .reduce((sum, item) => sum + item.coinCost, 0);
  const earnedCoins = entries
    .filter((entry) => entry.coinDelta > 0 && ["grant", "adjustment", "release"].includes(entry.type))
    .reduce((sum, entry) => sum + entry.coinDelta, 0);
  const spentCoins = store.redemptions
    .filter((item) => item.studentId === studentId && item.workspaceId === workspaceId && item.status === "settled")
    .reduce((sum, item) => sum + item.coinCost, 0);
  return {
    availableCoins,
    heldCoins,
    totalCoins: availableCoins + heldCoins,
    earnedCoins,
    spentCoins,
  };
}

function safeDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

function utcDayKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dayOffsetKey(baseDate, offsetDays) {
  const date = new Date(baseDate.getTime());
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return utcDayKey(date);
}

function recentCoinTotal(dailyMap, now, days) {
  const totalDays = Math.max(1, Math.round(Number(days) || 1));
  let total = 0;
  for (let offset = -(totalDays - 1); offset <= 0; offset += 1) {
    total += dailyMap.get(dayOffsetKey(now, offset)) || 0;
  }
  return total;
}

function earningLedgerEntries(store, studentId, workspaceId) {
  return store.ledger.filter((entry) => (
    entry.studentId === studentId
    && entry.workspaceId === workspaceId
    && entry.coinDelta > 0
    && entry.sourceType !== "redemption"
    && ["grant", "adjustment"].includes(entry.type)
  ));
}

function levelForCoins(totalCoins) {
  const total = Math.max(0, Math.round(Number(totalCoins) || 0));
  let current = LEARNING_COIN_LEVELS[0];
  let next = null;
  for (let index = 0; index < LEARNING_COIN_LEVELS.length; index += 1) {
    const level = LEARNING_COIN_LEVELS[index];
    if (total >= level.minCoins) {
      current = level;
      next = LEARNING_COIN_LEVELS[index + 1] || null;
    }
  }
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((total - current.minCoins) / (next.minCoins - current.minCoins)) * 100)))
    : 100;
  return {
    current: Object.assign({}, current),
    next: next ? Object.assign({}, next) : null,
    progressPct,
    toNextLevelCoins: next ? Math.max(0, next.minCoins - total) : 0,
  };
}

function learningCoinGrowthProfile(store, studentId, workspaceId, options = {}) {
  const now = safeDate(options.nowIso) || new Date();
  const earningEntries = earningLedgerEntries(store, studentId, workspaceId);
  const totalEarnedCoins = earningEntries.reduce((sum, entry) => sum + entry.coinDelta, 0);
  const dailyMap = new Map();
  const sourceMap = new Map();
  for (const entry of earningEntries) {
    const date = safeDate(entry.createdAt);
    const day = utcDayKey(date);
    if (day) dailyMap.set(day, (dailyMap.get(day) || 0) + entry.coinDelta);
    const source = entry.sourceType || entry.type || "learning";
    sourceMap.set(source, (sourceMap.get(source) || 0) + entry.coinDelta);
  }
  const recentDays = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = dayOffsetKey(now, offset);
    recentDays.push({ date, coins: dailyMap.get(date) || 0 });
  }
  let streakDays = 0;
  for (let offset = 0; offset > -366; offset -= 1) {
    if ((dailyMap.get(dayOffsetKey(now, offset)) || 0) <= 0) break;
    streakDays += 1;
  }
  const balances = balancesFor(store, studentId, workspaceId);
  const rewardProgress = store.rewards
    .filter((reward) => reward.active && reward.coinCost > 0)
    .map((reward) => {
      const remainingCoins = Math.max(0, reward.coinCost - balances.availableCoins);
      return {
        id: reward.id,
        title: reward.title,
        coinCost: reward.coinCost,
        rmbCents: reward.rmbCents,
        affordable: remainingCoins === 0,
        remainingCoins,
        progressPct: Math.max(0, Math.min(100, Math.round((balances.availableCoins / reward.coinCost) * 100))),
      };
    })
    .sort((a, b) => a.remainingCoins - b.remainingCoins || a.coinCost - b.coinCost || a.title.localeCompare(b.title))
    .slice(0, 4);
  return {
    totalEarnedCoins,
    level: levelForCoins(totalEarnedCoins),
    recentDays,
    sevenDayCoins: recentDays.reduce((sum, day) => sum + day.coins, 0),
    thirtyDayCoins: recentCoinTotal(dailyMap, now, 30),
    activeDaysInLast7: recentDays.filter((day) => day.coins > 0).length,
    streakDays,
    sourceBreakdown: Array.from(sourceMap.entries())
      .map(([sourceType, coins]) => ({ sourceType, coins }))
      .sort((a, b) => b.coins - a.coins || a.sourceType.localeCompare(b.sourceType))
      .slice(0, 8),
    rewardProgress,
    bestRewardProgress: rewardProgress[0] || null,
  };
}

function createLearningCoinService(options = {}) {
  const fs = options.fs || require("node:fs");
  const path = options.path || require("node:path");
  const storagePath = options.storagePath;
  const ensureDataDir = typeof options.ensureDataDir === "function" ? options.ensureDataDir : () => {};
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const makeId = typeof options.makeId === "function" ? options.makeId : ((prefix = "id") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const audit = typeof options.audit === "function" ? options.audit : () => {};

  if (!storagePath) throw new Error("learning coin service requires storagePath");

  function readStore() {
    if (!fs.existsSync(storagePath)) return normalizeStore(DEFAULT_STORE);
    try {
      return normalizeStore(JSON.parse(fs.readFileSync(storagePath, "utf8")));
    } catch (err) {
      err.message = `Failed to read learning coin store: ${err.message || String(err)}`;
      throw err;
    }
  }

  function writeStore(store) {
    ensureDataDir();
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const tempPath = `${storagePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, storagePath);
  }

  function recordAudit(eventType, payload) {
    try {
      audit(eventType, normalizeMetadata(payload));
    } catch (_) {}
  }

  function appendLedger(store, input = {}) {
    const idempotencyKey = compactText(input.idempotencyKey || "", 180);
    if (idempotencyKey) {
      const existing = store.ledger.find((entry) => entry.idempotencyKey === idempotencyKey);
      if (existing) return { entry: existing, duplicate: true };
    }
    const entry = normalizeLedgerEntry(Object.assign({}, input, {
      id: normalizeId(input.id, makeId("coin")),
      createdAt: input.createdAt || nowIso(),
    }));
    if (!entry.coinDelta) {
      const err = new Error("coinDelta must not be zero");
      err.status = 400;
      throw err;
    }
    store.ledger.push(entry);
    return { entry, duplicate: false };
  }

  function summary(input = {}) {
    const store = readStore();
    const workspaceId = normalizeId(input.workspaceId, "owner");
    const studentId = normalizeId(input.studentId, workspaceId);
    const limit = Math.max(1, Math.min(100, Number(input.limit || 25) || 25));
    return {
      studentId,
      workspaceId,
      settlement: store.settlement,
      balances: balancesFor(store, studentId, workspaceId),
      growth: learningCoinGrowthProfile(store, studentId, workspaceId, { nowIso: nowIso() }),
      rewards: store.rewards.filter((reward) => reward.active).map(publicReward),
      redemptions: store.redemptions
        .filter((item) => item.studentId === studentId && item.workspaceId === workspaceId)
        .slice(-limit)
        .reverse()
        .map(publicRedemption),
      ledger: store.ledger
        .filter((entry) => entry.studentId === studentId && entry.workspaceId === workspaceId)
        .slice(-limit)
        .reverse()
        .map(publicLedgerEntry),
    };
  }

  function listLedger(input = {}) {
    const store = readStore();
    const workspaceId = normalizeId(input.workspaceId, "owner");
    const studentId = normalizeId(input.studentId, workspaceId);
    const limit = Math.max(1, Math.min(500, Number(input.limit || 100) || 100));
    return store.ledger
      .filter((entry) => entry.studentId === studentId && entry.workspaceId === workspaceId)
      .slice(-limit)
      .reverse()
      .map(publicLedgerEntry);
  }

  function listRewards(input = {}) {
    const store = readStore();
    return store.rewards
      .filter((reward) => input.includeInactive || reward.active)
      .map(publicReward);
  }

  function getRedemption(redemptionId, scope = {}) {
    const id = normalizeId(redemptionId, "");
    const store = readStore();
    const redemption = store.redemptions.find((item) => item.id === id);
    return redemptionMatchesScope(redemption, scope) ? publicRedemption(redemption) : null;
  }

  function grantCoins(input = {}) {
    const store = readStore();
    const coinDelta = normalizePositiveInteger(input.coinAmount ?? input.coinDelta, "coinAmount");
    const workspaceId = normalizeId(input.workspaceId, "owner");
    const studentId = normalizeId(input.studentId, workspaceId);
    const { entry, duplicate } = appendLedger(store, {
      studentId,
      workspaceId,
      type: "grant",
      coinDelta,
      reason: input.reason || "learning outcome",
      sourceType: input.sourceType || "manual",
      sourceId: input.sourceId || "",
      idempotencyKey: input.idempotencyKey || "",
      createdAt: input.createdAt || "",
      createdByPrincipalId: input.createdByPrincipalId || "",
      metadata: input.metadata,
    });
    if (!duplicate) {
      writeStore(store);
      recordAudit("learning_coin.grant", { studentId, workspaceId, coinDelta, sourceType: entry.sourceType, sourceId: entry.sourceId });
    }
    return { entry: publicLedgerEntry(entry), duplicate, balances: balancesFor(store, studentId, workspaceId) };
  }

  function adjustCoins(input = {}) {
    const store = readStore();
    const coinDelta = normalizeInteger(input.coinDelta, "coinDelta");
    const workspaceId = normalizeId(input.workspaceId, "owner");
    const studentId = normalizeId(input.studentId, workspaceId);
    if (coinDelta < 0 && balancesFor(store, studentId, workspaceId).availableCoins + coinDelta < 0) {
      const err = new Error("Insufficient coins");
      err.status = 400;
      throw err;
    }
    const { entry, duplicate } = appendLedger(store, {
      studentId,
      workspaceId,
      type: "adjustment",
      coinDelta,
      reason: input.reason || "owner adjustment",
      sourceType: input.sourceType || "manual",
      sourceId: input.sourceId || "",
      idempotencyKey: input.idempotencyKey || "",
      createdAt: input.createdAt || "",
      createdByPrincipalId: input.createdByPrincipalId || "",
      metadata: input.metadata,
    });
    if (!duplicate) {
      writeStore(store);
      recordAudit("learning_coin.adjust", { studentId, workspaceId, coinDelta });
    }
    return { entry: publicLedgerEntry(entry), duplicate, balances: balancesFor(store, studentId, workspaceId) };
  }

  function upsertReward(input = {}) {
    const store = readStore();
    const now = nowIso();
    const id = normalizeId(input.id, makeId("reward"));
    const existingIndex = store.rewards.findIndex((reward) => reward.id === id);
    const existing = existingIndex >= 0 ? store.rewards[existingIndex] : {};
    const reward = normalizeReward(Object.assign({}, existing, input, {
      id,
      coinCost: normalizePositiveInteger(input.coinCost ?? existing.coinCost, "coinCost"),
      rmbCents: normalizeOptionalCents(Object.hasOwn(input, "rmbCents") ? input.rmbCents : existing.rmbCents),
      createdAt: existing.createdAt || now,
      updatedAt: now,
    }));
    if (existingIndex >= 0) store.rewards[existingIndex] = reward;
    else store.rewards.push(reward);
    writeStore(store);
    recordAudit("learning_coin.reward_upsert", { rewardId: reward.id, coinCost: reward.coinCost, active: reward.active });
    return publicReward(reward);
  }

  function requestRedemption(input = {}) {
    const store = readStore();
    const rewardId = normalizeId(input.rewardId, "");
    const reward = store.rewards.find((item) => item.id === rewardId && item.active);
    if (!reward) {
      const err = new Error("Reward is not available");
      err.status = 404;
      throw err;
    }
    const workspaceId = normalizeId(input.workspaceId, "owner");
    const studentId = normalizeId(input.studentId, workspaceId);
    const idempotencyKey = compactText(input.idempotencyKey || "", 180);
    if (idempotencyKey) {
      const existing = store.redemptions.find((item) => (
        item.idempotencyKey === idempotencyKey
        && item.studentId === studentId
        && item.workspaceId === workspaceId
        && item.rewardId === rewardId
      ));
      if (existing) return { redemption: publicRedemption(existing), duplicate: true, balances: balancesFor(store, existing.studentId, existing.workspaceId) };
    }
    const balances = balancesFor(store, studentId, workspaceId);
    if (balances.availableCoins < reward.coinCost) {
      const err = new Error("Insufficient coins");
      err.status = 400;
      throw err;
    }
    const now = nowIso();
    const redemption = normalizeRedemption({
      id: normalizeId(input.id, makeId("redeem")),
      studentId,
      workspaceId,
      rewardId: reward.id,
      rewardTitle: reward.title,
      coinCost: reward.coinCost,
      rmbCents: reward.rmbCents,
      currency: DEFAULT_CURRENCY,
      status: "requested",
      idempotencyKey,
      requestedAt: now,
      requestedByPrincipalId: input.requestedByPrincipalId || "",
      note: input.note || "",
    });
    store.redemptions.push(redemption);
    appendLedger(store, {
      studentId,
      workspaceId,
      type: "hold",
      coinDelta: -redemption.coinCost,
      reason: `兑换申请：${redemption.rewardTitle}`,
      sourceType: "redemption",
      sourceId: redemption.rewardId,
      redemptionId: redemption.id,
      idempotencyKey: `redemption:${redemption.id}:hold`,
      createdByPrincipalId: input.requestedByPrincipalId || "",
    });
    writeStore(store);
    recordAudit("learning_coin.redemption_request", { studentId, workspaceId, redemptionId: redemption.id, rewardId: reward.id, coinCost: reward.coinCost });
    return { redemption: publicRedemption(redemption), duplicate: false, balances: balancesFor(store, studentId, workspaceId) };
  }

  function transitionRedemption(redemptionId, action, input = {}) {
    const store = readStore();
    const id = normalizeId(redemptionId, "");
    const redemption = store.redemptions.find((item) => item.id === id);
    if (!redemption) {
      const err = new Error("Redemption was not found");
      err.status = 404;
      throw err;
    }
    if (!redemptionMatchesScope(redemption, input)) {
      const err = new Error("Redemption was not found");
      err.status = 404;
      throw err;
    }
    const now = nowIso();
    const actor = input.actorPrincipalId || "";
    const current = redemption.status;
    if (action === "approve") {
      if (current !== "requested") return { redemption: publicRedemption(redemption), duplicate: true, balances: balancesFor(store, redemption.studentId, redemption.workspaceId) };
      redemption.status = "approved";
      redemption.approvedAt = now;
      redemption.approvedByPrincipalId = actor;
    } else if (action === "settle") {
      if (!["requested", "approved"].includes(current)) return { redemption: publicRedemption(redemption), duplicate: true, balances: balancesFor(store, redemption.studentId, redemption.workspaceId) };
      if (current === "requested") {
        redemption.approvedAt = now;
        redemption.approvedByPrincipalId = actor;
      }
      redemption.status = "settled";
      redemption.settledAt = now;
      redemption.settledByPrincipalId = actor;
    } else if (action === "reject" || action === "cancel") {
      if (!["requested", "approved"].includes(current)) return { redemption: publicRedemption(redemption), duplicate: true, balances: balancesFor(store, redemption.studentId, redemption.workspaceId) };
      redemption.status = action === "reject" ? "rejected" : "cancelled";
      redemption.note = input.note || redemption.note;
      redemption[action === "reject" ? "rejectedAt" : "cancelledAt"] = now;
      redemption[action === "reject" ? "rejectedByPrincipalId" : "cancelledByPrincipalId"] = actor;
      appendLedger(store, {
        studentId: redemption.studentId,
        workspaceId: redemption.workspaceId,
        type: "release",
        coinDelta: redemption.coinCost,
        reason: action === "reject" ? "兑换申请未批准" : "兑换申请已取消",
        sourceType: "redemption",
        sourceId: redemption.rewardId,
        redemptionId: redemption.id,
        idempotencyKey: `redemption:${redemption.id}:release`,
        createdByPrincipalId: actor,
      });
    } else {
      const err = new Error("Unsupported redemption action");
      err.status = 400;
      throw err;
    }
    writeStore(store);
    recordAudit(`learning_coin.redemption_${action}`, { redemptionId: redemption.id, studentId: redemption.studentId, workspaceId: redemption.workspaceId, coinCost: redemption.coinCost });
    return { redemption: publicRedemption(redemption), duplicate: false, balances: balancesFor(store, redemption.studentId, redemption.workspaceId) };
  }

  return {
    adjustCoins,
    getRedemption,
    grantCoins,
    listLedger,
    listRewards,
    publicLedgerEntry,
    publicRedemption,
    publicReward,
    readStore,
    requestRedemption,
    summary,
    transitionRedemption,
    upsertReward,
  };
}

module.exports = {
  LEARNING_COIN_LEVELS,
  balancesFor,
  createLearningCoinService,
  learningCoinGrowthProfile,
  normalizeStore,
  publicLedgerEntry,
  publicRedemption,
  publicReward,
};
