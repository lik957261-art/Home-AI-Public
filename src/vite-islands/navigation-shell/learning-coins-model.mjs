"use strict";

export const LEARNING_COINS_MODEL_VERSION = "20260706-learning-coins-model-v1";

function numberValue(value, fallback = 0) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : fallback;
}

function cleanToken(value) {
  return String(value || "").trim();
}

export function formatCoinsPlan(value = 0) {
  return `${numberValue(value)} 金币`;
}

export function formatRmbCentsPlan(cents = null) {
  if (cents === null || cents === undefined || cents === "") return "人民币规则待设置";
  const value = Number(cents);
  if (!Number.isFinite(value)) return "人民币规则待设置";
  return `￥${(value / 100).toFixed(2)}`;
}

export function ownerFlagPlan(options = {}) {
  return Boolean(options?.state?.auth?.isOwner || options?.owner);
}

export function rewardCardsViewPlan(summary = {}, options = {}) {
  const owner = ownerFlagPlan(options);
  const rewards = Array.isArray(summary?.rewards) ? summary.rewards : [];
  if (!rewards.length) {
    return { empty: true, emptyText: owner ? "奖励池还没有配置。" : "暂无可申请的奖励。", cards: [] };
  }
  const available = numberValue(summary?.balances?.availableCoins);
  return {
    empty: false,
    emptyText: "",
    cards: rewards.map((reward = {}) => {
      const coinCost = numberValue(reward.coinCost);
      const affordable = available >= coinCost;
      return {
        id: cleanToken(reward.id),
        title: cleanToken(reward.title) || "奖励",
        description: cleanToken(reward.description),
        coinText: formatCoinsPlan(coinCost),
        rmbText: formatRmbCentsPlan(reward.rmbCents),
        showRmb: owner,
        affordable,
        buttonText: affordable ? "申请兑换" : "金币不足",
      };
    }),
  };
}

export function ledgerRowsViewPlan(summary = {}, options = {}) {
  const owner = ownerFlagPlan(options);
  const ledger = Array.isArray(summary?.ledger) ? summary.ledger : [];
  if (!ledger.length) return { empty: true, emptyText: "暂无金币流水。", rows: [] };
  return {
    empty: false,
    emptyText: "",
    rows: ledger.map((entry = {}) => {
      const coinDelta = numberValue(entry.coinDelta);
      const timeText = cleanToken(entry.createdAtText || entry.createdAt);
      return {
        title: cleanToken(entry.reason || entry.type) || "金币记录",
        meta: owner
          ? [entry.sourceType, entry.sourceId, timeText].map(cleanToken).filter(Boolean).join(" · ")
          : [timeText].filter(Boolean).join(" · "),
        amountText: `${coinDelta >= 0 ? "+" : ""}${formatCoinsPlan(coinDelta)}`,
        positive: coinDelta >= 0,
      };
    }),
  };
}

export function redemptionRowsViewPlan(summary = {}) {
  const redemptions = Array.isArray(summary?.redemptions) ? summary.redemptions : [];
  if (!redemptions.length) return { empty: true, emptyText: "暂无兑换申请。", rows: [] };
  return {
    empty: false,
    emptyText: "",
    rows: redemptions.map((item = {}) => ({
      title: cleanToken(item.rewardTitle || item.rewardId) || "兑换申请",
      meta: [item.status, item.requestedAtText || item.requestedAt].map(cleanToken).filter(Boolean).join(" · "),
      amountText: formatCoinsPlan(item.coinCost),
    })),
  };
}

export function dailyBarsViewPlan(growth = {}) {
  const days = Array.isArray(growth?.recentDays) ? growth.recentDays : [];
  if (!days.length) return { empty: true, emptyText: "暂无最近 7 天记录。", days: [] };
  const maxCoins = Math.max(1, ...days.map((day) => numberValue(day.coins)));
  return {
    empty: false,
    emptyText: "",
    days: days.map((day = {}) => {
      const coins = numberValue(day.coins);
      return {
        dateLabel: cleanToken(day.date).slice(5) || "--",
        coinsText: String(coins),
        heightPct: Math.max(4, Math.round((coins / maxCoins) * 100)),
      };
    }),
  };
}

export function rewardProgressViewPlan(growth = {}, options = {}) {
  const owner = ownerFlagPlan(options);
  const bestReward = growth?.bestRewardProgress || null;
  const allRewards = Array.isArray(growth?.rewardProgress) ? growth.rewardProgress : [];
  const rewards = bestReward
    ? [bestReward].concat(allRewards.filter((reward) => reward?.id !== bestReward.id)).slice(0, 4)
    : allRewards;
  if (!rewards.length) return { empty: true, emptyText: "配置奖励后会显示兑换进度。", rewards: [] };
  return {
    empty: false,
    emptyText: "",
    rewards: rewards.map((reward = {}) => {
      const pct = Math.max(0, Math.min(100, numberValue(reward.progressPct)));
      return {
        title: cleanToken(reward.title || reward.id) || "奖励",
        status: reward.affordable ? "可兑换" : `还差 ${formatCoinsPlan(reward.remainingCoins)}`,
        pct,
        meta: owner
          ? `${formatCoinsPlan(reward.coinCost)} · ${formatRmbCentsPlan(reward.rmbCents)}`
          : formatCoinsPlan(reward.coinCost),
      };
    }),
  };
}

export function growthPanelViewPlan(summary = {}) {
  const growth = summary?.growth || {};
  const balances = summary?.balances || {};
  const level = growth.level || {};
  const current = level.current || {};
  const next = level.next || null;
  const levelTitle = current.title ? `Lv.${current.level} ${current.title}` : "Lv.1 新手探索者";
  const nextText = next ? `距离 Lv.${next.level} ${next.title} 还差 ${formatCoinsPlan(level.toNextLevelCoins)}` : "已达到当前最高等级";
  return {
    levelTitle,
    totalEarnedText: formatCoinsPlan(growth.totalEarnedCoins),
    availableText: formatCoinsPlan(balances.availableCoins),
    streakText: `${numberValue(growth.streakDays)} 天`,
    nextText,
    progress: Math.max(0, Math.min(100, numberValue(level.progressPct))),
  };
}

export function coinsSubsystemViewPlan({ summary = {}, options = {} } = {}) {
  const owner = ownerFlagPlan(options);
  const balances = summary.balances || {};
  const learnerLabel = owner
    ? cleanToken(summary.studentId || options.learnerId)
    : cleanToken(options.learnerName || summary.displayName) || "成长档案";
  return {
    owner,
    learnerLabel,
    availableText: formatCoinsPlan(balances.availableCoins),
    heldText: formatCoinsPlan(balances.heldCoins),
    earnedText: formatCoinsPlan(balances.earnedCoins),
    spentText: formatCoinsPlan(balances.spentCoins),
    spentLabel: owner ? "已结算" : "已使用",
    heroText: owner ? "金币只作为学习任务的激励、兑换和奖励池管理凭证。" : "金币只作为学习任务的激励与兑换凭证。",
    rewardScopeText: owner ? (summary?.settlement?.currency || "CNY") : "学习奖励",
    redemptionScopeText: owner ? "审核状态" : "申请状态",
  };
}
