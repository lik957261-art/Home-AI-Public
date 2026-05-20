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
    if (value === "active") return "\u5df2\u63a5\u5165";
    if (value === "ready") return "\u5df2\u5c31\u7eea";
    if (value === "foundation") return "\u5e95\u5ea7";
    if (value === "guardrail") return "\u62a4\u680f";
    if (value === "platform-reuse") return "\u590d\u7528\u5e73\u53f0";
    if (value === "planned") return "\u89c4\u5212\u4e2d";
    if (value === "next") return "\u4e0b\u4e00\u9636\u6bb5";
    return value || "\u5f85\u5b9a";
  }
  function renderCapabilityCards(capabilities = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!capabilities.length) return `<div class="learning-coin-empty">\u6210\u957f\u7cfb\u7edf\u6a21\u5757\u6b63\u5728\u521d\u59cb\u5316\u3002</div>`;
    return capabilities.map((item) => `<article class="learning-growth-module-card" data-learning-growth-capability="${escapeHtml(item.id)}">
      <div class="learning-growth-module-top">
        <h3>${escapeHtml(item.title || item.id || "\u6a21\u5757")}</h3>
        <span>${escapeHtml(statusText(item.status))}</span>
      </div>
      <p>${escapeHtml(item.description || "")}</p>
    </article>`).join("");
  }

  function renderPlatformStrip(capabilities = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    return `<div class="learning-growth-platform-strip" aria-label="\u590d\u7528\u7684\u5e73\u53f0\u80fd\u529b">
      ${(capabilities || []).map((item) => `<span>${escapeHtml(item.title || item.id || "")}</span>`).join("")}
    </div>`;
  }

  function renderNextModules(nextModules = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!nextModules.length) return "";
    return `<section class="learning-coin-panel learning-growth-next-panel">
      <div class="learning-section-heading">
        <h3>\u5b9e\u65bd\u961f\u5217</h3>
        <span>\u53ef\u72ec\u7acb\u6f14\u8fdb</span>
      </div>
      <div class="learning-growth-next-list">
        ${nextModules.map((item) => `<div class="learning-growth-next-row">
          <strong>${escapeHtml(item.title || item.id || "")}</strong>
          <span>${escapeHtml(statusText(item.status))}</span>
        </div>`).join("")}
      </div>
    </section>`;
  }

  function countPendingTasks(programs = {}) {
    const dailyPending = Number(programs.dailyPlan?.summary?.pendingTasks);
    if (Number.isFinite(dailyPending) && dailyPending >= 0) return dailyPending;
    const taskCards = Array.isArray(programs.taskCards) ? programs.taskCards : [];
    return taskCards.filter((task) => ["planned", "published", "active", "review_required"].includes(String(task?.status || ""))).length;
  }

  function countReflectionOrReview(programs = {}, owner = false) {
    const counts = programs.launchOperations?.counts || {};
    if (owner) {
      return Number(counts.pendingPlanReviews || 0)
        + Number(counts.pendingParentReviews || 0)
        + Number(counts.pendingRewardSettlements || 0);
    }
    const sessions = Array.isArray(programs.interactionSessions) ? programs.interactionSessions : [];
    return sessions.filter((session) => /reflect|review/i.test(String(session?.currentStep || session?.status || ""))).length;
  }

  function renderGrowthMetric(label, value, detail, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    return `<span class="learning-growth-metric-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </span>`;
  }

  function renderGrowthWorkflow(options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const steps = [
      ["attempt", "\u4f5c\u7b54", "\u63d0\u4ea4\u8bc1\u636e"],
      ["feedback", "AI \u6279\u6539", "\u627e\u51fa\u5f31\u70b9"],
      ["revision", "\u4fee\u8ba2", "80 \u5206\u901a\u8fc7\u7ebf"],
      ["reflection", "\u5f55\u97f3\u590d\u76d8", "\u786e\u8ba4\u7406\u89e3"],
      ["settlement", "\u7ed3\u7b97", "\u5956\u52b1\u4e0e\u4e0b\u4e00\u9898"],
    ];
    return `<div class="learning-growth-workflow" aria-label="\u5b66\u4e60\u6d41\u7a0b">
      ${steps.map(([id, label, detail], index) => `<span data-learning-growth-flow-step="${escapeHtml(id)}">
        <b>${index + 1}</b>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail)}</small>
      </span>`).join("")}
    </div>`;
  }

  function boardLaneTitle(id, fallback = "") {
    const value = String(id || "");
    if (value === "today") return "\u4eca\u65e5";
    if (value === "ready") return "\u5f85\u6267\u884c";
    if (value === "waiting_ai") return "\u7b49\u5f85 AI";
    if (value === "needs_revision") return "\u5f85\u4fee\u8ba2";
    if (value === "reflection_required") return "\u5f85\u590d\u76d8";
    if (value === "completed_recent") return "\u6700\u8fd1\u5b8c\u6210";
    return fallback || value || "\u4efb\u52a1";
  }

  function boardActionText(action) {
    const value = String(action || "");
    if (value === "submit") return "\u63d0\u4ea4\u4f5c\u7b54";
    if (value === "revise") return "\u4fee\u8ba2\u63d0\u4ea4";
    if (value === "reflect") return "\u5f55\u97f3\u590d\u76d8";
    if (value === "wait") return "\u7b49\u5f85 AI";
    if (value === "review") return "\u67e5\u770b\u7ed3\u679c";
    return value || "\u67e5\u770b";
  }

  function boardStatusText(card = {}) {
    const nextAction = String(card.nextAction || card.primaryAction || "");
    if (nextAction === "submit") return "\u672a\u63d0\u4ea4";
    if (nextAction === "waiting_feedback") return "\u5df2\u63d0\u4ea4\uff0c\u7b49\u5f85 AI";
    if (nextAction === "revise") return "\u9700\u8981\u4fee\u8ba2";
    if (nextAction === "spoken_reflection") return "\u9700\u8981\u590d\u76d8";
    if (nextAction === "complete") return "\u5df2\u5b8c\u6210";
    return card.status || nextAction || "\u5f85\u5904\u7406";
  }

  function renderBoardCard(card = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(card.taskCardId || "");
    const workspaceId = String(card.workspaceId || options.workspaceId || "");
    const evaluation = card.latestEvaluation || {};
    const score = Number(evaluation.score);
    const scoreText = Number.isFinite(score) && score > 0 ? `${Math.round(score)} \u5206` : "";
    const artifacts = Number(card.artifactCount || 0);
    return `<article class="learning-growth-board-card" data-learning-executable-task-id="${escapeHtml(taskCardId)}">
      <div class="learning-growth-board-card-head">
        <strong>${escapeHtml(card.title || taskCardId || "\u5b66\u4e60\u4efb\u52a1")}</strong>
        <span>${escapeHtml(boardStatusText(card))}</span>
      </div>
      <div class="learning-growth-board-card-meta">
        ${card.activityType ? `<small>${escapeHtml(card.activityType)}</small>` : ""}
        ${card.plannedDate ? `<small>${escapeHtml(String(card.plannedDate).slice(0, 10))}</small>` : ""}
        ${scoreText ? `<small>${escapeHtml(scoreText)}</small>` : ""}
        ${artifacts ? `<small>${escapeHtml(String(artifacts))} \u4e2a\u4ea4\u4ed8</small>` : ""}
      </div>
      <div class="learning-growth-board-card-actions">
        <button type="button" data-learning-open-growth-task="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(workspaceId)}">${escapeHtml(boardActionText(card.primaryAction))}</button>
      </div>
    </article>`;
  }

  function renderLearningGrowthBoard(board = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const cards = Array.isArray(board.cards) ? board.cards : [];
    const cardById = new Map(cards.map((card) => [String(card.taskCardId || ""), card]));
    const lanes = Array.isArray(board.lanes) ? board.lanes : [];
    if (!lanes.length) return `<section class="learning-growth-board"><div class="learning-coin-empty">\u6682\u65e0\u6210\u957f\u4efb\u52a1\u3002</div></section>`;
    return `<section class="learning-growth-board" data-learning-growth-board>
      <div class="learning-growth-board-heading">
        <h3>\u6210\u957f\u770b\u677f</h3>
        <span>${escapeHtml(String(board.summary?.cardCount || cards.length || 0))} \u5f20\u4efb\u52a1</span>
      </div>
      <div class="learning-growth-board-lanes">
        ${lanes.map((lane) => {
          const laneCards = (Array.isArray(lane.cards) ? lane.cards : [])
            .map((id) => cardById.get(String(id || "")))
            .filter(Boolean);
          return `<section class="learning-growth-board-lane" data-growth-board-lane="${escapeHtml(lane.id || "")}">
            <div class="learning-growth-board-lane-head">
              <strong>${escapeHtml(boardLaneTitle(lane.id, lane.title))}</strong>
              <span>${escapeHtml(String(lane.count ?? laneCards.length))}</span>
            </div>
            ${laneCards.length
              ? laneCards.map((card) => renderBoardCard(card, options)).join("")
              : `<div class="learning-growth-board-empty">\u6ca1\u6709\u5f53\u524d\u4efb\u52a1</div>`}
          </section>`;
        }).join("")}
      </div>
    </section>`;
  }

  function readinessStatusText(status) {
    const value = String(status || "");
    if (value === "operational_ready") return "Operational ready";
    if (value === "system_ready") return "System ready";
    if (value === "blocked") return "Blocked";
    return value || "Unknown";
  }

  function renderReadinessMetric(label, value, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const percent = Math.max(0, Math.min(100, Number(value || 0)));
    return `<span>
      <strong>${escapeHtml(`${percent}%`)}</strong>
      <small>${escapeHtml(label)}</small>
    </span>`;
  }

  function renderReadinessCheckRows(checks = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    return (checks || []).map((item) => `<li class="learning-readiness-check-row" data-learning-readiness-check="${escapeHtml(item.id || "")}" data-ready="${item.ready ? "1" : "0"}">
      <span>${item.ready ? "OK" : "TODO"}</span>
      <strong>${escapeHtml(item.label || item.id || "")}</strong>
    </li>`).join("");
  }

  function renderReadinessPanel(readiness = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!readiness || typeof readiness !== "object") return "";
    const systemChecks = readiness.checks?.system || [];
    const learnerChecks = readiness.checks?.learnerData || [];
    const nextActions = readiness.nextActions || [];
    return `<section class="learning-coin-panel learning-readiness-panel" data-learning-operational-readiness>
      <div class="learning-section-heading">
        <h3>Learning V1 readiness</h3>
        <span>${escapeHtml(readinessStatusText(readiness.status))}</span>
      </div>
      <div class="learning-readiness-grid">
        ${renderReadinessMetric("System gates", readiness.systemReadinessPercent, options)}
        ${renderReadinessMetric("Learner data", readiness.learnerDataReadinessPercent, options)}
        <span>
          <strong>${readiness.operationalTestReady ? "Yes" : "No"}</strong>
          <small>Operational test</small>
        </span>
      </div>
      <div class="learning-readiness-checks">
        <div>
          <strong>System</strong>
          <ul class="learning-readiness-check-list">${renderReadinessCheckRows(systemChecks, options)}</ul>
        </div>
        <div>
          <strong>Learner data</strong>
          <ul class="learning-readiness-check-list">${renderReadinessCheckRows(learnerChecks, options)}</ul>
        </div>
      </div>
      ${nextActions.length ? `<div class="learning-readiness-next">
        <strong>Next actions</strong>
        <ul>${nextActions.map((item) => `<li>${escapeHtml(item.reason || item.checkId || "")}</li>`).join("")}</ul>
      </div>` : ""}
    </section>`;
  }

  function renderOwnerSystemPanel(overview = {}, options = {}) {
    if (!isOwner(options)) return "";
    return `<section class="learning-growth-category learning-growth-owner-system" data-learning-growth-category="owner-system">
      <div class="learning-growth-category-heading">
        <h3>\u540e\u53f0\u4e0e\u5e73\u53f0\u80fd\u529b</h3>
        <span>Owner</span>
      </div>
      ${renderReadinessPanel(overview.operationalReadiness, options)}
      ${renderPlatformStrip(overview.platformCapabilities || [], options)}
      <section class="learning-growth-modules">
        ${renderCapabilityCards(overview.capabilities || [], options)}
      </section>
      ${renderNextModules(overview.nextModules || [], options)}
    </section>`;
  }

  function renderLearningGrowthTabs(tabs = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const visible = tabs.filter((tab) => tab && tab.html);
    if (!visible.length) return "";
    const first = visible[0].id;
    return `<section class="learning-growth-tabs" data-learning-growth-tabs>
      <div class="learning-growth-tab-list" role="tablist" aria-label="\u590d\u7528\u7684\u5e73\u53f0\u80fd\u529b">
        ${visible.map((tab, index) => `<button type="button" role="tab" data-learning-growth-tab="${escapeHtml(tab.id)}" aria-selected="${index === 0 ? "true" : "false"}" class="${index === 0 ? "active" : ""}">${escapeHtml(tab.label)}</button>`).join("")}
      </div>
      ${visible.map((tab) => `<section class="learning-growth-tab-panel${tab.id === first ? " active" : ""}" data-learning-growth-tab-panel="${escapeHtml(tab.id)}" role="tabpanel"${tab.id === first ? "" : " hidden"}>
        ${tab.html}
      </section>`).join("")}
    </section>`;
  }

  function renderOwnerProgramTabs(programUi, coinsHtml, overview = {}, options = {}) {
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      launchOperations: overview.launchOperations,
      learnerId: overview.learner?.id || options.learnerId,
    });
    const execution = programUi.renderExecutionOverview(data, programOptions);
    const guidance = programUi.renderGuidancePanel(data, programOptions);
    const config = [
      programUi.renderFoundationPanel(data, programOptions),
      programUi.renderProgramForm(data, programOptions),
    ].join("");
    const review = [
      programUi.renderLaunchOperationsPanel(data.launchOperations || overview.launchOperations || {}, programOptions),
      programUi.renderParentReportPanel(data, programOptions),
      programUi.renderReviewQueue(data.reviewItems || [], programOptions),
      programUi.renderParentReviewRequests(data.parentReviewRequests || [], programOptions),
    ].join("");
    const rewards = [
      guidance,
      coinsHtml,
      programUi.renderRewardSettlements(data.rewardSettlements || [], programOptions),
    ].join("");
    const system = renderOwnerSystemPanel(overview, options);
    return `<section class="learning-program-section learning-program-parent-admin" data-learning-growth-module="programs" data-learning-growth-category="parent-admin">
      ${renderLearningGrowthTabs([
        { id: "execution", label: "\u6267\u884c", html: execution },
        { id: "config", label: "\u914d\u7f6e", html: config },
        { id: "review", label: "\u5ba1\u6838", html: review },
        { id: "rewards", label: "\u5956\u52b1", html: rewards },
        { id: "system", label: "\u7cfb\u7edf", html: system },
      ], options)}
    </section>`;
  }

  function renderExecutorProgramTabs(programUi, coinsHtml, overview = {}, options = {}) {
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      learnerId: overview.learner?.id || options.learnerId,
    });
    return `<section class="learning-program-section" data-learning-growth-module="programs">
      ${renderLearningGrowthTabs([
        { id: "execution", label: "\u6267\u884c", html: programUi.renderExecutionOverview(data, programOptions) },
        { id: "guidance", label: "\u5206\u6790", html: programUi.renderGuidancePanel(data, programOptions) },
        { id: "coins", label: "\u91d1\u5e01", html: coinsHtml },
      ], options)}
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
    const coinsHtml = coinsUi && typeof coinsUi.renderCoinsSubsystem === "function"
      ? coinsUi.renderCoinsSubsystem(Object.assign({}, options, {
          summary: coins,
          learnerId: learner.id || options.learnerId,
          learnerName: learnerLabel,
        }))
      : `<div class="learning-coin-empty">金币子模块未加载。</div>`;
    const owner = isOwner(options);
    const programsHtml = programUi && typeof programUi.renderExecutionOverview === "function"
      ? (owner
          ? renderOwnerProgramTabs(programUi, coinsHtml, overview, options)
          : renderExecutorProgramTabs(programUi, coinsHtml, overview, options))
      : "";
    const boardHtml = overview.board ? renderLearningGrowthBoard(overview.board, Object.assign({}, options, {
      workspaceId: overview.learner?.workspaceId || options.workspaceId || "",
    })) : "";
    const programs = overview.programs || {};
    const availableCoins = Number(coins.balances?.availableCoins || 0);
    const pendingTasks = countPendingTasks(programs);
    const reviewCount = countReflectionOrReview(programs, owner);
    const heroCopy = owner
      ? "\u6309\u6267\u884c\u3001\u5ba1\u6838\u3001\u5956\u52b1\u548c\u7cfb\u7edf\u5206\u533a\u67e5\u770b\uff0c\u91cd\u70b9\u76ef\u4efb\u52a1\u72b6\u6001\u3001AI \u6279\u6539\u3001\u5f55\u97f3\u590d\u76d8\u548c\u5956\u52b1\u7ed3\u7b97\u3002"
      : "\u67e5\u770b\u5f85\u6267\u884c\u4efb\u52a1\u3001AI \u6279\u6539\u3001\u4fee\u8ba2\u8981\u6c42\u3001\u5f55\u97f3\u590d\u76d8\u548c\u91d1\u5e01\u5956\u52b1\u72b6\u6001\u3002";
    return `<div class="learning-growth-view" data-learning-product="fanfan-growth" data-learning-role="${owner ? "owner" : "executor"}">
      <section class="learning-growth-shell-hero">
        <div class="learning-growth-hero-copy">
          <div class="learning-coin-eyebrow">${escapeHtml(owner ? (moduleInfo.currentEntry || "成长入口") : "成长")}</div>
          <h2>${escapeHtml(moduleInfo.title || "凡凡成长系统")}</h2>
          <p>${escapeHtml(heroCopy)}</p>
        </div>
        <div class="learning-growth-shell-metrics" aria-label="\u6210\u957f\u6982\u89c8">
          ${renderGrowthMetric("\u5b66\u4e60\u5bf9\u8c61", learnerLabel, owner ? "Owner \u89c6\u56fe" : "\u6267\u884c\u89c6\u56fe", options)}
          ${renderGrowthMetric("\u5f85\u6267\u884c", String(pendingTasks), "\u4eca\u65e5\u4efb\u52a1\u4e0e\u672a\u5b8c\u6210\u5361", options)}
          ${renderGrowthMetric("7 \u5929\u91d1\u5e01", String(metrics.sevenDayCoins || coins.growth?.sevenDayCoins || availableCoins || 0), "\u5956\u52b1\u8d8b\u52bf", options)}
          ${renderGrowthMetric(owner ? "\u5f85\u5904\u7406" : "\u5f85\u590d\u76d8", String(reviewCount || metrics.pendingRedemptions || 0), owner ? "\u5ba1\u6838\u3001\u7ed3\u7b97\u6216\u5151\u6362" : "\u5f55\u97f3\u590d\u76d8\u6216\u4fee\u8ba2", options)}
        </div>
        ${renderGrowthWorkflow(options)}
      </section>
      ${boardHtml}
      ${programsHtml}
    </div>`;
  }

  return {
    renderCapabilityCards,
    renderLearningGrowthTabs,
    renderLearningGrowthBoard,
    renderLearningGrowthView,
    renderNextModules,
    renderOwnerSystemPanel,
    renderPlatformStrip,
    renderReadinessPanel,
  };
}));
