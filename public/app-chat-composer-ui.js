"use strict";

const CHAT_COMPOSER_SHELL_MODEL_ESM_PATH = "/vite-islands/chat-composer-shell-model/chat-composer-shell-model.js";
let chatComposerShellModel = null;
let chatComposerShellModelPromise = null;

function importChatComposerShellModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerShellModel) return Promise.resolve(chatComposerShellModel);
  if (!chatComposerShellModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerShellModel === "function"
      ? rootRef.__homeAiImportChatComposerShellModel
      : (path) => import(path);
    chatComposerShellModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_SHELL_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerShellModel = model || null;
        return chatComposerShellModel;
      })
      .catch((error) => {
        chatComposerShellModelPromise = null;
        throw error;
      });
  }
  return chatComposerShellModelPromise;
}

function currentChatComposerShellModel() {
  return chatComposerShellModel;
}

if (typeof window !== "undefined") {
  importChatComposerShellModel().catch(() => null);
}

function composerShellViewState() {
  const model = currentChatComposerShellModel();
  if (typeof model?.composerShellViewStatePlan === "function") {
    return model.composerShellViewStatePlan({
      state,
      selectedWorkspaceInThreadGroup: Boolean(
        state.currentThread
        && typeof selectedWorkspaceInThreadGroup === "function"
        && selectedWorkspaceInThreadGroup(state.currentThread)
      ),
    });
  }
  const skillDetailView = Boolean(state.skillDetail);
  const taskWindowView = state.viewMode === "tasks" && Boolean(state.currentThread?.singleWindow);
  const singleWindowView = state.viewMode === "single" && Boolean(state.currentThread?.singleWindow);
  return {
    currentSingleWindowLoaded: Boolean(
      state.currentThread &&
      state.currentThread.singleWindow &&
      (
        state.currentThread.workspaceId === state.selectedWorkspaceId
        || (typeof selectedWorkspaceInThreadGroup === "function" && selectedWorkspaceInThreadGroup(state.currentThread))
      )
    ),
    skillDetailView,
    taskDetailView: !skillDetailView && state.viewMode === "tasks" && Boolean(state.currentTaskGroupId) && Boolean(state.currentThread?.singleWindow),
    todoDetailView: state.viewMode === "todos" && Boolean(state.selectedTodoId),
    taskWindowView,
    taskListView: taskWindowView && !state.currentTaskGroupId,
    todoView: state.viewMode === "todos",
    automationView: state.viewMode === "automation",
    automationDetailView: state.viewMode === "automation" && Boolean(state.selectedAutomationId),
    actionInboxView: state.viewMode === "inbox",
    actionInboxDetailView: state.viewMode === "inbox" && Boolean(state.selectedActionInboxItemId),
    actionInboxCreateView: state.viewMode === "inbox" && Boolean(state.actionInboxCreateOpen),
    singleWindowView,
    singleWindowChatView: singleWindowView && state.singleWindowMode === "chat",
  };
}

function sidebarBackToMenu() {
  const viewState = composerShellViewState();
  const model = currentChatComposerShellModel();
  const plan = typeof model?.sidebarBackActionPlan === "function"
    ? model.sidebarBackActionPlan({
      state,
      viewState,
      kanbanComposerOpen: kanbanComposerOpen(),
      automationDetailInboxReturnActive: typeof automationDetailInboxReturnActive === "function" && automationDetailInboxReturnActive(),
      mobileLayout: isMobileLayout(),
    })
    : null;
  const action = plan?.action || "";
  if (action === "open_task_list_and_close_sidebar" || (!action && state.viewMode === "tasks" && state.currentTaskGroupId)) {
    openTaskList();
    closeSidebar();
    return;
  }
  if (action === "open_todo_list_and_close_sidebar" || (!action && isTodoDetailView())) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (!action && kanbanComposerOpen()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (action === "close_automation_secondary_and_sidebar" || (!action && typeof automationDetailInboxReturnActive === "function" && automationDetailInboxReturnActive())) {
    closeAutomationSecondarySurface();
    closeSidebar();
    return;
  }
  if (action === "open_automation_list_and_close_sidebar" || (!action && isAutomationDetailView())) {
    openAutomationList();
    closeSidebar();
    return;
  }
  if (action === "open_action_inbox_overview_and_close_sidebar" || (!action && isActionInboxDetailView())) {
    openActionInboxOverview();
    closeSidebar();
    return;
  }
  if (action === "close_sidebar" || (!action && isMobileLayout())) {
    closeSidebar();
    return;
  }
  resetSidebarScroll();
}

function isMobileLayout() {
  return true;
}

function isCurrentSingleWindowLoaded() {
  return Boolean(composerShellViewState().currentSingleWindowLoaded);
}

function isSkillDetailView() {
  return Boolean(composerShellViewState().skillDetailView);
}

function isTaskDetailView() {
  return Boolean(composerShellViewState().taskDetailView);
}

function isTodoDetailView() {
  return Boolean(composerShellViewState().todoDetailView);
}

function isTaskWindowView() {
  return Boolean(composerShellViewState().taskWindowView);
}

function isTaskListView() {
  return Boolean(composerShellViewState().taskListView);
}

function isTodoView() {
  return Boolean(composerShellViewState().todoView);
}

function isAutomationView() {
  return Boolean(composerShellViewState().automationView);
}

function isAutomationDetailView() {
  return Boolean(composerShellViewState().automationDetailView);
}

function isActionInboxView() {
  return Boolean(composerShellViewState().actionInboxView);
}

function isActionInboxDetailView() {
  return Boolean(composerShellViewState().actionInboxDetailView);
}

function isActionInboxCreateView() {
  return Boolean(composerShellViewState().actionInboxCreateView);
}

function isSingleWindowView() {
  return Boolean(composerShellViewState().singleWindowView);
}

function isSingleWindowChatView() {
  return Boolean(composerShellViewState().singleWindowChatView);
}

function isComposerStopMode() {
  const model = currentChatComposerShellModel();
  if (typeof model?.composerStopModePlan === "function") {
    return model.composerStopModePlan({
      chatSearchMode: isChatSearchMode(),
      activeRunIds: activeComposerRunIds(),
      singleWindowView: isSingleWindowView(),
      hasDraft: composerHasDraft(),
    }).stopMode;
  }
  if (isChatSearchMode()) return false;
  if (!activeComposerRunIds().length) return false;
  if (isSingleWindowView() && composerHasDraft()) return false;
  return true;
}

function setComposerActionButtonVisualLabel(button, label) {
  if (!button) return;
  if (typeof voiceInputSetButtonVisualLabel === "function") {
    voiceInputSetButtonVisualLabel(button, label);
    return;
  }
  if (String(label || "") === "Stop") {
    button.classList.add("voice-input-label-proxy", "voice-input-stop-proxy");
    button.dataset.voiceInputVisualLabel = "";
    button.textContent = "";
    return;
  }
  button.classList.remove("voice-input-label-proxy", "voice-input-stop-proxy");
  delete button.dataset.voiceInputVisualLabel;
  button.textContent = String(label || "");
}

function composerSendPreActivationEvent(event) {
  if (!event || event.defaultPrevented) return false;
  if (event.type === "pointerdown") {
    const pointerType = String(event.pointerType || "mouse");
    if (pointerType === "mouse") return false;
  } else if (event.type !== "touchstart") {
    return false;
  }
  const button = event.target?.closest?.("#sendMessage");
  if (!button || button.disabled) return false;
  const input = $("messageInput");
  if (document.activeElement !== input && !document.documentElement?.classList?.contains("native-shell-ios")) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  if (typeof handleVoiceInputSendClick === "function" && handleVoiceInputSendClick(event)) return true;
  void sendMessage(event);
  return true;
}

function installComposerSendPreActivationGuard() {
  if (typeof document === "undefined" || window.__homeAiComposerSendPreActivationGuardInstalled) return;
  window.__homeAiComposerSendPreActivationGuardInstalled = true;
  document.addEventListener("pointerdown", composerSendPreActivationEvent, { capture: true });
  document.addEventListener("touchstart", composerSendPreActivationEvent, { capture: true });
}

function updateComposerAction() {
  const button = $("sendMessage");
  if (!button) return;
  const composer = $("composer");
  const attach = $("attachFile");
  const input = $("messageInput");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const searchMode = isChatSearchMode();
  const stopMode = isComposerStopMode();
  const model = currentChatComposerShellModel();
  const plan = typeof model?.composerActionViewPlan === "function"
    ? model.composerActionViewPlan({
      chatSearchMode: searchMode,
      mentionAvailable: composerMentionAvailable(),
      chatSearchDraft: searchMode && typeof currentChatSearchDraft === "function" ? currentChatSearchDraft() : "",
      stopMode,
    })
    : null;
  const effectiveSearchMode = plan ? plan.chatSearchMode : searchMode;
  composer?.classList.toggle(plan?.composerClass?.name || "chat-search-composer", plan ? Boolean(plan.composerClass.enabled) : searchMode);
  input?.classList.toggle(plan?.inputClass?.name || "chat-search-editor", plan ? Boolean(plan.inputClass.enabled) : searchMode);
  if (plan ? plan.closeMentionMenu : (searchMode || !composerMentionAvailable())) closeGroupMentionMenu();
  if (!plan || plan.updateSourceControl) updateComposerSourceControl();
  if (input) {
    input.setAttribute("enterkeyhint", plan?.input?.enterkeyhint || (searchMode ? "search" : "send"));
    input.setAttribute("aria-label", plan?.input?.ariaLabel || (searchMode ? "Search chat" : "Message Home AI"));
  }
  if (effectiveSearchMode) {
    if (attach) {
      attach.textContent = plan?.attach?.text || "×";
      attach.disabled = plan?.attach?.disabled === false ? false : attach.disabled;
      attach.setAttribute("aria-label", plan?.attach?.ariaLabel || "关闭搜索");
      attach.setAttribute("title", plan?.attach?.title || "关闭搜索");
    }
    const draft = currentChatSearchDraft();
    setComposerActionButtonVisualLabel(button, plan?.button?.label || "搜索");
    button.classList.remove("stop-mode");
    button.disabled = typeof plan?.button?.disabled === "boolean" ? plan.button.disabled : !draft;
    if (!plan || plan.updateChatSearchStatus) updateChatSearchStatus();
    if (!plan || plan.renderComposerContext) renderComposerContext();
    if ((!plan || plan.refreshVoiceInputSendButton) && typeof refreshVoiceInputSendButton === "function") refreshVoiceInputSendButton();
    return;
  }
  if (prevSearch && (!plan || plan.searchButtons?.hidePrevNext)) {
    prevSearch.hidden = true;
    prevSearch.disabled = true;
  }
  if (nextSearch && (!plan || plan.searchButtons?.hidePrevNext)) {
    nextSearch.hidden = true;
    nextSearch.disabled = true;
  }
  if (attach) {
    attach.textContent = plan?.attach?.text || "+";
    if (typeof plan?.attach?.disabled === "boolean") attach.disabled = plan.attach.disabled;
    attach.setAttribute("aria-label", plan?.attach?.ariaLabel || "添加文件");
    attach.setAttribute("title", plan?.attach?.title || "添加文件");
  }
  if (!plan || plan.updateChatSearchStatus) updateChatSearchStatus();
  setComposerActionButtonVisualLabel(button, plan?.button?.label || (stopMode ? "Stop" : "Send"));
  button.classList.toggle("stop-mode", plan ? Boolean(plan.button?.stopMode) : stopMode);
  if (typeof plan?.button?.disabled === "boolean") button.disabled = plan.button.disabled;
  else if (stopMode) button.disabled = false;
  if (!plan || plan.renderComposerContext) renderComposerContext();
  if ((!plan || plan.refreshVoiceInputSendButton) && typeof refreshVoiceInputSendButton === "function") refreshVoiceInputSendButton();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installComposerSendPreActivationGuard();
}
