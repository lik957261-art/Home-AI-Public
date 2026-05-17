"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningProgramUi = factory();
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

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isOwner(options = {}) {
    return Boolean(options.state?.auth?.isOwner);
  }

  function programStatusText(status, options = {}) {
    const value = String(status || "");
    if (value === "active") return "\u8fdb\u884c\u4e2d";
    if (value === "draft") return "\u8349\u7a3f";
    if (value === "review_required") return isOwner(options) ? "\u5f85\u5bb6\u957f\u5ba1\u6838" : "\u5f85\u786e\u8ba4";
    if (value === "published") return isOwner(options) ? "\u5df2\u4e0b\u53d1" : "\u5f85\u6267\u884c";
    if (value === "blocked") return isOwner(options) ? "\u5df2\u62e6\u622a" : "\u6682\u4e0d\u53ef\u6267\u884c";
    return value || "\u672a\u5b9a";
  }

  function taskStatusText(status, options = {}) {
    const value = String(status || "");
    if (value === "planned") return "\u5f85\u6267\u884c";
    if (value === "published") return "\u5df2\u4e0b\u53d1";
    if (value === "active") return "\u8fdb\u884c\u4e2d";
    if (value === "completed") return "\u5df2\u5b8c\u6210";
    if (value === "needs_review") return "\u5f85\u590d\u76d8";
    if (value === "review_required") return isOwner(options) ? "\u5f85\u5bb6\u957f\u5ba1\u6838" : "\u5f85\u786e\u8ba4";
    if (value === "blocked") return isOwner(options) ? "\u5df2\u62e6\u622a" : "\u6682\u4e0d\u53ef\u6267\u884c";
    return value || "\u5f85\u6267\u884c";
  }

  function evaluationStatusText(status) {
    const value = String(status || "");
    if (value === "passed") return "\u5df2\u901a\u8fc7";
    if (value === "needs_repair") return "\u9700\u4fee\u590d";
    if (value === "needs_review") return "\u5f85\u590d\u76d8";
    if (value === "recorded") return "\u5df2\u8bb0\u5f55";
    return value || "\u672a\u8bb0\u5f55";
  }

  function reviewStatusText(status) {
    const value = String(status || "");
    if (value === "pending") return "\u5f85\u5bb6\u957f\u5ba1\u6838";
    if (value === "approved") return "\u5df2\u901a\u8fc7";
    if (value === "rejected") return "\u5df2\u62d2\u7edd";
    if (value === "returned_for_revision") return "\u5df2\u8fd4\u56de\u4fee\u6539";
    if (value === "cancelled") return "\u5df2\u53d6\u6d88";
    return value || "\u672a\u5b9a";
  }

  function parentReviewTypeText(type) {
    const value = String(type || "");
    if (value === "evaluation_review") return "\u8bc4\u4ef7\u590d\u6838";
    if (value === "reward_settlement_review") return "\u5956\u52b1\u7ed3\u7b97\u590d\u6838";
    return value || "\u5bb6\u957f\u5ba1\u6838";
  }

  function settlementStatusText(status) {
    const value = String(status || "");
    if (value === "settled") return "\u5df2\u7ed3\u7b97";
    if (value === "pending_review") return "\u5f85\u5bb6\u957f\u590d\u6838";
    if (value === "blocked") return "\u5df2\u62e6\u622a";
    if (value === "skipped") return "\u5df2\u8df3\u8fc7";
    return value || "\u672a\u5b9a";
  }

  function formatCoinAmount(value) {
    const amount = Number(value || 0);
    return `${Number.isFinite(amount) ? amount : 0} \u91d1\u5e01`;
  }

  function compactRiskFlags(flags = []) {
    return asArray(flags).map((flag) => (flag && typeof flag === "object" ? (flag.code || flag.reason || "") : flag)).filter(Boolean).join(" / ");
  }

  function focusLabel(id) {
    const labels = {
      english_reading_comprehension: "\u9605\u8bfb",
      english_listening_input: "\u542c\u529b",
      english_speaking_retell: "\u53e3\u8bed\u590d\u8ff0",
      english_pronunciation_shadowing: "\u53d1\u97f3\u8ddf\u8bfb",
      english_short_writing: "\u5199\u4f5c",
      english_vocabulary_active_use: "\u8bcd\u6c47\u6d3b\u7528",
      english_grammar_in_expression: "\u8bed\u6cd5\u8868\u8fbe",
      english_presentation: "\u6f14\u8bb2\u9879\u76ee",
    };
    return labels[id] || id;
  }

  function compactFocus(focusAreas = []) {
    return asArray(focusAreas).map((id) => focusLabel(id)).join(" / ");
  }

  function formatPercent(value) {
    const number = Number(value || 0);
    return `${Math.round(Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0)) * 100)}%`;
  }

  function renderSourceGoalForms(options = {}) {
    const state = options.state || {};
    if (!state.auth?.isOwner) return "";
    return `<div class="learning-foundation-owner-grid">
      <form id="learningSourceForm" class="learning-program-form" data-learning-source-create>
        <div class="learning-section-heading">
          <h3>\u8d44\u6599\u6765\u6e90</h3>
          <span>SQLite</span>
        </div>
        <select id="learningSourceType" class="input">
          <option value="parent_config">\u5bb6\u957f\u5f55\u5165</option>
          <option value="school">\u5b66\u6821</option>
          <option value="tutor">\u79c1\u6559</option>
          <option value="cleaned_history">\u5386\u53f2\u6e05\u6d17</option>
          <option value="assessment_summary">\u6d4b\u8bc4\u6458\u8981</option>
        </select>
        <input id="learningSourceTitle" class="input" type="text" autocomplete="off" placeholder="\u6765\u6e90\u540d\u79f0">
        <textarea id="learningSourceSummary" class="input" rows="3" placeholder="\u53ea\u5199\u6458\u8981\u548c\u7ed3\u8bba\uff0c\u4e0d\u7c98\u8d34\u5b69\u5b50\u5b8c\u6574\u4f5c\u7b54\u6216\u8f6c\u5199"></textarea>
        <input id="learningSourceTags" class="input" type="text" autocomplete="off" placeholder="\u6807\u7b7e\uff0c\u7528\u9017\u53f7\u5206\u9694">
        <button class="learning-coin-primary" type="submit">\u4fdd\u5b58\u6765\u6e90</button>
      </form>
      <form id="learningGoalForm" class="learning-program-form" data-learning-goal-create>
        <div class="learning-section-heading">
          <h3>\u5b66\u4e60\u76ee\u6807</h3>
          <span>Goal</span>
        </div>
        <input id="learningGoalTitle" class="input" type="text" autocomplete="off" placeholder="\u76ee\u6807\u540d\u79f0">
        <textarea id="learningGoalSummary" class="input" rows="3" placeholder="\u76ee\u6807\u3001\u8303\u56f4\u3001\u8981\u6c42\u548c\u9a8c\u6536\u6807\u51c6"></textarea>
        <div class="learning-program-field-grid">
          <label><span>\u9886\u57df</span><select id="learningGoalDomain" class="input"><option value="english">English</option><option value="math">Math</option><option value="programming">Programming</option></select></label>
          <label><span>\u4f18\u5148\u7ea7</span><input id="learningGoalPriority" class="input" type="number" min="0" max="100" value="80"></label>
          <label><span>\u622a\u6b62\u65e5\u671f</span><input id="learningGoalTargetDate" class="input" type="date"></label>
        </div>
        <input id="learningGoalFocus" class="input" type="text" autocomplete="off" placeholder="\u80fd\u529b\u8303\u56f4\uff1areading, speaking, writing">
        <button class="learning-coin-primary" type="submit">\u4fdd\u5b58\u76ee\u6807</button>
      </form>
    </div>`;
  }

  function renderFoundationImportForm(options = {}) {
    const state = options.state || {};
    if (!state.auth?.isOwner) return "";
    return `<form id="learningFoundationImportForm" class="learning-program-form learning-foundation-import-form" data-learning-foundation-import>
      <div class="learning-section-heading">
        <h3>\u6279\u91cf\u57fa\u7840\u5bfc\u5165</h3>
        <span>Summary only</span>
      </div>
      <textarea id="learningFoundationImportSources" class="input" rows="3" placeholder="\u6765\u6e90\uff0c\u6bcf\u884c\uff1a\u7c7b\u578b | \u6807\u9898 | \u6458\u8981 | \u6807\u7b7e"></textarea>
      <textarea id="learningFoundationImportGoals" class="input" rows="3" placeholder="\u76ee\u6807\uff0c\u6bcf\u884c\uff1a\u9886\u57df | \u6807\u9898 | \u76ee\u6807\u6458\u8981 | \u80fd\u529b\u6807\u7b7e"></textarea>
      <textarea id="learningFoundationImportProfile" class="input" rows="2" placeholder="\u5b66\u4e60\u753b\u50cf\u6458\u8981\uff1a\u53ea\u5199\u7ed3\u8bba\uff0c\u4e0d\u7c98\u8d34\u5b8c\u6574\u4f5c\u7b54\u6216\u8f6c\u5199"></textarea>
      <button class="learning-coin-primary" type="submit">\u5bfc\u5165\u6458\u8981</button>
    </form>`;
  }

  function renderFoundationPanel(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    const sources = asArray(data.sources).slice(0, 5);
    const goals = asArray(data.goals).slice(0, 5);
    const refs = asArray(data.curriculumReferences).slice(0, 5);
    const profile = data.learnerProfile || null;
    return `<section class="learning-coin-panel learning-foundation-panel" data-learning-foundation>
      <div class="learning-section-heading">
        <h3>\u5b66\u4e60\u57fa\u7840\u6570\u636e</h3>
        <button type="button" data-learning-profile-rebuild>\u91cd\u5efa\u753b\u50cf</button>
      </div>
      ${renderSourceGoalForms(options)}
      ${renderFoundationImportForm(options)}
      <div class="learning-foundation-grid">
        <article>
          <strong>\u5b66\u4e60\u753b\u50cf</strong>
          <p>${escapeHtml(profile?.profileSummary || "\u5c1a\u672a\u91cd\u5efa\u753b\u50cf")}</p>
        </article>
        <article>
          <strong>\u76ee\u6807</strong>
          ${goals.length ? goals.map((goal) => `<p>${escapeHtml(goal.title || goal.goalId)} · ${escapeHtml(goal.domain || "")}</p>`).join("") : `<p>\u8fd8\u6ca1\u6709\u76ee\u6807</p>`}
        </article>
        <article>
          <strong>\u8d44\u6599\u6765\u6e90</strong>
          ${sources.length ? sources.map((source) => `<p>${escapeHtml(source.title || source.sourceId)} · ${escapeHtml(source.sourceType || "")}</p>`).join("") : `<p>\u8fd8\u6ca1\u6709\u6765\u6e90\u6458\u8981</p>`}
        </article>
        <article>
          <strong>\u516c\u5f00\u8bfe\u7a0b\u53c2\u8003</strong>
          ${refs.length ? refs.map((ref) => `<p>${escapeHtml(ref.title || ref.referenceId)}</p>`).join("") : `<p>\u8bfe\u7a0b\u53c2\u8003\u672a\u521d\u59cb\u5316</p>`}
        </article>
      </div>
    </section>`;
  }

  function renderProgramForm(options = {}) {
    const state = options.state || {};
    if (!state.auth?.isOwner) return "";
    return `<section class="learning-coin-panel learning-program-owner-panel" data-learning-program-owner>
      <div class="learning-section-heading">
        <h3>\u5b66\u4e60\u8303\u56f4\u914d\u7f6e</h3>
        <span>SQLite</span>
      </div>
      <form id="learningProgramForm" class="learning-program-form" data-learning-program-create>
        <input id="learningProgramTitle" class="input" type="text" autocomplete="off" placeholder="\u8ba1\u5212\u540d\u79f0\uff0c\u4f8b\uff1a\u82f1\u8bed\u5feb\u901f\u63d0\u5347">
        <textarea id="learningProgramGoal" class="input" rows="3" placeholder="\u76ee\u6807\u548c\u8981\u6c42\uff1a\u60f3\u5b66\u4ec0\u4e48\u8303\u56f4\uff0c\u4ec0\u4e48\u8981\u6c42\uff0c\u591a\u957f\u65f6\u95f4"></textarea>
        <div class="learning-program-field-grid">
          <label><span>\u9886\u57df</span><select id="learningProgramDomain" class="input"><option value="english">English</option><option value="math">Math</option><option value="programming">Programming</option></select></label>
          <label><span>\u5f00\u59cb</span><input id="learningProgramStartDate" class="input" type="date"></label>
          <label><span>\u5468\u671f\u5929\u6570</span><input id="learningProgramDurationDays" class="input" type="number" min="7" max="366" value="28"></label>
          <label><span>\u6bcf\u5468\u5929\u6570</span><input id="learningProgramDaysPerWeek" class="input" type="number" min="1" max="7" value="5"></label>
          <label><span>\u6bcf\u5929\u5206\u949f</span><input id="learningProgramMinutesPerDay" class="input" type="number" min="10" max="90" value="30"></label>
          <label><span>\u63d0\u9192\u65f6\u95f4</span><input id="learningProgramTimeOfDay" class="input" type="time" value="19:30"></label>
        </div>
        <fieldset class="learning-program-focus-grid" aria-label="\u82f1\u8bed\u80fd\u529b\u8303\u56f4">
          <label><input type="checkbox" name="learningProgramFocus" value="english_reading_comprehension" checked> \u9605\u8bfb</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_listening_input"> \u542c\u529b</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_speaking_retell" checked> \u53e3\u8bed</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_pronunciation_shadowing"> \u53d1\u97f3</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_short_writing" checked> \u5199\u4f5c</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_vocabulary_active_use" checked> \u8bcd\u6c47</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_grammar_in_expression"> \u8bed\u6cd5</label>
          <label><input type="checkbox" name="learningProgramFocus" value="english_presentation"> \u6f14\u8bb2</label>
        </fieldset>
        <textarea id="learningProgramSourceRefs" class="input" rows="2" placeholder="\u4f9d\u636e\u6765\u6e90\u6458\u8981\uff0c\u4e00\u884c\u4e00\u4e2a\uff1a\u5b66\u6821\u3001\u79c1\u6559\u3001\u5386\u53f2\u6e05\u6d17\u8d44\u6599\u3001\u5bb6\u957f\u76ee\u6807"></textarea>
        <button class="learning-coin-primary" type="submit">\u4fdd\u5b58\u8303\u56f4</button>
      </form>
    </section>`;
  }

  function renderDraftSummary(draft, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!draft) return "";
    const days = asArray(draft.dailyPlans).slice(0, 3);
    return `<div class="learning-program-draft" data-learning-program-draft="${escapeHtml(draft.draftId)}">
      <div class="learning-program-draft-top">
        <strong>${escapeHtml(`${draft.weekStart || ""} - ${draft.weekEnd || ""}`)}</strong>
        <span>${escapeHtml(programStatusText(draft.status, options))}</span>
      </div>
      <div class="learning-program-task-days">
        ${days.map((day) => `<span>${escapeHtml(day.date || "")}: ${escapeHtml(String(asArray(day.tasks).length))} \u9879</span>`).join("")}
      </div>
    </div>`;
  }

  function renderProgramCards(programs = [], latestDrafts = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const owner = isOwner(options);
    if (!programs.length) {
      return `<div class="learning-coin-empty">${owner ? "\u8fd8\u6ca1\u6709\u5b66\u4e60\u8303\u56f4\u914d\u7f6e\u3002" : "\u6682\u65e0\u5b66\u4e60\u5b89\u6392\u3002"}</div>`;
    }
    const draftByProgram = new Map(latestDrafts.map((draft) => [draft.programId, draft]));
    return programs.map((program) => {
      const draft = draftByProgram.get(program.programId);
      return `<article class="learning-program-card" data-learning-program-id="${escapeHtml(program.programId)}">
        <div class="learning-program-card-top">
          <div>
            <h3>${escapeHtml(program.title || program.programId)}</h3>
            ${owner && program.goalSummary ? `<p>${escapeHtml(program.goalSummary)}</p>` : ""}
          </div>
          <span>${escapeHtml(programStatusText(program.status, options))}</span>
        </div>
        <div class="learning-program-meta-grid">
          <span><strong>${escapeHtml(program.domain || "")}</strong><small>\u9886\u57df</small></span>
          <span><strong>${escapeHtml(String(program.minutesPerDay || 0))}</strong><small>\u6bcf\u5929\u5206\u949f</small></span>
          <span><strong>${escapeHtml(String(program.daysPerWeek || 0))}</strong><small>\u6bcf\u5468\u5929\u6570</small></span>
        </div>
        ${owner ? `<div class="learning-program-focus">${escapeHtml(compactFocus(program.focusAreas))}</div>` : ""}
        ${owner ? renderDraftSummary(draft, options) : ""}
        ${owner ? `<div class="learning-program-actions">
          <button type="button" data-learning-program-draft-action="${escapeHtml(program.programId)}">\u751f\u6210\u5468\u8ba1\u5212</button>
          <button type="button" data-learning-program-publish="${escapeHtml(program.programId)}" ${draft && !draft.reliability?.publishBlocked ? "" : "disabled"}>\u4e0b\u53d1\u4efb\u52a1</button>
        </div>` : ""}
      </article>`;
    }).join("");
  }

  function renderTaskRows(taskCards = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const tasks = asArray(taskCards).slice(0, 8);
    if (!tasks.length) return `<div class="learning-coin-empty">\u6682\u65e0\u5f85\u6267\u884c\u4efb\u52a1\u3002</div>`;
    return `<div class="learning-program-task-list">
      ${tasks.map((task) => {
        const skills = compactFocus(task.skillIds || []).slice(0, 80);
        const meta = [
          task.plannedDate,
          task.plannedMinutes ? `${task.plannedMinutes} min` : "",
          skills,
        ].filter(Boolean).join(" / ");
        return `<article class="learning-program-task-item" data-learning-task-card-id="${escapeHtml(task.taskCardId)}">
          <div>
            <strong>${escapeHtml(task.title || task.taskCardId || "\u5b66\u4e60\u4efb\u52a1")}</strong>
            <p>${escapeHtml(meta || task.taskCardType || "")}</p>
          </div>
          <span>${escapeHtml(taskStatusText(task.status, options))}</span>
        </article>`;
      }).join("")}
    </div>`;
  }

  function renderSkillChips(skillStates = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const items = asArray(skillStates).slice(0, 8);
    if (!items.length) return `<div class="learning-coin-empty">\u5b8c\u6210\u4efb\u52a1\u540e\u4f1a\u663e\u793a\u80fd\u529b\u8ddf\u8e2a\u3002</div>`;
    return `<div class="learning-program-skill-list">
      ${items.map((item) => `<span class="learning-program-skill-chip">
        <strong>${escapeHtml(focusLabel(item.skillId || ""))}</strong>
        <small>${escapeHtml([item.level, formatPercent(item.confidence)].filter(Boolean).join(" / "))}</small>
      </span>`).join("")}
    </div>`;
  }

  function renderEvaluationRows(evaluations = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const items = asArray(evaluations).slice(0, 5);
    if (!items.length) return `<div class="learning-coin-empty">\u6682\u65e0\u8bc4\u4f30\u6458\u8981\u3002</div>`;
    return `<div class="learning-program-evaluation-list">
      ${items.map((item) => `<article class="learning-program-review-item" data-learning-evaluation-summary="${escapeHtml(item.evaluationId)}">
        <div>
          <strong>${escapeHtml([evaluationStatusText(item.status), item.score || item.score === 0 ? `${item.score}` : ""].filter(Boolean).join(" / "))}</strong>
          <p>${escapeHtml(item.summary || "\u672a\u586b\u5199\u8bc4\u4f30\u6458\u8981")}</p>
        </div>
        <span class="learning-program-status-chip">${escapeHtml(item.passed ? "\u901a\u8fc7" : "\u5f85\u4fee\u590d")}</span>
      </article>`).join("")}
    </div>`;
  }

  function renderExecutionOverview(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const tasks = asArray(data.taskCards);
    const programs = asArray(data.programs);
    const pendingCount = tasks.filter((task) => !["completed", "archived"].includes(String(task.status || ""))).length || programs.length;
    return `<section class="learning-growth-category learning-program-execution-panel" data-learning-growth-category="execution">
      <div class="learning-growth-category-heading">
        <h3>\u6267\u884c\u6982\u89c8 / \u5f85\u6267\u884c</h3>
        <span>${escapeHtml(String(pendingCount))} \u9879</span>
      </div>
      <div class="learning-program-execution-grid">
        <section class="learning-coin-panel">
          <div class="learning-section-heading"><h3>\u4efb\u52a1\u72b6\u6001</h3><span>Task</span></div>
          ${renderTaskRows(tasks, options)}
        </section>
        <section class="learning-coin-panel">
          <div class="learning-section-heading"><h3>${isOwner(options) ? "\u5b66\u4e60\u8ba1\u5212" : "\u5b66\u4e60\u5b89\u6392"}</h3><span>${escapeHtml(String(programs.length))}</span></div>
          <div class="learning-program-list">${renderProgramCards(programs, data.latestDrafts || [], options)}</div>
        </section>
      </div>
    </section>`;
  }

  function renderGuidancePanel(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const profile = data.learnerProfile || {};
    const summary = profile.profileSummary || "\u6682\u65e0\u5206\u6790\u6458\u8981\uff0c\u5b8c\u6210\u4efb\u52a1\u540e\u4f1a\u66f4\u65b0\u4e0b\u4e00\u6b65\u6307\u5bfc\u3002";
    return `<section class="learning-growth-category learning-program-guidance-panel" data-learning-growth-category="guidance">
      <div class="learning-growth-category-heading">
        <h3>\u5206\u6790\u4e0e\u6307\u5bfc</h3>
        <span>Summary</span>
      </div>
      <div class="learning-program-guidance-grid">
        <section class="learning-coin-panel">
          <div class="learning-section-heading"><h3>\u80fd\u529b\u8ddf\u8e2a</h3><span>\u6458\u8981</span></div>
          <p class="learning-program-guidance-copy">${escapeHtml(summary)}</p>
          ${renderSkillChips(data.skillStates || [], options)}
        </section>
        <section class="learning-coin-panel">
          <div class="learning-section-heading"><h3>\u8fd1\u671f\u8bc4\u4f30</h3><span>\u7ed3\u8bba</span></div>
          ${renderEvaluationRows(data.evaluations || [], options)}
        </section>
      </div>
    </section>`;
  }

  function renderReviewQueue(reviewItems = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    if (!reviewItems.length) return "";
    return `<section class="learning-coin-panel learning-program-review-panel" data-learning-review-queue>
      <div class="learning-section-heading">
        <h3>\u5bb6\u957f\u5ba1\u6838\u961f\u5217</h3>
        <span>${escapeHtml(String(reviewItems.length))}</span>
      </div>
      <div class="learning-program-review-list">
        ${reviewItems.map((item) => `<article class="learning-program-review-item" data-learning-review-id="${escapeHtml(item.reviewId)}">
          <div>
            <strong>${escapeHtml(item.summary || item.reason || item.reviewId)}</strong>
            <p>${escapeHtml(asArray(item.riskFlags).map((flag) => flag.code || flag).join(" / "))}</p>
          </div>
          <div class="learning-program-actions">
            <button type="button" data-learning-review-decision="${escapeHtml(item.reviewId)}" data-decision="approved">\u901a\u8fc7</button>
            <button type="button" data-learning-review-decision="${escapeHtml(item.reviewId)}" data-decision="returned_for_revision">\u8fd4\u56de\u4fee\u6539</button>
            <button type="button" data-learning-review-decision="${escapeHtml(item.reviewId)}" data-decision="rejected">\u62d2\u7edd</button>
          </div>
        </article>`).join("")}
      </div>
    </section>`;
  }

  function renderParentReviewRequests(reviewRequests = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    const items = asArray(reviewRequests);
    if (!items.length) return "";
    return `<section class="learning-coin-panel learning-program-review-panel" data-learning-parent-review-requests>
      <div class="learning-section-heading">
        <h3>\u5bb6\u957f\u590d\u6838</h3>
        <span>${escapeHtml(String(items.length))}</span>
      </div>
      <div class="learning-program-review-list">
        ${items.map((item) => {
          const riskText = compactRiskFlags(item.riskFlags);
          const canDecide = String(item.status || "") === "pending";
          return `<article class="learning-program-review-item" data-learning-parent-review-request-id="${escapeHtml(item.reviewRequestId)}">
            <div>
              <strong>${escapeHtml(item.summary || item.reason || item.reviewRequestId)}</strong>
              <p>${escapeHtml([parentReviewTypeText(item.requestType), reviewStatusText(item.status), riskText].filter(Boolean).join(" / "))}</p>
            </div>
            ${canDecide ? `<div class="learning-program-actions">
              <button type="button" data-learning-parent-review-decision="${escapeHtml(item.reviewRequestId)}" data-decision="approved">\u901a\u8fc7</button>
              <button type="button" data-learning-parent-review-decision="${escapeHtml(item.reviewRequestId)}" data-decision="returned_for_revision">\u8fd4\u56de\u4fee\u6539</button>
              <button type="button" data-learning-parent-review-decision="${escapeHtml(item.reviewRequestId)}" data-decision="rejected">\u62d2\u7edd</button>
            </div>` : `<span class="learning-program-status-chip">${escapeHtml(reviewStatusText(item.status))}</span>`}
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }

  function renderRewardSettlements(rewardSettlements = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    const items = asArray(rewardSettlements);
    if (!items.length) return "";
    return `<section class="learning-coin-panel learning-program-review-panel" data-learning-reward-settlements>
      <div class="learning-section-heading">
        <h3>\u5956\u52b1\u7ed3\u7b97</h3>
        <span>${escapeHtml(String(items.length))}</span>
      </div>
      <div class="learning-program-review-list">
        ${items.map((item) => `<article class="learning-program-review-item" data-learning-reward-settlement-id="${escapeHtml(item.rewardSettlementId)}">
          <div>
            <strong>${escapeHtml([settlementStatusText(item.status), formatCoinAmount(item.coinAmount)].join(" / "))}</strong>
            <p>${escapeHtml([item.reason, item.sourceType, item.evaluationId].filter(Boolean).join(" / "))}</p>
          </div>
          <span class="learning-program-status-chip">${escapeHtml(settlementStatusText(item.status))}</span>
        </article>`).join("")}
      </div>
    </section>`;
  }

  function renderParentReportPanel(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    const report = options.parentReport || data.parentReport || null;
    const loading = Boolean(options.parentReportLoading);
    const error = String(options.parentReportError || "");
    const counts = report?.counts || {};
    return `<section class="learning-coin-panel learning-parent-report-panel" data-learning-parent-report>
      <div class="learning-section-heading">
        <h3>\u5bb6\u957f\u5468\u62a5</h3>
        <button type="button" data-learning-parent-report-refresh>${loading ? "\u751f\u6210\u4e2d" : "\u5237\u65b0\u5468\u62a5"}</button>
      </div>
      ${error ? `<div class="learning-coin-empty">${escapeHtml(error)}</div>` : ""}
      ${report ? `<div class="learning-program-report-grid">
        <span><strong>${escapeHtml(String(counts.plannedTasks || 0))}</strong><small>\u672c\u5468\u4efb\u52a1</small></span>
        <span><strong>${escapeHtml(String(counts.passedEvaluations || 0))}</strong><small>\u901a\u8fc7\u8bc4\u4f30</small></span>
        <span><strong>${escapeHtml(String(counts.coinsSettled || 0))}</strong><small>\u7ed3\u7b97\u91d1\u5e01</small></span>
        <span><strong>${escapeHtml(String(counts.pendingReviews || 0))}</strong><small>\u5f85\u5ba1\u6838</small></span>
      </div>
      <div class="learning-program-report-actions">
        ${asArray(report.nextActions).slice(0, 4).map((item) => `<p>${escapeHtml([item.reason, item.resourceType, item.resourceId].filter(Boolean).join(" / "))}</p>`).join("") || `<p>\u6682\u65e0\u5f85\u5904\u7406\u9879</p>`}
      </div>` : `<div class="learning-coin-empty">\u70b9\u51fb\u5237\u65b0\u540e\u751f\u6210\u672c\u5468\u6458\u8981\u62a5\u544a\u3002</div>`}
    </section>`;
  }

  function renderParentAdminPanel(data = {}, options = {}) {
    if (!isOwner(options)) return "";
    return `<section class="learning-growth-category learning-program-parent-admin" data-learning-growth-category="parent-admin">
      <div class="learning-growth-category-heading">
        <h3>\u5bb6\u957f\u914d\u7f6e / \u5ba1\u6838</h3>
        <span>Owner</span>
      </div>
      ${renderFoundationPanel(data, options)}
      ${renderProgramForm(options)}
      ${renderParentReportPanel(data, options)}
      ${renderReviewQueue(data.reviewItems || [], options)}
      ${renderParentReviewRequests(data.parentReviewRequests || [], options)}
      ${renderRewardSettlements(data.rewardSettlements || [], options)}
    </section>`;
  }

  function renderProgramSubsystem(options = {}) {
    const programs = options.programs || {};
    const data = programs.programs ? programs : {};
    return `<section class="learning-program-section" data-learning-growth-module="programs">
      ${renderExecutionOverview(data, options)}
      ${renderGuidancePanel(data, options)}
      ${renderParentAdminPanel(data, options)}
    </section>`;
  }

  return {
    compactFocus,
    renderExecutionOverview,
    renderFoundationPanel,
    renderGuidancePanel,
    renderParentAdminPanel,
    renderParentReportPanel,
    renderProgramCards,
    renderProgramForm,
    renderProgramSubsystem,
    renderParentReviewRequests,
    renderReviewQueue,
    renderRewardSettlements,
  };
}));
