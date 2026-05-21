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
        <button type="button" class="learning-growth-board-card-title" data-learning-open-growth-task="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(workspaceId)}">
          <strong>${escapeHtml(card.title || taskCardId || "\u5b66\u4e60\u4efb\u52a1")}</strong>
          <small>\u5956\u52b1 ${escapeHtml(String(taskRewardCapCoins(card)))} \u91d1\u5e01</small>
        </button>
        <span>${escapeHtml(boardStatusText(card))}</span>
      </div>
      ${card.instructionPreview ? `<p class="learning-growth-board-card-preview">${escapeHtml(card.instructionPreview)}</p>` : ""}
      <div class="learning-growth-board-card-meta">
        ${card.activityType ? `<small>${escapeHtml(card.activityType)}</small>` : ""}
        ${cardOpenTimeText(card) ? `<small>\u5f00\u653e ${escapeHtml(cardOpenTimeText(card))}</small>` : ""}
        ${scoreText ? `<small>${escapeHtml(scoreText)}</small>` : ""}
        ${artifacts ? `<small>${escapeHtml(String(artifacts))} \u4e2a\u4ea4\u4ed8</small>` : ""}
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
    const requested = String(options.activeTab || options.state?.learningGrowthActiveTab || "").trim();
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

  function renderOwnerProgramTabs(programUi, coinsHtml, overview = {}, options = {}) {
    const data = overview.programs || {};
    const programOptions = Object.assign({}, options, {
      programs: data,
      launchOperations: overview.launchOperations,
      learnerId: overview.learner?.id || options.learnerId,
    });
    const execution = programUi.renderExecutionOverview(data, programOptions);
    const guidance = programUi.renderGuidancePanel(data, programOptions);
    const rewardPolicy = renderOwnerRewardPolicySettings(overview, options);
    const config = [
      rewardPolicy,
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
    const taskManagement = [
      execution,
      review,
    ].join("");
    return `<section class="learning-program-section learning-program-parent-admin" data-learning-growth-module="programs" data-learning-growth-category="parent-admin" data-learning-growth-owner-management>
      ${renderLearningGrowthTabs([
        { id: "settings", label: "\u8bbe\u7f6e", html: config },
        { id: "ai-summary", label: "AI 总结", html: renderOwnerAiSummaryRecommendationsPanel(data, programOptions) },
        { id: "new-task", label: "\u65b0\u5efa\u4efb\u52a1", html: taskManagement },
        { id: "reward-settlement", label: "\u5956\u52b1\u7ed3\u7b97", html: rewards },
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
    const series = asArray(result?.recommendedSeries);
    const creatingId = String(pageState.learningAiDraftCreatingId || "");
    return `<section class="learning-coin-panel learning-ai-summary-panel" data-learning-ai-summary-recommendations>
      <div class="learning-section-heading">
        <h3>AI 总结</h3>
        <span>${escapeHtml(result?.modelStatus || "template-guarded")}</span>
      </div>
      <p class="learning-growth-muted">基于学习记录摘要和当前任务模板推荐任务系列。推荐只生成可审核草稿，不直接发布。</p>
      <div class="learning-program-report-actions">
        <button type="button" data-learning-ai-summary-refresh ${loading ? "disabled" : ""}>${loading ? "分析中..." : "生成 AI 总结"}</button>
      </div>
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
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const coins = options.coins || overview.coins || {};
    const learnerId = overview.learner?.id || options.learnerId;
    const learnerLabel = overview.learner?.displayName
      || (learnerId === "weixin_stephen" ? "鍑″嚒" : learnerId)
      || "\u6267\u884c\u8005";
    const coinsHtml = coinsUi && typeof coinsUi.renderCoinsSubsystem === "function"
      ? coinsUi.renderCoinsSubsystem({ summary: coins, learnerId, state: options.state || {}, escapeHtml: optionFn(options, "escapeHtml", defaultEscapeHtml) })
      : "";
    const adminHtml = renderOwnerProgramTabs(programUi, coinsHtml, overview, options);
    if (!adminHtml) return "";
    return `<div class="learning-growth-view learning-growth-settings-page" data-learning-product="fanfan-growth" data-learning-role="owner" data-learning-growth-settings-page>
      <div class="learning-growth-settings-head">
        <button type="button" data-learning-growth-close-settings>\u8fd4\u56de\u770b\u677f</button>
        <div>
          <strong>\u8bbe\u7f6e</strong>
          <span>${escapeHtml(learnerLabel)}</span>
        </div>
      </div>
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

  function renderSelectedGrowthTaskView(overview = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const programUi = options.programUi || ProgramUi;
    const programs = overview.programs || {};
    const taskCardId = String(options.selectedGrowthTaskCardId || options.state?.selectedLearningTaskCardId || "");
    const task = findSelectedGrowthTask(programs, taskCardId);
    const detail = task && programUi && typeof programUi.renderNativeGrowthTaskDetail === "function"
      ? programUi.renderNativeGrowthTaskDetail(task, programs, options)
      : `<div class="learning-coin-empty">\u8fd9\u5f20\u4efb\u52a1\u5361\u5df2\u66f4\u65b0\u6216\u4e0d\u5728\u5f53\u524d\u72b6\u6001\u91cc\u3002</div>`;
    return `<div class="learning-growth-view learning-growth-task-focus" data-learning-product="fanfan-growth" data-learning-growth-task-focus="${escapeHtml(taskCardId)}">
      <div class="learning-growth-task-focus-head">
        <button type="button" data-learning-close-growth-task>\u8fd4\u56de\u770b\u677f</button>
        <span>\u5355\u5f20\u4efb\u52a1</span>
      </div>
      ${detail}
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
    const coinText = formatGrowthCoins(Number.isFinite(historicalCoins) ? historicalCoins : 0);
    const coinsUi = options.coinsUi || CoinsUi;
    if (owner && options.state?.learningGrowthSettingsOpen) {
      return renderOwnerSettingsPage(programUi, coinsUi, overview, options);
    }
    return `<div class="learning-growth-view learning-growth-board-page" data-learning-product="fanfan-growth" data-learning-role="${owner ? "owner" : "executor"}">
      <section class="learning-growth-board-summary" data-learning-growth-board-summary>
        <div class="learning-growth-board-summary-metrics" aria-label="\u6210\u957f\u6982\u89c8">
          <span><b>${escapeHtml(learnerLabel)}</b></span>
          <span><b>${escapeHtml(coinText)}</b></span>
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
