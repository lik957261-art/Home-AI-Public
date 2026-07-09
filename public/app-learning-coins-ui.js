"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningCoinsUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LEARNING_COINS_MODEL_ESM_PATH = "/vite-islands/learning-coins-model/learning-coins-model.js";
  let learningCoinsModel = null;
  let learningCoinsModelPromise = null;

  function importLearningCoinsModel(rootRef = (typeof globalThis !== "undefined" ? globalThis : null)) {
    if (learningCoinsModel) return Promise.resolve(learningCoinsModel);
    if (!learningCoinsModelPromise) {
      const importer = typeof rootRef?.__homeAiImportLearningCoinsModel === "function"
        ? rootRef.__homeAiImportLearningCoinsModel
        : (path) => import(path);
      learningCoinsModelPromise = Promise.resolve()
        .then(() => importer(LEARNING_COINS_MODEL_ESM_PATH))
        .then((model) => {
          learningCoinsModel = model || null;
          return learningCoinsModel;
        })
        .catch((error) => {
          learningCoinsModelPromise = null;
          throw error;
        });
    }
    return learningCoinsModelPromise;
  }

  function currentLearningCoinsModel() {
    return learningCoinsModel;
  }

  function learningCoinsModelFunction(name) {
    const model = currentLearningCoinsModel();
    return model && typeof model[name] === "function" ? model[name] : null;
  }

  if (typeof window !== "undefined") {
    importLearningCoinsModel().catch(() => null);
  }

  function defaultEscapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function optionFn(options, name, fallback) {
    return typeof options[name] === "function" ? options[name] : fallback;
  }

  function optionState(options) {
    return options.state && typeof options.state === "object" ? options.state : {};
  }

  function isOwner(options = {}) {
    return Boolean(optionState(options).auth?.isOwner);
  }

  function formatCoins(value) {
    const modelFn = learningCoinsModelFunction("formatCoinsPlan");
    if (modelFn) return modelFn(value);
    const amount = Number(value || 0);
    return `${Number.isFinite(amount) ? amount : 0} 金币`;
  }

  function formatRmbCents(cents) {
    const modelFn = learningCoinsModelFunction("formatRmbCentsPlan");
    if (modelFn) return modelFn(cents);
    if (cents === null || cents === undefined || cents === "") return "人民币规则待设置";
    const value = Number(cents);
    if (!Number.isFinite(value)) return "人民币规则待设置";
    return `￥${(value / 100).toFixed(2)}`;
  }

  function renderRewardCards(summary, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const owner = isOwner(options);
    const modelFn = learningCoinsModelFunction("rewardCardsViewPlan");
    const plan = modelFn ? modelFn(summary, { state: optionState(options), owner }) : null;
    if (plan) {
      if (plan.empty) return `<div class="learning-coin-empty">${escapeHtml(plan.emptyText)}</div>`;
      return plan.cards.map((reward) => `<article class="learning-reward-card">
        <div class="learning-reward-main">
          <div class="learning-reward-title">${escapeHtml(reward.title)}</div>
          ${reward.description ? `<div class="learning-reward-description">${escapeHtml(reward.description)}</div>` : ""}
        </div>
        <div class="learning-reward-meta">
          <span>${escapeHtml(reward.coinText)}</span>
          ${reward.showRmb ? `<span>${escapeHtml(reward.rmbText)}</span>` : ""}
        </div>
        <button class="learning-coin-primary" type="button" data-learning-redeem="${escapeHtml(reward.id)}" ${reward.affordable ? "" : "disabled"}>${escapeHtml(reward.buttonText)}</button>
      </article>`).join("");
    }
    const rewards = summary?.rewards || [];
    if (!rewards.length) {
      return `<div class="learning-coin-empty">${owner ? "奖励池还没有配置。" : "暂无可申请的奖励。"}</div>`;
    }
    const available = Number(summary?.balances?.availableCoins || 0);
    return rewards.map((reward) => {
      const affordable = available >= Number(reward.coinCost || 0);
      return `<article class="learning-reward-card">
        <div class="learning-reward-main">
          <div class="learning-reward-title">${escapeHtml(reward.title || "奖励")}</div>
          ${reward.description ? `<div class="learning-reward-description">${escapeHtml(reward.description)}</div>` : ""}
        </div>
        <div class="learning-reward-meta">
          <span>${escapeHtml(formatCoins(reward.coinCost))}</span>
          ${owner ? `<span>${escapeHtml(formatRmbCents(reward.rmbCents))}</span>` : ""}
        </div>
        <button class="learning-coin-primary" type="button" data-learning-redeem="${escapeHtml(reward.id)}" ${affordable ? "" : "disabled"}>${affordable ? "申请兑换" : "金币不足"}</button>
      </article>`;
    }).join("");
  }

  function renderLedgerRows(summary, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const formatTime = optionFn(options, "formatTime", (value) => String(value || ""));
    const owner = isOwner(options);
    const modelFn = learningCoinsModelFunction("ledgerRowsViewPlan");
    const plan = modelFn ? modelFn(Object.assign({}, summary, {
      ledger: (Array.isArray(summary?.ledger) ? summary.ledger : []).map((entry) => Object.assign({}, entry, {
        createdAtText: formatTime(entry.createdAt),
      })),
    }), { state: optionState(options), owner }) : null;
    if (plan) {
      if (plan.empty) return `<div class="learning-coin-empty">${escapeHtml(plan.emptyText)}</div>`;
      return plan.rows.map((entry) => `<div class="learning-ledger-row">
        <div>
          <div class="learning-ledger-title">${escapeHtml(entry.title)}</div>
          <div class="learning-ledger-meta">${escapeHtml(entry.meta)}</div>
        </div>
        <div class="learning-ledger-amount ${entry.positive ? "positive" : "negative"}">${escapeHtml(entry.amountText)}</div>
      </div>`).join("");
    }
    const ledger = summary?.ledger || [];
    if (!ledger.length) return `<div class="learning-coin-empty">暂无金币流水。</div>`;
    return ledger.map((entry) => {
      const positive = Number(entry.coinDelta || 0) >= 0;
      const meta = owner
        ? [entry.sourceType, entry.sourceId, formatTime(entry.createdAt)].filter(Boolean).join(" · ")
        : [formatTime(entry.createdAt)].filter(Boolean).join(" · ");
      return `<div class="learning-ledger-row">
        <div>
          <div class="learning-ledger-title">${escapeHtml(entry.reason || entry.type || "金币记录")}</div>
          <div class="learning-ledger-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="learning-ledger-amount ${positive ? "positive" : "negative"}">${positive ? "+" : ""}${escapeHtml(formatCoins(entry.coinDelta))}</div>
      </div>`;
    }).join("");
  }

  function renderRedemptionRows(summary, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const formatTime = optionFn(options, "formatTime", (value) => String(value || ""));
    const modelFn = learningCoinsModelFunction("redemptionRowsViewPlan");
    const plan = modelFn ? modelFn(Object.assign({}, summary, {
      redemptions: (Array.isArray(summary?.redemptions) ? summary.redemptions : []).map((item) => Object.assign({}, item, {
        requestedAtText: formatTime(item.requestedAt),
      })),
    })) : null;
    if (plan) {
      if (plan.empty) return `<div class="learning-coin-empty">${escapeHtml(plan.emptyText)}</div>`;
      return plan.rows.map((item) => `<div class="learning-redemption-row">
      <div>
        <div class="learning-ledger-title">${escapeHtml(item.title)}</div>
        <div class="learning-ledger-meta">${escapeHtml(item.meta)}</div>
      </div>
      <div class="learning-ledger-amount negative">${escapeHtml(item.amountText)}</div>
    </div>`).join("");
    }
    const redemptions = summary?.redemptions || [];
    if (!redemptions.length) return `<div class="learning-coin-empty">暂无兑换申请。</div>`;
    return redemptions.map((item) => `<div class="learning-redemption-row">
      <div>
        <div class="learning-ledger-title">${escapeHtml(item.rewardTitle || item.rewardId || "兑换申请")}</div>
        <div class="learning-ledger-meta">${escapeHtml([item.status, formatTime(item.requestedAt)].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="learning-ledger-amount negative">${escapeHtml(formatCoins(item.coinCost))}</div>
    </div>`).join("");
  }

  function renderDailyBars(growth, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const modelFn = learningCoinsModelFunction("dailyBarsViewPlan");
    const plan = modelFn ? modelFn(growth) : null;
    if (plan) {
      if (plan.empty) return `<div class="learning-coin-empty">${escapeHtml(plan.emptyText)}</div>`;
      return `<div class="learning-growth-days">${plan.days.map((day) => `<div class="learning-growth-day">
        <div class="learning-growth-bar" style="height:${day.heightPct}%"></div>
        <span>${escapeHtml(day.dateLabel)}</span>
        <strong>${escapeHtml(day.coinsText)}</strong>
      </div>`).join("")}</div>`;
    }
    const days = Array.isArray(growth?.recentDays) ? growth.recentDays : [];
    if (!days.length) return `<div class="learning-coin-empty">暂无最近 7 天记录。</div>`;
    const maxCoins = Math.max(1, ...days.map((day) => Number(day.coins || 0)));
    return `<div class="learning-growth-days">${days.map((day) => {
      const coins = Number(day.coins || 0);
      const pct = Math.max(4, Math.round((coins / maxCoins) * 100));
      return `<div class="learning-growth-day">
        <div class="learning-growth-bar" style="height:${pct}%"></div>
        <span>${escapeHtml(String(day.date || "").slice(5) || "--")}</span>
        <strong>${escapeHtml(String(coins))}</strong>
      </div>`;
    }).join("")}</div>`;
  }

  function renderRewardProgress(growth, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const owner = isOwner(options);
    const modelFn = learningCoinsModelFunction("rewardProgressViewPlan");
    const plan = modelFn ? modelFn(growth, { state: optionState(options), owner }) : null;
    if (plan) {
      if (plan.empty) return `<div class="learning-coin-empty">${escapeHtml(plan.emptyText)}</div>`;
      return plan.rewards.map((reward) => `<div class="learning-growth-reward">
        <div class="learning-growth-reward-top">
          <strong>${escapeHtml(reward.title)}</strong>
          <span>${escapeHtml(reward.status)}</span>
        </div>
        <div class="learning-growth-progress" aria-label="${escapeHtml(`${reward.pct}%`)}"><span style="width:${reward.pct}%"></span></div>
        <div class="learning-ledger-meta">${escapeHtml(reward.meta)}</div>
      </div>`).join("");
    }
    const bestReward = growth?.bestRewardProgress || null;
    const allRewards = Array.isArray(growth?.rewardProgress) ? growth.rewardProgress : [];
    const rewards = bestReward
      ? [bestReward].concat(allRewards.filter((reward) => reward?.id !== bestReward.id)).slice(0, 4)
      : allRewards;
    if (!rewards.length) return `<div class="learning-coin-empty">配置奖励后会显示兑换进度。</div>`;
    return rewards.map((reward) => {
      const pct = Math.max(0, Math.min(100, Number(reward.progressPct || 0)));
      const status = reward.affordable ? "可兑换" : `还差 ${formatCoins(reward.remainingCoins)}`;
      return `<div class="learning-growth-reward">
        <div class="learning-growth-reward-top">
          <strong>${escapeHtml(reward.title || reward.id || "奖励")}</strong>
          <span>${escapeHtml(status)}</span>
        </div>
        <div class="learning-growth-progress" aria-label="${escapeHtml(`${pct}%`)}"><span style="width:${pct}%"></span></div>
        <div class="learning-ledger-meta">${escapeHtml(owner ? `${formatCoins(reward.coinCost)} · ${formatRmbCents(reward.rmbCents)}` : formatCoins(reward.coinCost))}</div>
      </div>`;
    }).join("");
  }

  function renderGrowthPanel(summary, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const modelFn = learningCoinsModelFunction("growthPanelViewPlan");
    const plan = modelFn ? modelFn(summary) : null;
    const growth = summary?.growth || {};
    const balances = summary?.balances || {};
    const level = growth.level || {};
    const current = level.current || {};
    const next = level.next || null;
    const levelTitle = plan?.levelTitle || (current.title ? `Lv.${current.level} ${current.title}` : "Lv.1 新手探索者");
    const nextText = plan?.nextText || (next ? `距离 Lv.${next.level} ${next.title} 还差 ${formatCoins(level.toNextLevelCoins)}` : "已达到当前最高等级");
    const progress = plan?.progress ?? Math.max(0, Math.min(100, Number(level.progressPct || 0)));
    return `<section class="learning-coin-panel learning-growth-panel" data-learning-growth-coins="profile">
      <div class="learning-section-heading">
        <h3>成长档案</h3>
        <span>历史累计</span>
      </div>
      <div class="learning-growth-summary">
        <div class="learning-growth-level">
          <div class="learning-coin-eyebrow">${escapeHtml(levelTitle)}</div>
          <strong>${escapeHtml(plan?.totalEarnedText || formatCoins(growth.totalEarnedCoins))}</strong>
          <div class="learning-growth-progress" aria-label="${escapeHtml(`${progress}%`)}"><span style="width:${progress}%"></span></div>
          <small>${escapeHtml(nextText)}</small>
        </div>
        <div class="learning-growth-metrics">
          <span><strong>${escapeHtml(plan?.totalEarnedText || formatCoins(growth.totalEarnedCoins))}</strong><small>历史累计</small></span>
          <span><strong>${escapeHtml(plan?.availableText || formatCoins(balances.availableCoins))}</strong><small>当前可用</small></span>
          <span><strong>${escapeHtml(plan?.streakText || `${String(growth.streakDays || 0)} 天`)}</strong><small>连续获得</small></span>
        </div>
      </div>
      <div class="learning-growth-rewards">
        <div class="learning-section-heading compact"><h3>兑换进度</h3><span>按差额排序</span></div>
        ${renderRewardProgress(growth, options)}
      </div>
    </section>`;
  }

  function renderOwnerForm(options = {}) {
    const state = optionState(options);
    if (!state.auth?.isOwner) return "";
    return `<section class="learning-coin-panel learning-coin-owner-panel" data-learning-growth-coins="owner">
      <div class="learning-section-heading">
        <h3>奖励池</h3>
        <span>Owner</span>
      </div>
      <form id="learningRewardForm" class="learning-reward-form">
        <input id="learningRewardTitle" class="input" type="text" placeholder="奖励名称" autocomplete="off">
        <input id="learningRewardCost" class="input" type="number" min="1" step="1" placeholder="金币">
        <input id="learningRewardRmb" class="input" type="number" min="0" step="0.01" placeholder="人民币，可留空">
        <textarea id="learningRewardDescription" class="input" rows="2" placeholder="说明，可留空"></textarea>
        <button class="learning-coin-primary" type="submit">保存奖励</button>
      </form>
    </section>`;
  }

  function renderCoinsSubsystem(options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const state = optionState(options);
    const owner = isOwner(options);
    const summary = options.summary || state.learningCoins || {};
    const modelFn = learningCoinsModelFunction("coinsSubsystemViewPlan");
    const plan = modelFn ? modelFn({ summary, options: Object.assign({}, options, { state }) }) : null;
    const balances = summary.balances || {};
    const learnerLabel = plan?.learnerLabel || (owner
      ? (summary.studentId || options.learnerId || "")
      : (options.learnerName || summary.displayName || "成长档案"));
    const loading = options.loading ? `<div class="learning-coin-loading">正在刷新成长数据...</div>` : "";
    const error = options.error ? `<div class="automation-error">${escapeHtml(options.error)}</div>` : "";
    return `<section class="learning-growth-coin-section" data-learning-growth-module="coins">
      <div class="learning-section-heading">
        <h3>金币与奖励</h3>
        <span>激励记录</span>
      </div>
      <section class="learning-coin-hero">
        <div>
          <div class="learning-coin-eyebrow">${escapeHtml(learnerLabel)}</div>
          <h2>${escapeHtml(plan?.availableText || formatCoins(balances.availableCoins))}</h2>
          <p>${escapeHtml(plan?.heroText || (owner ? "金币只作为学习任务的激励、兑换和奖励池管理凭证。" : "金币只作为学习任务的激励与兑换凭证。"))}</p>
        </div>
        <div class="learning-coin-stats">
          <span><strong>${escapeHtml(plan?.heldText || formatCoins(balances.heldCoins))}</strong><small>冻结中</small></span>
          <span><strong>${escapeHtml(plan?.earnedText || formatCoins(balances.earnedCoins))}</strong><small>累计获得</small></span>
          <span><strong>${escapeHtml(plan?.spentText || formatCoins(balances.spentCoins))}</strong><small>${escapeHtml(plan?.spentLabel || (owner ? "已结算" : "已使用"))}</small></span>
        </div>
      </section>
      ${loading}
      ${error}
      ${renderGrowthPanel(summary, options)}
      <section class="learning-coin-panel" data-learning-growth-coins="rewards">
        <div class="learning-section-heading">
          <h3>兑换</h3>
          <span>${escapeHtml(plan?.rewardScopeText || (owner ? (summary?.settlement?.currency || "CNY") : "学习奖励"))}</span>
        </div>
        <div class="learning-reward-list">${renderRewardCards(summary, options)}</div>
      </section>
      <section class="learning-coin-grid">
        <div class="learning-coin-panel" data-learning-growth-coins="ledger">
          <div class="learning-section-heading"><h3>金币流水</h3><span>最近记录</span></div>
          ${renderLedgerRows(summary, options)}
        </div>
        <div class="learning-coin-panel" data-learning-growth-coins="redemptions">
          <div class="learning-section-heading"><h3>兑换申请</h3><span>${escapeHtml(plan?.redemptionScopeText || (owner ? "审核状态" : "申请状态"))}</span></div>
          ${renderRedemptionRows(summary, options)}
        </div>
      </section>
      ${renderOwnerForm(options)}
    </section>`;
  }

  return {
    currentLearningCoinsModel,
    formatCoins,
    formatRmbCents,
    importLearningCoinsModel,
    renderCoinsSubsystem,
    renderDailyBars,
    renderGrowthPanel,
    renderLedgerRows,
    renderRedemptionRows,
    renderRewardCards,
    renderRewardProgress,
  };
}));
