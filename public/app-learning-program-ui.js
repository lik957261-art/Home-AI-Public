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

  function programStatusText(status) {
    const value = String(status || "");
    if (value === "active") return "\u8fdb\u884c\u4e2d";
    if (value === "draft") return "\u8349\u7a3f";
    if (value === "review_required") return "\u5f85\u5bb6\u957f\u5ba1\u6838";
    if (value === "published") return "\u5df2\u4e0b\u53d1";
    if (value === "blocked") return "\u5df2\u62e6\u622a";
    return value || "\u672a\u5b9a";
  }

  function compactFocus(focusAreas = []) {
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
    return asArray(focusAreas).map((id) => labels[id] || id).join(" / ");
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
        <span>${escapeHtml(programStatusText(draft.status))}</span>
      </div>
      <div class="learning-program-task-days">
        ${days.map((day) => `<span>${escapeHtml(day.date || "")}: ${escapeHtml(String(asArray(day.tasks).length))} \u9879</span>`).join("")}
      </div>
    </div>`;
  }

  function renderProgramCards(programs = [], latestDrafts = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    if (!programs.length) return `<div class="learning-coin-empty">\u8fd8\u6ca1\u6709\u5b66\u4e60\u8303\u56f4\u914d\u7f6e\u3002</div>`;
    const draftByProgram = new Map(latestDrafts.map((draft) => [draft.programId, draft]));
    return programs.map((program) => {
      const draft = draftByProgram.get(program.programId);
      return `<article class="learning-program-card" data-learning-program-id="${escapeHtml(program.programId)}">
        <div class="learning-program-card-top">
          <div>
            <h3>${escapeHtml(program.title || program.programId)}</h3>
            <p>${escapeHtml(program.goalSummary || "")}</p>
          </div>
          <span>${escapeHtml(programStatusText(program.status))}</span>
        </div>
        <div class="learning-program-meta-grid">
          <span><strong>${escapeHtml(program.domain || "")}</strong><small>\u9886\u57df</small></span>
          <span><strong>${escapeHtml(String(program.minutesPerDay || 0))}</strong><small>\u6bcf\u5929\u5206\u949f</small></span>
          <span><strong>${escapeHtml(String(program.daysPerWeek || 0))}</strong><small>\u6bcf\u5468\u5929\u6570</small></span>
        </div>
        <div class="learning-program-focus">${escapeHtml(compactFocus(program.focusAreas))}</div>
        ${renderDraftSummary(draft, options)}
        <div class="learning-program-actions">
          <button type="button" data-learning-program-draft-action="${escapeHtml(program.programId)}">\u751f\u6210\u5468\u8ba1\u5212</button>
          <button type="button" data-learning-program-publish="${escapeHtml(program.programId)}" ${draft && !draft.reliability?.publishBlocked ? "" : "disabled"}>\u4e0b\u53d1\u4efb\u52a1</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderReviewQueue(reviewItems = [], options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
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

  function renderProgramSubsystem(options = {}) {
    const programs = options.programs || {};
    const data = programs.programs ? programs : {};
    return `<section class="learning-program-section" data-learning-growth-module="programs">
      ${renderProgramForm(options)}
      <section class="learning-coin-panel">
        <div class="learning-section-heading">
          <h3>\u5b66\u4e60\u8ba1\u5212</h3>
          <span>\u53ef\u6269\u5c55\u8303\u56f4</span>
        </div>
        <div class="learning-program-list">${renderProgramCards(data.programs || [], data.latestDrafts || [], options)}</div>
      </section>
      ${renderReviewQueue(data.reviewItems || [], options)}
    </section>`;
  }

  return {
    compactFocus,
    renderProgramCards,
    renderProgramForm,
    renderProgramSubsystem,
    renderReviewQueue,
  };
}));
