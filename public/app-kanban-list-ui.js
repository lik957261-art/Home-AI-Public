"use strict";

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
