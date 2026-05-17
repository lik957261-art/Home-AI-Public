"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./app-learning-coins-ui"), require("./app-learning-program-ui"));
  } else {
    root.HermesLearningGrowthUi = factory(root.HermesLearningCoinsUi, root.HermesLearningProgramUi);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (CoinsUi, ProgramUi) {
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

  function isOwner(options = {}) {
    return Boolean(options.state?.auth?.isOwner);
  }

  function statusText(status) {
    const value = String(status || "");
    if (value === "active") return "已接入";
    if (value === "ready") return "已就绪";
    if (value === "foundation") return "底座";
    if (value === "guardrail") return "护栏";
    if (value === "platform-reuse") return "复用平台";
    if (value === "planned") return "规划中";
    if (value === "next") return "下一阶段";
    return value || "待定";
  }

  function renderCapabilityCards(capabilities = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!capabilities.length) return `<div class="learning-coin-empty">成长系统模块正在初始化。</div>`;
    return capabilities.map((item) => `<article class="learning-growth-module-card" data-learning-growth-capability="${escapeHtml(item.id)}">
      <div class="learning-growth-module-top">
        <h3>${escapeHtml(item.title || item.id || "模块")}</h3>
        <span>${escapeHtml(statusText(item.status))}</span>
      </div>
      <p>${escapeHtml(item.description || "")}</p>
    </article>`).join("");
  }

  function renderPlatformStrip(capabilities = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    return `<div class="learning-growth-platform-strip" aria-label="复用的平台能力">
      ${(capabilities || []).map((item) => `<span>${escapeHtml(item.title || item.id || "")}</span>`).join("")}
    </div>`;
  }

  function renderNextModules(nextModules = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!nextModules.length) return "";
    return `<section class="learning-coin-panel learning-growth-next-panel">
      <div class="learning-section-heading">
        <h3>实施队列</h3>
        <span>可独立演进</span>
      </div>
      <div class="learning-growth-next-list">
        ${nextModules.map((item) => `<div class="learning-growth-next-row">
          <strong>${escapeHtml(item.title || item.id || "")}</strong>
          <span>${escapeHtml(statusText(item.status))}</span>
        </div>`).join("")}
      </div>
    </section>`;
  }

  function renderOwnerSystemPanel(overview = {}, options = {}) {
    if (!isOwner(options)) return "";
    return `<section class="learning-growth-category learning-growth-owner-system" data-learning-growth-category="owner-system">
      <div class="learning-growth-category-heading">
        <h3>后台与平台能力</h3>
        <span>Owner</span>
      </div>
      ${renderPlatformStrip(overview.platformCapabilities || [], options)}
      <section class="learning-growth-modules">
        ${renderCapabilityCards(overview.capabilities || [], options)}
      </section>
      ${renderNextModules(overview.nextModules || [], options)}
    </section>`;
  }

  function renderLearningGrowthView(options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const overview = options.overview || {};
    const moduleInfo = overview.module || {};
    const learner = overview.learner || {};
    const metrics = overview.metrics || {};
    const learnerLabel = learner.displayName
      || (options.learnerId === "weixin_stephen" ? "凡凡" : options.learnerId)
      || learner.id
      || "Learner";
    const coins = options.coins || overview.coins || {};
    const coinsUi = options.coinsUi || CoinsUi;
    const programUi = options.programUi || ProgramUi;
    const programsHtml = programUi && typeof programUi.renderProgramSubsystem === "function"
      ? programUi.renderProgramSubsystem(Object.assign({}, options, {
          programs: overview.programs || {},
          learnerId: learner.id || options.learnerId,
        }))
      : "";
    const coinsHtml = coinsUi && typeof coinsUi.renderCoinsSubsystem === "function"
      ? coinsUi.renderCoinsSubsystem(Object.assign({}, options, {
          summary: coins,
          learnerId: learner.id || options.learnerId,
        }))
      : `<div class="learning-coin-empty">金币子模块未加载。</div>`;
    const owner = isOwner(options);
    return `<div class="learning-growth-view" data-learning-product="fanfan-growth" data-learning-role="${owner ? "owner" : "executor"}">
      <section class="learning-growth-shell-hero">
        <div>
          <div class="learning-coin-eyebrow">${escapeHtml(owner ? (moduleInfo.currentEntry || "成长入口") : "成长")}</div>
          <h2>${escapeHtml(moduleInfo.title || "凡凡成长系统")}</h2>
          <p>${escapeHtml(owner ? "按执行、金币、分析和家长配置分区查看；金币仍是成长系统内部激励子模块。" : "这里只显示金币情况、待执行任务状态、分析与指导。")}</p>
        </div>
        <div class="learning-growth-shell-metrics">
          <span><strong>${escapeHtml(learnerLabel)}</strong><small>学习对象</small></span>
          <span><strong>${escapeHtml(String(metrics.sevenDayCoins || 0))}</strong><small>7 天金币</small></span>
          <span><strong>${escapeHtml(String(metrics.pendingRedemptions || 0))}</strong><small>${owner ? "待审兑换" : "申请中"}</small></span>
        </div>
      </section>
      ${programsHtml}
      ${coinsHtml}
      ${renderOwnerSystemPanel(overview, options)}
    </div>`;
  }

  return {
    renderCapabilityCards,
    renderLearningGrowthView,
    renderNextModules,
    renderOwnerSystemPanel,
    renderPlatformStrip,
  };
}));
