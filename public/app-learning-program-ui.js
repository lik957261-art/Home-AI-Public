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
    if (value === "published") return isOwner(options) ? "\u5df2\u4e0b\u53d1" : "\u5f85\u6267\u884c";
    if (value === "active") return "\u8fdb\u884c\u4e2d";
    if (value === "completed") return "\u5df2\u5b8c\u6210";
    if (value === "needs_review") return "\u5f85\u590d\u76d8";
    if (value === "review_required") return isOwner(options) ? "\u5f85\u5bb6\u957f\u5ba1\u6838" : "\u5f85\u786e\u8ba4";
    if (value === "blocked") return isOwner(options) ? "\u5df2\u62e6\u622a" : "\u6682\u4e0d\u53ef\u6267\u884c";
    return value || "\u5f85\u6267\u884c";
  }

  function taskRewardPolicy(task = {}) {
    const policy = task.rewardPolicy || {};
    const maxCoins = Number(task.rewardCapCoins || policy.maxCoins || policy.rewardCapCoins || 100);
    const minCoins = Number(policy.minCoins || 40);
    return {
      maxCoins: Number.isFinite(maxCoins) && maxCoins > 0 ? Math.round(maxCoins) : 100,
      minCoins: Number.isFinite(minCoins) && minCoins > 0 ? Math.round(minCoins) : 40,
      accuracyBonusMax: Number(policy.accuracyBonusMax || 30) || 30,
      timelinessBonusMax: Number(policy.timelinessBonusMax || 15) || 15,
      interactionBonusMax: Number(policy.interactionBonusMax || 15) || 15,
    };
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

  const ENGLISH_FOCUS_IDS = Object.freeze([
    "english_reading_comprehension",
    "english_listening_input",
    "english_speaking_retell",
    "english_pronunciation_shadowing",
    "english_short_writing",
    "english_vocabulary_active_use",
    "english_grammar_in_expression",
    "english_presentation",
  ]);

  const DEFAULT_OWNER_PROGRAM = Object.freeze({
    title: "\u82f1\u8bed\u5feb\u901f\u63d0\u5347\u8ba1\u5212",
    goalSummary: "\u56f4\u7ed5\u4e03\u5e74\u7ea7\u548c\u8bed\u8a00\u6c34\u5e73 5.5-6 / B1 \u8fc7\u6e21\uff0c\u7528 8 \u5468\u5feb\u901f\u63d0\u5347\u9605\u8bfb\u7406\u89e3\u3001\u53e3\u8bed\u590d\u8ff0\u3001\u5199\u4f5c\u8868\u8fbe\u3001\u8bcd\u6c47\u548c\u8bed\u6cd5\u8f93\u51fa\u3002",
    durationDays: 56,
    daysPerWeek: 5,
    minutesPerDay: 30,
    timeOfDay: "19:30",
    focusAreas: [
      "english_reading_comprehension",
      "english_listening_input",
      "english_speaking_retell",
      "english_short_writing",
      "english_vocabulary_active_use",
      "english_grammar_in_expression",
    ],
  });

  function firstItem(items = []) {
    return asArray(items).find(Boolean) || null;
  }

  function selectedAttr(value, expected) {
    return String(value || "") === expected ? " selected" : "";
  }

  function checkedAttr(values = [], id, fallback = false) {
    const list = asArray(values).map(String);
    return (list.length ? list.includes(id) : fallback) ? " checked" : "";
  }

  function latestDraftForProgram(program = {}, drafts = []) {
    const programId = String(program.programId || "");
    return asArray(drafts).find((draft) => String(draft.programId || "") === programId) || null;
  }

  function taskCardsForDraft(taskCards = [], draft = {}) {
    const draftId = String(draft?.draftId || "");
    return asArray(taskCards).filter((task) => String(task?.draftId || "") === draftId);
  }

  function hasLegacyCurriculumRef(ref) {
    const text = String(ref || "").toLowerCase();
    return text.includes("grade4-5")
      || text.includes("upper-primary")
      || text.includes("cambridge-primary")
      || text.includes("cefr-a2-b1")
      || text.includes("school-english-current-grade");
  }

  function draftNeedsRebuild(data = {}, draft = {}) {
    if (!draft) return false;
    const taskRefs = taskCardsForDraft(data.taskCards || [], draft).flatMap((task) => asArray(task.curriculumRefs));
    const draftRefs = asArray(draft.curriculumRefs);
    return draftRefs.concat(taskRefs).some(hasLegacyCurriculumRef);
  }

  function draftCanBeRebuilt(data = {}, draft = {}) {
    if (!draft) return false;
    if (["published", "publish_failed"].includes(String(draft.status || ""))) return false;
    return taskCardsForDraft(data.taskCards || [], draft)
      .every((task) => ["planned", "review_required", "blocked"].includes(String(task.status || "")));
  }

  function learnerFacts(data = {}) {
    const profile = data.learnerProfile || {};
    const refs = asArray(data.curriculumReferences);
    const sources = asArray(data.sources);
    const programs = asArray(data.programs);
    const refText = refs.concat(programs).map((item) => JSON.stringify(item || {})).join(" ").toLowerCase();
    const sourceText = sources.map((item) => JSON.stringify(item || {})).join(" ").toLowerCase();
    const grade = refText.includes("grade7") || sourceText.includes("grade7") ? "\u4e03\u5e74\u7ea7" : "\u5f85\u786e\u8ba4";
    const level = refText.includes("5_5-6") || refText.includes("5.5-6") || sourceText.includes("5.5-6")
      ? "5.5-6 / B1 \u8fc7\u6e21"
      : "\u5f85\u786e\u8ba4";
    return {
      displayName: profile.displayName || profile.learnerId || "\u51e1\u51e1",
      grade,
      level,
      sourceCount: sources.length,
      goalCount: asArray(data.goals).length,
      programCount: programs.length,
    };
  }

  function sourceRefsForProgram(data = {}, program = {}) {
    const refs = asArray(program.sourceBasisRefs);
    if (refs.length) return refs.join("\n");
    return asArray(data.sources).map((source) => source.sourceRef || source.sourceId).filter(Boolean).slice(0, 20).join("\n");
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

  function renderSourceDirectoryPanel(sourceDirectories = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    const directories = asArray(sourceDirectories);
    if (!directories.length) return "";
    return `<div class="learning-source-directory-panel" data-learning-source-directories>
      ${directories.map((directory) => {
        const summaryFiles = asArray(directory.summaryFiles);
        const available = Number(directory.availableSummaryCount || summaryFiles.filter((item) => item.exists).length || 0);
        const label = directory.directoryLabel || "\u5b66\u4e60\u8d44\u6599";
        const fileMeta = summaryFiles.length
          ? summaryFiles.map((item) => `${item.exists ? "\u5df2\u8bc6\u522b" : "\u672a\u627e\u5230"}:${item.role || item.ref || ""}`).join(" / ")
          : "\u5c1a\u672a\u68c0\u6d4b\u5230\u6e05\u6d17\u6458\u8981";
        return `<article class="learning-source-directory-card" data-learning-source-directory="${escapeHtml(directory.bindingId || "")}">
          <div>
            <strong>${escapeHtml(label)} 路 ${escapeHtml(directory.displayName || directory.learnerId || "")}</strong>
            <p>${escapeHtml(`Summary only / ${available} summaries / ${directory.policy || "summary_only_cleaned_data"}`)}</p>
            <small>${escapeHtml(fileMeta)}</small>
          </div>
          <div class="learning-source-directory-actions">
            <button type="button" data-learning-source-directory-import="${escapeHtml(directory.bindingId || "")}">\u5bfc\u5165\u6e05\u6d17\u6458\u8981</button>
            <button type="button" data-learning-source-directory-bootstrap="${escapeHtml(directory.bindingId || "")}">\u521d\u59cb\u5316\u76ee\u6807\u8ba1\u5212</button>
          </div>
        </article>`;
      }).join("")}
    </div>`;
  }

  function renderFoundationPanel(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options)) return "";
    const sources = asArray(data.sources).slice(0, 5);
    const goals = asArray(data.goals).slice(0, 5);
    const refs = asArray(data.curriculumReferences).slice(0, 5);
    const profile = data.learnerProfile || null;
    const facts = learnerFacts(data);
    return `<section class="learning-coin-panel learning-foundation-panel learning-owner-step" data-learning-foundation data-learning-owner-step="learner">
      <div class="learning-section-heading">
        <h3>1. \u786e\u8ba4\u5b66\u4e60\u5bf9\u8c61</h3>
        <button type="button" data-learning-profile-rebuild>\u91cd\u5efa\u753b\u50cf</button>
      </div>
      <div class="learning-owner-fact-grid">
        <span><strong>${escapeHtml(facts.displayName)}</strong><small>\u5b66\u4e60\u5bf9\u8c61</small></span>
        <span><strong>${escapeHtml(facts.grade)}</strong><small>\u5e74\u7ea7</small></span>
        <span><strong>${escapeHtml(facts.level)}</strong><small>\u82f1\u8bed\u6c34\u5e73</small></span>
        <span><strong>${escapeHtml(String(facts.sourceCount))}</strong><small>\u6458\u8981\u6765\u6e90</small></span>
      </div>
      ${renderSourceDirectoryPanel(data.sourceDirectories || [], options)}
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
      <details class="learning-owner-advanced">
        <summary>\u624b\u52a8\u8865\u5145\u6765\u6e90\u3001\u76ee\u6807\u6216\u6458\u8981</summary>
        ${renderSourceGoalForms(options)}
        ${renderFoundationImportForm(options)}
      </details>
    </section>`;
  }

  function renderProgramForm(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const state = options.state || {};
    if (!state.auth?.isOwner) return "";
    const program = firstItem(data.programs) || {};
    const goal = firstItem(data.goals) || {};
    const focusAreas = asArray(program.focusAreas).length ? asArray(program.focusAreas) : DEFAULT_OWNER_PROGRAM.focusAreas;
    const title = program.title || goal.title || DEFAULT_OWNER_PROGRAM.title;
    const goalSummary = program.goalSummary || goal.targetSummary || DEFAULT_OWNER_PROGRAM.goalSummary;
    const sourceRefs = sourceRefsForProgram(data, program);
    const domain = program.domain || goal.domain || "english";
    return `<section class="learning-coin-panel learning-program-owner-panel learning-owner-step" data-learning-program-owner data-learning-owner-step="scope">
      <div class="learning-section-heading">
        <h3>2-3. \u9636\u6bb5\u76ee\u6807\u4e0e\u5185\u5bb9\u8303\u56f4</h3>
        <span>\u5df2\u9884\u586b</span>
      </div>
      <form id="learningProgramForm" class="learning-program-form" data-learning-program-create>
        <label class="learning-program-wide-field"><span>\u9636\u6bb5\u76ee\u6807</span><input id="learningProgramTitle" class="input" type="text" autocomplete="off" value="${escapeHtml(title)}" placeholder="\u8ba1\u5212\u540d\u79f0\uff0c\u4f8b\uff1a\u82f1\u8bed\u5feb\u901f\u63d0\u5347"></label>
        <label class="learning-program-wide-field"><span>\u8981\u8fbe\u5230\u7684\u7ed3\u679c</span><textarea id="learningProgramGoal" class="input" rows="3" placeholder="\u9636\u6bb5\u76ee\u6807\u3001\u9a8c\u6536\u6807\u51c6\u548c\u7279\u6b8a\u8981\u6c42">${escapeHtml(goalSummary)}</textarea></label>
        <div class="learning-program-field-grid">
          <label><span>\u9886\u57df</span><select id="learningProgramDomain" class="input"><option value="english"${selectedAttr(domain, "english")}>English</option><option value="math"${selectedAttr(domain, "math")}>Math</option><option value="programming"${selectedAttr(domain, "programming")}>Programming</option></select></label>
          <label><span>\u5f00\u59cb</span><input id="learningProgramStartDate" class="input" type="date" value="${escapeHtml(program.startDate || "")}"></label>
          <label><span>\u5468\u671f\u5929\u6570</span><input id="learningProgramDurationDays" class="input" type="number" min="7" max="366" value="${escapeHtml(String(program.durationDays || DEFAULT_OWNER_PROGRAM.durationDays))}"></label>
          <label><span>\u6bcf\u5468\u5929\u6570</span><input id="learningProgramDaysPerWeek" class="input" type="number" min="1" max="7" value="${escapeHtml(String(program.daysPerWeek || DEFAULT_OWNER_PROGRAM.daysPerWeek))}"></label>
          <label><span>\u6bcf\u5929\u5206\u949f</span><input id="learningProgramMinutesPerDay" class="input" type="number" min="10" max="90" value="${escapeHtml(String(program.minutesPerDay || DEFAULT_OWNER_PROGRAM.minutesPerDay))}"></label>
          <label><span>\u63d0\u9192\u65f6\u95f4</span><input id="learningProgramTimeOfDay" class="input" type="time" value="${escapeHtml(program.timeOfDay || DEFAULT_OWNER_PROGRAM.timeOfDay)}"></label>
        </div>
        <fieldset class="learning-program-focus-grid" aria-label="\u82f1\u8bed\u80fd\u529b\u8303\u56f4">
          ${ENGLISH_FOCUS_IDS.map((id) => `<label><input type="checkbox" name="learningProgramFocus" value="${escapeHtml(id)}"${checkedAttr(focusAreas, id, DEFAULT_OWNER_PROGRAM.focusAreas.includes(id))}> ${escapeHtml(focusLabel(id))}</label>`).join("")}
        </fieldset>
        <details class="learning-owner-advanced compact">
          <summary>\u67e5\u770b\u5185\u5bb9\u4f9d\u636e\u5f15\u7528</summary>
          <textarea id="learningProgramSourceRefs" class="input" rows="2" placeholder="\u4f9d\u636e\u6765\u6e90\u6458\u8981\uff0c\u4e00\u884c\u4e00\u4e2a">${escapeHtml(sourceRefs)}</textarea>
        </details>
        <button class="learning-coin-primary" type="submit">\u4fdd\u5b58\u9636\u6bb5\u76ee\u6807\u548c\u5185\u5bb9\u8303\u56f4</button>
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
    const data = options.programsData || {};
    if (!programs.length) {
      return `<div class="learning-coin-empty">${owner ? "\u8fd8\u6ca1\u6709\u5b66\u4e60\u8303\u56f4\u914d\u7f6e\u3002" : "\u6682\u65e0\u5b66\u4e60\u5b89\u6392\u3002"}</div>`;
    }
    const draftByProgram = new Map(latestDrafts.map((draft) => [draft.programId, draft]));
    return programs.map((program) => {
      const draft = draftByProgram.get(program.programId);
      const needsRebuild = owner && draftNeedsRebuild(data, draft);
      const canRebuild = owner && draftCanBeRebuilt(data, draft);
      const draftPublished = String(draft?.status || "") === "published";
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
        ${needsRebuild ? `<div class="learning-program-rebuild-warning" data-learning-program-stale-draft="${escapeHtml(draft.draftId || "")}">\u68c0\u6d4b\u5230\u65e7\u8bfe\u7a0b\u53c2\u8003\u5c42\uff0c\u5efa\u8bae\u4f5c\u5e9f\u5f53\u524d\u5f85\u5ba1\u6838\u5468\u8ba1\u5212\u5e76\u91cd\u65b0\u751f\u6210\u3002</div>` : ""}
        ${owner ? `<div class="learning-program-actions">
          <button type="button" data-learning-program-draft-action="${escapeHtml(program.programId)}">\u751f\u6210\u5468\u8ba1\u5212</button>
          ${canRebuild ? `<button type="button" data-learning-program-rebuild-draft="${escapeHtml(program.programId)}">\u4f5c\u5e9f\u5e76\u91cd\u5efa</button>` : ""}
          <button type="button" data-learning-program-publish="${escapeHtml(program.programId)}" ${draft && !draft.reliability?.publishBlocked && !needsRebuild && !draftPublished ? "" : "disabled"}>${draftPublished ? "\u5df2\u81ea\u52a8\u4e0b\u53d1" : "\u4e0b\u53d1\u4efb\u52a1"}</button>
        </div>` : ""}
      </article>`;
    }).join("");
  }

  function renderTaskRows(taskCards = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const tasks = asArray(taskCards).slice(0, 8);
    const sessions = asArray(options.sessions);
    if (!tasks.length) return `<div class="learning-coin-empty">\u6682\u65e0\u5f85\u6267\u884c\u4efb\u52a1\u3002</div>`;
    return `<div class="learning-program-task-list">
      ${tasks.map((task) => {
        const session = latestSessionForTask(task, sessions);
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
          ${renderTaskAction(task, session, options)}
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
    const settlements = asArray(options.rewardSettlements);
    const settlementByEvaluation = new Map(settlements.map((item) => [String(item?.evaluationId || ""), item]).filter(([id]) => id));
    return `<div class="learning-program-evaluation-list">
      ${items.map((item) => {
        const settlement = settlementByEvaluation.get(String(item.evaluationId || ""));
        const canSettle = isOwner(options) && item.passed && (!settlement || String(settlement.status || "") !== "settled");
        const publicStatus = settlement && !isOwner(options)
          ? "\u5f85\u786e\u8ba4"
          : (settlement ? settlementStatusText(settlement.status) : (item.passed ? "\u901a\u8fc7" : "\u5f85\u4fee\u590d"));
        return `<article class="learning-program-review-item" data-learning-evaluation-summary="${escapeHtml(item.evaluationId)}">
        <div>
          <strong>${escapeHtml([evaluationStatusText(item.status), item.score || item.score === 0 ? `${item.score}` : ""].filter(Boolean).join(" / "))}</strong>
          <p>${escapeHtml(item.summary || "\u672a\u586b\u5199\u8bc4\u4f30\u6458\u8981")}</p>
        </div>
        ${canSettle ? `<button type="button" data-learning-evaluation-settle="${escapeHtml(item.evaluationId)}">\u7ed3\u7b97\u91d1\u5e01</button>` : `<span class="learning-program-status-chip">${escapeHtml(publicStatus)}</span>`}
      </article>`;
      }).join("")}
    </div>`;
  }

  function sessionStepText(step, options = {}) {
    const value = String(step || "");
    if (!isOwner(options) && value === "reward_settlement") return "\u5df2\u5b8c\u6210 / \u7b49\u5f85\u786e\u8ba4";
    const labels = {
      receive_task: "\u63a5\u6536\u4efb\u52a1",
      ai_goal_explain: "\u76ee\u6807\u8bf4\u660e",
      learner_attempt: "\u4f5c\u7b54\u4e2d",
      ai_hint: "\u63d0\u793a",
      learner_revision: "\u4fee\u6539\u4e2d",
      ai_evaluation: "\u8bc4\u4f30",
      mistake_explanation: "\u9519\u56e0\u590d\u76d8",
      variant_repair: "\u53d8\u5f0f\u4fee\u590d",
      reward_settlement: "\u7ed3\u7b97",
    };
    return labels[value] || value || "\u8fdb\u884c\u4e2d";
  }

  function latestSessionForTask(task, sessions = []) {
    const taskCardId = String(task?.taskCardId || "");
    const matches = asArray(sessions).filter((session) => String(session?.taskCardId || "") === taskCardId);
    if (!matches.length) return null;
    return matches.slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
  }

  function latestRecordForTask(records = [], taskCardId = "", field = "updatedAt") {
    const id = String(taskCardId || "");
    const matches = asArray(records).filter((record) => String(record?.taskCardId || "") === id);
    if (!matches.length) return null;
    return matches.slice().sort((a, b) => String(b?.[field] || b?.updatedAt || b?.createdAt || "").localeCompare(String(a?.[field] || a?.updatedAt || a?.createdAt || "")))[0];
  }

  function growthTaskUi(options = {}) {
    return options.growthTaskUi
      || (typeof globalThis !== "undefined" ? globalThis.HermesLearningGrowthTaskUi : null)
      || null;
  }

  function growthTaskUiInput(task = {}) {
    return Object.assign({ learningTaskModel: task.taskModel || task.learningTaskModel }, task);
  }

  function fallbackSubmissionGuard(task = {}) {
    const model = task.taskModel || task.learningTaskModel || {};
    const activity = String(model.activityType || "").trim().toLowerCase();
    const base = {
      writing: { minWords: 80, minChars: 300 },
      reading: { minWords: 50, minChars: 250 },
      listening: { minWords: 35, minChars: 180 },
      speaking: { minWords: 45, minChars: 220 },
      pronunciation: { minWords: 20, minChars: 100 },
      vocabulary: { minWords: 40, minChars: 220 },
      grammar: { minWords: 35, minChars: 180 },
      rewriting: { minWords: 70, minChars: 380 },
      presentation: { minWords: 60, minChars: 320 },
      weekly_challenge: { minWords: 80, minChars: 450 },
    }[activity] || { minWords: 40, minChars: 200 };
    return Object.assign({ activityType: activity || "default", stage: "draft" }, base);
  }

  function nativeGrowthSubmissionPrompt(task = {}, options = {}) {
    const helper = growthTaskUi(options);
    if (helper && typeof helper.submissionPrompt === "function") {
      return helper.submissionPrompt({}, growthTaskUiInput(task));
    }
    return "\u5199\u4e0b\u672c\u6b21\u5b66\u4e60\u4efb\u52a1\u4f5c\u7b54\uff0c\u63d0\u4ea4\u540e\u7531 AI \u6279\u6539\u5e76\u751f\u6210\u53cd\u9988\u3002";
  }

  function nativeGrowthSubmissionGuard(task = {}, options = {}) {
    const helper = growthTaskUi(options);
    if (helper && typeof helper.submissionGuard === "function") {
      return helper.submissionGuard(growthTaskUiInput(task), {});
    }
    return fallbackSubmissionGuard(task);
  }

  function nativeGrowthRequirementLabel(guard = {}, options = {}) {
    const helper = growthTaskUi(options);
    if (helper && typeof helper.submissionRequirementLabel === "function") {
      return helper.submissionRequirementLabel(guard);
    }
    return `\u81f3\u5c11 ${Number(guard.minWords || 0)} \u4e2a\u82f1\u6587\u8bcd / ${Number(guard.minChars || 0)} \u4e2a\u6709\u6548\u5b57\u7b26`;
  }

  function nativeGrowthRequiresAudio(task = {}) {
    const model = task.taskModel || task.learningTaskModel || {};
    const activityType = String(model.activityType || "").toLowerCase();
    const skillId = String(model.skillId || task.skillId || (task.skillIds || [])[0] || "").toLowerCase();
    return activityType === "speaking"
      || activityType === "pronunciation"
      || skillId === "english_speaking_retell"
      || skillId === "english_pronunciation_shadowing";
  }

  function nativeGrowthSubmissionRecordingStatus(taskCardId, options = {}) {
    const recorder = options.state?.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
    const duration = typeof formatKanbanReadingRecordingDuration === "function" && typeof kanbanReadingRecordingDuration === "function"
      ? formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recorder))
      : "";
    if (recorder.status === "requesting") return "\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650...";
    if (recorder.status === "recording") return `\u6b63\u5728\u5f55\u97f3 ${duration}`.trim();
    if (recorder.status === "stopping") return "\u6b63\u5728\u751f\u6210\u590d\u8ff0\u5f55\u97f3...";
    if (recorder.status === "ready") return `\u5df2\u5f55\u597d\u590d\u8ff0 ${duration}`.trim();
    if (recorder.status === "unsupported") return "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u5f55\u97f3\u3002";
    if (recorder.status === "error") return recorder.error || "\u590d\u8ff0\u5f55\u97f3\u4e0d\u53ef\u7528\uff0c\u8bf7\u91cd\u8bd5\u3002";
    return "\u9605\u8bfb\u4e0a\u65b9\u6750\u6599\u540e\uff0c\u7528\u82f1\u8bed\u5f55\u97f3\u590d\u8ff0\u3002\u63d0\u4ea4\u540e\u4f1a\u5148\u8f6c\u5199\uff0c\u518d\u8fdb\u5165 AI \u6279\u6539\u3002";
  }

  function renderNativeGrowthAudioRecorder(task = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(task?.taskCardId || "");
    const recorder = options.state?.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
    const status = String(recorder.status || "");
    const ready = status === "ready" && recorder.url;
    const recording = status === "recording";
    const waiting = status === "requesting" || status === "stopping";
    return `<div class="learning-native-growth-recorder" data-learning-native-growth-recorder="${escapeHtml(taskCardId)}">
      <div class="learning-native-growth-recorder-status" data-learning-native-growth-record-status="${escapeHtml(taskCardId)}">${escapeHtml(nativeGrowthSubmissionRecordingStatus(taskCardId, options))}</div>
      ${ready ? `<audio controls preload="metadata" src="${escapeHtml(recorder.url)}"></audio>` : ""}
      <div class="learning-program-task-actions learning-native-growth-recorder-actions">
        ${recording
          ? `<button type="button" data-learning-native-growth-record-stop="${escapeHtml(taskCardId)}">\u505c\u6b62\u5f55\u97f3</button>`
          : `<button type="button" data-learning-native-growth-record-start="${escapeHtml(taskCardId)}" ${waiting ? "disabled" : ""}>${ready ? "\u91cd\u65b0\u5f55\u97f3" : "\u5f00\u59cb\u5f55\u97f3"}</button>`}
        ${ready || recording || status === "error" ? `<button type="button" data-learning-native-growth-record-cancel="${escapeHtml(taskCardId)}">\u6e05\u9664</button>` : ""}
      </div>
    </div>`;
  }

  function nativeGrowthReflectionRecordingStatus(taskCardId, options = {}) {
    const recorder = options.state?.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
    const duration = typeof formatKanbanReadingRecordingDuration === "function" && typeof kanbanReadingRecordingDuration === "function"
      ? formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recorder))
      : "";
    if (recorder.status === "requesting") return "\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650...";
    if (recorder.status === "recording") return `\u6b63\u5728\u5f55\u97f3 ${duration}`.trim();
    if (recorder.status === "stopping") return "\u6b63\u5728\u751f\u6210\u590d\u76d8\u5f55\u97f3...";
    if (recorder.status === "ready") return `\u5df2\u5f55\u597d\u590d\u76d8 ${duration}`.trim();
    if (recorder.status === "unsupported") return "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u5f55\u97f3\u3002";
    if (recorder.status === "error") return recorder.error || "\u590d\u76d8\u5f55\u97f3\u4e0d\u53ef\u7528\uff0c\u8bf7\u91cd\u8bd5\u3002";
    return "\u9605\u8bfb AI \u53cd\u9988\u540e\uff0c\u5f55\u4e00\u6bb5\u590d\u76d8\uff0c\u8bf4\u660e\u9519\u8bef\u3001\u4fee\u6539\u539f\u56e0\u548c\u4e0b\u6b21\u7ec3\u4e60\u65b9\u5411\u3002";
  }

  function renderNativeGrowthReflectionRecorder(task = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(task?.taskCardId || "");
    const recorder = options.state?.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
    const status = String(recorder.status || "");
    const ready = status === "ready" && recorder.url;
    const recording = status === "recording";
    const waiting = status === "requesting" || status === "stopping";
    return `<div class="learning-native-growth-recorder" data-learning-native-growth-reflection-recorder="${escapeHtml(taskCardId)}">
      <div class="learning-native-growth-recorder-status" data-learning-native-growth-reflection-record-status="${escapeHtml(taskCardId)}">${escapeHtml(nativeGrowthReflectionRecordingStatus(taskCardId, options))}</div>
      ${ready ? `<audio controls preload="metadata" src="${escapeHtml(recorder.url)}"></audio>` : ""}
      <div class="learning-program-task-actions learning-native-growth-recorder-actions">
        ${recording
          ? `<button type="button" data-learning-native-growth-reflection-record-stop="${escapeHtml(taskCardId)}">\u505c\u6b62\u5f55\u97f3</button>`
          : `<button type="button" data-learning-native-growth-reflection-record-start="${escapeHtml(taskCardId)}" ${waiting ? "disabled" : ""}>${ready ? "\u91cd\u65b0\u5f55\u590d\u76d8" : "\u5f00\u59cb\u5f55\u590d\u76d8"}</button>`}
        ${ready || recording || status === "error" ? `<button type="button" data-learning-native-growth-reflection-record-cancel="${escapeHtml(taskCardId)}">\u6e05\u9664</button>` : ""}
      </div>
    </div>`;
  }

  function structuredQuestionItems(task = {}) {
    const model = task.taskModel || task.learningTaskModel || {};
    const items = Array.isArray(task.questionItems) ? task.questionItems
      : Array.isArray(model.questionItems) ? model.questionItems
        : Array.isArray(model.questions) ? model.questions
          : [];
    return items.map((item, index) => {
      const id = String(item?.id || `q${index + 1}`).trim();
      const type = String(item?.type || item?.questionType || "").trim().toLowerCase();
      const choices = Array.isArray(item?.choices) ? item.choices : [];
      return Object.assign({}, item, {
        id,
        type: type === "single_choice" ? "multiple_choice" : type,
        choices,
      });
    }).filter((item) => item.id && (item.stem || item.body || item.prompt || item.title || item.question || item.choices.length));
  }

  function renderStructuredQuestionSubmission(task = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const questions = structuredQuestionItems(task);
    if (!questions.length) return "";
    return `<div class="learning-native-growth-questions" data-learning-native-growth-questions>
      ${questions.map((item, index) => {
        const questionId = String(item.id || `q${index + 1}`);
        const type = String(item.type || "written");
        const title = String(item.title || `第 ${index + 1} 题`);
        const prompt = String(item.stem || item.body || item.prompt || item.question || "");
        if (type === "multiple_choice") {
          const choices = asArray(item.choices).map((choice, choiceIndex) => {
            const value = String(choice?.id || choice?.value || String.fromCharCode(65 + choiceIndex));
            const label = String(choice?.label || value);
            const text = String(choice?.text || choice?.content || choice?.label || value);
            return `<label class="learning-native-growth-choice">
              <input type="radio" name="learning-growth-${escapeHtml(questionId)}" value="${escapeHtml(value)}" data-learning-native-growth-question-choice="${escapeHtml(questionId)}">
              <span><b>${escapeHtml(label)}</b>${escapeHtml(text === label ? "" : ` ${text}`)}</span>
            </label>`;
          }).join("");
          return `<fieldset class="learning-native-growth-question" data-learning-native-growth-question="${escapeHtml(questionId)}" data-question-type="multiple_choice" data-question-title="${escapeHtml(title)}">
            <legend>${escapeHtml(title)}</legend>
            ${prompt ? `<p>${escapeHtml(prompt)}</p>` : ""}
            <div class="learning-native-growth-choice-list">${choices}</div>
            <label class="learning-native-growth-reason-label">
              <span>${escapeHtml(item.reasonLabel || "简短理由")}</span>
              <textarea class="input learning-native-growth-question-reason" rows="2" maxlength="1200" data-learning-native-growth-question-reason="${escapeHtml(questionId)}" placeholder="${escapeHtml(item.reasonPlaceholder || "写 1-2 句理由")}"></textarea>
            </label>
          </fieldset>`;
        }
        return `<fieldset class="learning-native-growth-question" data-learning-native-growth-question="${escapeHtml(questionId)}" data-question-type="written" data-question-title="${escapeHtml(title)}">
          <legend>${escapeHtml(title)}</legend>
          ${prompt ? `<p>${escapeHtml(prompt)}</p>` : ""}
          <textarea class="input learning-native-growth-question-response" rows="5" maxlength="5000" data-learning-native-growth-question-response="${escapeHtml(questionId)}" placeholder="${escapeHtml(item.responsePlaceholder || "写出关键推理过程")}"></textarea>
        </fieldset>`;
      }).join("")}
    </div>`;
  }

  function renderNativeGrowthSubmission(task = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(task?.taskCardId || "");
    if (!taskCardId) return "";
    const guard = nativeGrowthSubmissionGuard(task, options);
    const requiresAudio = nativeGrowthRequiresAudio(task);
    const structuredQuestions = !requiresAudio ? renderStructuredQuestionSubmission(task, options) : "";
    const kanbanCardId = String(task?.kanbanCardId || task?.todoId || "");
    const workspaceId = String(task?.workspaceId || "");
    const nativeState = task?.nativeState || {};
    const nextAction = String(nativeState.nextAction || "");
    const detailButton = options.hideNativeGrowthDetailButton ? "" : `<button type="button" data-learning-open-growth-task="${escapeHtml(taskCardId)}" data-workspace-id="${escapeHtml(workspaceId)}">\u67e5\u770b\u4efb\u52a1\u8be6\u60c5</button>`;
    const stateLabel = {
      submit: "\u5f85\u4f5c\u7b54",
      waiting_feedback: "\u5df2\u63d0\u4ea4\uff0c\u7b49\u5f85 AI \u6279\u6539",
      revise: "\u9700\u8981\u4fee\u6539\u540e\u518d\u63d0\u4ea4",
      spoken_reflection: "\u9700\u8981\u5f55\u97f3\u6216\u6587\u5b57\u590d\u76d8",
      complete: "\u5df2\u5b8c\u6210",
    }[nextAction] || "";
    if (nextAction === "complete") {
      return `<div class="learning-native-growth-submission-state is-ready">${escapeHtml(stateLabel || "\u5df2\u5b8c\u6210")}</div>`;
    }
    if (nextAction === "spoken_reflection") {
      return `<form class="learning-native-growth-submission-form" data-learning-native-growth-reflection-form="${escapeHtml(taskCardId)}" data-task-card-id="${escapeHtml(taskCardId)}">
        <p class="learning-native-growth-prompt">\u9605\u8bfb AI \u53cd\u9988\u540e\uff0c\u7528\u81ea\u5df1\u7684\u8bdd\u8bf4\u660e\u672c\u6b21\u4e3b\u8981\u9519\u8bef\u3001\u4fee\u6539\u539f\u56e0\u548c\u4e0b\u6b21\u7ec3\u4e60\u65b9\u5411\u3002</p>
        ${renderNativeGrowthReflectionRecorder(task, options)}
        <div class="learning-native-growth-submission-state" data-learning-native-growth-reflection-state="${escapeHtml(taskCardId)}">${escapeHtml(stateLabel)}</div>
        <div class="learning-program-task-actions">
          <button type="submit" data-learning-submit-native-growth-reflection="${escapeHtml(taskCardId)}">\u63d0\u4ea4\u5f55\u97f3\u590d\u76d8</button>
          ${detailButton}
        </div>
      </form>`;
    }
    return `<form class="learning-native-growth-submission-form" data-learning-native-growth-submission-form="${escapeHtml(taskCardId)}" data-task-card-id="${escapeHtml(taskCardId)}" data-min-words="${escapeHtml(String(guard.minWords || 0))}" data-min-chars="${escapeHtml(String(guard.minChars || 0))}" data-requires-audio="${requiresAudio ? "1" : "0"}">
      <p class="learning-native-growth-prompt">${escapeHtml(nativeGrowthSubmissionPrompt(task, options))}</p>
      ${stateLabel ? `<div class="learning-native-growth-submission-state">${escapeHtml(stateLabel)}</div>` : ""}
      ${requiresAudio ? renderNativeGrowthAudioRecorder(task, options) : structuredQuestions || `<textarea class="input learning-native-growth-submission-input" name="text" rows="4" maxlength="12000" data-learning-native-growth-submission-input="${escapeHtml(taskCardId)}" placeholder="\u5728\u8fd9\u91cc\u76f4\u63a5\u5199\u4f5c\u7b54\uff0c\u63d0\u4ea4\u540e\u7b49\u5f85 AI \u6279\u6539"></textarea>
      <div class="todo-learning-growth-submit-requirement" data-learning-native-growth-submission-count="${escapeHtml(taskCardId)}">${escapeHtml(nativeGrowthRequirementLabel(guard, options))}</div>`}
      <div class="learning-program-task-actions">
        <button type="submit" data-learning-submit-native-growth="${escapeHtml(taskCardId)}">${requiresAudio ? "\u63d0\u4ea4\u5f55\u97f3\u7ed9 AI \u6279\u6539" : "\u63d0\u4ea4\u7ed9 AI \u6279\u6539"}</button>
        ${detailButton}
      </div>
      <div class="learning-native-growth-submission-state" data-learning-native-growth-submission-state="${escapeHtml(taskCardId)}" aria-live="polite"></div>
    </form>`;
  }

  function taskActionFromRecords(task = {}, data = {}) {
    const nativeAction = String(task?.nativeState?.nextAction || "");
    if (nativeAction) return nativeAction;
    const taskCardId = String(task?.taskCardId || "");
    const reflection = latestRecordForTask(data.taskReflections || [], taskCardId, "submittedAt");
    const evaluation = latestRecordForTask(data.evaluations || [], taskCardId, "createdAt");
    const submission = latestRecordForTask(data.taskSubmissions || [], taskCardId, "submittedAt");
    if (String(task.status || "").toLowerCase() === "completed" || String(reflection?.status || "") === "accepted") return "complete";
    if (String(evaluation?.status || "") === "reflection_required") return "spoken_reflection";
    if (["needs_repair", "needs_revision"].includes(String(evaluation?.status || ""))) return "revise";
    if (String(submission?.status || "")) return "waiting_feedback";
    return "submit";
  }

  function renderTaskRewardPolicy(task = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const policy = taskRewardPolicy(task);
    return `<section class="learning-growth-answer-reward" data-learning-task-reward-policy>
      <div class="learning-growth-answer-reward-head">
        <h4>\u5956\u52b1\u673a\u5236</h4>
        <strong>\u5956\u52b1 ${escapeHtml(String(policy.maxCoins))} \u91d1\u5e01</strong>
      </div>
      <div class="learning-growth-answer-reward-grid">
        <span><b>${escapeHtml(String(policy.minCoins))}</b><small>\u901a\u8fc7\u57fa\u7840</small></span>
        <span><b>${escapeHtml(String(policy.accuracyBonusMax))}</b><small>\u51c6\u786e\u5ea6\u52a0\u6210</small></span>
        <span><b>${escapeHtml(String(policy.timelinessBonusMax))}</b><small>\u6309\u65f6\u52a0\u6210</small></span>
        <span><b>${escapeHtml(String(policy.interactionBonusMax))}</b><small>\u4fee\u6539\u4e92\u52a8\u52a0\u6210</small></span>
      </div>
      <p>\u5956\u52b1\u5728 AI \u8bc4\u4ef7\u901a\u8fc7\u3001\u5b8c\u6210\u5fc5\u8981\u590d\u76d8\u540e\u8fdb\u5165\u7ed3\u7b97\uff1b\u8d85\u51fa\u81ea\u52a8\u7ed3\u7b97\u9608\u503c\u6216\u8bc1\u636e\u4e0d\u8db3\u65f6\u9700\u8981 Owner \u590d\u6838\u3002</p>
    </section>`;
  }

  function renderNativeGrowthTaskDetail(task = {}, data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(task?.taskCardId || "");
    if (!taskCardId) return `<div class="learning-coin-empty">\u672a\u627e\u5230\u8fd9\u5f20\u5b66\u4e60\u5361\u3002</div>`;
    const model = task.taskModel || task.learningTaskModel || {};
    const skills = compactFocus(task.skillIds || model.skillTargets || []).slice(0, 120);
    const latestEvaluation = latestRecordForTask(data.evaluations || [], taskCardId, "createdAt");
    const meta = [task.plannedDate, task.plannedMinutes ? `${task.plannedMinutes} min` : "", skills].filter(Boolean);
    const instruction = task.learnerInstruction || task.instruction || model.learnerInstruction || task.instructionPreview || task.summary || "";
    const taskForForm = Object.assign({ source: "learning-growth" }, task, {
      nativeState: Object.assign({}, task.nativeState || {}, { nextAction: taskActionFromRecords(task, data) }),
    });
    return `<section class="learning-growth-answer-card" data-learning-growth-answer-card data-learning-executable-task-id="${escapeHtml(taskCardId)}">
      <div class="learning-growth-answer-card-head">
        <div>
          <span>\u7b54\u9898\u5361</span>
          <h3>${escapeHtml(task.title || taskCardId || "\u5b66\u4e60\u4efb\u52a1")}</h3>
        </div>
        <strong>${escapeHtml(taskStatusText(task.status, options))}</strong>
      </div>
      ${meta.length ? `<div class="learning-growth-answer-card-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${instruction ? `<section class="learning-growth-answer-instruction"><h4>\u4efb\u52a1\u8981\u6c42</h4><p>${escapeHtml(instruction)}</p></section>` : ""}
      ${renderTaskRewardPolicy(taskForForm, options)}
      ${latestEvaluation ? `<section class="learning-growth-answer-feedback"><h4>\u6700\u8fd1\u6279\u6539</h4>${renderFeedbackHistory(taskForForm, latestEvaluation)}</section>` : ""}
      ${renderTaskAction(taskForForm, null, Object.assign({}, options, { hideNativeGrowthDetailButton: true }))}
    </section>`;
  }

  function renderTaskAction(task, session, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const taskCardId = String(task?.taskCardId || "");
    const todoId = String(task?.todoId || task?.kanbanCardId || "");
    const workspaceId = String(task?.workspaceId || "");
    const status = String(task?.status || "");
    const nativeGrowth = task?.source === "learning-growth" && taskCardId;
    if (nativeGrowth) {
      if (["completed", "archived", "blocked"].includes(status)) return "";
      return renderNativeGrowthSubmission(task, options);
    }
    if (todoId || task?.source === "kanban") {
      if (!todoId || ["completed", "archived", "blocked"].includes(status)) return "";
      return `<div class="learning-program-task-actions">
        <button type="button" data-learning-open-kanban-card="${escapeHtml(todoId)}" data-workspace-id="${escapeHtml(workspaceId)}">\u6253\u5f00\u4efb\u52a1</button>
      </div>`;
    }
    if (!taskCardId || ["completed", "archived", "blocked"].includes(status)) return "";
    if (!session) {
      const canStart = status === "published" || status === "active";
      if (!canStart) return "";
      return `<div class="learning-program-task-actions">
        <button type="button" data-learning-task-start="${escapeHtml(taskCardId)}">\u5f00\u59cb</button>
      </div>`;
    }
    const sessionStatus = String(session.status || "active");
    const complete = sessionStatus === "completed";
    return `<div class="learning-program-task-actions" data-learning-session-id="${escapeHtml(session.sessionId || "")}">
      <span class="learning-program-status-chip">${escapeHtml([sessionStatus, sessionStepText(session.currentStep, options)].filter(Boolean).join(" / "))}</span>
      ${complete ? "" : `<button type="button" data-learning-session-advance="${escapeHtml(session.sessionId || "")}">\u4e0b\u4e00\u6b65</button>`}
      ${complete || !isOwner(options) ? "" : `<form class="learning-evaluation-inline-form" data-learning-evaluation-form="${escapeHtml(session.sessionId || "")}">
        <input class="input" name="score" type="number" min="0" max="100" placeholder="\u5f97\u5206">
        <input class="input" name="summary" type="text" autocomplete="off" maxlength="280" placeholder="\u53ea\u5199\u8bc4\u4ef7\u6458\u8981">
        <button type="submit">\u8bb0\u5f55\u8bc4\u4ef7</button>
      </form>`}
    </div>`;
  }

  function renderExecutableTaskRows(tasks = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const items = asArray(tasks).slice(0, 8);
    if (!items.length) return "";
    return `<section class="learning-coin-panel learning-program-executable-panel" data-learning-executable-tasks>
      <div class="learning-section-heading"><h3>\u5df2\u4e0b\u53d1\u4efb\u52a1</h3><span>${escapeHtml(String(items.length))}</span></div>
      <div class="learning-program-task-list">
        ${items.map((task) => {
          const skills = compactFocus(task.skillIds || []).slice(0, 80);
          const meta = [
            task.dueLocal || task.plannedDate,
            task.nativeState?.status ? `\u72b6\u6001: ${task.nativeState.status}` : "",
            skills,
          ].filter(Boolean).join(" / ");
          return `<article class="learning-program-task-item" data-learning-executable-task-id="${escapeHtml(task.todoId || task.taskCardId || "")}">
            <div>
              <strong>${escapeHtml(task.title || task.taskCardId || "\u5b66\u4e60\u4efb\u52a1")}</strong>
              <p>${escapeHtml(meta || task.taskCardType || "")}</p>
            </div>
            <span>${escapeHtml(taskStatusText(task.status, options))}</span>
            ${renderTaskAction(task, null, options)}
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }

  function renderDailyPlanPanel(dailyPlan = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!dailyPlan || typeof dailyPlan !== "object") return "";
    const summary = dailyPlan.summary || {};
    const activeDays = asArray(dailyPlan.days).filter((day) => asArray(day.tasks).length).slice(0, 5);
    const nextTask = dailyPlan.nextTask || null;
    return `<section class="learning-coin-panel learning-daily-plan-panel" data-learning-daily-plan>
      <div class="learning-section-heading">
        <h3>\u4eca\u65e5\u4e0e\u8fd1\u671f\u8ba1\u5212</h3>
        <span>${escapeHtml(String(summary.pendingTasks || 0))} \u5f85\u6267\u884c</span>
      </div>
      <div class="learning-daily-plan-summary">
        <span><strong>${escapeHtml(String(summary.totalTasks || 0))}</strong><small>\u4efb\u52a1</small></span>
        <span><strong>${escapeHtml(String(summary.totalMinutes || 0))}</strong><small>\u5206\u949f</small></span>
        <span><strong>${escapeHtml(String(summary.activeDays || 0))}</strong><small>\u6709\u5b89\u6392\u5929</small></span>
      </div>
      ${nextTask ? `<p class="learning-program-guidance-copy">\u4e0b\u4e00\u4e2a\uff1a${escapeHtml(nextTask.title || nextTask.taskCardId || "")}</p>` : ""}
      ${activeDays.length ? `<div class="learning-daily-plan-list">
        ${activeDays.map((day) => `<article>
          <strong>${escapeHtml(day.date || "")}</strong>
          <span>${escapeHtml(String(day.pendingCount || asArray(day.tasks).length))} \u9879 / ${escapeHtml(String(day.totalMinutes || 0))} min</span>
        </article>`).join("")}
      </div>` : `<div class="learning-coin-empty">\u8fd1\u671f\u6682\u65e0\u53ef\u6267\u884c\u5b66\u4e60\u4efb\u52a1\u3002</div>`}
    </section>`;
  }

  function renderExecutionOverview(data = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const tasks = asArray(data.taskCards);
    const executableTasks = asArray(data.executableTasks);
    const programs = asArray(data.programs);
    const taskOptions = Object.assign({}, options, { sessions: data.interactionSessions || [] });
    const pendingCount = executableTasks.length
      + (tasks.filter((task) => !["completed", "archived"].includes(String(task.status || ""))).length || programs.length);
    return `<section class="learning-growth-category learning-program-execution-panel" data-learning-growth-category="execution">
      <div class="learning-growth-category-heading">
        <h3>\u6267\u884c\u6982\u89c8 / \u5f85\u6267\u884c</h3>
        <span>${escapeHtml(String(pendingCount))} \u9879</span>
      </div>
      ${renderDailyPlanPanel(data.dailyPlan || {}, options)}
      ${renderExecutableTaskRows(executableTasks, taskOptions)}
      <div class="learning-program-execution-grid">
        <section class="learning-coin-panel">
          <div class="learning-section-heading"><h3>\u4efb\u52a1\u72b6\u6001</h3><span>Task</span></div>
          ${renderTaskRows(tasks, taskOptions)}
        </section>
        <section class="learning-coin-panel">
          <div class="learning-section-heading"><h3>${isOwner(options) ? "\u5b66\u4e60\u8ba1\u5212" : "\u5b66\u4e60\u5b89\u6392"}</h3><span>${escapeHtml(String(programs.length))}</span></div>
          <div class="learning-program-list">${renderProgramCards(programs, data.latestDrafts || [], Object.assign({}, options, { programsData: data }))}</div>
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
          ${renderEvaluationRows(data.evaluations || [], Object.assign({}, options, { rewardSettlements: data.rewardSettlements || [] }))}
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

  function launchStatusText(status) {
    const value = String(status || "");
    if (value === "ready") return "\u5df2\u5c31\u7eea";
    if (value === "attention_required") return "\u9700\u5904\u7406";
    if (value === "blocked") return "\u5df2\u963b\u65ad";
    return value || "\u5f85\u786e\u8ba4";
  }

  function operationReasonText(reasonCode) {
    const value = String(reasonCode || "");
    const labels = {
      missing_learning_source_or_goal: "\u8865\u5145\u5b66\u4e60\u6765\u6e90\u6216\u76ee\u6807",
      missing_learning_program: "\u521b\u5efa\u5b66\u4e60\u8ba1\u5212",
      launch_blockers_present: "\u5148\u5904\u7406\u963b\u65ad\u9879",
      pending_parent_review: "\u5904\u7406\u5bb6\u957f\u5ba1\u6838",
      pending_reward_settlement: "\u5904\u7406\u5956\u52b1\u7ed3\u7b97",
      no_published_learning_tasks: "\u4e0b\u53d1\u9996\u6279\u5b66\u4e60\u4efb\u52a1",
      pending_coin_redemptions: "\u5ba1\u6838\u5151\u6362\u7533\u8bf7",
      task_ready_for_executor: "\u5df2\u4e0b\u53d1\u7ed9\u6267\u884c\u8005",
      session_in_progress: "\u5b66\u4e60\u4e2d",
      passed_evaluation_needs_reward_settlement: "\u901a\u8fc7\u540e\u5f85\u7ed3\u7b97",
      reward_settlement_pending: "\u5956\u52b1\u5f85\u5904\u7406",
      draft_blocked_by_reliability: "\u8ba1\u5212\u88ab\u53ef\u9760\u6027\u62e6\u622a",
      task_blocked: "\u4efb\u52a1\u963b\u65ad",
      evaluation_requires_repair: "\u8bc4\u4f30\u9700\u4fee\u590d",
      reward_settlement_blocked: "\u5956\u52b1\u7ed3\u7b97\u963b\u65ad",
    };
    return labels[value] || value || "\u5f85\u5904\u7406";
  }

  function renderLaunchQueue(title, items = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const list = asArray(items).slice(0, 4);
    if (!list.length) return "";
    return `<div class="learning-launch-queue">
      <strong>${escapeHtml(title)}</strong>
      <div class="learning-program-review-list">
        ${list.map((item) => `<article class="learning-program-review-item" data-learning-launch-operation-item="${escapeHtml(item.resourceType || item.type || "")}:${escapeHtml(item.resourceId || "")}">
          <div>
            <strong>${escapeHtml(item.title || item.resourceId || item.resourceType || "")}</strong>
            <p>${escapeHtml(operationReasonText(item.reasonCode))}</p>
          </div>
          <span class="learning-program-status-chip">${escapeHtml(item.priority || item.status || "normal")}</span>
        </article>`).join("")}
      </div>
    </div>`;
  }

  function renderLaunchOperationsPanel(launchOperations = {}, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!isOwner(options) || !launchOperations || typeof launchOperations !== "object") return "";
    const counts = launchOperations.counts || {};
    const queues = launchOperations.queues || {};
    const nextActions = asArray(launchOperations.nextActions).slice(0, 5);
    return `<section class="learning-coin-panel learning-launch-operations-panel" data-learning-launch-operations data-launch-status="${escapeHtml(launchOperations.status || "")}">
      <div class="learning-section-heading">
        <h3>4. \u751f\u6210\u8ba1\u5212\u5e76\u5ba1\u6838</h3>
        <span>${escapeHtml(launchStatusText(launchOperations.status))}</span>
      </div>
      <div class="learning-program-report-grid">
        <span><strong>${escapeHtml(String(counts.publishedTasks || 0))}</strong><small>\u5df2\u4e0b\u53d1\u4efb\u52a1</small></span>
        <span><strong>${escapeHtml(String(counts.activeSessions || 0))}</strong><small>\u8fdb\u884c\u4e2d</small></span>
        <span><strong>${escapeHtml(String((counts.pendingPlanReviews || 0) + (counts.pendingParentReviews || 0)))}</strong><small>\u5f85\u5ba1\u6838</small></span>
        <span><strong>${escapeHtml(String((counts.pendingRewardSettlements || 0) + (counts.rewardCandidates || 0)))}</strong><small>\u5f85\u7ed3\u7b97</small></span>
      </div>
      <div class="learning-launch-next-actions">
        ${nextActions.length ? nextActions.map((item) => `<span data-learning-launch-next-action="${escapeHtml(item.id || "")}">${escapeHtml(operationReasonText(item.reasonCode))}</span>`).join("") : `<span>\u5f53\u524d\u65e0\u5fc5\u5904\u7406\u9879</span>`}
      </div>
      ${renderLaunchQueue("\u963b\u65ad\u9879", queues.blockers || [], options)}
      ${renderLaunchQueue("\u5ba1\u6838\u961f\u5217", queues.approvals || [], options)}
      ${renderLaunchQueue("\u6267\u884c\u961f\u5217", queues.execution || [], options)}
      ${renderLaunchQueue("\u5956\u52b1\u961f\u5217", queues.rewards || [], options)}
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
        <h3>\u5bb6\u957f\u914d\u7f6e\u5411\u5bfc</h3>
        <span>4 steps</span>
      </div>
      ${renderLaunchOperationsPanel(data.launchOperations || options.launchOperations || {}, options)}
      ${renderFoundationPanel(data, options)}
      ${renderProgramForm(data, options)}
      ${renderParentReportPanel(data, options)}
      ${renderReviewQueue(data.reviewItems || [], options)}
      ${renderParentReviewRequests(data.parentReviewRequests || [], options)}
      ${renderRewardSettlements(data.rewardSettlements || [], options)}
    </section>`;
  }

  function renderProgramSubsystem(options = {}) {
    const programs = options.programs || {};
    const data = programs.programs ? programs : {};
    const owner = isOwner(options);
    const parentAdmin = renderParentAdminPanel(data, options);
    const execution = renderExecutionOverview(data, options);
    const guidance = renderGuidancePanel(data, options);
    return `<section class="learning-program-section" data-learning-growth-module="programs">
      ${owner ? parentAdmin : ""}
      ${execution}
      ${guidance}
      ${owner ? "" : parentAdmin}
    </section>`;
  }

  return {
    compactFocus,
    renderDailyPlanPanel,
    renderExecutionOverview,
    renderFoundationPanel,
    renderGuidancePanel,
    renderParentAdminPanel,
    renderParentReportPanel,
    renderNativeGrowthTaskDetail,
    renderProgramCards,
    renderProgramForm,
    renderProgramSubsystem,
    renderLaunchOperationsPanel,
    renderParentReviewRequests,
    renderReviewQueue,
    renderRewardSettlements,
    renderSourceDirectoryPanel,
  };
}));
