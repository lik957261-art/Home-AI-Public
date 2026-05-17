"use strict";


function renderTodoList() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
  return;
}

function renderTodos(options = {}) {
  applyViewMode();
  renderTodoList();
  renderTodoPanel(options);
}

function renderTodoRouteMissingNotice() {
  const targetId = String(state.todoRouteMissingTargetId || "").trim();
  if (!targetId || state.selectedTodoId) return "";
  return `<div class="empty-state small">\u672a\u627e\u5230\u63a8\u9001\u5bf9\u5e94\u7684\u5f85\u529e\u5361\u7247\uff0c\u5df2\u5237\u65b0\u770b\u677f\u5217\u8868\u3002</div>`;
}

function renderTodoPanel(options = {}) {
  const conversation = $("conversation");
  const previousScrollTop = conversation ? conversation.scrollTop : 0;
  const active = document.activeElement;
  const restoreKanbanComposerFocus = Boolean(active && state.todoCreateOpen && active.closest?.("#kanbanComposerForm"));
  const restoreTodoDraftFocus = Boolean(active && (active.id === "todoCommentText" || active.id === "todoRevisionText" || active.id === "todoReadingSubmissionNotes"));
  const kanbanComposerSelection = restoreKanbanComposerFocus
    ? { id: active.id || "kanbanComposerText", start: active.selectionStart, end: active.selectionEnd }
    : null;
  const todoDraftFocus = restoreTodoDraftFocus
    ? { id: active.id, start: active.selectionStart, end: active.selectionEnd }
    : null;
  if (restoreKanbanComposerFocus) {
    syncKanbanComposerDraftFromDom();
    syncKanbanReadingDraftFromDom(active.closest?.("#kanbanComposerForm") || document);
  }
  if (restoreTodoDraftFocus) syncTodoDetailDraftFromDom(active);
  const selected = state.todos.find((todo) => todo.id === state.selectedTodoId) || null;
  const creating = kanbanComposerOpen();
  $("threadTitle").textContent = creating ? "\u65b0\u589e\u4efb\u52a1" : (selected ? "看板详情" : "看板");
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  const openTodos = state.todos.filter(todoMatchesOpen);
  const closedTodos = state.todos.filter((todo) => !todoMatchesOpen(todo));
  const todoBody = selected
    ? renderTodoDetail(selected)
    : (creating
      ? renderKanbanCreatePage()
      : (isKanbanTodoSource() ? renderTodoKanbanBoard(state.todos) : renderTodoSections(openTodos, closedTodos)));
  conversation.innerHTML = `
    <section class="todo-shell">
      ${selected || creating ? "" : renderTodoCreatePanel()}
      ${selected || creating ? "" : renderTodoRouteMissingNotice()}
      ${todoBody}
    </section>
  `;
  wireTodoPanel(conversation);
  loadKanbanCoverImages(conversation).catch(() => {});
  ensureVerticalScrollAffordance(conversation);
  if (restoreKanbanComposerFocus) {
    const input = $(kanbanComposerSelection?.id || "kanbanComposerText") || $("kanbanComposerText");
    if (input) {
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        input.focus();
      }
      if (kanbanComposerSelection && typeof input.setSelectionRange === "function") {
        try {
          input.setSelectionRange(kanbanComposerSelection.start, kanbanComposerSelection.end);
        } catch (_) {}
      }
    }
  }
  if (restoreTodoDraftFocus) restoreTodoDetailDraftFocus(todoDraftFocus);
  if (shouldAutoLoadKanbanDetail(selected)) {
    window.setTimeout(() => loadKanbanCardDetail(selected.id).catch(showError), 0);
  }
  if (!selected && !creating) {
    window.setTimeout(() => scheduleKanbanStoryDetailLoads(state.todos), 0);
  }
  if (options.preserveScroll) {
    const nextScrollTop = Number.isFinite(options.restoreScrollTop) ? options.restoreScrollTop : previousScrollTop;
    conversation.scrollTop = nextScrollTop;
  } else {
    conversation.scrollTop = 0;
  }
}

function renderTodoCreatePanel() {
  if (isKanbanTodoSource()) return "";
  if (!state.todoCreateOpen) {
    return `<button class="todo-create-toggle" type="button" data-open-todo-create>新增卡片</button>`;
  }
  return `<form id="todoCreateForm" class="todo-create">
    <div class="todo-create-grid">
      <input id="todoContent" class="todo-input todo-content-input" type="text" placeholder="卡片内容">
      <input id="todoDue" class="todo-input" type="datetime-local">
      <select id="todoAssignee" class="todo-input">${renderTodoAssigneeOptions()}</select>
      <select id="todoRecurrence" class="todo-input">
        <option value="none">不重复</option>
        <option value="daily">每天</option>
        <option value="weekly">每周</option>
      </select>
    </div>
    <div class="todo-create-actions">
      <input id="todoRecurrenceDays" class="todo-input" type="text" placeholder="每周日期，例如 Mon/Wed/Fri">
      <div class="todo-create-buttons">
        <button class="secondary-small" type="button" data-close-todo-create>收起</button>
        <button class="primary-small" type="submit">添加卡片</button>
      </div>
    </div>
  </form>`;
}

function syncTodoDetailDraftFromDom(input = null) {
  const target = input || document.activeElement;
  if (!target || !["todoCommentText", "todoRevisionText", "todoReadingSubmissionNotes"].includes(target.id)) return;
  const form = target.closest?.("[data-todo-comment-form], [data-todo-revision-form], [data-reading-submission-form]");
  const commentId = form?.dataset?.todoCommentForm || "";
  const revisionId = form?.dataset?.todoRevisionForm || "";
  const readingId = form?.dataset?.readingSubmissionForm || "";
  if (target.id === "todoCommentText" && commentId) state.todoCommentDrafts[commentId] = target.value || "";
  if (target.id === "todoRevisionText" && revisionId) state.todoRevisionDrafts[revisionId] = target.value || "";
  if (target.id === "todoReadingSubmissionNotes" && readingId) state.todoReadingSubmissionDrafts[readingId] = target.value || "";
}

function restoreTodoDetailDraftFocus(focus = null) {
  if (!focus?.id) return;
  const input = $(focus.id);
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  if (typeof input.setSelectionRange === "function") {
    const start = Number.isFinite(focus.start) ? focus.start : input.value.length;
    const end = Number.isFinite(focus.end) ? focus.end : start;
    input.setSelectionRange(start, end);
  }
}

function renderKanbanComposerMessage(message) {
  const role = String(message?.role || "assistant");
  const label = role === "user" ? "\u4f60" : "Hermes";
  return `<article class="kanban-composer-message ${escapeHtml(role)}">
    <strong>${escapeHtml(label)}</strong>
    <p>${escapeHtml(message?.content || "").replace(/\n/g, "<br>")}</p>
  </article>`;
}

function kanbanPlanDependencyLabels(card, plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const byId = new Map(cards.map((item, index) => [String(item.clientId || `card-${index + 1}`), item]));
  return (Array.isArray(card?.dependsOn) ? card.dependsOn : [])
    .map((id) => byId.get(String(id || ""))?.title || String(id || "").trim())
    .filter(Boolean);
}

function renderKanbanPlanDraft(plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const disabled = state.kanbanPlanCreating ? " disabled" : "";
  const cardItems = cards.map((card, index) => {
    const deps = kanbanPlanDependencyLabels(card, plan);
    const status = card.initialRunnable
      ? "\u9996\u6279\u6267\u884c"
      : deps.length
        ? "\u7b49\u5f85\u4f9d\u8d56"
        : "\u7b49\u5f85\u5e76\u884c\u4f4d";
    const deliverables = Array.isArray(card.deliverables) ? card.deliverables.filter(Boolean).slice(0, 4) : [];
    const acceptance = Array.isArray(card.acceptance) ? card.acceptance.filter(Boolean).slice(0, 4) : [];
    return `<article class="kanban-plan-card">
      <div class="kanban-plan-card-head">
        <span>${index + 1}</span>
        <strong>${escapeHtml(card.title || `Card ${index + 1}`)}</strong>
        <em>${escapeHtml(status)}</em>
      </div>
      ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ""}
      ${deps.length ? `<small>${escapeHtml("\u4f9d\u8d56\uff1a" + deps.join(" / "))}</small>` : ""}
      ${deliverables.length ? `<ul>${deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${acceptance.length ? `<small>${escapeHtml("\u9a8c\u6536\uff1a" + acceptance.join(" / "))}</small>` : ""}
    </article>`;
  }).join("");
  const maxParallel = normalizeKanbanComposerMaxParallel(plan?.maxParallel || state.kanbanComposerMaxParallel);
  return `<section class="kanban-plan-draft">
    <div class="kanban-plan-draft-head">
      <div>
        <strong>\u591a Agent \u62c6\u89e3\u8349\u6848</strong>
        <span>${escapeHtml(plan?.summary || "")}</span>
      </div>
      <small>\u6700\u5927\u5e76\u884c ${maxParallel}</small>
    </div>
    <div class="kanban-plan-card-list">${cardItems}</div>
    <div class="kanban-plan-actions">
      <button type="button" data-clear-kanban-plan${disabled}>\u6e05\u7a7a\u8349\u6848</button>
      <button type="button" data-create-kanban-plan${disabled}>\u786e\u8ba4\u6267\u884c ${cards.length} \u5f20\u4efb\u52a1</button>
    </div>
  </section>`;
}

function renderKanbanReasoningOptions(selected = "") {
  const known = new Map();
  const add = (item) => {
    const value = String(item?.value || "").trim().toLowerCase();
    if (known.has(value)) return;
    known.set(value, item);
  };
  TASK_REASONING_OPTIONS.forEach(add);
  configuredReasoningOptions().forEach(add);
  return [...known.values()].map((item) => {
    const value = String(item?.value || "").trim().toLowerCase();
    const label = value ? reasoningEffortLabel(value) : `Hermes default (${defaultReasoningLabel()})`;
    return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function renderKanbanMultiAgentControls(disabled = false) {
  const attr = disabled ? " disabled" : "";
  const maxParallel = normalizeKanbanComposerMaxParallel(state.kanbanComposerMaxParallel);
  const rawReasoningEffort = String(state.kanbanComposerReasoningEffort || "").trim().toLowerCase();
  const reasoningEffort = ["low", "medium", "high", "xhigh"].includes(rawReasoningEffort) ? rawReasoningEffort : "";
  return `<div class="kanban-multi-agent-controls">
    <label>
      <span>\u6700\u5927 Agent \u6570</span>
      <input id="kanbanComposerMaxParallel" class="todo-input" type="number" min="1" max="${KANBAN_MULTI_AGENT_MAX_PARALLEL}" step="1" value="${escapeHtml(String(maxParallel))}"${attr}>
    </label>
    <label>
      <span>\u63a8\u7406\u7b49\u7ea7</span>
      <select id="kanbanComposerReasoningEffort" class="todo-input"${attr}>${renderKanbanReasoningOptions(reasoningEffort)}</select>
    </label>
  </div>`;
}

function renderKanbanComposerDocumentPanel(disabled = false) {
  const attr = disabled ? " disabled" : "";
  const docs = Array.isArray(state.kanbanComposerDocuments) ? state.kanbanComposerDocuments : [];
  const items = docs.map((item, index) => `<li>
    <div>
      <strong>${escapeHtml(item.name || `Document ${index + 1}`)}</strong>
      <small>${escapeHtml([item.mime || item.kind || "", item.size ? formatBytes(item.size) : "", item.truncated ? "\u5df2\u622a\u65ad" : ""].filter(Boolean).join(" | "))}</small>
      <p>${escapeHtml(compactDisplayText(item.text || "", 180) || "\u5df2\u63d0\u53d6\u6587\u6863\u5185\u5bb9")}</p>
    </div>
    <button type="button" data-remove-kanban-composer-document="${index}"${attr}>\u79fb\u9664</button>
  </li>`).join("");
  const uploading = state.kanbanComposerDocumentUploading ? `<small class="kanban-document-upload-status">\u6587\u6863\u6b63\u5728\u89e3\u6790...</small>` : "";
  return `<section class="kanban-document-source">
    <label class="kanban-document-picker">
      <span>\u4e0a\u4f20\u6587\u6863\u4f5c\u4e3a\u9700\u6c42\u6765\u6e90</span>
      <input id="kanbanComposerDocument" type="file" accept=".txt,.md,.markdown,.csv,.json,.docx,text/*,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"${attr}>
    </label>
    ${uploading}
    ${items ? `<ul class="kanban-document-source-list">${items}</ul>` : ""}
  </section>`;
}

function renderKanbanComposerProgress() {
  if (!state.kanbanComposerBusy && !state.kanbanPlanCreating) return "";
  const steps = kanbanComposerProgressSteps();
  const current = Math.max(0, Math.min(steps.length - 1, Number(state.kanbanComposerProgressStep || 0)));
  const elapsed = state.kanbanComposerProgressStartedAt
    ? Math.max(1, Math.round((Date.now() - state.kanbanComposerProgressStartedAt) / 1000))
    : 0;
  const title = state.kanbanComposerProgressKind === "reading"
    ? "正在创建学习计划"
    : (state.kanbanComposerProgressKind === "assessment"
      ? "正在创建考试计划"
      : (state.kanbanComposerProgressKind === "create" ? "\u6b63\u5728\u521b\u5efa\u5e76\u542f\u52a8\u4efb\u52a1" : "\u6b63\u5728\u62c6\u89e3\u4efb\u52a1"));
  return `<section class="kanban-create-progress" aria-live="polite">
    <div class="kanban-create-progress-head">
      <strong>${title}</strong>
      <span>${elapsed}s</span>
    </div>
    <ol>
      ${steps.map((step, index) => {
        const stateClass = index < current ? " done" : (index === current ? " active" : "");
        return `<li class="${stateClass.trim()}"><span>${index + 1}</span><em>${escapeHtml(step)}</em></li>`;
      }).join("")}
    </ol>
  </section>`;
}

function kanbanComposerMode() {
  if (state.kanbanComposerMode === "reading") return "study";
  if (["single", "multi", "study", "assessment"].includes(state.kanbanComposerMode)) return state.kanbanComposerMode;
  return state.kanbanComposerMultiAgent ? "multi" : "single";
}

function renderKanbanReadingFields(disabled = false) {
  const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  const attr = disabled ? " disabled" : "";
  const rawTemplate = String(draft.studyTemplate || "").trim().toLowerCase();
  const template = rawTemplate === "custom" ? "custom" : (rawTemplate === "programming" ? "programming" : "reading");
  const programmingTemplate = template === "programming";
  const activityTitle = draft.activityTitle || draft.bookTitle || "";
  const learnerName = draft.learnerName || draft.readerName || "";
  const scheduleFrequency = normalizeKanbanStudyScheduleFrequency(draft.scheduleFrequency);
  const scheduleWeekdays = new Set(parseKanbanStudyWeekdays(draft.scheduleWeekdays || "1"));
  const scheduleMonthDay = Math.max(1, Math.min(31, Number(draft.scheduleMonthDay || "1") || 1));
  const selectedPerformer = String(draft.performerWorkspaceId || "").trim();
  const selectedViewers = new Set(parseWorkspaceIdList(draft.viewerWorkspaceIds));
  const currentWorkspaceId = String(state.selectedWorkspaceId || "").trim();
  const shareWorkspaces = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .filter((workspace) => String(workspace?.id || "").trim() && String(workspace.id) !== currentWorkspaceId);
  const performerControl = shareWorkspaces.length
    ? `<select id="kanbanStudyPerformerWorkspace" class="todo-input"${attr}>
        <option value="">不指定执行工作区</option>
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          return `<option value="${escapeHtml(id)}"${selectedPerformer === id ? " selected" : ""}>${escapeHtml(workspace.label || id)} (${escapeHtml(id)})</option>`;
        }).join("")}
      </select>`
    : `<input id="kanbanStudyPerformerWorkspace" class="todo-input" type="text" value="${escapeHtml(selectedPerformer)}" placeholder="workspace id"${attr}>`;
  const viewerControl = shareWorkspaces.length
    ? `<div class="kanban-study-share-list">
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          const disabledViewer = id === selectedPerformer || disabled;
          return `<span class="kanban-study-share-option">
            <input type="checkbox" data-kanban-study-viewer-workspace value="${escapeHtml(id)}"${selectedViewers.has(id) ? " checked" : ""}${disabledViewer ? " disabled" : ""}>
            <span>${escapeHtml(workspace.label || id)} <small>${escapeHtml(id)}</small></span>
          </span>`;
        }).join("")}
      </div>
      <input id="kanbanStudyViewerWorkspaces" type="hidden" value="${escapeHtml(Array.from(selectedViewers).join(","))}">`
    : `<input id="kanbanStudyViewerWorkspaces" class="todo-input" type="text" value="${escapeHtml(draft.viewerWorkspaceIds || "")}" placeholder="多个 id 用逗号分隔"${attr}>`;
  const coverPreview = state.kanbanReadingCoverPreviewUrl
    ? `<img src="${escapeHtml(state.kanbanReadingCoverPreviewUrl)}" alt="cover preview">`
    : `<span class="kanban-reading-cover-placeholder">${escapeHtml(draft.coverName || "可选上传封面图")}</span>`;
  return `<div class="kanban-reading-fields">
    <label>
      <span>学习模板</span>
      <select id="kanbanStudyTemplate" class="todo-input"${attr}>
        <option value="reading"${template === "reading" ? " selected" : ""}>阅读复述</option>
        <option value="programming"${template === "programming" ? " selected" : ""}>编程测验</option>
        <option value="custom"${template === "custom" ? " selected" : ""}>通用学习</option>
      </select>
    </label>
    <label>
      <span>学科 / 领域</span>
      <input id="kanbanStudySubject" class="todo-input" type="text" value="${escapeHtml(draft.subjectDomain || (programmingTemplate ? "Python 编程" : ""))}" placeholder="${escapeHtml(programmingTemplate ? "Python 编程、JavaScript、算法..." : "英语、数学、科学...")}"${attr}>
    </label>
    <label>
      <span>学习者 / 目标</span>
      <input id="kanbanStudyLearner" class="todo-input" type="text" value="${escapeHtml(learnerName)}" placeholder="姓名或目标对象"${attr}>
      <input id="kanbanReadingReader" type="hidden" value="${escapeHtml(draft.readerName || learnerName)}">
    </label>
    <label>
      <span>内容标题</span>
      <input id="kanbanStudyTitle" class="todo-input" type="text" value="${escapeHtml(activityTitle)}" placeholder="${escapeHtml(programmingTemplate ? "Python 基础测验、循环练习、项目实战..." : "书名、章节、主题或活动")}"${attr}>
      <input id="kanbanReadingBook" type="hidden" value="${escapeHtml(draft.bookTitle || activityTitle)}">
    </label>
    <label>
      <span>执行工作区</span>
      ${performerControl}
    </label>
    <label>
      <span>只读查看工作区</span>
      ${viewerControl}
    </label>
    ${renderKanbanPlanBindingPreview(draft, "study")}
    <label>
      <span>次数</span>
      <input id="kanbanReadingSessions" class="todo-input" type="number" min="1" max="31" step="1" value="${escapeHtml(draft.sessions || "10")}"${attr}>
    </label>
    <label>
      <span>开始日期</span>
      <input id="kanbanReadingStartDate" class="todo-input" type="date" value="${escapeHtml(draft.startDate || todayDateInputValue())}"${attr}>
    </label>
    <label>
      <span>每天时间</span>
      <input id="kanbanReadingTime" class="todo-input" type="time" value="${escapeHtml(draft.timeOfDay || "21:00")}"${attr}>
    </label>
    <label>
      <span>执行频率</span>
      <select id="kanbanStudyScheduleFrequency" class="todo-input"${attr}>
        <option value="daily"${scheduleFrequency === "daily" ? " selected" : ""}>每日</option>
        <option value="weekly"${scheduleFrequency === "weekly" ? " selected" : ""}>每周几</option>
        <option value="monthly"${scheduleFrequency === "monthly" ? " selected" : ""}>每月</option>
      </select>
    </label>
    <div class="kanban-study-schedule-weekdays" data-kanban-study-weekdays${scheduleFrequency === "weekly" ? "" : " hidden"}>
      <span>每周执行日</span>
      ${[
        [1, "周一"],
        [2, "周二"],
        [3, "周三"],
        [4, "周四"],
        [5, "周五"],
        [6, "周六"],
        [7, "周日"],
      ].map(([value, label]) => `<label class="kanban-study-schedule-option">
        <input type="checkbox" data-kanban-study-weekday value="${value}"${scheduleWeekdays.has(value) ? " checked" : ""}${attr}>
        <span>${label}</span>
      </label>`).join("")}
    </div>
    <label data-kanban-study-month-day${scheduleFrequency === "monthly" ? "" : " hidden"}>
      <span>每月日期</span>
      <input id="kanbanStudyScheduleMonthDay" class="todo-input" type="number" min="1" max="31" step="1" value="${escapeHtml(String(scheduleMonthDay))}"${attr}>
    </label>
    <label>
      <span>提前提醒</span>
      <input id="kanbanReadingReminder" class="todo-input" type="number" min="0" max="1440" step="5" value="${escapeHtml(draft.reminderLeadMinutes || "15")}"${attr}>
    </label>
    ${programmingTemplate ? "" : `<label class="kanban-reading-cover-field">
      <span>封面图</span>
      <input id="kanbanReadingCover" class="todo-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"${attr}>
      <span class="kanban-reading-cover-preview">${coverPreview}</span>
    </label>`}
  </div>`;
}

function renderKanbanAssessmentFields(disabled = false) {
  const draft = Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
  const attr = disabled ? " disabled" : "";
  const selectedSubject = String(draft.subject || "").trim();
  const assessmentSubjects = ["数学", "Python 编程", "英语", "科学", "历史", "中文"];
  if (selectedSubject && !assessmentSubjects.includes(selectedSubject)) assessmentSubjects.push(selectedSubject);
  const selectedPerformer = String(draft.performerWorkspaceId || "").trim();
  const selectedViewers = new Set(parseWorkspaceIdList(draft.viewerWorkspaceIds));
  const currentWorkspaceId = String(state.selectedWorkspaceId || "").trim();
  const shareWorkspaces = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .filter((workspace) => String(workspace?.id || "").trim() && String(workspace.id) !== currentWorkspaceId);
  const performerControl = shareWorkspaces.length
    ? `<select id="kanbanAssessmentPerformerWorkspace" class="todo-input"${attr}>
        <option value="">不指定执行工作区</option>
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          return `<option value="${escapeHtml(id)}"${selectedPerformer === id ? " selected" : ""}>${escapeHtml(workspace.label || id)} (${escapeHtml(id)})</option>`;
        }).join("")}
      </select>`
    : `<input id="kanbanAssessmentPerformerWorkspace" class="todo-input" type="text" value="${escapeHtml(selectedPerformer)}" placeholder="workspace id"${attr}>`;
  const viewerControl = shareWorkspaces.length
    ? `<div class="kanban-study-share-list">
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          const disabledViewer = id === selectedPerformer || disabled;
          return `<span class="kanban-study-share-option">
            <input type="checkbox" data-kanban-assessment-viewer-workspace value="${escapeHtml(id)}"${selectedViewers.has(id) ? " checked" : ""}${disabledViewer ? " disabled" : ""}>
            <span>${escapeHtml(workspace.label || id)} <small>${escapeHtml(id)}</small></span>
          </span>`;
        }).join("")}
      </div>
      <input id="kanbanAssessmentViewerWorkspaces" type="hidden" value="${escapeHtml(Array.from(selectedViewers).join(","))}">`
    : `<input id="kanbanAssessmentViewerWorkspaces" class="todo-input" type="text" value="${escapeHtml(draft.viewerWorkspaceIds || "")}" placeholder="多个 id 用逗号分隔"${attr}>`;
  return `<div class="kanban-reading-fields kanban-assessment-fields">
    <label>
      <span>科目</span>
      <select id="kanbanAssessmentSubject" class="todo-input"${attr}>
        ${assessmentSubjects.map((subject) => `<option value="${escapeHtml(subject)}"${selectedSubject === subject ? " selected" : ""}>${escapeHtml(subject)}</option>`).join("")}
      </select>
    </label>
    <label>
      <span>学习者</span>
      <input id="kanbanAssessmentLearner" class="todo-input" type="text" value="${escapeHtml(draft.learnerName || "")}" placeholder="姓名或目标对象"${attr}>
    </label>
    <label>
      <span>阶段 / 课程</span>
      <input id="kanbanAssessmentLevel" class="todo-input" type="text" value="${escapeHtml(draft.courseLevel || "")}" placeholder="本学期、AMC8、A-Level..."${attr}>
    </label>
    <label>
      <span>计划标题</span>
      <input id="kanbanAssessmentTitle" class="todo-input" type="text" value="${escapeHtml(draft.planTitle || "")}" placeholder="本学期数学能力检测"${attr}>
    </label>
    <label>
      <span>执行工作区</span>
      ${performerControl}
    </label>
    <label>
      <span>只读查看工作区</span>
      ${viewerControl}
    </label>
    ${renderKanbanPlanBindingPreview(draft, "assessment")}
    <label>
      <span>考试次数</span>
      <input id="kanbanAssessmentExamCount" class="todo-input" type="number" min="1" max="30" step="1" value="${escapeHtml(draft.examCount || "10")}"${attr}>
    </label>
    <label>
      <span>每次题量</span>
      <input id="kanbanAssessmentQuestionCount" class="todo-input" type="number" min="5" max="40" step="1" value="${escapeHtml(draft.questionCount || "20")}"${attr}>
    </label>
    <label>
      <span>时长分钟</span>
      <input id="kanbanAssessmentDuration" class="todo-input" type="number" min="5" max="180" step="5" value="${escapeHtml(draft.durationMinutes || "30")}"${attr}>
    </label>
    <label>
      <span>通过线</span>
      <input id="kanbanAssessmentPassingScore" class="todo-input" type="number" min="50" max="100" step="1" value="${escapeHtml(draft.passingScore || "80")}"${attr}>
    </label>
    <label>
      <span>间隔天数</span>
      <input id="kanbanAssessmentIntervalDays" class="todo-input" type="number" min="1" max="60" step="1" value="${escapeHtml(draft.intervalDays || "14")}"${attr}>
    </label>
    <label>
      <span>首次日期</span>
      <input id="kanbanAssessmentStartDate" class="todo-input" type="date" value="${escapeHtml(draft.startDate || todayDateInputValue())}"${attr}>
    </label>
    <label>
      <span>考试时间</span>
      <input id="kanbanAssessmentTime" class="todo-input" type="time" value="${escapeHtml(draft.timeOfDay || "19:30")}"${attr}>
    </label>
    <label>
      <span>提前提醒</span>
      <input id="kanbanAssessmentReminder" class="todo-input" type="number" min="0" max="1440" step="5" value="${escapeHtml(draft.reminderLeadMinutes || "30")}"${attr}>
    </label>
    <label>
      <span>难度分布</span>
      <input id="kanbanAssessmentDifficulty" class="todo-input" type="text" value="${escapeHtml(draft.difficulty || "")}" placeholder="基础30% / 中等50% / 挑战20%"${attr}>
    </label>
  </div>`;
}

function renderKanbanComposerPanel() {
  if (!isKanbanTodoSource()) return "";
  const busy = state.kanbanComposerBusy || state.kanbanPlanCreating;
  const messages = state.kanbanComposerMessages.slice(-10).map(renderKanbanComposerMessage).join("");
  const draft = state.kanbanPlanDraft ? renderKanbanPlanDraft(state.kanbanPlanDraft) : "";
  if (!state.todoCreateOpen && !busy) return "";
  const mode = kanbanComposerMode();
  const singleActive = mode === "single";
  const multiActive = mode === "multi";
  const studyActive = mode === "study";
  const assessmentActive = mode === "assessment";
  const programmingStudyActive = studyActive && isKanbanProgrammingStudyTemplate(state.kanbanReadingDraft?.studyTemplate);
  const modeButton = (mode, label, active) => `<button class="kanban-create-mode-button${active ? " active" : ""}" type="button" data-kanban-composer-mode="${mode}" aria-pressed="${active ? "true" : "false"}"${busy ? " disabled" : ""}>${label}</button>`;
  const submitLabel = assessmentActive
    ? "\u521b\u5efa\u8003\u8bd5\u8ba1\u5212"
    : (studyActive
      ? (programmingStudyActive ? "\u521b\u5efa\u7f16\u7a0b\u6d4b\u9a8c\u8ba1\u5212" : "\u521b\u5efa\u5b66\u4e60\u8ba1\u5212")
      : (multiActive
        ? (state.kanbanPlanDraft ? "\u91cd\u65b0\u62c6\u89e3" : "\u62c6\u89e3\u4efb\u52a1")
        : "\u521b\u5efa\u4efb\u52a1"));
  const placeholder = assessmentActive
    ? "\u8865\u5145\u8003\u8bd5\u8303\u56f4\u3001\u9898\u578b\u6bd4\u4f8b\u3001\u6559\u6750\u7ae0\u8282\u6216\u8584\u5f31\u70b9"
    : (studyActive
      ? (programmingStudyActive ? "\u8865\u5145\u7f16\u7a0b\u9879\u76ee\u3001\u8bfe\u5802\u91cd\u70b9\u3001\u7ec3\u4e60\u8303\u56f4\u6216\u51fa\u9898\u8981\u6c42\uff0c\u6216\u7559\u7a7a" : "\u8865\u5145\u5b66\u4e60\u8303\u56f4\u3001\u5206\u6bb5\u8981\u6c42\u3001\u8bc4\u4ef7\u91cd\u70b9\uff0c\u6216\u7559\u7a7a")
      : "\u8f93\u5165\u4efb\u52a1\u9700\u6c42");
  const caption = assessmentActive
    ? "\u56fa\u5b9a\u6b63\u5f0f\u8003\u8bd5\u6a21\u677f\uff1b\u672a\u8fbe\u901a\u8fc7\u7ebf\u4f1a\u4fdd\u7559\u91cd\u8003"
    : (studyActive
      ? (programmingStudyActive ? "\u6309\u5b66\u4e60\u8ba1\u5212\u65e5\u671f\u5f00\u653e\u7f16\u7a0b\u6d4b\u9a8c\u5361\uff1b\u6bcf\u5f20\u5361\u5f00\u653e\u540e\u586b\u5199\u672c\u6b21\u8981\u6c42\u518d\u51fa\u9898" : "\u6bcf\u6b21\u5b66\u4e60\u4e00\u5f20\u5361\u7247\uff0c\u6bcf\u65e5\u5c0f\u6d4b\u901a\u8fc7\u540e\u5b8c\u6210\uff1b\u6700\u540e\u6709\u7efc\u5408\u8003\u8bd5")
      : (multiActive ? `\u6700\u5927\u5e76\u884c ${KANBAN_MULTI_AGENT_MAX_PARALLEL}` : "\u76f4\u63a5\u8fdb\u5165 todo"));
  return `<section class="kanban-composer-panel">
    <form id="kanbanComposerForm" class="kanban-composer-form">
      <div class="kanban-create-mode" role="group" aria-label="\u4efb\u52a1\u521b\u5efa\u65b9\u5f0f">
        ${modeButton("single", "\u5355\u4efb\u52a1", singleActive)}
        ${modeButton("multi", "\u62c6\u89e3", multiActive)}
        ${modeButton("study", "\u5b66\u4e60\u8ba1\u5212", studyActive)}
        ${modeButton("assessment", "\u8003\u8bd5\u8ba1\u5212", assessmentActive)}
      </div>
      ${studyActive ? renderKanbanReadingFields(busy) : ""}
      ${assessmentActive ? renderKanbanAssessmentFields(busy) : ""}
      ${multiActive ? renderKanbanMultiAgentControls(busy) : ""}
      ${renderKanbanComposerDocumentPanel(busy)}
      <textarea id="kanbanComposerText" class="kanban-composer-input" rows="${studyActive || assessmentActive ? "4" : "7"}" placeholder="${escapeHtml(placeholder)}"${busy ? " disabled" : ""}>${escapeHtml(state.kanbanComposerText)}</textarea>
      <div class="kanban-composer-toolbar">
        <span class="kanban-create-mode-caption">${escapeHtml(caption)}</span>
        <span class="kanban-composer-buttons">
          <button type="button" data-close-todo-create${busy ? " disabled" : ""}>\u8fd4\u56de\u770b\u677f</button>
          <button type="submit"${busy ? " disabled" : ""}>${submitLabel}</button>
        </span>
      </div>
    </form>
    ${renderKanbanComposerProgress()}
    ${(messages || draft) ? `<div class="kanban-composer-thread">${messages}${draft}</div>` : ""}
  </section>`;
}

function renderKanbanCreatePage() {
  return `<div class="kanban-create-page">
    ${renderKanbanComposerPanel()}
  </div>`;
}

function renderTodoKanbanBoard(todos) {
  const grouped = new Map(KANBAN_STATUS_ORDER.map((status) => [status, []]));
  const boardTodos = kanbanVisibleBoardTodos(todos);
  for (const todo of boardTodos) {
    const status = normalizedKanbanStatus(todo);
    if (!grouped.has(status)) grouped.set(status, []);
    grouped.get(status).push(todo);
  }
  grouped.set("done", sortArchivedKanbanCards(grouped.get("done") || []));
  grouped.set("archived", sortArchivedKanbanCards(grouped.get("archived") || []));
  const selectedStatus = currentTodoKanbanStatus(grouped);
  const selectedMeta = kanbanStatusMeta(selectedStatus);
  const selectedItems = grouped.get(selectedStatus) || [];
  const storyCases = state.todoCompletedLoaded ? kanbanActiveStoryCases(todos) : [];
  const tabs = KANBAN_TAB_ORDER.map((status) => {
    const meta = kanbanStatusMeta(status);
    const items = grouped.get(status) || [];
    const active = status === selectedStatus ? " active" : "";
    const count = status === KANBAN_STORY_STATUS
      ? (state.todoCompletedLoaded ? String(storyCases.length) : "\u2026")
      : (!state.todoCompletedLoaded && kanbanStatusNeedsCompleted(status) ? "\u2026" : String(items.length));
    return `<button class="todo-kanban-tab${active} status-${escapeHtml(status)}" type="button" data-kanban-status="${escapeHtml(status)}" aria-pressed="${active ? "true" : "false"}">
      <span class="todo-kanban-tab-label">${escapeHtml(meta.label)}</span>
      <span class="todo-kanban-tab-count">${escapeHtml(count)}</span>
    </button>`;
  }).join("");
  const laneBody = selectedStatus === KANBAN_STORY_STATUS
    ? renderKanbanStoryTree(todos)
    : (selectedStatus === "archived" ? renderKanbanArchiveStories(selectedItems) : (selectedItems.map(renderTodoKanbanCard).join("") || `<div class="empty-state small">No items.</div>`));
  return `
    <div class="todo-kanban-board">
      <nav class="todo-kanban-switcher" aria-label="Kanban status">${tabs}</nav>
      <section class="todo-kanban-lane todo-kanban-current status-${escapeHtml(selectedStatus)}" aria-label="${escapeHtml(selectedMeta.shortLabel)}" role="list">
        <header class="todo-kanban-lane-header">
          <div>
            <div class="todo-kanban-lane-title">${escapeHtml(selectedMeta.label)}</div>
            <div class="todo-kanban-lane-code">${escapeHtml(selectedMeta.shortLabel)}</div>
          </div>
          <span>${selectedStatus === KANBAN_STORY_STATUS ? storyCases.length : selectedItems.length}</span>
        </header>
        <div class="todo-kanban-cards">${laneBody}</div>
      </section>
    </div>
  `;
}

function renderTodoKanbanCard(todo) {
  const status = normalizedKanbanStatus(todo);
  const meta = kanbanStatusMeta(status);
  const assignee = todo.kanbanAssignee || todo.assigneeLabel || todo.assignee || "";
  const priority = todoPriorityLabel(todo);
  const tenant = todo.kanbanTenant || "";
  const due = todoDueLabel(todo);
  const skills = Array.isArray(todo.kanbanSkills) ? todo.kanbanSkills.slice(0, 3) : [];
  const chips = [
    priority,
    assignee ? `@${assignee}` : "",
    tenant && tenant !== assignee ? tenant : "",
    todo.kanbanWorkspaceKind || "",
  ].filter(Boolean);
  return `<article class="todo-kanban-card status-${escapeHtml(status)}" role="listitem">
    <button class="todo-kanban-card-button" type="button" data-todo-id="${escapeHtml(todo.id)}">
      <span class="todo-kanban-card-status">${escapeHtml(meta.shortLabel)}</span>
      <span class="todo-kanban-card-title">${escapeHtml(todo.content || todo.id)}</span>
      <span class="todo-kanban-card-meta">${escapeHtml(due)}</span>
      ${chips.length ? `<span class="todo-kanban-card-chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</span>` : ""}
      ${skills.length ? `<span class="todo-kanban-card-skills">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</span>` : ""}
    </button>
  </article>`;
}

function renderTodoSections(openTodos, closedTodos) {
  return `
    <div class="todo-section">
      <div class="todo-section-title">未完成 · ${openTodos.length}</div>
      <div class="todo-card-list">${openTodos.map(renderTodoCard).join("") || `<div class="empty-state small">No open cards.</div>`}</div>
    </div>
    <div class="todo-section todo-section-muted">
      <div class="todo-section-title">已完成 / 已取消 · ${closedTodos.length}</div>
      <div class="todo-card-list">${closedTodos.slice(0, 30).map(renderTodoCard).join("") || `<div class="empty-state small">No completed cards.</div>`}</div>
    </div>
  `;
}

function renderTodoCard(todo) {
  const status = todoStatusLabel(todo);
  return `<article class="todo-card task-swipe-row ${escapeHtml(status)}" data-swipe-row data-swipe-kind="todo" data-swipe-id="${escapeHtml(todo.id)}">
    <button class="task-swipe-delete" type="button" data-delete-swipe="${escapeHtml(todo.id)}" aria-label="删除看板卡片">删除</button>
    <div class="task-swipe-content" data-swipe-content>
      <button class="todo-card-main" type="button" data-todo-id="${escapeHtml(todo.id)}">
      <span class="todo-card-title">${escapeHtml(todo.content || todo.id)}</span>
      <span class="todo-card-meta">${escapeHtml(todo.assigneeLabel || todo.assignee || "")} · ${escapeHtml(todoDueLabel(todo))}</span>
      <span class="todo-card-status">${escapeHtml(todoStatusText(todo))}${todo.recurrenceLabel ? ` | ${escapeHtml(todo.recurrenceLabel)}` : ""}</span>
      </button>
    </div>
  </article>`;
}

function renderTodoDetailGridItem(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function todoCardDetailState(todoId) {
  return state.todoCardDetails?.[todoId] || null;
}

function dedupeKanbanOutputs(outputs) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(outputs) ? outputs : []) {
    const key = String(item?.url || item?.path || item?.name || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function kanbanCardOutputs(todo) {
  const detail = todoCardDetailState(todo?.id || "");
  const readingOutput = todo?.readingSubmission?.analysisOutput ? [todo.readingSubmission.analysisOutput] : [];
  const outputs = dedupeKanbanOutputs([
    ...(Array.isArray(todo?.kanbanOutputs) ? todo.kanbanOutputs : []),
    ...readingOutput,
    ...(Array.isArray(detail?.outputs) ? detail.outputs : []),
  ]);
  if (isKanbanAssessmentCard(todo)) {
    const summary = assessmentExamSummary(todo) || {};
    if (!summary.lastAttempt && !assessmentExamCompleted(todo)) return [];
    return outputs.filter((item) => {
      const name = String(item?.name || item?.path || "").toLowerCase();
      return !name.includes("answer_key") && !name.includes("sample_answers");
    });
  }
  return outputs;
}

function shouldAutoLoadKanbanDetail(todo) {
  if (!todo || !isKanbanTodoSource() || todoCardDetailState(todo.id)) return false;
  return !String(todo?.kanbanResult || "").trim() && !kanbanCardOutputs(todo).length;
}

function renderKanbanOutputLinks(outputs, className = "todo-detail-outputs") {
  const items = Array.isArray(outputs) ? outputs : [];
  if (!items.length) return "";
  return `<div class="${escapeHtml(className)}">
    ${items.map((item) => `<a href="${escapeHtml(kanbanOutputHref(item))}" target="_self" rel="noopener">
      <span>${escapeHtml(item.name || "output")}</span>
      <small>${escapeHtml(item.displayPath || item.path || "")}</small>
    </a>`).join("")}
  </div>`;
}

function renderKanbanDeliveryFiles(todo) {
  const outputs = kanbanCardOutputs(todo);
  if (!outputs.length) return "";
  return `<section class="todo-detail-deliverables">
    <div class="todo-detail-deliverables-head">
      <strong>\u4ea4\u4ed8\u6587\u4ef6</strong>
      <span>${outputs.length}</span>
    </div>
    ${renderKanbanOutputLinks(outputs)}
  </section>`;
}

function kanbanOutputHref(item) {
  return artifactHref({
    url: item?.url || "#",
    name: item?.name || "output",
    mime: item?.mime || "",
    size: item?.size || 0,
  });
}

function kanbanCaseCover(todo) {
  return todo?.kanbanCaseCover && typeof todo.kanbanCaseCover === "object" ? todo.kanbanCaseCover : null;
}

function renderKanbanCaseCover(cover, options = {}) {
  if (!cover?.url) return "";
  const compact = options.compact ? " compact" : "";
  const title = cover.name || "book cover";
  return `<a class="kanban-reading-cover${compact}" href="${escapeHtml(kanbanOutputHref(cover))}" target="_self" aria-label="${escapeHtml(`预览 ${title}`)}">
    <span class="kanban-reading-cover-frame">
      <img data-kanban-cover-img data-cover-url="${escapeHtml(cover.url)}" alt="${escapeHtml(title)}">
    </span>
    ${options.hideLabel ? "" : `<span>${escapeHtml(title)}</span>`}
  </a>`;
}

async function loadKanbanCoverImages(root = document) {
  const nodes = [...(root.querySelectorAll?.("img[data-kanban-cover-img][data-cover-url]") || [])];
  for (const img of nodes) {
    const url = String(img.dataset.coverUrl || "");
    if (!url || img.dataset.coverLoaded === "1") continue;
    if (state.kanbanCoverObjectUrls[url]) {
      img.src = state.kanbanCoverObjectUrls[url];
      img.dataset.coverLoaded = "1";
      continue;
    }
    try {
      const headers = {};
      if (state.key) headers["X-Hermes-Web-Key"] = state.key;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      state.kanbanCoverObjectUrls[url] = objectUrl;
      if (img.isConnected) {
        img.src = objectUrl;
        img.dataset.coverLoaded = "1";
      }
    } catch (_) {
      img.dataset.coverLoaded = "error";
    }
  }
}

function renderKanbanProcessRows(detail) {
  const events = Array.isArray(detail?.events) ? detail.events.filter((event) => event.preview || event.kind).slice(-6) : [];
  const runs = Array.isArray(detail?.runs) ? detail.runs.filter((run) => run.summary || run.status || run.outcome).slice(-3) : [];
  const eventRows = events.map((event) => `<li><strong>${escapeHtml(event.kind || "event")}</strong><span>${escapeHtml(event.preview || "")}</span></li>`);
  const runRows = runs.map((run) => `<li><strong>${escapeHtml([run.profile, run.outcome || run.status].filter(Boolean).join(" / ") || "run")}</strong><span>${escapeHtml(run.summary || "")}</span></li>`);
  const rows = [...eventRows, ...runRows];
  return rows.length ? `<ul class="todo-detail-process">${rows.join("")}</ul>` : "";
}

function renderKanbanDetailReport(todo) {
  if (!isKanbanTodoSource()) return "";
  if (isKanbanAssessmentCard(todo) && !assessmentHasVisibleResult(todo)) return "";
  const detail = todoCardDetailState(todo.id);
  const summary = kanbanDisplayResultText(todo, todo.kanbanResult || detail?.summary || "");
  const readingCard = isKanbanReadingCard(todo);
  const labels = kanbanStudyLabels(todo);
  if (readingCard && kanbanCardOutputs(todo).length) return "";
  const processRows = detail && !readingCard ? renderKanbanProcessRows(detail) : "";
  const loading = detail?.loading;
  const error = detail?.error || "";
  const actionLabel = loading ? "\u52a0\u8f7d\u4e2d" : (detail ? "\u5237\u65b0\u8fc7\u7a0b" : "\u52a0\u8f7d\u8fc7\u7a0b");
  const title = readingCard ? labels.receipt : "\u56de\u6267 / \u8fc7\u7a0b";
  const emptyText = readingCard && kanbanCardOutputs(todo).length
    ? "\u5b8c\u6574\u5206\u6790\u5df2\u5728\u4e0a\u65b9\u4ea4\u4ed8\u6587\u4ef6\u4e2d\u3002"
    : "\u6682\u65e0\u56de\u6267\u6458\u8981\u3002";
  return `<section class="todo-detail-result">
    <div class="todo-detail-result-head">
      <strong>${escapeHtml(title)}</strong>
      <button type="button" data-load-kanban-detail="${escapeHtml(todo.id)}"${loading ? " disabled" : ""}>${actionLabel}</button>
    </div>
    ${loading ? `<p class="todo-detail-muted">正在加载官方看板过程...</p>` : ""}
    ${error ? `<p class="todo-detail-error">${escapeHtml(error)}</p>` : ""}
    ${summary ? `<pre>${escapeHtml(summary)}</pre>` : (!loading && !error ? `<p class="todo-detail-muted">${escapeHtml(emptyText)}</p>` : "")}
    ${processRows}
  </section>`;
}

function isKanbanReadingCard(todo) {
  return isKanbanStudyCase(todo) && !isKanbanFinalStudyAssessment(todo);
}

function readingSubmissionSummary(todo) {
  return todo?.readingSubmission && typeof todo.readingSubmission === "object"
    ? todo.readingSubmission
    : null;
}

function readingSubmissionHasAnalysis(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "reading" || workflow.kind === "study")) {
    return ["quiz_pending", "completed"].includes(String(workflow.phase || ""));
  }
  const summary = readingSubmissionSummary(todo);
  return Boolean(
    summary?.quizAvailable
    || summary?.analysisOutput
    || readingQuizState(todo?.id || "")?.quiz
    || kanbanCardOutputs(todo).length,
  );
}

function readingSubmissionCompleted(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "reading" || workflow.kind === "study")) return Boolean(workflow.completed);
  const summary = readingSubmissionSummary(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

function readingSubmissionFeedback(todoId) {
  return state.todoReadingSubmissionFeedback?.[todoId] || null;
}

function setReadingSubmissionFeedback(todoId, feedback = {}) {
  if (!todoId) return;
  state.todoReadingSubmissionFeedback[todoId] = Object.assign({ updatedAt: Date.now() }, feedback);
}

function clearReadingSubmissionWatchdog(todoId) {
  const timer = state.todoReadingSubmissionWatchdogs?.[todoId];
  if (timer) {
    window.clearTimeout(timer);
    delete state.todoReadingSubmissionWatchdogs[todoId];
  }
}

function clearReadingSubmissionPendingState(todoId) {
  if (!todoId) return;
  clearReadingSubmissionWatchdog(todoId);
  delete state.todoReadingSubmitting[todoId];
  delete state.todoReadingSubmissionRefreshing[todoId];
  delete state.todoReadingSubmissionProgress[todoId];
}

function answerDraftHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function answerDraftStorageId(value) {
  return encodeURIComponent(String(value || ""));
}

function answerDraftStoragePrefix(kind, workspaceId, todoId) {
  return `hermes${kind}AnswerDraft:${answerDraftStorageId(workspaceId || "owner")}:${answerDraftStorageId(todoId)}:`;
}

function answerDraftStorageKey(kind, workspaceId, todoId, fingerprint) {
  return `${answerDraftStoragePrefix(kind, workspaceId, todoId)}${answerDraftHash(fingerprint)}`;
}

function answerDraftFingerprint(source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const questionKey = questions.map((question, index) => [
    question?.id || `q${index + 1}`,
    question?.prompt || "",
    Array.isArray(question?.choices) ? question.choices.length : 0,
  ].join(":")).join("|");
  return [
    source.startedAt || "",
    source.quizTargetingVersion || "",
    source.verification || "",
    source.status || "",
    questions.length,
    questionKey,
  ].join("|");
}

function validAnswerChoice(value, question = {}) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  const choices = Array.isArray(question.choices) ? question.choices : [];
  return Number.isInteger(parsed) && parsed >= 0 && parsed < choices.length ? parsed : null;
}

function serializeAnswerDraftAnswers(answers = [], questions = []) {
  return questions.map((question, index) => validAnswerChoice(answers[index], question));
}

function restoreAnswerDraftAnswers(answers = [], questions = []) {
  const restored = [];
  questions.forEach((question, index) => {
    const value = validAnswerChoice(answers[index], question);
    if (value !== null) restored[index] = value;
  });
  return restored;
}

function answerDraftAnsweredCount(answers = [], questions = []) {
  return serializeAnswerDraftAnswers(answers, questions).filter((value) => value !== null).length;
}

function clearAnswerDrafts(kind, workspaceId, todoId, keepKey = "") {
  const prefix = answerDraftStoragePrefix(kind, workspaceId, todoId);
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(prefix) && key !== keepKey) localStorage.removeItem(key);
    }
  } catch (_) {}
}

function readAnswerDraft(kind, workspaceId, todoId, source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!todoId || !questions.length) return { answers: [], step: 0 };
  const key = answerDraftStorageKey(kind, workspaceId, todoId, answerDraftFingerprint(source));
  clearAnswerDrafts(kind, workspaceId, todoId, key);
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (!raw || typeof raw !== "object") return { answers: [], step: 0 };
    const answers = restoreAnswerDraftAnswers(Array.isArray(raw.answers) ? raw.answers : [], questions);
    const maxStep = Math.max(0, questions.length - 1);
    const step = Math.max(0, Math.min(maxStep, Number(raw.step || 0) || 0));
    return { answers, step };
  } catch (_) {
    return { answers: [], step: 0 };
  }
}

function writeAnswerDraft(kind, workspaceId, todoId, source = {}, answers = [], step = 0) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!todoId || !questions.length) return;
  const key = answerDraftStorageKey(kind, workspaceId, todoId, answerDraftFingerprint(source));
  const payload = {
    updatedAt: new Date().toISOString(),
    answers: serializeAnswerDraftAnswers(answers, questions),
    step: Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(step || 0) || 0)),
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    clearAnswerDrafts(kind, workspaceId, todoId, key);
  } catch (_) {}
}

function applyAnswerDraft(kind, workspaceId, todoId, source = {}, existingAnswers = [], existingStep = 0) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const existingCount = answerDraftAnsweredCount(existingAnswers, questions);
  if (existingCount > 0) {
    return {
      answers: restoreAnswerDraftAnswers(existingAnswers, questions),
      step: Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(existingStep || 0) || 0)),
    };
  }
  return readAnswerDraft(kind, workspaceId, todoId, source);
}

function readingSubmissionReady(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return false;
  const quiz = readingQuizState(id)?.quiz;
  if (quiz && Array.isArray(quiz.questions) && quiz.questions.length) return true;
  return readingSubmissionHasAnalysis(kanbanCardById(id));
}

function readReadingQuizDraft(todoId, quiz = {}) {
  return readAnswerDraft("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId, quiz);
}

function writeReadingQuizDraft(todoId) {
  const quiz = state.todoReadingQuizzes[todoId]?.quiz || null;
  if (!quiz) return;
  writeAnswerDraft("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId, quiz, state.todoReadingQuizAnswers[todoId] || [], state.todoReadingQuizStep[todoId] || 0);
}

function clearReadingQuizDrafts(todoId) {
  clearAnswerDrafts("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId);
}

function applyReadingQuizResult(todoId, result = {}) {
  const originalId = String(todoId || "").trim();
  const canonicalId = String(result.canonicalCardId || originalId || "").trim() || originalId;
  if (!canonicalId || !result?.quiz) return originalId;
  if (canonicalId !== originalId) {
    delete state.todoReadingQuizzes[originalId];
    state.selectedTodoId = canonicalId;
  }
  state.todoReadingQuizzes[canonicalId] = {
    quiz: result.quiz,
    quizUrl: result.quizUrl || "",
    status: result.status || "quiz_pending",
  };
  const draft = applyAnswerDraft(
    "ReadingQuiz",
    kanbanCardWorkspaceId(canonicalId),
    canonicalId,
    result.quiz,
    state.todoReadingQuizAnswers[canonicalId] || [],
    state.todoReadingQuizStep[canonicalId] || 0,
  );
  state.todoReadingQuizAnswers[canonicalId] = draft.answers;
  state.todoReadingQuizStep[canonicalId] = draft.step;
  return canonicalId;
}

async function refreshReadingSubmissionStatus(todoId, options = {}) {
  const id = String(todoId || "").trim();
  if (!id || state.todoReadingSubmissionRefreshing?.[id]) return false;
  const card = kanbanCardById(id);
  const labels = kanbanStudyLabels(card || {});
  state.todoReadingSubmissionRefreshing[id] = true;
  state.todoReadingSubmissionProgress[id] = "transcribing";
  setReadingSubmissionFeedback(id, {
    kind: "info",
    message: options.fromWatchdog
      ? "正在重新检查后台处理结果。"
      : "正在刷新处理结果。",
  });
  if (!options.silent) renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });

  let canonicalId = id;
  let ready = false;
  let quizError = null;
  let refreshError = null;
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(id) });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(id)}/reading-quiz?${params.toString()}`);
    canonicalId = applyReadingQuizResult(id, result);
    const questions = result?.quiz?.questions;
    ready = Array.isArray(questions) && questions.length > 0;
  } catch (err) {
    quizError = err;
  }

  try {
    const workspaceId = kanbanCardWorkspaceId(canonicalId || id);
    clearTodoListCache(workspaceId);
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true, preserveScroll: true });
    if (state.todos.some((todo) => todo.id === canonicalId)) state.selectedTodoId = canonicalId;
    else if (state.todos.some((todo) => todo.id === id)) state.selectedTodoId = id;
    delete state.todoCardDetails[id];
    if (canonicalId !== id) delete state.todoCardDetails[canonicalId];
    await loadKanbanCardDetail(canonicalId || id, { force: true, silent: true });
  } catch (err) {
    refreshError = err;
  }

  ready = ready || readingSubmissionReady(canonicalId) || readingSubmissionReady(id);
  if (ready) {
    clearReadingSubmissionPendingState(id);
    if (canonicalId && canonicalId !== id) clearReadingSubmissionPendingState(canonicalId);
    delete state.todoReadingSubmissionDrafts[id];
    setReadingSubmissionFeedback(canonicalId || id, {
      kind: "success",
      message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
    });
    if (!options.silentToast) showPushToast(`${labels.analysis}和${labels.quiz}已生成；请开始答卷。`, "success");
  } else if (quizError && refreshError) {
    setReadingSubmissionFeedback(id, {
      kind: "error",
      message: "刷新处理状态失败；请检查网络后重试。",
    });
  } else {
    setReadingSubmissionFeedback(id, {
      kind: "info",
      message: "后台仍在处理；稍后会继续刷新，也可以再次点刷新处理结果。",
    });
  }
  if (!ready && state.todoReadingSubmitting?.[id]) scheduleReadingSubmissionRecovery(id);
  delete state.todoReadingSubmissionRefreshing[id];
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  return ready;
}

function scheduleReadingSubmissionRecovery(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return;
  clearReadingSubmissionWatchdog(id);
  state.todoReadingSubmissionWatchdogs[id] = window.setTimeout(() => {
    if (!state.todoReadingSubmitting?.[id]) return;
    refreshReadingSubmissionStatus(id, { fromWatchdog: true, silentToast: true }).catch((err) => {
      setReadingSubmissionFeedback(id, {
        kind: "error",
        message: err?.message || "刷新处理状态失败；请手动刷新。",
      });
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  }, 45000);
}

function renderKanbanReadingWorkflowPanel(todo) {
  return LearningReadingUi.renderKanbanReadingWorkflowPanel(todo, learningReadingUiOptions());
}

function readingQuizState(todoId) {
  return state.todoReadingQuizzes?.[todoId] || null;
}

function renderKanbanReadingQuizPanel(todo) {
  return LearningReadingUi.renderKanbanReadingQuizPanel(todo, learningReadingUiOptions());
}

function assessmentExamState(todoId) {
  return state.todoAssessmentExams?.[todoId] || null;
}

function readAssessmentExamDraft(todoId, exam = {}) {
  return readAnswerDraft("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId, exam);
}

function writeAssessmentExamDraft(todoId) {
  const exam = state.todoAssessmentExams[todoId]?.exam || null;
  if (!exam) return;
  writeAnswerDraft("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId, exam, state.todoAssessmentAnswers[todoId] || [], state.todoAssessmentStep[todoId] || 0);
}

function clearAssessmentExamDrafts(todoId) {
  clearAnswerDrafts("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId);
}

function learningGuidanceKey(todoId, mode) {
  return `${String(todoId || "")}:${String(mode || "")}`;
}

function learningGuidanceDraftKey(todoId, mode, index) {
  return `${learningGuidanceKey(todoId, mode)}:${Number(index) || 0}`;
}

function learningGuidanceQuestionRecord(todoId, mode, question, index) {
  const session = state.todoLearningGuidance?.[learningGuidanceKey(todoId, mode)]?.guidance || null;
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  const questionId = String(question?.id || `q${Number(index || 0) + 1}`);
  return questions.find((item) => String(item.questionId || "") === questionId)
    || questions.find((item) => Number(item.questionIndex || 0) === Number(index || 0))
    || null;
}

function learningGuidanceModeForAssessment(todo) {
  return isKanbanProgrammingAssessmentCard(todo) ? "programming-assessment" : "assessment-exam";
}

function selectedLearningAnswer(todoId, mode, index) {
  const answers = mode === "reading-quiz"
    ? state.todoReadingQuizAnswers?.[todoId]
    : state.todoAssessmentAnswers?.[todoId];
  const value = Array.isArray(answers) ? Number(answers[index]) : NaN;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function learningGuidanceQuestionPayload(question = {}, index = 0) {
  return {
    id: String(question.id || `q${Number(index || 0) + 1}`),
    index: Number(index) || 0,
    skill: String(question.skill || ""),
    prompt: String(question.prompt || ""),
    choices: Array.isArray(question.choices) ? question.choices.map((choice) => String(choice || "")) : [],
  };
}

function learningGuidanceReflectionValue(todoId, mode, index, record = null) {
  const key = learningGuidanceDraftKey(todoId, mode, index);
  if (Object.prototype.hasOwnProperty.call(state.todoLearningGuidanceDrafts, key)) {
    return state.todoLearningGuidanceDrafts[key] || "";
  }
  return record?.reflection || "";
}

function renderLearningGuidancePanel(todoId, mode, index, question, options = {}) {
  const record = learningGuidanceQuestionRecord(todoId, mode, question, index);
  const selected = selectedLearningAnswer(todoId, mode, index);
  const draft = learningGuidanceReflectionValue(todoId, mode, index, record);
  const submitKey = learningGuidanceDraftKey(todoId, mode, index);
  const submitting = Boolean(state.todoLearningGuidanceSubmitting?.[submitKey]);
  const disabled = Boolean(options.disabled);
  const hint = record?.lastHint || "";
  const reflectionSaved = Boolean(record?.reflection);
  const reviewed = Boolean(record?.reviewedAt);
  return `<div class="learning-guidance-panel" data-learning-guidance-panel="${escapeHtml(submitKey)}">
    <div class="learning-guidance-head">
      <strong>${escapeHtml(options.title || "\u601d\u8def\u4e0e\u63d0\u793a")}</strong>
      <span>${escapeHtml(reviewed ? "\u5df2\u590d\u6838" : (reflectionSaved ? "\u5df2\u8bb0\u5f55\u601d\u8def" : "\u53ef\u5148\u5199\u601d\u8def"))}</span>
    </div>
    ${hint ? `<div class="learning-guidance-hint" role="status">${escapeHtml(hint)}</div>` : ""}
    <textarea class="todo-input learning-guidance-reflection" rows="2" data-learning-guidance-reflection="${escapeHtml(submitKey)}" placeholder="${escapeHtml("\u5199\u4e00\u53e5\uff1a\u6211\u4e3a\u4ec0\u4e48\u8fd9\u6837\u9009\uff1f\u54ea\u4e2a\u5730\u65b9\u8fd8\u4e0d\u786e\u5b9a\uff1f")}"${disabled || submitting ? " disabled" : ""}>${escapeHtml(draft)}</textarea>
    <div class="learning-guidance-actions">
      <button type="button" data-learning-guidance-action="hint" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting ? " disabled" : ""}>${escapeHtml(submitting ? "\u5904\u7406\u4e2d..." : "\u7ed9\u6211\u63d0\u793a")}</button>
      <button type="button" data-learning-guidance-action="reflection" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting ? " disabled" : ""}>${escapeHtml("\u4fdd\u5b58\u601d\u8def")}</button>
      <button type="button" data-learning-guidance-action="review" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting || selected === null ? " disabled" : ""}>${escapeHtml(reviewed ? "\u66f4\u65b0\u590d\u6838" : "\u52a0\u5165\u590d\u6838")}</button>
    </div>
  </div>`;
}

function renderAnswerReviewGate(todoId, mode, answeredCount, total, open) {
  if (!total || answeredCount < total) return "";
  const reviewedCount = (state.todoLearningGuidance?.[learningGuidanceKey(todoId, mode)]?.guidance?.questions || [])
    .filter((item) => item.reviewedAt).length;
  if (open) {
    return `<div class="learning-answer-review open" role="status">
      <strong>${escapeHtml("\u63d0\u4ea4\u524d\u590d\u6838")}</strong>
      <p>${escapeHtml(`\u5df2\u7b54 ${answeredCount}/${total}\uff1b\u5df2\u6807\u8bb0\u590d\u6838 ${reviewedCount}/${total}\u3002\u53ef\u4ee5\u8fd4\u56de\u4fee\u6539\uff0c\u786e\u8ba4\u540e\u518d\u5224\u5377\u3002`)}</p>
    </div>`;
  }
  return `<div class="learning-answer-review" role="status">
    <strong>${escapeHtml("\u5148\u590d\u6838\uff0c\u518d\u5224\u5377")}</strong>
    <p>${escapeHtml(`\u5df2\u7b54 ${answeredCount}/${total}\u3002\u70b9\u51fb\u590d\u6838\u540e\uff0c\u518d\u505a\u6700\u7ec8\u63d0\u4ea4\u3002`)}</p>
  </div>`;
}

function questionForLearningGuidance(todoId, mode, index) {
  const source = mode === "reading-quiz"
    ? state.todoReadingQuizzes?.[todoId]?.quiz
    : state.todoAssessmentExams?.[todoId]?.exam;
  const questions = Array.isArray(source?.questions) ? source.questions : [];
  return questions[Math.max(0, Number(index) || 0)] || null;
}

async function requestLearningGuidance(todoId, mode, action, index) {
  const normalizedTodoId = String(todoId || "");
  const normalizedMode = String(mode || "");
  const questionIndex = Math.max(0, Number(index) || 0);
  const question = questionForLearningGuidance(normalizedTodoId, normalizedMode, questionIndex);
  if (!normalizedTodoId || !question) return;
  const submitKey = learningGuidanceDraftKey(normalizedTodoId, normalizedMode, questionIndex);
  if (state.todoLearningGuidanceSubmitting?.[submitKey]) return;
  state.todoLearningGuidanceSubmitting[submitKey] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(normalizedTodoId)}/learning-guidance`, {
      method: "POST",
      body: JSON.stringify({
        workspaceId: kanbanCardWorkspaceId(normalizedTodoId),
        mode: normalizedMode,
        action,
        question: learningGuidanceQuestionPayload(question, questionIndex),
        reflection: state.todoLearningGuidanceDrafts?.[submitKey] || "",
        selectedAnswerIndex: selectedLearningAnswer(normalizedTodoId, normalizedMode, questionIndex),
      }),
    });
    state.todoLearningGuidance[learningGuidanceKey(normalizedTodoId, normalizedMode)] = result;
    if (action === "hint") showPushToast("\u5df2\u751f\u6210\u63d0\u793a", "success");
    if (action === "reflection") showPushToast("\u5df2\u4fdd\u5b58\u601d\u8def", "success");
  } finally {
    delete state.todoLearningGuidanceSubmitting[submitKey];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadLearningGuidanceSession(todoId, mode) {
  const normalizedTodoId = String(todoId || "");
  const normalizedMode = String(mode || "");
  if (!normalizedTodoId || !normalizedMode) return;
  const params = new URLSearchParams({
    workspaceId: kanbanCardWorkspaceId(normalizedTodoId),
    mode: normalizedMode,
  });
  const result = await api(`/api/kanban/cards/${encodeURIComponent(normalizedTodoId)}/learning-guidance?${params.toString()}`);
  state.todoLearningGuidance[learningGuidanceKey(normalizedTodoId, normalizedMode)] = result;
}

function renderKanbanAssessmentExamPanel(todo) {
  if (!isKanbanAssessmentCard(todo)) return "";
  const canAnswer = kanbanCan(todo, "canAnswerQuiz");
  const summary = assessmentExamSummary(todo) || {};
  const examState = assessmentExamState(todo.id);
  const submitting = Boolean(state.todoAssessmentSubmitting?.[todo.id]);
  const passed = assessmentExamCompleted(todo);
  const startable = assessmentCardAcceptsStart(todo);
  const workflow = todoWorkflowState(todo);
  const workflowPhase = String(workflow?.phase || "").trim().toLowerCase();
  if (!examState) {
    const last = summary.lastAttempt;
    const examAvailable = Boolean(
      summary.examAvailable
      || passed
      || workflowPhase === "in_progress"
      || workflowPhase === "retake_required"
      || workflow?.canAnswerQuiz
    );
    const text = last
      ? `上次 ${last.score}/100，通过线 ${last.passingScore || summary.passingScore || 80}；${last.passed ? "已通过" : "需要重考"}。`
      : (examAvailable ? "考试已生成，可继续查看或答题。" : (startable ? "考试已开放。开始后会生成正式单选考卷。" : "考试尚未开放，需要先通过前一张考试卡。"));
    const canOpenExam = (startable || examAvailable) && (canAnswer || passed);
    const programming = isKanbanProgrammingAssessmentCard(todo);
    const draft = state.todoAssessmentRequirementDrafts?.[todo.id] || "";
    const action = programming && !examAvailable && startable && canAnswer
      ? `<form class="todo-assessment-requirement-form" data-assessment-requirement-form="${escapeHtml(todo.id)}">
        <label class="todo-panel-label" for="todoAssessmentRequirementText">本次编程要求</label>
        <textarea id="todoAssessmentRequirementText" class="todo-input todo-comment-textarea" rows="4" data-assessment-requirement-input="${escapeHtml(todo.id)}" placeholder="填写老师教学重点、课堂表现、项目目标、想测试的知识点或代码练习要求">${escapeHtml(draft)}</textarea>
        <button type="submit" data-start-assessment-exam="${escapeHtml(todo.id)}">生成编程测验</button>
      </form>`
      : (canOpenExam
        ? `<button type="button" data-load-assessment-exam="${escapeHtml(todo.id)}">${escapeHtml(examAvailable ? "查看考卷" : "开始考试")}</button>`
        : `<div class="todo-assessment-waiting-action" role="status">${escapeHtml(startable ? "当前账号无答题权限" : "等待前序考试通过")}</div>`);
    const heading = programming ? "编程测验" : (summary.finalExam ? "最终综合考试" : "正式检测");
    return `<section class="todo-comment-panel todo-assessment-panel">
      <div class="todo-detail-deliverables-head">
        <strong>${escapeHtml(heading)}</strong>
        <span>${escapeHtml(`${summary.questionCount || 20}题 / ${summary.durationMinutes || 30}分钟`)}</span>
      </div>
      <p class="todo-detail-muted">${escapeHtml(text)}</p>
      ${action}
    </section>`;
  }
  if (examState.loading) {
    return `<section class="todo-comment-panel todo-assessment-panel"><p class="todo-detail-muted">正在生成正式考卷...</p></section>`;
  }
  if (examState.error) {
    return `<section class="todo-comment-panel todo-assessment-panel">
      <p class="todo-detail-error">${escapeHtml(examState.error)}</p>
      <button type="button" data-load-assessment-exam="${escapeHtml(todo.id)}">重新加载</button>
    </section>`;
  }
  const exam = examState.exam || {};
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  if (!questions.length) return "";
  const answers = state.todoAssessmentAnswers?.[todo.id] || [];
  const step = Math.max(0, Math.min(questions.length - 1, Number(state.todoAssessmentStep?.[todo.id] || 0)));
  const question = questions[step] || questions[0];
  const selected = Number(answers[step]);
  const result = examState.result || null;
  const resultItems = result && Array.isArray(result.results) ? result.results : [];
  const currentResult = resultItems[step] || null;
  const currentWrong = result && !result.passed && currentResult && !currentResult.correct;
  const choices = (question.choices || []).map((choice, index) => {
    const id = `assessmentExam_${todo.id}_${step}_${index}`.replace(/[^\w-]/g, "_");
    return `<label class="reading-quiz-choice" for="${escapeHtml(id)}">
      <input id="${escapeHtml(id)}" type="radio" name="assessmentExamChoice_${escapeHtml(todo.id)}" value="${index}" data-assessment-exam-choice="${escapeHtml(todo.id)}" data-question-index="${step}"${selected === index ? " checked" : ""}${submitting || passed || !canAnswer ? " disabled" : ""}>
      <span>${escapeHtml(choice)}</span>
    </label>`;
  }).join("");
  const canPrev = step > 0;
  const canNext = step < questions.length - 1;
  const answeredCount = answers.filter((value) => Number.isInteger(Number(value))).length;
  const guidanceMode = learningGuidanceModeForAssessment(todo);
  const reviewOpen = Boolean(state.todoAssessmentReviewOpen?.[todo.id]);
  const status = result
    ? (result.passed ? `已通过：${result.score}/100` : `本次 ${result.score}/100，未达通过线，请修正后重考。`)
    : (passed ? "已通过，可查看题目。" : `已答 ${answeredCount}/${questions.length}；通过线 ${exam.passingScore || summary.passingScore || 80}`);
  const wrongHint = currentWrong
    ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题需要复习</strong>
      <p>${escapeHtml(currentResult.explanation || "这题需要重新检查。")}</p>
    </div>`
    : "";
  const passedExplanation = result?.passed && currentResult?.explanation
    ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题讲解</strong>
      <p>${escapeHtml(currentResult.explanation)}</p>
    </div>`
    : "";
  const guidanceBlock = renderLearningGuidancePanel(todo.id, guidanceMode, step, question, {
    disabled: submitting || passed || !canAnswer,
    title: "\u6d4b\u9a8c\u5f15\u5bfc",
  });
  const reviewBlock = renderAnswerReviewGate(todo.id, guidanceMode, answeredCount, questions.length, reviewOpen);
  const submitControls = passed
    ? `<button type="submit" disabled>${escapeHtml("\u5df2\u901a\u8fc7")}</button>`
    : (reviewOpen
      ? `<button type="submit"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml(submitting ? "\u6b63\u5728\u5224\u5377..." : "\u786e\u8ba4\u63d0\u4ea4")}</button>`
      : `<button type="button" data-assessment-exam-review="${escapeHtml(todo.id)}"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml("\u590d\u6838\u7b54\u6848")}</button>`);
  return `<form class="todo-comment-panel todo-assessment-panel" data-assessment-exam-form="${escapeHtml(todo.id)}">
    <div class="todo-detail-deliverables-head">
      <strong>${escapeHtml(exam.title || "正式检测")}</strong>
      <span>${step + 1}/${questions.length}</span>
    </div>
    <p class="todo-detail-muted">${escapeHtml(status)}</p>
    <article class="reading-quiz-question">
      <small>${escapeHtml(question.skill || "")}</small>
      <strong>${escapeHtml(question.prompt || "")}</strong>
      <div class="reading-quiz-choices">${choices}</div>
    </article>
    ${wrongHint}
    ${passedExplanation}
    ${guidanceBlock}
    ${reviewBlock}
    <div class="todo-comment-actions">
      <button type="button" data-assessment-exam-prev="${escapeHtml(todo.id)}"${canPrev && !submitting ? "" : " disabled"}>上一题</button>
      <button type="button" data-assessment-exam-next="${escapeHtml(todo.id)}"${canNext && (passed || Number.isInteger(selected)) && !submitting ? "" : " disabled"}>下一题</button>
      ${submitControls}
    </div>
  </form>`;
}

function kanbanReadingMediaRecorderApi() {
  if (typeof window !== "undefined" && typeof window.MediaRecorder === "function") return window.MediaRecorder;
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder === "function") return MediaRecorder;
  return null;
}

function supportsKanbanReadingRecorder() {
  return Boolean(
    kanbanReadingMediaRecorderApi()
    && typeof navigator !== "undefined"
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function preferredKanbanReadingRecorderMimeType() {
  const Recorder = kanbanReadingMediaRecorderApi();
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
  return candidates.find((mime) => {
    try {
      return Recorder.isTypeSupported(mime);
    } catch (_) {
      return false;
    }
  }) || "";
}

function kanbanReadingRecordingExtension(mime = "") {
  const value = String(mime || "").toLowerCase();
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("wav")) return "wav";
  if (value.includes("ogg") || value.includes("opus")) return "ogg";
  return "webm";
}

function kanbanReadingRecordingFile(todoId, blob, mime = "") {
  const extension = kanbanReadingRecordingExtension(mime);
  const safeId = String(todoId || "card").replace(/[^a-zA-Z0-9_-]+/g, "").slice(-24) || "card";
  const filename = `reading-recording-${safeId}-${Date.now()}.${extension}`;
  try {
    if (typeof File === "function") return new File([blob], filename, { type: mime || blob.type || "audio/webm" });
  } catch (_) {
    // Older WebViews can expose Blob without a usable File constructor.
  }
  blob.name = filename;
  blob.lastModified = Date.now();
  return blob;
}

function kanbanReadingRecordingDuration(recording = {}) {
  const stored = Number(recording.elapsedMs || 0) || 0;
  if (recording.status === "recording" && recording.startedAt) {
    return Math.max(0, stored + Date.now() - Number(recording.startedAt || 0));
  }
  return Math.max(0, stored);
}

function formatKanbanReadingRecordingDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function kanbanReadingRecordingPermissionMessage(err) {
  const name = String(err?.name || "");
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return "麦克风权限未开启，请允许权限后重试。";
  if (["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError"].includes(name)) return "未找到可用麦克风，请检查设备后重试。";
  return "无法开始录音，请检查浏览器权限后重试。";
}

function kanbanReadingRecordingStatusText(todoId) {
  const recording = state.todoReadingRecorders?.[todoId] || {};
  const duration = formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recording));
  if (recording.status === "requesting") return "正在请求麦克风权限...";
  if (recording.status === "recording") return `正在录音 ${duration}`;
  if (recording.status === "stopping") return "正在生成录音...";
  if (recording.status === "ready") return `已录好待提交 ${duration}`;
  if (recording.status === "unsupported") return "当前浏览器不支持直接录音。";
  if (recording.status === "error") return recording.error || "录音不可用，请重试。";
  return supportsKanbanReadingRecorder() ? "点击红色录音按钮开始。" : "当前浏览器不支持直接录音。";
}

function renderKanbanReadingRecorderControls(todo, submitting = false) {
  return LearningReadingUi.renderKanbanReadingRecorderControls(todo, learningReadingUiOptions({ submitting }));
}

function revokeKanbanReadingRecordingUrl(recording = {}) {
  if (!recording?.url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(recording.url);
  } catch (_) {
    // Object URL cleanup should not block recorder state changes.
  }
}

function clearKanbanReadingRecordingTimer(recording = {}) {
  if (recording.timer) {
    clearInterval(recording.timer);
    recording.timer = 0;
  }
}

function stopKanbanReadingRecordingTracks(recording = {}) {
  const tracks = recording.stream?.getTracks?.() || [];
  for (const track of tracks) {
    try {
      track.stop();
    } catch (_) {
      // Ignore cleanup errors from already-stopped tracks.
    }
  }
}

function renderTodosAfterReadingRecorderChange() {
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

function updateKanbanReadingRecordingStatus(todoId) {
  const text = kanbanReadingRecordingStatusText(todoId);
  document.querySelectorAll("[data-reading-record-status]").forEach((node) => {
    if (node.dataset.readingRecordStatus === String(todoId)) node.textContent = text;
  });
}

function startKanbanReadingRecordingTimer(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  recording.timer = setInterval(() => updateKanbanReadingRecordingStatus(todoId), 1000);
  updateKanbanReadingRecordingStatus(todoId);
}

function finishKanbanReadingRecording(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  if (recording.cancelled) return;
  const chunks = (recording.chunks || []).filter((chunk) => chunk && chunk.size > 0);
  const elapsedMs = Number(recording.elapsedMs || 0) || kanbanReadingRecordingDuration(recording);
  if (!chunks.length) {
    state.todoReadingRecorders[todoId] = { status: "error", error: "未录到声音，请重试。", elapsedMs };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const mime = recording.recorder?.mimeType || recording.mimeType || chunks[0]?.type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  const file = kanbanReadingRecordingFile(todoId, blob, mime);
  const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";
  state.todoReadingRecorders[todoId] = {
    status: "ready",
    elapsedMs,
    mimeType: mime,
    file,
    url,
  };
  renderTodosAfterReadingRecorderChange();
}

function failKanbanReadingRecording(todoId, err) {
  const recording = state.todoReadingRecorders?.[todoId] || {};
  const elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  state.todoReadingRecorders[todoId] = {
    status: "error",
    elapsedMs,
    error: kanbanReadingRecordingPermissionMessage(err),
  };
  renderTodosAfterReadingRecorderChange();
}

async function startKanbanReadingRecording(todoId) {
  if (!todoId || state.todoReadingSubmitting?.[todoId]) return;
  const Recorder = kanbanReadingMediaRecorderApi();
  if (!supportsKanbanReadingRecorder() || !Recorder) {
    state.todoReadingRecorders[todoId] = { status: "unsupported" };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const current = state.todoReadingRecorders?.[todoId] || {};
  if (["requesting", "recording", "stopping"].includes(current.status)) return;
  revokeKanbanReadingRecordingUrl(current);
  state.todoReadingRecorders[todoId] = { status: "requesting", chunks: [], elapsedMs: 0, error: "" };
  renderTodosAfterReadingRecorderChange();
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pending = state.todoReadingRecorders?.[todoId];
    if (!pending || pending.status !== "requesting") {
      stream.getTracks?.().forEach((track) => track.stop());
      return;
    }
    const mimeType = preferredKanbanReadingRecorderMimeType();
    const recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
    const recording = {
      status: "recording",
      recorder,
      stream,
      chunks: [],
      startedAt: Date.now(),
      elapsedMs: 0,
      mimeType: recorder.mimeType || mimeType || "",
      error: "",
    };
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) recording.chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => finishKanbanReadingRecording(todoId, recording));
    recorder.addEventListener("error", (event) => failKanbanReadingRecording(todoId, event.error || event));
    state.todoReadingRecorders[todoId] = recording;
    recorder.start();
    startKanbanReadingRecordingTimer(todoId, recording);
    renderTodosAfterReadingRecorderChange();
  } catch (err) {
    if (stream) stream.getTracks?.().forEach((track) => track.stop());
    failKanbanReadingRecording(todoId, err);
  }
}

function stopKanbanReadingRecording(todoId) {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording || recording.status !== "recording") return;
  recording.elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.startedAt = 0;
  recording.status = "stopping";
  clearKanbanReadingRecordingTimer(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    } else {
      finishKanbanReadingRecording(todoId, recording);
    }
  } catch (err) {
    failKanbanReadingRecording(todoId, err);
  }
  renderTodosAfterReadingRecorderChange();
}

function cancelKanbanReadingRecording(todoId) {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording) return;
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  revokeKanbanReadingRecordingUrl(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") recording.recorder.stop();
  } catch (_) {
    // Ignore cancellation stop errors.
  }
  delete state.todoReadingRecorders[todoId];
  renderTodosAfterReadingRecorderChange();
}

async function submitRecordedReadingSubmission(todoId, notes = "") {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording?.file) throw new Error("请先停止录音");
  const file = recording.file;
  await submitReadingSubmission(todoId, file, notes);
  const latest = state.todoReadingRecorders?.[todoId];
  if (latest?.file === file) {
    revokeKanbanReadingRecordingUrl(latest);
    delete state.todoReadingRecorders[todoId];
  }
}

function renderKanbanReadingSubmissionPanel(todo) {
  return LearningReadingUi.renderKanbanReadingSubmissionPanel(todo, learningReadingUiOptions());
}

function renderTodoDetail(todo) {
  const open = todoMatchesOpen(todo);
  const kanban = isKanbanTodoSource();
  const kanbanStatus = normalizedKanbanStatus(todo);
  const blocked = kanbanStatus === "blocked";
  const completed = kanban && (kanbanStatus === "done" || todo.status === "completed");
  const readingCard = kanban && isKanbanReadingCard(todo);
  const assessmentCard = kanban && isKanbanAssessmentCard(todo);
  const canManage = !kanban || kanbanCan(todo, "canManage");
  const canRevise = !kanban || kanbanCan(todo, "canRevise");
  const canComment = !kanban || kanbanCan(todo, "canComment");
  const canCommentAndManage = canComment && canManage;
  const statusText = kanban ? kanbanStatusText(todo) : todoStatusText(todo);
  const gridItems = [
    renderTodoDetailGridItem("负责人", todo.assigneeLabel || todo.assignee || ""),
    renderTodoDetailGridItem("截止", todoDueLabel(todo)),
    renderTodoDetailGridItem("提醒", `${String(todo.reminderLeadMinutes || 0)} 分钟前`),
    renderTodoDetailGridItem("重复", todo.recurrenceLabel || todo.recurrence || "不重复"),
    kanban ? renderTodoDetailGridItem("看板", todo.kanbanBoard || todoBoardLabel()) : "",
    kanban ? renderTodoDetailGridItem("状态", kanbanStatusText(todo)) : "",
    kanban ? renderTodoDetailGridItem("官方执行者", todo.kanbanAssignee || "") : "",
    kanban ? renderTodoDetailGridItem("租户", todo.kanbanTenant || "") : "",
    kanban ? renderTodoDetailGridItem("优先级", todoPriorityLabel(todo)) : "",
    kanban ? renderTodoDetailGridItem("工作区", todo.kanbanWorkspaceKind || "") : "",
    kanban ? renderTodoDetailGridItem("创建者", todo.kanbanCreatedBy || "") : "",
    renderTodoDetailGridItem("创建", todoTimestampLabel(todo.createdAt)),
    renderTodoDetailGridItem("更新", todoTimestampLabel(todo.updatedAt)),
    kanban ? renderTodoDetailGridItem("开始", todoTimestampLabel(todo.kanbanStartedAt)) : "",
    kanban ? renderTodoDetailGridItem("完成", todoTimestampLabel(todo.kanbanCompletedAt || todo.completedAt)) : "",
  ].filter(Boolean).join("");
  const skillRows = kanban && Array.isArray(todo.kanbanSkills) && todo.kanbanSkills.length
    ? `<div class="todo-detail-skills">${todo.kanbanSkills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>`
    : "";
  const coverBlock = kanban ? renderKanbanCaseCover(kanbanCaseCover(todo)) : "";
  const deliveryBlock = kanban ? renderKanbanDeliveryFiles(todo) : "";
  const readingWorkflowBlock = kanban ? renderKanbanReadingWorkflowPanel(todo) : "";
  const readingQuizBlock = kanban ? renderKanbanReadingQuizPanel(todo) : "";
  const assessmentExamBlock = kanban ? renderKanbanAssessmentExamPanel(todo) : "";
  const resultBlock = kanban ? renderKanbanDetailReport(todo) : "";
  const readingPanel = kanban ? renderKanbanReadingSubmissionPanel(todo) : "";
  const metaBlock = kanban
    ? `<details class="todo-detail-meta">
      <summary>卡片信息</summary>
      ${gridItems ? `<div class="todo-detail-grid">${gridItems}</div>` : ""}
      ${skillRows}
    </details>`
    : `<div class="todo-detail-grid">${gridItems}</div>${skillRows}`;
  const showGenericCommentPanel = !readingCard && !assessmentCard;
  const commentPanel = kanban && open && canComment && showGenericCommentPanel
    ? `<form class="todo-comment-panel" data-todo-comment-form="${escapeHtml(todo.id)}">
      <textarea id="todoCommentText" class="todo-input todo-comment-textarea" rows="4" placeholder="写评论、完成说明或执行记录，可留空">${escapeHtml(state.todoCommentDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-comment-todo="${escapeHtml(todo.id)}">添加评论</button>
        ${canManage ? `<button type="button" data-comment-complete-todo="${escapeHtml(todo.id)}">完成并记录</button>` : ""}
        ${blocked && canCommentAndManage ? `<button type="button" data-comment-unblock-todo="${escapeHtml(todo.id)}">评论并解除阻塞</button>` : ""}
      </div>
    </form>`
    : "";
  const revisionPanel = completed && canRevise
    ? `<form class="todo-comment-panel todo-revision-panel" data-todo-revision-form="${escapeHtml(todo.id)}" ${state.todoRevisionSubmitting?.[todo.id] ? 'aria-busy="true"' : ""}>
      <label class="todo-panel-label" for="todoRevisionText">要求修改</label>
      <textarea id="todoRevisionText" class="todo-input todo-comment-textarea" rows="4" placeholder="写清楚需要修改的地方、验收要求或补充材料" ${state.todoRevisionSubmitting?.[todo.id] ? "disabled" : ""}>${escapeHtml(state.todoRevisionDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-revise-todo="${escapeHtml(todo.id)}" ${state.todoRevisionSubmitting?.[todo.id] ? "disabled" : ""}>${state.todoRevisionSubmitting?.[todo.id] ? "正在创建..." : "创建修改任务"}</button>
      </div>
      ${state.todoRevisionSubmitting?.[todo.id] ? `<p class="todo-detail-muted">正在创建修改任务，请勿重复提交。</p>` : ""}
    </form>`
    : "";
  const managementPanel = open && canManage
    ? `<details class="todo-admin-panel"${readingCard || assessmentCard ? "" : " open"}>
      <summary>
        <span>卡片管理</span>
        <small>阻塞、取消、延期</small>
      </summary>
      <div class="todo-admin-panel-body">
        <div class="todo-detail-actions">
          ${readingCard || assessmentCard ? "" : `<button type="button" data-complete-todo="${escapeHtml(todo.id)}">完成</button>`}
          ${kanban && !blocked ? `<button type="button" data-block-todo="${escapeHtml(todo.id)}">标记阻塞</button>` : ""}
          ${kanban && blocked ? `<button type="button" data-unblock-todo="${escapeHtml(todo.id)}">解除阻塞</button>` : ""}
          <button type="button" data-cancel-todo="${escapeHtml(todo.id)}">取消</button>
        </div>
        <div class="todo-postpone-panel">
          <div class="todo-postpone-row">
            <label class="todo-postpone-field" for="todoPostponeDue">
              <span>延期到</span>
              <input id="todoPostponeDue" class="todo-input" type="datetime-local" value="${escapeHtml(todoDueInputValue(todo))}">
            </label>
            <button type="button" data-postpone-todo="${escapeHtml(todo.id)}">保存延期</button>
          </div>
          <div class="todo-postpone-quick">
            <button type="button" data-postpone-minutes="60" data-postpone-todo="${escapeHtml(todo.id)}">1 小时后</button>
            <button type="button" data-postpone-minutes="1440" data-postpone-todo="${escapeHtml(todo.id)}">明天</button>
          </div>
        </div>
      </div>
    </details>`
    : "";
  return `<article class="todo-detail-card ${escapeHtml(todoStatusLabel(todo))}">
    <div class="todo-detail-head">
      <div>
        <div class="todo-detail-id">${escapeHtml(todo.id)}</div>
        <h2>${escapeHtml(todo.content || "Kanban card")}</h2>
      </div>
      <span class="todo-state status-${escapeHtml(kanbanStatus)}">${escapeHtml(statusText)}</span>
    </div>
    ${coverBlock}
    ${readingWorkflowBlock}
    ${deliveryBlock}
    ${resultBlock}
    ${readingPanel}
    ${readingQuizBlock}
    ${assessmentExamBlock}
    ${metaBlock}
    ${commentPanel}
    ${revisionPanel}
    ${managementPanel}
  </article>`;
}
