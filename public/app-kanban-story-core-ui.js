"use strict";

function kanbanStoryHelperOptions(extra = {}) {
  return Object.assign({
    allTodos: state.todos || [],
    statusOrder: KANBAN_STATUS_ORDER,
    todoSortTimestamp,
    todoTitle,
    compactDisplayText,
    isKanbanReadingCard,
    isKanbanAssessmentCard,
    normalizedKanbanStatus,
    kanbanStatusMeta,
    assessmentExamSummary,
    assessmentExamCompleted,
    assessmentCardAcceptsStart,
    readingSubmissionHasAnalysis,
    readingSubmissionCompleted,
    readingCardAcceptsSubmission,
    kanbanCan,
    kanbanDisplayResultText,
    todoCardDetailState,
    kanbanCardOutputs,
    isKanbanTodoSource,
  }, extra || {});
}

function isReadingPlanWaitingCard(todo) {
  if (!isKanbanReadingCard(todo)) return false;
  if (normalizedKanbanStatus(todo) !== "blocked") return false;
  const reason = String(todo?.kanbanBlockReason || "").toLowerCase();
  if (reason.includes("previous reading session") || reason.includes("future reading")) return true;
  return arrayFromKanbanField(todo?.kanbanCaseDependsOn, 12).length > 0 && !String(todo?.kanbanResult || "").trim();
}

function kanbanReadingCaseKey(todo) {
  return KanbanStoryHelpers.kanbanReadingCaseKey(todo);
}

function kanbanVisibleReadingTodoIds(todos) {
  return KanbanStoryHelpers.kanbanVisibleReadingTodoIds(todos, kanbanStoryHelperOptions());
}

function kanbanReadingRevisionOriginal(group, item) {
  return KanbanStoryHelpers.kanbanReadingRevisionOriginal(group, item);
}

function isKanbanReadingRevision(itemOrTodo) {
  return KanbanStoryHelpers.isKanbanReadingRevision(itemOrTodo);
}

function kanbanReadingDisplayCardIndex(group, item) {
  return KanbanStoryHelpers.kanbanReadingDisplayCardIndex(group, item);
}

function kanbanRevisionSortTimestamp(item) {
  return KanbanStoryHelpers.kanbanRevisionSortTimestamp(item, kanbanStoryHelperOptions());
}

function kanbanLatestRevisionReplacementItems(group, predicate = null) {
  return KanbanStoryHelpers.kanbanLatestRevisionReplacementItems(group, predicate, kanbanStoryHelperOptions());
}

function kanbanAssessmentVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanAssessmentVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanAssessmentStoryVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanAssessmentStoryVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanReadingStoryVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanReadingStoryVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanReadingBaseCardItems(group) {
  return KanbanStoryHelpers.kanbanReadingBaseCardItems(group);
}

function kanbanReadingDisplayCardCount(group) {
  return KanbanStoryHelpers.kanbanReadingDisplayCardCount(group);
}

function kanbanVisibleBoardTodos(todos) {
  return KanbanStoryHelpers.kanbanVisibleBoardTodos(todos, kanbanStoryHelperOptions());
}

function kanbanReadingStartTime(todo) {
  const value = String(todo?.dueAt || todo?.dueLocal || "").trim();
  if (!value) return NaN;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function todoWorkflowState(todo) {
  const workflow = todo?.workflowState && typeof todo.workflowState === "object" ? todo.workflowState : null;
  if (!workflow) return null;
  if (
    ["reading", "study", "assessment", "final-assessment"].includes(String(workflow.kind || ""))
    && workflow.priorContextAvailable === false
  ) {
    return null;
  }
  return workflow;
}

function readingCardAcceptsSubmission(todo) {
  if (!isKanbanReadingCard(todo)) return false;
  const workflow = todoWorkflowState(todo);
  if (workflow && Object.prototype.hasOwnProperty.call(workflow, "canSubmitStudy")) return Boolean(workflow.canSubmitStudy);
  const status = normalizedKanbanStatus(todo);
  if (status === "done" || status === "archived") return false;
  if (status === "blocked" && !readingCasePriorComplete(todo)) return false;
  return true;
}

function assessmentExamSummary(todo) {
  return todo?.assessmentExam && typeof todo.assessmentExam === "object"
    ? todo.assessmentExam
    : null;
}

function assessmentExamCompleted(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "assessment" || workflow.kind === "final-assessment")) return Boolean(workflow.completed);
  const summary = assessmentExamSummary(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

function assessmentHasVisibleResult(todo) {
  const summary = assessmentExamSummary(todo);
  return Boolean(summary?.lastAttempt) || assessmentExamCompleted(todo);
}

function kanbanCasePriorCards(todo, predicate) {
  return KanbanStoryHelpers.kanbanCasePriorCards(todo, predicate, kanbanStoryHelperOptions());
}

function readingCasePriorComplete(todo) {
  return KanbanStoryHelpers.readingCasePriorComplete(todo, kanbanStoryHelperOptions());
}

function learningReadingUiOptions(extra = {}) {
  return Object.assign({
    state,
    todos: state.todos || [],
    escapeHtml,
    isKanbanReadingCard,
    normalizedKanbanStatus,
    kanbanStudyLabels,
    readingSubmissionFeedback,
    readingSubmissionHasAnalysis,
    readingQuizState,
    readingSubmissionCompleted,
    readingCardAcceptsSubmission,
    kanbanCan,
    readingSubmissionSummary,
    isKanbanReadingPlanCase,
    renderLearningGuidancePanel,
    renderAnswerReviewGate,
    supportsKanbanReadingRecorder,
    kanbanReadingRecordingStatusText,
    todoMatchesOpen,
    renderKanbanReadingRecorderControls,
  }, extra);
}

function nextReadingCaseTodo(todo) {
  return LearningReadingUi.nextReadingCaseTodo(todo, learningReadingUiOptions());
}

function assessmentPriorComplete(todo) {
  return KanbanStoryHelpers.assessmentPriorComplete(todo, kanbanStoryHelperOptions());
}

function assessmentCardAcceptsStart(todo) {
  if (!isKanbanAssessmentCard(todo) || assessmentExamCompleted(todo)) return false;
  const workflow = todoWorkflowState(todo);
  if (workflow && Object.prototype.hasOwnProperty.call(workflow, "canStartExam")) {
    return Boolean(workflow.canStartExam || workflow.canAnswerQuiz);
  }
  const status = normalizedKanbanStatus(todo);
  if (status === "archived") return false;
  return assessmentPriorComplete(todo);
}

function kanbanAssessmentCaseCurrentItem(group) {
  return KanbanStoryHelpers.kanbanAssessmentCaseCurrentItem(group, kanbanStoryHelperOptions());
}

function kanbanReadingCaseCurrentItem(group) {
  return KanbanStoryHelpers.kanbanReadingCaseCurrentItem(group, kanbanStoryHelperOptions());
}

function stableDisplayHash(value) {
  return KanbanStoryHelpers.stableDisplayHash(value);
}

function arrayFromKanbanField(value, limit = 8) {
  return KanbanStoryHelpers.arrayFromKanbanField(value, limit);
}

function kanbanDescriptionSection(description, heading) {
  return KanbanStoryHelpers.kanbanDescriptionSection(description, heading);
}

function kanbanDescriptionList(description, heading, limit = 8) {
  return KanbanStoryHelpers.kanbanDescriptionList(description, heading, limit);
}

function parsedKanbanPlanDescription(todo) {
  return KanbanStoryHelpers.parsedKanbanPlanDescription(todo);
}

function kanbanCardCaseInfo(todo) {
  return KanbanStoryHelpers.kanbanCardCaseInfo(todo);
}

function kanbanArchiveCases(items) {
  return KanbanStoryHelpers.kanbanArchiveCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCases(items) {
  return KanbanStoryHelpers.kanbanStoryCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCaseFullyArchived(group) {
  return KanbanStoryHelpers.kanbanStoryCaseFullyArchived(group, kanbanStoryHelperOptions());
}

function kanbanActiveStoryCases(items) {
  return KanbanStoryHelpers.kanbanActiveStoryCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCaseKey(group) {
  return KanbanStoryHelpers.kanbanStoryCaseKey(group);
}

function kanbanStoryCaseExpanded(group) {
  const key = kanbanStoryCaseKey(group);
  return Boolean(key && state.kanbanStoryExpanded && state.kanbanStoryExpanded[key]);
}

function kanbanStoryToggleAttrs(group, expanded) {
  const key = kanbanStoryCaseKey(group);
  return key
    ? ` data-kanban-story-case="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}"`
    : "";
}

function kanbanStoryCaseBodyOpen(group, options = {}) {
  return !options.collapsible || kanbanStoryCaseExpanded(group);
}

function kanbanStoryCaseRenderState(group, options = {}) {
  const collapsible = Boolean(options.collapsible);
  const expanded = kanbanStoryCaseBodyOpen(group, options);
  return {
    expanded,
    caseClass: collapsible && !expanded ? " story-collapsed" : "",
    toggleClass: collapsible ? " kanban-archive-case-toggle" : "",
    toggleAttrs: collapsible ? kanbanStoryToggleAttrs(group, expanded) : "",
  };
}

function kanbanStoryCaseTemplate(group) {
  return String(group?.caseTemplate || group?.cards?.[0]?.todo?.kanbanCaseTemplate || "").trim().toLowerCase();
}

function kanbanStoryCaseIsLearningGrowth(group) {
  return kanbanStoryCaseTemplate(group) === "learning-growth";
}

function kanbanStoryCaseArchiveItems(group) {
  return KanbanStoryHelpers.kanbanStoryCaseArchiveItems(group, kanbanStoryHelperOptions());
}

function renderKanbanStoryArchiveButton(group, options = {}) {
  if (!options.archiveAction) return "";
  const items = kanbanStoryCaseArchiveItems(group);
  if (!items.length) return "";
  const key = kanbanStoryCaseKey(group);
  return `<button class="kanban-archive-case-action" type="button" data-archive-kanban-story-case="${escapeHtml(key)}">${"\u5f52\u6863"}</button>`;
}

function kanbanStoryCaseDeleteItems(group) {
  return KanbanStoryHelpers.kanbanStoryCaseDeleteItems(group, kanbanStoryHelperOptions());
}

function kanbanStoryCaseCanDelete(group, options = {}) {
  return KanbanStoryHelpers.kanbanStoryCaseCanDelete(group, kanbanStoryHelperOptions(options));
}

function kanbanStorySwipeRenderState(group, options = {}) {
  const key = kanbanStoryCaseKey(group);
  const swipable = Boolean(key && kanbanStoryCaseCanDelete(group, options));
  return {
    articleClass: swipable ? " task-swipe-row kanban-story-swipe" : "",
    articleAttrs: swipable ? ` data-swipe-row data-swipe-kind="kanban-story" data-swipe-id="${escapeHtml(key)}"` : "",
    contentClass: swipable ? "task-swipe-content kanban-story-swipe-content" : "kanban-story-swipe-content",
    contentAttrs: swipable ? " data-swipe-content" : "",
    deleteButton: swipable
      ? `<button class="task-swipe-delete kanban-story-swipe-delete" type="button" data-delete-swipe aria-label="\u5220\u9664\u6545\u4e8b">\u5220\u9664</button>`
      : "",
  };
}

function kanbanArchiveStatusSummary(group) {
  return KanbanStoryHelpers.kanbanArchiveStatusSummary(group, kanbanStoryHelperOptions());
}

function kanbanArchiveConclusion(group) {
  return KanbanStoryHelpers.kanbanArchiveConclusion(group, kanbanStoryHelperOptions());
}

function kanbanCardStoryFeedback(todo) {
  return KanbanStoryHelpers.kanbanCardStoryFeedback(todo, kanbanStoryHelperOptions());
}

function kanbanCardNeedsStoryDetail(todo) {
  return KanbanStoryHelpers.kanbanCardNeedsStoryDetail(todo, kanbanStoryHelperOptions());
}

function kanbanCardStoryFeedbackLine(todo) {
  return KanbanStoryHelpers.kanbanCardStoryFeedbackLine(todo, kanbanStoryHelperOptions());
}

function scheduleKanbanStoryDetailLoads(items) {
  if (!isKanbanTodoSource() || state.selectedTodoId || kanbanComposerOpen()) return;
  if (String(state.todoKanbanStatus || "").trim().toLowerCase() !== KANBAN_STORY_STATUS) return;
  const queued = state.kanbanStoryDetailQueued || {};
  const ids = [];
  for (const group of kanbanActiveStoryCases(items).filter(kanbanStoryCaseExpanded).slice(0, 4)) {
    const cardItems = group.mode === "study-plan"
      ? [kanbanReadingCaseCurrentItem(group)].filter(Boolean)
      : group.mode === "assessment-plan"
        ? kanbanAssessmentStoryVisibleCardItems(group)
      : (group.cards || []).slice(0, 10);
    for (const item of cardItems) {
      const id = String(item?.todo?.id || "").trim();
      if (!id || queued[id] || !kanbanCardNeedsStoryDetail(item.todo)) continue;
      queued[id] = Date.now();
      ids.push(id);
      if (ids.length >= KANBAN_STORY_DETAIL_LOAD_LIMIT) break;
    }
    if (ids.length >= KANBAN_STORY_DETAIL_LOAD_LIMIT) break;
  }
  state.kanbanStoryDetailQueued = queued;
  ids.forEach((id, index) => {
    window.setTimeout(() => {
      loadKanbanCardDetail(id, { silent: true }).catch(showError);
    }, index * 120);
  });
}

function renderKanbanReadingArchiveCase(group, options = {}) {
  const cards = group.cards || [];
  const baseCards = kanbanReadingBaseCardItems(group);
  const visibleCards = kanbanReadingStoryVisibleCardItems(group);
  const first = cards[0]?.todo || {};
  const labels = kanbanStudyLabels(first);
  const current = kanbanReadingCaseCurrentItem(group);
  const currentTodo = current?.todo || first;
  const currentId = String(currentTodo?.id || "");
  const cover = cards.map((item) => kanbanCaseCover(item.todo)).find(Boolean);
  const requirement = compactDisplayText(group.sourceText || group.title || first.content || "", 320);
  const statusSummary = kanbanArchiveStatusSummary(group);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const completed = baseCards.filter((item) => ["done", "archived"].includes(normalizedKanbanStatus(item.todo))).length;
  const total = kanbanReadingDisplayCardCount(group) || baseCards.length || cards.length;
  const progress = `${completed}/${total} \u5df2\u5b8c\u6210${statusSummary ? ` | ${statusSummary}` : ""}`;
  const conclusion = kanbanArchiveConclusion(group);
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const storyRows = visibleCards.map((item) => {
    const todo = item.todo || {};
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const feedback = kanbanCardStoryFeedbackLine(todo);
    const outputCount = kanbanCardOutputs(todo).length;
    const meta = [
      status,
      todo?.dueLocal || todo?.dueAt || "",
      outputCount ? `\u4ea4\u4ed8 ${outputCount}` : "",
      String(todo.id || "") === currentId ? "\u5f53\u524d" : "",
      todo?.kanbanRevisionOf ? "\u4fee\u6539\u4efb\u52a1" : "",
    ].filter(Boolean).join(" | ");
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(kanbanReadingDisplayCardIndex(group, item) || item?.info?.cardIndex || todo.kanbanCaseCardIndex || 1))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedback ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedback)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  return `<article class="kanban-archive-case study-plan-case${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml([labels.plan, statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "\u672a\u5f52\u7ec4")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    ${cover ? renderKanbanCaseCover(cover, { compact: true }) : ""}
    <div class="kanban-archive-story-grid">
      <section>
        <strong>\u9700\u6c42</strong>
        <p>${escapeHtml(requirement || "\u672a\u8bb0\u5f55\u539f\u59cb\u9700\u6c42")}</p>
      </section>
      <section>
        <strong>\u8fdb\u5ea6</strong>
        <p>${escapeHtml(progress)}</p>
      </section>
      <section>
        <strong>\u7ed3\u8bba</strong>
        <p>${escapeHtml(conclusion)}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${storyRows}</ol>
    </div>
  </article>`;
}

function stripAssessmentConfigText(text = "") {
  return String(text || "")
    .replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assessmentTemplateDisplayText(group, currentTodo, firstTodo) {
  const summary = assessmentExamSummary(currentTodo) || assessmentExamSummary(firstTodo) || {};
  const questionCount = Number(summary.questionCount || currentTodo?.assessmentExam?.questionCount || firstTodo?.assessmentExam?.questionCount || 0) || 0;
  const durationMinutes = Number(summary.durationMinutes || currentTodo?.assessmentExam?.durationMinutes || firstTodo?.assessmentExam?.durationMinutes || 0) || 0;
  const passingScore = Number(summary.passingScore || currentTodo?.assessmentExam?.passingScore || firstTodo?.assessmentExam?.passingScore || 0) || 0;
  const source = compactDisplayText(stripAssessmentConfigText(group?.sourceText || firstTodo?.kanbanCaseSourceText || ""), 180);
  const revision = compactDisplayText(currentTodo?.kanbanRevisionRequest || "", 160);
  const parts = [
    questionCount && durationMinutes ? `${questionCount}\u9898/${durationMinutes}\u5206\u949f` : "",
    passingScore ? `\u901a\u8fc7\u7ebf ${passingScore}` : "",
    summary.finalExam ? "\u7ec8\u8003" : "",
    revision ? `\u672c\u6b21\u4fee\u6539\uff1a${revision}` : "",
    source,
  ].filter(Boolean);
  return parts.join(" | ") || "\u56fa\u5b9a\u6b63\u5f0f\u6d4b\u8bd5\u6a21\u677f";
}

function renderKanbanAssessmentArchiveCase(group, options = {}) {
  const cards = group.cards || [];
  const visibleCards = kanbanAssessmentVisibleCardItems(group);
  const visibleGroup = Object.assign({}, group, { cards: visibleCards });
  const first = visibleCards[0]?.todo || cards[0]?.todo || {};
  const current = kanbanAssessmentCaseCurrentItem(group);
  const currentTodo = current?.todo || first;
  const requirement = assessmentTemplateDisplayText(group, currentTodo, first);
  const statusSummary = kanbanArchiveStatusSummary(visibleGroup);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const completed = visibleCards.filter((item) => assessmentExamCompleted(item.todo)).length;
  const total = Number(first.kanbanCaseCardCount || visibleCards.length || cards.length || 0) || visibleCards.length || cards.length;
  const summary = assessmentExamSummary(currentTodo) || {};
  const storyCards = kanbanAssessmentStoryVisibleCardItems(group);
  const currentId = String(currentTodo?.id || "");
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const storyRows = storyCards.map((item) => {
    const todo = item.todo || {};
    const itemSummary = assessmentExamSummary(todo) || {};
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const attempt = itemSummary.lastAttempt || null;
    const outputCount = kanbanCardOutputs(todo).length;
    const resultLine = attempt
      ? `${attempt.passed ? "已通过" : "未通过"} ${Number(attempt.score || 0)}/100`
      : "";
    const meta = [
      status,
      todo?.dueLocal || todo?.dueAt || "",
      itemSummary.questionCount ? `${itemSummary.questionCount}题/${itemSummary.durationMinutes || 30}分钟` : "",
      itemSummary.passingScore ? `通过线 ${itemSummary.passingScore}` : "",
      resultLine,
      outputCount ? `交付 ${outputCount}` : "",
      String(todo.id || "") === currentId ? "当前" : "",
      todo?.kanbanRevisionOf ? "修改任务" : "",
    ].filter(Boolean).join(" | ");
    const feedback = kanbanCardStoryFeedbackLine(todo);
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(kanbanReadingDisplayCardIndex(group, item) || item?.info?.cardIndex || todo.kanbanCaseCardIndex || 1))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedback ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedback)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  return `<article class="kanban-archive-case assessment-plan-case${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml(["考试计划", statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "考试计划")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    <div class="kanban-archive-story-grid">
      <section>
        <strong>考试模板</strong>
        <p>${escapeHtml(requirement || "固定正式测试模板")}</p>
      </section>
      <section>
        <strong>进度</strong>
        <p>${escapeHtml(`${completed}/${total} 已通过${statusSummary ? ` | ${statusSummary}` : ""}`)}</p>
      </section>
      <section>
        <strong>规则</strong>
        <p>${escapeHtml("正式测试高于日常小测；低于通过线则保持重考，直到通过。")}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${storyRows}</ol>
    </div>
  </article>`;
}

function renderKanbanArchiveCase(group, options = {}) {
  if (group.mode === "assessment-plan") return renderKanbanAssessmentArchiveCase(group, options);
  if (group.mode === "study-plan" && !kanbanStoryCaseIsLearningGrowth(group)) return renderKanbanReadingArchiveCase(group, options);
  const cards = group.cards || [];
  const first = cards[0]?.todo || {};
  const cover = cards.map((item) => kanbanCaseCover(item.todo)).find(Boolean);
  const requirement = compactDisplayText(group.sourceText || group.title || first.content || "", 320);
  const conclusion = kanbanArchiveConclusion(group);
  const statusSummary = kanbanArchiveStatusSummary(group);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const modeLabel = kanbanStoryCaseIsLearningGrowth(group)
    ? "\u6210\u957f\u8ba1\u5212"
    : (group.mode === "multi-agent" ? "\u591a Agent" : "\u5355\u5361");
  const titleByCardId = new Map(cards.map(({ todo, info }, index) => [
    info.cardId || `card-${info.cardIndex || index + 1}`,
    todo.content || info.cardId || todo.id || "",
  ]));
  const cardRows = cards.slice(0, 8).map(({ todo, info }, index) => {
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const goal = compactDisplayText(info.cardGoal || todo.description || todo.content || "", 160);
    const sequence = info.cardIndex || index + 1;
    const revisionLabel = todo.kanbanRevisionOf ? "\u4fee\u6539\u4efb\u52a1" : "";
    const dependencies = (info.dependsOn || [])
      .map((id) => titleByCardId.get(id) || id)
      .filter(Boolean)
      .join(" / ");
    const outputCount = kanbanCardOutputs(todo).length;
    const feedback = kanbanCardStoryFeedbackLine(todo);
    const meta = [status, revisionLabel, dependencies ? `\u4f9d\u8d56\uff1a${dependencies}` : "", goal].filter(Boolean).join(" | ");
    const feedbackLine = [feedback, outputCount ? `\u4ea4\u4ed8 ${outputCount}` : ""].filter(Boolean).join(" | ");
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(sequence))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedbackLine ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedbackLine)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  const more = cards.length > 8 ? `<li class="kanban-archive-more">+${cards.length - 8}</li>` : "";
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const modeClass = group.mode === "single-card"
    ? " single-card-case"
    : (group.mode === "multi-agent" ? " multi-agent-case" : (kanbanStoryCaseIsLearningGrowth(group) ? " learning-growth-case" : ""));
  return `<article class="kanban-archive-case${modeClass}${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml(["\u4efb\u52a1\u6545\u4e8b", modeLabel, statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "\u672a\u5f52\u7ec4")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    ${cover ? renderKanbanCaseCover(cover, { compact: true }) : ""}
    <div class="kanban-archive-story-grid">
      <section>
        <strong>\u9700\u6c42</strong>
        <p>${escapeHtml(requirement || "\u672a\u8bb0\u5f55\u539f\u59cb\u9700\u6c42")}</p>
      </section>
      <section>
        <strong>\u62c6\u89e3</strong>
        <p>${escapeHtml(`${cards.length} \u5f20\u5361\u7247${statusSummary ? ` | ${statusSummary}` : ""}`)}</p>
      </section>
      <section>
        <strong>\u7ed3\u8bba</strong>
        <p>${escapeHtml(conclusion)}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${cardRows}${more}</ol>
    </div>
  </article>`;
}

function renderKanbanArchiveStories(items) {
  const cases = kanbanArchiveCases(items);
  if (!cases.length) return `<div class="empty-state small">No archived cases.</div>`;
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, deleteAction: true })).join("")}</div>`;
}
