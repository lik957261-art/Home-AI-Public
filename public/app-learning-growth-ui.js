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

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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

  function formatGrowthCoins(value) {
    if (CoinsUi && typeof CoinsUi.formatCoins === "function") return CoinsUi.formatCoins(value);
    const amount = Number(value || 0);
    return `${Number.isFinite(amount) ? amount : 0} \u91d1\u5e01`;
  }

  function averageCoinsForWindow(coins = {}, metrics = {}, days = 7) {
    const totalField = days === 30 ? "thirtyDayCoins" : "sevenDayCoins";
    const total = Number(metrics?.[totalField] ?? coins?.growth?.[totalField] ?? 0);
    return Number.isFinite(total) ? Math.round(total / days) : 0;
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
    if (value === "ready") return "\u5f53\u524d";
    if (value === "waiting_ai") return "\u7b49\u5f85 AI";
    if (value === "needs_revision") return "\u5f85\u4fee\u8ba2";
    if (value === "reflection_required") return "\u5f85\u590d\u76d8";
    if (value === "locked_until") return "\u9501\u5b9a";
    if (value === "completed_recent") return "\u6700\u8fd1\u5b8c\u6210";
    return fallback || value || "\u4efb\u52a1";
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

  function taskRewardCapCoins(task = {}) {
    const policy = task.rewardPolicy || {};
    const value = Number(task.rewardCapCoins || policy.maxCoins || policy.rewardCapCoins || 100);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 100;
  }

  function cardRewardText(card = {}) {
    const settlement = card.latestRewardSettlement || card.rewardSettlement || null;
    const coinAmount = Number(settlement?.coinAmount || 0);
    const amount = Number.isFinite(coinAmount) && coinAmount > 0 ? Math.round(coinAmount) : 0;
    const status = String(settlement?.status || "");
    if (amount && status === "settled") return `\u5df2\u5f97 ${amount} \u91d1\u5e01`;
    if (amount && (status === "ready" || status === "pending_review")) return `\u5f85\u7ed3\u7b97 ${amount} \u91d1\u5e01`;
    return `\u5956\u52b1 ${taskRewardCapCoins(card)} \u91d1\u5e01`;
  }

  function cardOpenTimeText(card = {}) {
    const value = String(card.openedAt || card.generatedAt || card.availableAt || card.createdAt || card.plannedDate || "").trim();
    if (!value) return "";
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) {
      const date = new Date(ms);
      const pad = (number) => String(number).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    const normalized = value.replace("T", " ");
    return normalized.length > 16 ? normalized.slice(0, 16) : normalized;
  }

  function cardPublishedAgeText(card = {}) {
    const decay = card.rewardDecay || {};
    if (decay.ageLabel) return decay.ageLabel;
    const value = String(card.openedAt || card.generatedAt || card.availableAt || card.createdAt || card.plannedDate || "").trim();
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "";
    const hours = Math.max(0, Math.floor((Date.now() - ms) / (60 * 60 * 1000)));
    if (hours < 48) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainder = hours % 24;
    return remainder ? `${days}d ${remainder}h` : `${days}d`;
  }

  function isCompletedBoardCard(card = {}) {
    const status = String(card.status || card.executionStatus || card.laneId || card.nextAction || card.primaryAction || "").trim().toLowerCase();
    return ["completed", "complete", "done", "settled", "completed_recent"].includes(status);
  }

  function rewardDecayClass(card = {}) {
    const severity = String(card.rewardDecay?.severity || "");
    if (severity === "warning") return " is-reward-warning";
    if (severity === "danger") return " is-reward-danger";
    return "";
  }

  function rewardDecayText(card = {}) {
    const decay = card.rewardDecay || {};
    if (!decay.applies) return "";
    if (decay.severity === "warning" || decay.severity === "danger") {
      const rate = Number(decay.dailyPenaltyPercent || 0);
      const current = Number(decay.effectiveRewardCapCoins || 0);
      const total = Number(decay.rewardCapCoins || taskRewardCapCoins(card));
      return `已发布 ${cardPublishedAgeText(card)} · 每日 -${rate}% · 当前 ${current}/${total}`;
    }
    return "规则 48h 黄 -5%/日，72h 红 -10%/日";
  }

  function boardRewardDecayRule(board = {}) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    if (!cards.some((card) => card?.rewardDecay?.applies)) return "";
    const hasDanger = cards.some((card) => String(card?.rewardDecay?.severity || "") === "danger");
    const hasWarning = cards.some((card) => String(card?.rewardDecay?.severity || "") === "warning");
    const severityClass = hasDanger ? " is-danger" : hasWarning ? " is-warning" : "";
    return `<div class="learning-growth-board-decay-rule${severityClass}">
      <strong>超时规则</strong>
      <span>发布 48 小时后每日扣 5%，72 小时后每日扣 10%。</span>
    </div>`;
  }

  function renderArtifactCountPill(card = {}, artifacts = 0, escapeHtml = defaultEscapeHtml) {
    const directoryPath = String(card.artifactDirectoryPath || "").trim();
    if (!artifacts || !directoryPath) return "";
    return `<button type="button" class="learning-growth-board-artifact-link" data-learning-growth-artifact-link data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(card.title || "\u4ea4\u4ed8\u76ee\u5f55")}" aria-label="\u6253\u5f00\u4ea4\u4ed8\u76ee\u5f55" title="\u6253\u5f00\u4ea4\u4ed8\u76ee\u5f55"><span class="learning-growth-board-artifact-icon" aria-hidden="true"></span></button>`;
  }

  function renderHistoryPill(card = {}, escapeHtml = defaultEscapeHtml) {
    const taskCardId = String(card.taskCardId || card.id || "").trim();
    if (!taskCardId) return "";
    return `<button type="button" class="learning-growth-board-history-link" data-learning-open-growth-history="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(card.workspaceId || "")}" aria-label="\u67e5\u770b\u540c\u7cfb\u5217\u5386\u53f2\u5361\u7247" title="\u67e5\u770b\u540c\u7cfb\u5217\u5386\u53f2\u5361\u7247"><span aria-hidden="true"></span></button>`;
  }

  function renderBoardCard(card = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(card.taskCardId || "");
    const workspaceId = String(card.workspaceId || options.workspaceId || "");
    const evaluation = card.latestEvaluation || {};
    const score = Number(evaluation.score);
    const scoreText = Number.isFinite(score) && score > 0 ? `${Math.round(score)} \u5206` : "";
    const artifacts = Number(card.artifactCount || 0);
    const completed = isCompletedBoardCard(card);
    const openTime = completed ? "" : cardOpenTimeText(card);
    const ageText = completed ? "" : cardPublishedAgeText(card);
    return `<article class="learning-growth-board-card${rewardDecayClass(card)}" data-learning-executable-task-id="${escapeHtml(taskCardId)}" data-learning-open-growth-task="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(workspaceId)}">
      <div class="learning-growth-board-card-head">
        <button type="button" class="learning-growth-board-card-title" data-learning-open-growth-task="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(workspaceId)}">
          <strong>${escapeHtml(card.title || taskCardId || "\u5b66\u4e60\u4efb\u52a1")}</strong>
          <small data-learning-growth-board-card-reward="${escapeHtml(taskCardId)}">${escapeHtml(cardRewardText(card))}</small>
        </button>
        <span>${escapeHtml(boardStatusText(card))}</span>
      </div>
      ${card.instructionPreview ? `<p class="learning-growth-board-card-preview">${escapeHtml(card.instructionPreview)}</p>` : ""}
      <div class="learning-growth-board-card-meta">
        ${card.activityType ? `<small>${escapeHtml(card.activityType)}</small>` : ""}
        ${openTime ? `<small>${escapeHtml(openTime)}${ageText ? ` · \u5df2\u53d1\u5e03 ${escapeHtml(ageText)}` : ""}</small>` : ""}
        ${scoreText ? `<small>${escapeHtml(scoreText)}</small>` : ""}
        ${renderArtifactCountPill(card, artifacts, escapeHtml)}
        ${renderHistoryPill(card, escapeHtml)}
      </div>
    </article>`;
  }

  function renderLearningGrowthBoard(board = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const cards = Array.isArray(board.cards) ? board.cards : [];
    const cardById = new Map(cards.map((card) => [String(card.taskCardId || ""), card]));
    const lanes = Array.isArray(board.lanes) ? board.lanes : [];
    if (!lanes.length) return `<section class="learning-growth-board"><div class="learning-coin-empty">\u6682\u65e0\u6210\u957f\u4efb\u52a1\u3002</div></section>`;
    const laneModels = lanes.map((lane) => {
      const laneCards = (Array.isArray(lane.cards) ? lane.cards : [])
        .map((id) => cardById.get(String(id || "")))
        .filter(Boolean);
      return Object.assign({}, lane, {
        id: String(lane.id || ""),
        count: Number(lane.count ?? laneCards.length) || laneCards.length,
        laneCards,
      });
    });
    const requestedLane = String(options.activeGrowthBoardLane || "").trim();
    const visibleLaneModels = laneModels.filter((lane) => lane.count > 0);
    const displayLaneModels = visibleLaneModels.length ? visibleLaneModels : laneModels;
    const fallbackLane = displayLaneModels.find((lane) => lane.count > 0)?.id || displayLaneModels[0]?.id || "";
    const activeLaneId = displayLaneModels.some((lane) => lane.id === requestedLane) ? requestedLane : fallbackLane;
    return `<section class="learning-growth-board" data-learning-growth-board>
      <div class="learning-growth-board-status-filter" role="tablist" aria-label="\u6210\u957f\u4efb\u52a1\u72b6\u6001">
        ${displayLaneModels.map((lane) => {
          const active = lane.id === activeLaneId;
          return `<button type="button" class="learning-growth-board-status-chip${active ? " active" : ""}" role="tab" aria-selected="${active ? "true" : "false"}" data-learning-growth-board-filter="${escapeHtml(lane.id)}">
            <strong>${escapeHtml(boardLaneTitle(lane.id, lane.title))}</strong>
            <span>${escapeHtml(String(lane.count))}</span>
          </button>`;
        }).join("")}
      </div>
      ${boardRewardDecayRule(board)}
      <div class="learning-growth-board-lanes" data-growth-board-active-lane="${escapeHtml(activeLaneId)}">
        ${displayLaneModels.map((lane) => {
          const active = lane.id === activeLaneId;
          return `<section class="learning-growth-board-lane${active ? " active" : ""}" data-growth-board-lane="${escapeHtml(lane.id)}" data-learning-growth-board-panel="${escapeHtml(lane.id)}"${active ? "" : " hidden"}>
            ${lane.laneCards.length
              ? lane.laneCards.map((card) => renderBoardCard(card, options)).join("")
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
    const requestedRaw = String(options.activeTab || options.state?.learningGrowthActiveTab || "").trim();
    const aliases = { settings: "overview", "new-task": "tasks", "reward-settlement": "rewards", "ai-summary": "ai-analysis" };
    const requested = aliases[requestedRaw] || requestedRaw;
    const activeId = visible.some((tab) => tab.id === requested) ? requested : first;
    return `<section class="learning-growth-tabs" data-learning-growth-tabs>
      <div class="learning-growth-tab-list" role="tablist" aria-label="\u590d\u7528\u7684\u5e73\u53f0\u80fd\u529b">
        ${visible.map((tab) => `<button type="button" role="tab" data-learning-growth-tab="${escapeHtml(tab.id)}" aria-selected="${tab.id === activeId ? "true" : "false"}" class="${tab.id === activeId ? "active" : ""}">${escapeHtml(tab.label)}</button>`).join("")}
      </div>
      ${visible.map((tab) => `<section class="learning-growth-tab-panel${tab.id === activeId ? " active" : ""}" data-learning-growth-tab-panel="${escapeHtml(tab.id)}" role="tabpanel"${tab.id === activeId ? "" : " hidden"}>
        ${tab.html}
      </section>`).join("")}
    </section>`;
  }

  function renderOwnerSettingsOverview(programUi, coinsHtml, overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      launchOperations: overview.launchOperations,
      learnerId: overview.learner?.id || options.learnerId,
    });
    const coins = options.coins || overview.coins || {};
    const growth = coins.growth || {};
    const counts = data.launchOperations?.counts || {};
    const cards = asArray(overview.board?.cards);
    const completed = cards.filter((card) => /complete|completed|done/i.test(String(card?.status || card?.nextAction || ""))).length;
    const activeTasks = cards.filter((card) => !/complete|completed|done/i.test(String(card?.status || card?.nextAction || ""))).length;
    const earned = Number(growth.totalEarnedCoins || coins.balances?.earnedCoins || 0);
    const sevenDayAverage = averageCoinsForWindow(coins, overview.metrics || {}, 7);
    const thirtyDayAverage = averageCoinsForWindow(coins, overview.metrics || {}, 30);
    return `<section class="learning-settings-overview" data-learning-settings-overview>
      <div class="learning-settings-kpi-grid">
        <span><small>执行者</small><strong>${escapeHtml(overview.learner?.displayName || overview.learner?.id || options.learnerId || "执行者")}</strong></span>
        <span><small>当前任务</small><strong>${escapeHtml(String(activeTasks))}</strong></span>
        <span><small>已完成</small><strong>${escapeHtml(String(completed || counts.completedTasks || 0))}</strong></span>
        <span><small>累计金币</small><strong>${escapeHtml(String(Math.round(earned || 0)))}</strong></span>
        <span><small>7日均值</small><strong>${escapeHtml(String(sevenDayAverage))}</strong></span>
        <span><small>30日均值</small><strong>${escapeHtml(String(thirtyDayAverage))}</strong></span>
        <span><small>待结算</small><strong>${escapeHtml(String(counts.pendingRewardSettlements || 0))}</strong></span>
      </div>
      ${programUi.renderLaunchOperationsPanel(data.launchOperations || overview.launchOperations || {}, Object.assign({}, programOptions, { compactOwnerSettings: true }))}
    </section>`;
  }

  function renderOwnerSettingsFold(title, meta, html, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!html) return "";
    return `<details class="learning-settings-fold" data-learning-settings-fold>
      <summary><strong>${escapeHtml(title)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</summary>
      <div class="learning-settings-fold-body">${html}</div>
    </details>`;
  }

  function renderOwnerTaskList(overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const tasks = uniqueRewardTasks(overview).slice(0, 80);
    if (!tasks.length) return `<div class="learning-coin-empty">暂无任务。</div>`;
    return `<section class="learning-coin-panel learning-settings-task-list" data-learning-settings-task-list>
      <div class="learning-section-heading">
        <h3>当前任务</h3>
        <span>${escapeHtml(String(tasks.length))}</span>
      </div>
      <div class="learning-settings-task-rows">
        ${tasks.map((task) => {
          const taskCardId = String(task.taskCardId || task.id || "");
          const workspaceId = String(task.workspaceId || overview.learner?.workspaceId || options.workspaceId || "");
          const generated = cardOpenTimeText(task);
          return `<button type="button" class="learning-settings-task-row" data-learning-open-settings-task="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(workspaceId)}">
            <span>
              <strong>${escapeHtml(task.title || taskCardId)}</strong>
              <small>${escapeHtml([task.templateId || task.taskModel?.templateId || "", task.status || task.nextAction || "", generated ? `开放 ${generated}` : ""].filter(Boolean).join(" / "))}</small>
            </span>
            <em>查看</em>
          </button>`;
        }).join("")}
      </div>
    </section>`;
  }

  function ownerSettingsTaskById(overview = {}, taskCardId = "") {
    const id = String(taskCardId || "");
    if (!id) return null;
    return uniqueRewardTasks(overview).find((task) => String(task.taskCardId || task.id || "") === id) || null;
  }

  function ownerSettingsTaskSeries(overview = {}, task = {}) {
    const key = taskSeriesKey(task);
    return uniqueRewardTasks(overview)
      .filter((item) => taskSeriesKey(item) === key)
      .sort((left, right) => {
        const leftTime = Date.parse(left.completedAt || left.updatedAt || left.createdAt || left.openedAt || "") || 0;
        const rightTime = Date.parse(right.completedAt || right.updatedAt || right.createdAt || right.openedAt || "") || 0;
        return rightTime - leftTime;
      });
  }

  function renderOwnerSettingsTaskDetail(overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskId = String(options.state?.learningGrowthSettingsTaskId || "");
    const task = ownerSettingsTaskById(overview, taskId);
    if (!task) {
      return `<section class="learning-coin-panel learning-settings-task-detail" data-learning-settings-task-detail>
        <button type="button" class="learning-settings-back" data-learning-settings-task-back>返回任务列表</button>
        <div class="learning-coin-empty">这项任务已更新或不在当前列表里。</div>
      </section>`;
    }
    const series = ownerSettingsTaskSeries(overview, task);
    const completed = series.filter((item) => /complete|completed|done/i.test(String(item.status || item.nextAction || "")));
    const latest = series.slice(0, 6);
    const instruction = task.learnerInstruction || task.instruction || task.taskModel?.learnerInstruction || task.summary || task.description || "";
    const goal = task.goalSummary || task.taskModel?.goalSummary || task.acceptance?.[0] || task.taskModel?.acceptance?.[0] || instruction;
    const nextSuggestion = task.learningGrowthGenerationReport?.goal
      || task.learningGrowthJitGeneration?.goal
      || task.learningGrowthJitGeneration?.decision
      || task.nextRecommendation
      || "建议在 AI分析 标签刷新学习总结后，再决定下一张卡的方向。";
    return `<section class="learning-coin-panel learning-settings-task-detail" data-learning-settings-task-detail>
      <button type="button" class="learning-settings-back" data-learning-settings-task-back>返回任务列表</button>
      <div class="learning-section-heading">
        <h3>${escapeHtml(task.title || taskId)}</h3>
        <span>${escapeHtml(task.status || task.nextAction || "未定")}</span>
      </div>
      <div class="learning-settings-task-detail-grid">
        <span><small>系列</small><strong>${escapeHtml(taskSeriesLabel({ title: task.title, templateId: task.templateId || task.taskModel?.templateId, skillId: task.skillId }))}</strong></span>
        <span><small>已生成</small><strong>${escapeHtml(String(series.length))}</strong></span>
        <span><small>已完成</small><strong>${escapeHtml(String(completed.length))}</strong></span>
        <span><small>奖励</small><strong>${escapeHtml(String(taskRewardCapCoins(task)))}</strong></span>
      </div>
      <div class="learning-settings-task-detail-block">
        <h4>目标</h4>
        <p>${escapeHtml(goal || "暂无目标摘要。")}</p>
      </div>
      <div class="learning-settings-task-detail-block">
        <h4>当前状态</h4>
        <p>${escapeHtml([task.activityType || "", task.skillId || "", cardOpenTimeText(task) ? `开放 ${cardOpenTimeText(task)}` : ""].filter(Boolean).join(" / ") || "暂无状态摘要。")}</p>
      </div>
      <div class="learning-settings-task-detail-block">
        <h4>已生成卡片</h4>
        ${latest.length ? latest.map((item) => `<p>${escapeHtml([item.title || item.taskCardId || item.id, item.status || item.nextAction || "", cardOpenTimeText(item) ? `开放 ${cardOpenTimeText(item)}` : ""].filter(Boolean).join(" / "))}</p>`).join("") : `<p>暂无卡片记录。</p>`}
      </div>
      <div class="learning-settings-task-detail-block">
        <h4>后续建议</h4>
        <p>${escapeHtml(nextSuggestion)}</p>
      </div>
    </section>`;
  }

  function renderOwnerTaskManagement(programUi, overview = {}, options = {}) {
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      launchOperations: overview.launchOperations,
      learnerId: overview.learner?.id || options.learnerId,
    });
    if (options.state?.learningGrowthSettingsTaskId) {
      return renderOwnerSettingsTaskDetail(overview, options);
    }
    const scopeHtml = renderOwnerSettingsFold("\u5b66\u4e60\u8303\u56f4", "\u76ee\u6807 / \u5185\u5bb9", programUi.renderProgramForm(data, programOptions), options);
    return [
      `<section class="learning-coin-panel learning-settings-task-create is-settings-tab-intro" data-learning-settings-task-create>
        <div class="learning-section-heading">
          <h3>任务管理</h3>
          <span>范围 / 列表</span>
        </div>
        <p class="learning-growth-muted">学习范围与当前任务列表。</p>
      </section>`,
      scopeHtml,
      renderOwnerTaskList(overview, options),
    ].join("");
  }

  function renderOwnerRewardDashboard(programUi, coinsHtml, overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      learnerId: overview.learner?.id || options.learnerId,
    });
    const coins = options.coins || overview.coins || {};
    const growth = coins.growth || {};
    const balances = coins.balances || {};
    const settlements = asArray(data.rewardSettlements);
    const settled = settlements.filter((item) => String(item.status || "") === "settled");
    const settledCoins = settled.reduce((sum, item) => sum + (Number(item.coinAmount) || 0), 0);
    const averageSettled = settled.length ? Math.round(settledCoins / settled.length) : 0;
    const sevenDayAverage = averageCoinsForWindow(coins, overview.metrics || {}, 7);
    const thirtyDayAverage = averageCoinsForWindow(coins, overview.metrics || {}, 30);
    const policyHtml = renderOwnerSettingsFold("奖励规则", "按系列", renderOwnerRewardPolicySettings(overview, options), options);
    const settlementsHtml = renderOwnerSettingsFold("结算记录", String(settlements.length), programUi.renderRewardSettlements(data.rewardSettlements || [], programOptions), options);
    const stats = `<section class="learning-coin-panel learning-settings-reward-stats" data-learning-settings-reward-stats>
      <div class="learning-section-heading">
        <h3>奖励统计</h3>
        <span>执行者</span>
      </div>
      <div class="learning-settings-reward-rows">
        <span><small>累计金币</small><strong>${escapeHtml(String(Math.round(Number(growth.totalEarnedCoins || balances.earnedCoins || 0) || 0)))}</strong></span>
        <span><small>7日均值</small><strong>${escapeHtml(String(sevenDayAverage))}</strong></span>
        <span><small>30日均值</small><strong>${escapeHtml(String(thirtyDayAverage))}</strong></span>
        <span><small>已结算次数</small><strong>${escapeHtml(String(settled.length))}</strong></span>
        <span><small>平均每次</small><strong>${escapeHtml(String(averageSettled))}</strong></span>
      </div>
    </section>`;
    return [
      stats,
      policyHtml,
      settlementsHtml,
    ].join("");
  }

  function masteryStatusText(status = "") {
    const key = String(status || "").trim();
    if (key === "mastered") return "\u5df2\u638c\u63e1";
    if (key === "practicing") return "\u7ec3\u4e60\u4e2d";
    if (key === "needs_repair") return "\u9700\u4fee\u590d";
    if (key === "emerging") return "\u521a\u51fa\u73b0";
    if (key === "not_observed") return "\u672a\u89c2\u5bdf";
    return key || "\u672a\u5b9a";
  }

  function masteryStrategyText(strategy = "") {
    const key = String(strategy || "").trim();
    if (key === "repair") return "\u4fee\u590d";
    if (key === "stretch") return "\u62d3\u5c55";
    if (key === "stabilize") return "\u5de9\u56fa";
    if (key === "review") return "\u590d\u4e60";
    if (key === "observe") return "\u89c2\u5bdf";
    return key || "\u5f85\u5b9a";
  }

  function masteryDomainText(domain = "") {
    const key = String(domain || "").trim();
    if (key === "english") return "\u82f1\u8bed";
    if (key === "math") return "\u6570\u5b66";
    if (key === "science") return "\u79d1\u5b66";
    if (key === "computer_science") return "\u8ba1\u7b97\u673a\u79d1\u5b66";
    if (key === "learning_habit") return "\u5b66\u4e60\u4e60\u60ef";
    return key || "\u7efc\u5408";
  }

  function renderMasteryRows(states = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const rows = asArray(states);
    if (!rows.length) return `<div class="learning-coin-empty">\u6682\u65e0\u53ef\u5ba1\u8ba1\u7684\u80fd\u529b\u753b\u50cf\u8bb0\u5f55\u3002</div>`;
    return `<div class="learning-mastery-state-list">
      ${rows.map((state) => {
        const confidence = Math.round((Number(state.confidence) || 0) * 100);
        const evidence = Number(state.evidenceCount || 0) || 0;
        const strategy = masteryStrategyText(state.nextRecommendation?.strategy || "");
        const meta = [
          state.strand || "",
          state.externalLevelReference || "",
          evidence ? `${evidence} \u6761\u8bc1\u636e` : "\u6682\u65e0\u8bc1\u636e",
          confidence ? `${confidence}%` : "",
        ].filter(Boolean).join(" / ");
        const weakness = asArray(state.weaknesses).find(Boolean);
        const strength = asArray(state.strengths).find(Boolean);
        const evidenceSummary = asArray(state.evidenceSummary).map((item) => item?.summary || "").find(Boolean);
        const description = strength || weakness || evidenceSummary || state.summary || "";
        return `<article class="learning-mastery-state-row" data-learning-mastery-skill="${escapeHtml(state.skillId || "")}" data-learning-mastery-status="${escapeHtml(state.status || "")}">
          <div>
            <strong>${escapeHtml(state.displayName || state.skillId || state.microSkillId || "\u80fd\u529b\u70b9")}</strong>
            <small>${escapeHtml(meta)}</small>
            ${description ? `<p>${escapeHtml(description)}</p>` : ""}
          </div>
          <span>
            <em>${escapeHtml(masteryStatusText(state.status))}</em>
            <small>${escapeHtml(strategy)}</small>
          </span>
        </article>`;
      }).join("")}
    </div>`;
  }

  function renderMasteryDomainSections(states = [], domainSummary = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const rows = asArray(states);
    if (!rows.length) return renderMasteryRows(rows, options);
    const order = ["english", "math", "science", "computer_science", "learning_habit"];
    const grouped = rows.reduce((acc, state) => {
      const key = String(state.domain || "general").trim() || "general";
      if (!acc[key]) acc[key] = [];
      acc[key].push(state);
      return acc;
    }, {});
    const summaryByDomain = new Map(asArray(domainSummary).map((item) => [String(item.domain || "").trim(), item]));
    const domains = Object.keys(grouped).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return `<div class="learning-mastery-domain-switcher" data-learning-mastery-domain-switcher>
      ${domains.map((domain, index) => `<input class="learning-mastery-domain-radio" type="radio" name="learning-mastery-domain" id="learning-mastery-domain-${index}"${index === 0 ? " checked" : ""}>`).join("")}
      <div class="learning-mastery-domain-tabs" data-learning-mastery-domain-tabs aria-label="\u79d1\u76ee\u753b\u50cf">
        ${domains.map((domain, index) => {
          const summary = summaryByDomain.get(domain) || {};
          const observed = Number(summary.observed || grouped[domain].filter((state) => state.evidenceCount > 0).length) || 0;
          const total = Number(summary.total || grouped[domain].length) || grouped[domain].length;
          return `<label class="learning-mastery-domain-tab" data-learning-mastery-domain-tab="${escapeHtml(domain)}" for="learning-mastery-domain-${index}">
            <span>${escapeHtml(masteryDomainText(domain))}</span>
            <small>${escapeHtml(String(observed))}/${escapeHtml(String(total))}</small>
          </label>`;
        }).join("")}
      </div>
      <div class="learning-mastery-domain-panel-list">
      ${domains.map((domain, index) => {
        const summary = summaryByDomain.get(domain) || {};
        const observed = Number(summary.observed || grouped[domain].filter((state) => state.evidenceCount > 0).length) || 0;
        const total = Number(summary.total || grouped[domain].length) || grouped[domain].length;
        return `<section class="learning-mastery-domain-section" data-learning-mastery-domain="${escapeHtml(domain)}" data-learning-mastery-domain-index="${escapeHtml(String(index))}">
          <div class="learning-mastery-domain-heading">
            <strong>${escapeHtml(masteryDomainText(domain))}</strong>
            <span>${escapeHtml(String(observed))}/${escapeHtml(String(total))} \u5df2\u89c2\u5bdf</span>
          </div>
          ${renderMasteryRows(grouped[domain], options)}
        </section>`;
      }).join("")}
      </div>
    </div>`;
  }

  function renderOwnerMasteryProfile(overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const payload = options.masteryProfile || overview.masteryProfile || {};
    const profile = payload.masteryProfile || payload.profile || payload || {};
    const trajectory = asArray(payload.trajectory || overview.masteryTrajectory);
    const states = asArray(profile.skillStates || profile.states);
    const strengths = asArray(profile.strengths);
    const weaknesses = asArray(profile.weaknesses);
    const domainSummary = asArray(profile.domainSummary);
    const loading = Boolean(options.masteryProfileLoading);
    const error = String(options.masteryProfileError || "");
    return `<section class="learning-coin-panel learning-mastery-profile-panel" data-learning-mastery-profile-panel>
      <div class="learning-section-heading">
        <h3>\u5b66\u4e60\u753b\u50cf</h3>
        <span>${escapeHtml(profile.taxonomyVersion || "\u80fd\u529b\u8bc1\u636e")}</span>
      </div>
      <div class="learning-settings-kpi-grid learning-mastery-kpi-grid">
        <span><small>\u80fd\u529b\u70b9</small><strong>${escapeHtml(String(states.length))}</strong></span>
        <span><small>\u4f18\u52bf</small><strong>${escapeHtml(String(strengths.length))}</strong></span>
        <span><small>\u9700\u4fee\u590d</small><strong>${escapeHtml(String(weaknesses.length))}</strong></span>
        <span><small>\u8f68\u8ff9</small><strong>${escapeHtml(String(trajectory.length))}</strong></span>
      </div>
      ${loading ? `<div class="learning-growth-muted">\u6b63\u5728\u5237\u65b0\u753b\u50cf...</div>` : ""}
      ${error ? `<div class="learning-error">${escapeHtml(error)}</div>` : ""}
      ${renderMasteryDomainSections(states, domainSummary, options)}
    </section>`;
  }

  function renderOwnerProgramTabs(programUi, coinsHtml, overview = {}, options = {}) {
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      launchOperations: overview.launchOperations,
      learnerId: overview.learner?.id || options.learnerId,
    });
    return `<section class="learning-program-section learning-program-parent-admin learning-growth-settings-tabs" data-learning-growth-module="programs" data-learning-growth-category="parent-admin" data-learning-growth-owner-management>
      ${renderLearningGrowthTabs([
        { id: "overview", label: "总览", html: renderOwnerSettingsOverview(programUi, coinsHtml, overview, options) },
        { id: "mastery", label: "\u753b\u50cf", html: renderOwnerMasteryProfile(overview, options) },
        { id: "tasks", label: "任务", html: renderOwnerTaskManagement(programUi, overview, options) },
        { id: "rewards", label: "奖励", html: renderOwnerRewardDashboard(programUi, coinsHtml, overview, options) },
        { id: "ai-analysis", label: "AI分析", html: renderOwnerAiSummaryRecommendationsPanel(data, programOptions) },
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

  function uniqueRewardTasks(overview = {}) {
    const seen = new Set();
    return [
      ...asArray(overview.board?.cards),
      ...asArray(overview.programs?.taskCards),
      ...asArray(overview.programs?.executableTasks),
    ].filter((task) => {
      const id = String(task?.taskCardId || task?.id || "");
      if (!id || seen.has(id) || task?.readOnly || id.startsWith("legacy_todo:")) return false;
      seen.add(id);
      return true;
    });
  }

  function taskSeriesKey(task = {}) {
    return String(task.sequenceGroupId || task.programId || task.templateId || task.taskModel?.templateId || task.taskCardId || task.id || "").trim();
  }

  function taskSeriesLabel(series = {}) {
    if (series.templateId === "english-speaking-retell-v1") return "\u82f1\u8bed\u9605\u8bfb\u590d\u8ff0";
    if (series.templateId === "english-short-writing-v1") return "\u82f1\u8bed\u77ed\u5199\u4f5c";
    if (series.templateId === "english-vocabulary-active-use-v1") return "\u82f1\u8bed\u8bcd\u6c47\u6d3b\u7528";
    return series.title || series.skillId || series.templateId || "\u5b66\u4e60\u4efb\u52a1\u7cfb\u5217";
  }

  function rewardTaskSeries(overview = {}) {
    const groups = new Map();
    uniqueRewardTasks(overview).forEach((task) => {
      const key = taskSeriesKey(task);
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          ids: [],
          title: task.title,
          templateId: task.templateId || task.taskModel?.templateId || "",
          skillId: task.skillId || asArray(task.skillIds)[0] || "",
          activityType: task.activityType || "",
          sequenceGroupId: task.sequenceGroupId || "",
          coins: taskRewardCapCoins(task),
        });
      }
      const group = groups.get(key);
      const id = String(task.taskCardId || task.id || "");
      if (id && !group.ids.includes(id)) group.ids.push(id);
      group.coins = taskRewardCapCoins(task);
    });
    return [...groups.values()].sort((a, b) => taskSeriesLabel(a).localeCompare(taskSeriesLabel(b), "zh-Hans-CN"));
  }

  function renderOwnerRewardPolicySettings(overview = {}, options = {}) {
    if (!isOwner(options)) return "";
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const series = rewardTaskSeries(overview).slice(0, 40);
    if (!series.length) return "";
    return `<section class="learning-coin-panel learning-task-reward-policy-settings" data-learning-task-reward-policy-settings>
      <div class="learning-section-heading">
        <h3>\u5956\u52b1\u89c4\u5219</h3>
        <span>\u6309\u7cfb\u5217</span>
      </div>
      <p class="learning-growth-muted">\u540c\u4e00\u4e2a\u4efb\u52a1\u7cfb\u5217\u5171\u7528\u4e00\u4e2a\u91d1\u5e01\u6570\uff0c\u4e0d\u518d\u6309\u5355\u5f20\u5361\u7247\u5206\u522b\u8bbe\u7f6e\u3002</p>
      <div class="learning-task-reward-policy-list">
        ${series.map((item) => {
          const ids = item.ids.join(",");
          return `<form class="learning-task-reward-policy-form compact" data-learning-task-reward-policy-series-form="${escapeHtml(ids)}">
            <div>
              <strong>${escapeHtml(taskSeriesLabel(item))}</strong>
              <span>${escapeHtml([item.templateId, item.skillId, `${item.ids.length} \u5f20\u5361`].filter(Boolean).join(" · "))}</span>
            </div>
            <label><span>\u91d1\u5e01</span><input class="input" name="maxCoins" type="number" min="1" max="1000" step="1" value="${escapeHtml(String(item.coins))}"></label>
            <button type="submit">\u4fdd\u5b58</button>
            <small data-learning-task-reward-policy-state="${escapeHtml(ids)}" aria-live="polite"></small>
          </form>`;
        }).join("")}
      </div>
    </section>`;
  }

  function renderOwnerAiSummaryRecommendationsPanel(data = {}, options = {}) {
    if (!isOwner(options)) return "";
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const pageState = options.state || {};
    const result = options.aiSummary || pageState.learningAiSummary || null;
    const loading = Boolean(options.aiSummaryLoading || pageState.learningAiSummaryLoading);
    const error = options.aiSummaryError || pageState.learningAiSummaryError || "";
    const progress = pageState.learningAiSummaryProgress || "";
    const series = asArray(result?.recommendedSeries);
    const buttonText = result?.recommendationRunId || result?.generatedAt ? "重新生成 AI 总结" : "生成 AI 总结";
    const creatingId = String(pageState.learningAiDraftCreatingId || "");
    return `<section class="learning-coin-panel learning-ai-summary-panel" data-learning-ai-summary-recommendations>
      <div class="learning-section-heading">
        <h3>AI 总结</h3>
        <span>${escapeHtml(result?.modelStatus || "template-guarded")}</span>
      </div>
      <p class="learning-growth-muted">基于学习记录摘要和当前任务模板推荐任务系列。推荐只生成可审核草稿，不直接发布。</p>
      <div class="learning-program-report-actions">
        <button type="button" data-learning-ai-summary-refresh ${loading ? "disabled" : ""}>${loading ? "分析中..." : buttonText}</button>
      </div>
      ${loading ? `<div class="learning-ai-progress" role="status" aria-live="polite"><span></span><p>${escapeHtml(progress || "\u6b63\u5728\u8bf7\u6a21\u578b\u5206\u6790...")}</p></div>` : ""}
      ${error ? `<div class="learning-error">${escapeHtml(error)}</div>` : ""}
      ${result?.analysisSummary ? `<p class="learning-ai-summary-text">${escapeHtml(result.analysisSummary)}</p>` : ""}
      ${asArray(result?.weakSignals).length ? `<div class="learning-program-chip-row">${asArray(result.weakSignals).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${series.length ? `<div class="learning-ai-recommendation-list">
        ${series.map((item) => {
          const id = String(item.recommendationId || item.id || "");
          const busy = creatingId && creatingId === id;
          return `<article class="learning-ai-recommendation-card">
            <div>
              <strong>${escapeHtml(item.title || item.skillId || "推荐任务系列")}</strong>
              <span>${escapeHtml(item.templateId || "")}</span>
            </div>
            ${item.rationale ? `<p>${escapeHtml(item.rationale)}</p>` : ""}
            ${item.requirements ? `<p>${escapeHtml(item.requirements)}</p>` : ""}
            <div class="learning-growth-board-card-meta">
              <small>${escapeHtml(item.skillId || "")}</small>
              <small>${escapeHtml(item.sequenceMode || "evergreen_jit")}</small>
              ${item.recommendedReadingMinutes ? `<small>阅读 ${escapeHtml(String(item.recommendedReadingMinutes))} 分钟</small>` : ""}
              <small>奖励 ${escapeHtml(String(item.rewardCapCoins || 100))} 金币</small>
            </div>
            <button type="button" data-learning-ai-recommendation-draft="${escapeHtml(id)}" ${busy ? "disabled" : ""}>${busy ? "生成中..." : "生成草稿"}</button>
          </article>`;
        }).join("")}
      </div>` : `<div class="empty-state small">还没有 AI 推荐。点击生成后会显示可审核任务系列。</div>`}
      ${result?.lastDraft?.draft?.draftId ? `<div class="learning-success">已生成草稿：${escapeHtml(result.lastDraft.draft.draftId)}</div>` : ""}
    </section>`;
  }

  function renderOwnerSettingsPage(programUi, coinsUi, overview = {}, options = {}) {
    if (!isOwner(options) || !programUi || typeof renderOwnerProgramTabs !== "function") return "";
    const coins = options.coins || overview.coins || {};
    const learnerId = overview.learner?.id || options.learnerId;
    const coinsHtml = coinsUi && typeof coinsUi.renderCoinsSubsystem === "function"
      ? coinsUi.renderCoinsSubsystem({ summary: coins, learnerId, state: options.state || {}, escapeHtml: optionFn(options, "escapeHtml", defaultEscapeHtml) })
      : "";
    const adminHtml = renderOwnerProgramTabs(programUi, coinsHtml, overview, options);
    if (!adminHtml) return "";
    return `<div class="learning-growth-view learning-growth-settings-page" data-learning-product="fanfan-growth" data-learning-role="owner" data-learning-growth-settings-page>
      ${adminHtml}
    </div>`;
  }

  function findSelectedGrowthTask(programs = {}, taskCardId = "") {
    const id = String(taskCardId || "");
    if (!id) return null;
    const taskCards = Array.isArray(programs.taskCards) ? programs.taskCards : [];
    const executableTasks = Array.isArray(programs.executableTasks) ? programs.executableTasks : [];
    const full = taskCards.find((task) => String(task?.taskCardId || task?.id || "") === id) || null;
    const executable = executableTasks.find((task) => String(task?.taskCardId || task?.id || "") === id) || null;
    if (full && executable) {
      return Object.assign({}, executable, full, {
        nativeState: Object.assign({}, full.nativeState || {}, executable.nativeState || {}),
      });
    }
    return full || executable || null;
  }

  function mergeSelectedGrowthTask(primary = null, boardTask = null) {
    if (!primary) return boardTask;
    if (!boardTask) return primary;
    return Object.assign({}, boardTask, primary, {
      nativeState: Object.assign({}, boardTask.nativeState || {}, primary.nativeState || {}, {
        nextAction: boardTask.nativeState?.nextAction || boardTask.nextAction || primary.nativeState?.nextAction || primary.nextAction || "",
      }),
      latestSubmission: primary.latestSubmission || boardTask.latestSubmission || null,
      latestEvaluation: primary.latestEvaluation || boardTask.latestEvaluation || null,
      latestReflection: primary.latestReflection || boardTask.latestReflection || null,
      latestRewardSettlement: primary.latestRewardSettlement || boardTask.latestRewardSettlement || null,
      artifactCount: primary.artifactCount ?? boardTask.artifactCount,
      laneId: primary.laneId || boardTask.laneId || "",
      nextAction: boardTask.nextAction || primary.nextAction || "",
      primaryAction: boardTask.primaryAction || primary.primaryAction || "",
    });
  }

  function renderSelectedGrowthTaskView(overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const programUi = options.programUi || ProgramUi;
    const programs = overview.programs || {};
    const taskCardId = String(options.selectedGrowthTaskCardId || options.state?.selectedLearningTaskCardId || "");
    const boardFallback = { taskCards: Array.isArray(overview.board?.cards) ? overview.board.cards : [] };
    const task = mergeSelectedGrowthTask(
      findSelectedGrowthTask(programs, taskCardId),
      findSelectedGrowthTask(boardFallback, taskCardId),
    );
    const detail = task && programUi && typeof programUi.renderNativeGrowthTaskDetail === "function"
      ? programUi.renderNativeGrowthTaskDetail(task, programs, options)
      : `<div class="learning-coin-empty">\u8fd9\u5f20\u4efb\u52a1\u5361\u5df2\u66f4\u65b0\u6216\u4e0d\u5728\u5f53\u524d\u72b6\u6001\u91cc\u3002</div>`;
    return `<div class="learning-growth-view learning-growth-task-focus" data-learning-product="fanfan-growth" data-learning-growth-task-focus="${escapeHtml(taskCardId)}">
      ${detail}
    </div>`;
  }

  function findGrowthHistorySeed(overview = {}, taskCardId = "") {
    const id = String(taskCardId || "");
    if (!id) return null;
    return uniqueRewardTasks(overview).find((task) => String(task.taskCardId || task.id || "") === id) || null;
  }

  function relatedGrowthHistoryCards(overview = {}, seed = {}) {
    const key = taskSeriesKey(seed);
    if (!key) return [];
    return uniqueRewardTasks(overview)
      .filter((task) => taskSeriesKey(task) === key)
      .sort((left, right) => {
        const leftTime = Date.parse(left.completedAt || left.updatedAt || left.createdAt || left.openedAt || left.generatedAt || "") || 0;
        const rightTime = Date.parse(right.completedAt || right.updatedAt || right.createdAt || right.openedAt || right.generatedAt || "") || 0;
        return rightTime - leftTime;
      });
  }

  function renderGrowthHistoryPage(overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(options.state?.learningGrowthHistoryTaskCardId || options.historyTaskCardId || "");
    const seed = findGrowthHistorySeed(overview, taskCardId);
    const cards = seed ? relatedGrowthHistoryCards(overview, seed) : [];
    const workspaceId = String(seed?.workspaceId || overview.learner?.workspaceId || options.workspaceId || "");
    return `<div class="learning-growth-view learning-growth-history-page" data-learning-growth-history-page="${escapeHtml(taskCardId)}">
      <section class="learning-coin-panel learning-growth-history-panel">
        <button type="button" class="learning-settings-back" data-learning-growth-history-back>\u8fd4\u56de\u4efb\u52a1</button>
        <div class="learning-section-heading">
          <h3>${escapeHtml(seed ? taskSeriesLabel({ title: seed.title, templateId: seed.templateId || seed.taskModel?.templateId, skillId: seed.skillId }) : "\u5386\u53f2\u5361\u7247")}</h3>
          <span>${escapeHtml(String(cards.length))}</span>
        </div>
        <div class="learning-growth-history-list">
          ${cards.length ? cards.map((card) => {
            const id = String(card.taskCardId || card.id || "");
            const score = Number(card.latestEvaluation?.score);
            const scoreText = Number.isFinite(score) && score > 0 ? `${Math.round(score)} \u5206` : "";
            const timeText = cardOpenTimeText(card);
            return `<button type="button" class="learning-growth-history-row" data-learning-open-growth-task="${escapeHtml(id)}" data-workspace-id="${escapeHtml(card.workspaceId || workspaceId)}">
              <span>
                <strong>${escapeHtml(card.title || id || "\u5b66\u4e60\u4efb\u52a1")}</strong>
                <small>${escapeHtml([card.status || card.nextAction || "", timeText, scoreText].filter(Boolean).join(" / "))}</small>
              </span>
              <em>${escapeHtml(boardStatusText(card))}</em>
            </button>`;
          }).join("") : `<div class="learning-coin-empty">\u6682\u65e0\u540c\u7cfb\u5217\u5386\u53f2\u5361\u7247\u3002</div>`}
        </div>
      </section>
    </div>`;
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
    const owner = isOwner(options);
    if (options.state?.learningGrowthHistoryTaskCardId || options.historyTaskCardId) {
      return renderGrowthHistoryPage(overview, options);
    }
    if (options.selectedGrowthTaskCardId || options.state?.selectedLearningTaskCardId) {
      return renderSelectedGrowthTaskView(overview, options);
    }
    const boardHtml = overview.board ? renderLearningGrowthBoard(overview.board, Object.assign({}, options, {
      workspaceId: overview.learner?.workspaceId || options.workspaceId || "",
    })) : "";
    const programUi = options.programUi || ProgramUi;
    const availableCoins = Number(coins.balances?.availableCoins || 0);
    const historicalCoins = Number(metrics.totalEarnedCoins
      || coins.growth?.totalEarnedCoins
      || coins.balances?.earnedCoins
      || availableCoins
      || 0);
    const coinText = String(Number.isFinite(historicalCoins) ? Math.round(historicalCoins) : 0);
    const sevenDayAverage = averageCoinsForWindow(coins, metrics, 7);
    const thirtyDayAverage = averageCoinsForWindow(coins, metrics, 30);
    const coinsUi = options.coinsUi || CoinsUi;
    if (owner && options.state?.learningGrowthSettingsOpen) {
      return renderOwnerSettingsPage(programUi, coinsUi, overview, options);
    }
    return `<div class="learning-growth-view learning-growth-board-page" data-learning-product="fanfan-growth" data-learning-role="${owner ? "owner" : "executor"}">
      <section class="learning-growth-board-summary" data-learning-growth-board-summary>
        <div class="learning-growth-board-summary-metrics" aria-label="\u6210\u957f\u6982\u89c8">
          <span><small>\u6267\u884c\u8005</small><b>${escapeHtml(learnerLabel)}</b></span>
          <span><small>\u7d2f\u8ba1\u91d1\u5e01</small><b>${escapeHtml(coinText)}</b></span>
          <span><small>7\u65e5\u5747\u503c</small><b>${escapeHtml(String(sevenDayAverage))}</b></span>
          <span><small>30\u65e5\u5747\u503c</small><b>${escapeHtml(String(thirtyDayAverage))}</b></span>
        </div>
      </section>
      ${boardHtml}
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
