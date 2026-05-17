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
