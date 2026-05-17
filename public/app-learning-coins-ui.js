"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningCoinsUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
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
    const amount = Number(value || 0);
    return `${Number.isFinite(amount) ? amount : 0} 金币`;
  }

  function formatRmbCents(cents) {
    if (cents === null || cents === undefined || cents === "") return "人民币规则待设置";
    const value = Number(cents);
    if (!Number.isFinite(value)) return "人民币规则待设置";
    return `￥${(value / 100).toFixed(2)}`;
  }

  function renderRewardCards(summary, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const owner = isOwner(options);
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
    const ledger = summary?.ledger || [];
    if (!ledger.length) return `<div class="learning-coin-empty">暂无金币流水。</div>`;
    return ledger.map((entry) => {
      const positive = Number(entry.coinDelta || 0) >= 0;
      return `<div class="learning-ledger-row">
        <div>
          <div class="learning-ledger-title">${escapeHtml(entry.reason || entry.type || "金币记录")}</div>
          <div class="learning-ledger-meta">${escapeHtml([entry.sourceType, entry.sourceId, formatTime(entry.createdAt)].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="learning-ledger-amount ${positive ? "positive" : "negative"}">${positive ? "+" : ""}${escapeHtml(formatCoins(entry.coinDelta))}</div>
      </div>`;
    }).join("");
  }

  function renderRedemptionRows(summary, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const formatTime = optionFn(options, "formatTime", (value) => String(value || ""));
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
    const growth = summary?.growth || {};
    const level = growth.level || {};
    const current = level.current || {};
    const next = level.next || null;
    const levelTitle = current.title ? `Lv.${current.level} ${current.title}` : "Lv.1 新手探索者";
    const nextText = next ? `距离 Lv.${next.level} ${next.title} 还差 ${formatCoins(level.toNextLevelCoins)}` : "已达到当前最高等级";
    const progress = Math.max(0, Math.min(100, Number(level.progressPct || 0)));
    return `<section class="learning-coin-panel learning-growth-panel" data-learning-growth-coins="profile">
      <div class="learning-section-heading">
        <h3>成长档案</h3>
        <span>最近 7 天</span>
      </div>
      <div class="learning-growth-summary">
        <div class="learning-growth-level">
          <div class="learning-coin-eyebrow">${escapeHtml(levelTitle)}</div>
          <strong>${escapeHtml(formatCoins(growth.totalEarnedCoins))}</strong>
          <div class="learning-growth-progress" aria-label="${escapeHtml(`${progress}%`)}"><span style="width:${progress}%"></span></div>
          <small>${escapeHtml(nextText)}</small>
        </div>
        <div class="learning-growth-metrics">
          <span><strong>${escapeHtml(formatCoins(growth.sevenDayCoins))}</strong><small>7 天获得</small></span>
          <span><strong>${escapeHtml(String(growth.activeDaysInLast7 || 0))} 天</strong><small>7 天活跃</small></span>
          <span><strong>${escapeHtml(String(growth.streakDays || 0))} 天</strong><small>连续获得</small></span>
        </div>
      </div>
      ${renderDailyBars(growth, options)}
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
    const balances = summary.balances || {};
    const loading = options.loading ? `<div class="learning-coin-loading">正在刷新成长数据...</div>` : "";
    const error = options.error ? `<div class="automation-error">${escapeHtml(options.error)}</div>` : "";
    return `<section class="learning-growth-coin-section" data-learning-growth-module="coins">
      <div class="learning-section-heading">
        <h3>金币与奖励</h3>
        <span>成长系统子模块</span>
      </div>
      <section class="learning-coin-hero">
        <div>
          <div class="learning-coin-eyebrow">${escapeHtml(summary.studentId || options.learnerId || "")}</div>
          <h2>${escapeHtml(formatCoins(balances.availableCoins))}</h2>
          <p>${escapeHtml(owner ? "金币只作为学习成长系统的激励、兑换和奖励池管理凭证。" : "金币只作为学习成长系统的激励与兑换凭证。")}</p>
        </div>
        <div class="learning-coin-stats">
          <span><strong>${escapeHtml(formatCoins(balances.heldCoins))}</strong><small>冻结中</small></span>
          <span><strong>${escapeHtml(formatCoins(balances.earnedCoins))}</strong><small>累计获得</small></span>
          <span><strong>${escapeHtml(formatCoins(balances.spentCoins))}</strong><small>${owner ? "已结算" : "已使用"}</small></span>
        </div>
      </section>
      ${loading}
      ${error}
      ${renderGrowthPanel(summary, options)}
      <section class="learning-coin-panel" data-learning-growth-coins="rewards">
        <div class="learning-section-heading">
          <h3>兑换</h3>
          <span>${escapeHtml(owner ? (summary?.settlement?.currency || "CNY") : "学习奖励")}</span>
        </div>
        <div class="learning-reward-list">${renderRewardCards(summary, options)}</div>
      </section>
      <section class="learning-coin-grid">
        <div class="learning-coin-panel" data-learning-growth-coins="ledger">
          <div class="learning-section-heading"><h3>金币流水</h3><span>最近记录</span></div>
          ${renderLedgerRows(summary, options)}
        </div>
        <div class="learning-coin-panel" data-learning-growth-coins="redemptions">
          <div class="learning-section-heading"><h3>兑换申请</h3><span>${owner ? "审核状态" : "申请状态"}</span></div>
          ${renderRedemptionRows(summary, options)}
        </div>
      </section>
      ${renderOwnerForm(options)}
    </section>`;
  }

  return {
    formatCoins,
    formatRmbCents,
    renderCoinsSubsystem,
    renderDailyBars,
    renderGrowthPanel,
    renderLedgerRows,
    renderRedemptionRows,
    renderRewardCards,
    renderRewardProgress,
  };
}));
