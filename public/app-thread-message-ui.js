"use strict";

const THREAD_MESSAGE_MODEL_ESM_PATH = "/vite-islands/thread-message-model/thread-message-model.js";
let threadMessageModel = null;
let threadMessageModelPromise = null;

function importThreadMessageModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (threadMessageModel) return Promise.resolve(threadMessageModel);
  if (!threadMessageModelPromise) {
    const importer = typeof rootRef.__homeAiImportThreadMessageModel === "function"
      ? rootRef.__homeAiImportThreadMessageModel
      : (path) => import(path);
    threadMessageModelPromise = Promise.resolve()
      .then(() => importer(THREAD_MESSAGE_MODEL_ESM_PATH))
      .then((model) => {
        threadMessageModel = model || null;
        return threadMessageModel;
      })
      .catch((error) => {
        threadMessageModelPromise = null;
        throw error;
      });
  }
  return threadMessageModelPromise;
}

function currentThreadMessageModel() {
  return threadMessageModel;
}

if (typeof window !== "undefined") {
  importThreadMessageModel().catch(() => null);
}

async function createThread() {
  clearQuotedReply({ render: false });
  const model = currentThreadMessageModel();
  const plan = typeof model?.createThreadActionPlan === "function"
    ? model.createThreadActionPlan({
      state,
      currentSingleWindowLoaded: typeof isCurrentSingleWindowLoaded === "function" && isCurrentSingleWindowLoaded(),
      mobileLayout: typeof isMobileLayout === "function" && isMobileLayout(),
    })
    : null;
  const action = plan?.action || "";
  if (action === "load_single_window" || (!action && state.viewMode === "single")) {
    await loadSingleWindow();
    return;
  }
  if (action === "open_todo_create" || (!action && state.viewMode === "todos")) {
    state.selectedTodoId = "";
    if (!state.todoCreateOpen) {
      state.kanbanComposerMessages = [];
      state.kanbanPlanDraft = null;
      finishKanbanComposerProgress();
    }
    state.todoCreateOpen = true;
    await loadTodos();
    if (isMobileLayout()) closeSidebar();
    focusTodoFormSoon();
    return;
  }
  if (["render_task_root", "load_task_root"].includes(action) || (!action && state.viewMode === "tasks")) {
    state.currentTaskGroupId = "";
    if (plan?.closeSidebar || (!action && isMobileLayout())) closeSidebar();
    if (action === "render_task_root" || (!action && isCurrentSingleWindowLoaded())) {
      renderThreads();
      renderCurrentThread({ stickToBottom: true });
      focusComposerSoon();
      return;
    }
    await loadSingleWindow();
    focusComposerSoon();
    return;
  }
  if (action === "render_automation" || (!action && state.viewMode === "automation")) {
    renderAutomationView();
    return;
  }
  if (action === "load_directory" || (!action && state.viewMode === "projects")) {
    await loadDirectoryView();
    return;
  }
  state.transientProjectRoute = null;
  if (plan?.closeSidebar || (!action && isMobileLayout())) closeSidebar();
  const draft = createDraftThread();
  state.currentThread = draft;
  state.currentThreadId = draft.id;
  state.threads = [draft, ...state.threads.filter((thread) => !isDraftThread(thread))];
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  focusComposerSoon();
}

async function selectThread(threadId) {
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  const model = currentThreadMessageModel();
  const plan = typeof model?.selectThreadRequestPlan === "function"
    ? model.selectThreadRequestPlan(threadId)
    : { ok: Boolean(threadId), threadId, path: `/api/threads/${encodeURIComponent(threadId)}`, renderOptions: { stickToBottom: true } };
  if (!plan.ok) return;
  state.currentThreadId = plan.threadId;
  const result = await api(plan.path);
  state.currentThread = mergeCurrentThread(result.thread);
  renderThreads();
  renderCurrentThread(plan.renderOptions || { stickToBottom: true });
  setComposerEnabled(true);
  if (isMobileLayout()) closeSidebar();
}

async function openProjectTask(sourceThreadId, taskGroupId) {
  if (!sourceThreadId || !taskGroupId) return;
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  const model = currentThreadMessageModel();
  const plan = typeof model?.openProjectTaskRequestPlan === "function"
    ? model.openProjectTaskRequestPlan({
      sourceThreadId,
      taskGroupId,
      messageLimit: typeof taskDetailMessageInitialLimit === "function" ? taskDetailMessageInitialLimit() : 30,
    })
    : {
      ok: true,
      sourceThreadId,
      taskGroupId,
      viewMode: "tasks",
      storage: { key: "hermesWebViewMode", value: "tasks" },
      path: `/api/threads/${encodeURIComponent(sourceThreadId)}?${new URLSearchParams({
        messageMode: "tasks",
        taskGroupId,
        messageLimit: String(typeof taskDetailMessageInitialLimit === "function" ? taskDetailMessageInitialLimit() : 30),
      }).toString()}`,
      renderOptions: { stickToBottom: true },
    };
  if (!plan.ok) return;
  state.viewMode = plan.viewMode || "tasks";
  if (plan.storage?.key) localStorage.setItem(plan.storage.key, plan.storage.value || state.viewMode);
  state.currentThreadId = plan.sourceThreadId;
  const result = await api(plan.path);
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentTaskGroupId = plan.taskGroupId;
  state.threads = [summarizeThread(state.currentThread)];
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread(plan.renderOptions || { stickToBottom: true });
  setComposerEnabled(true);
}

function configureComposer(options = {}) {
  const directoryTopicDraft = typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive();
  const model = currentThreadMessageModel();
  const plan = typeof model?.composerStatePlan === "function"
    ? model.composerStatePlan({
      state,
      options,
      directoryTopicDraft,
      searchMode: isChatSearchMode(),
      chatSearchDraft: currentChatSearchDraft(),
      singleWindowView: isSingleWindowView(),
      singleWindowChatView: isSingleWindowChatView(),
      defaultPlaceholder: "Message Home AI...",
    })
    : null;
  const taskListRoot = plan?.taskListRoot ?? (state.viewMode === "tasks" && !state.currentTaskGroupId && !directoryTopicDraft);
  const enabled = plan?.enabled ?? (taskListRoot ? false : Boolean(options.enabled));
  const searchMode = plan?.searchMode ?? isChatSearchMode();
  const hidden = plan?.hidden ?? (taskListRoot || Boolean(options.hidden));
  const composer = $("composer");
  const shellLocked = plan?.shellLocked ?? (Boolean(options.shellLocked) && !hidden && !searchMode);
  const visuallyEnabled = plan?.visuallyEnabled ?? (enabled || shellLocked || searchMode);
  if (composer && (plan?.shouldHideBeforeUpdate ?? (Boolean(hidden) && !searchMode))) {
    composer.hidden = true;
    composer.setAttribute("aria-hidden", "true");
  }
  if (composer) {
    composer.classList.toggle("composer-shell-locked", shellLocked);
    composer.setAttribute("aria-busy", plan?.ariaBusy || (shellLocked ? "true" : "false"));
  }
  if ((plan?.shouldClearKeyboardViewportMetrics ?? !enabled) && typeof clearKeyboardViewportMetrics === "function") clearKeyboardViewportMetrics();
  setComposerEditorEnabled(plan?.editorEnabled ?? visuallyEnabled);
  if ((plan?.shouldBlurFocusedEditable ?? (!visuallyEnabled || (Boolean(hidden) && !searchMode))) && typeof blurFocusedEditableIfStale === "function") {
    blurFocusedEditableIfStale(plan?.blurReason || "composer_hidden_or_disabled");
  }
  setComposerPlaceholder(plan?.placeholder || (searchMode ? "搜索聊天" : composerPlaceholder(options.placeholder || "Message Home AI...")));
  $("attachFile").disabled = plan?.attachDisabled ?? (searchMode ? false : !visuallyEnabled);
  $("sendMessage").disabled = plan?.sendDisabled ?? (searchMode ? !currentChatSearchDraft() : !visuallyEnabled);
  updateComposerAction();
  renderQuotedReply();
  if (composer && (plan?.shouldShowAfterUpdate ?? !(Boolean(hidden) && !searchMode))) {
    composer.hidden = false;
    composer.setAttribute("aria-hidden", "false");
  }
}

function setComposerEnabled(enabled) {
  configureComposer({ enabled, placeholder: $("messageInput")?.dataset.placeholder || "Message Home AI..." });
}

function setComposerEditorEnabled(enabled) {
  const input = $("messageInput");
  if (!input) return;
  if ("disabled" in input) input.disabled = !enabled;
  else input.setAttribute("contenteditable", enabled ? "plaintext-only" : "false");
  input.dataset.disabled = enabled ? "" : "true";
  input.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function setComposerPlaceholder(text) {
  const input = $("messageInput");
  if (input) {
    input.dataset.placeholder = text || "";
    if ("placeholder" in input) input.placeholder = text || "";
  }
}

function composerPlaceholder(fallback) {
  const model = currentThreadMessageModel();
  if (typeof model?.composerPlaceholderPlan === "function") {
    return model.composerPlaceholderPlan({
      singleWindowView: isSingleWindowView(),
      singleWindowChatView: isSingleWindowChatView(),
      quotedReply: state.quotedReply,
      defaultPlaceholder: arguments[0],
    }).placeholder;
  }
  return isSingleWindowView() && !isSingleWindowChatView() && state.quotedReply ? "Reply to quoted task..." : fallback;
}
