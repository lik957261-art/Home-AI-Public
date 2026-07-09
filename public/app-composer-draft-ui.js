"use strict";

const CHAT_COMPOSER_DRAFT_MODEL_ESM_PATH = "/vite-islands/chat-composer-draft-model/chat-composer-draft-model.js";
let chatComposerDraftModel = null;
let chatComposerDraftModelPromise = null;

function importChatComposerDraftModel(rootRef = window) {
  if (chatComposerDraftModel) return Promise.resolve(chatComposerDraftModel);
  if (!chatComposerDraftModelPromise) {
    const importer = typeof rootRef.__homeAiImportComposerDraftModel === "function"
      ? rootRef.__homeAiImportComposerDraftModel
      : (path) => import(path);
    chatComposerDraftModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_DRAFT_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerDraftModel = model || null;
        return chatComposerDraftModel;
      })
      .catch((error) => {
        chatComposerDraftModelPromise = null;
        throw error;
      });
  }
  return chatComposerDraftModelPromise;
}

function currentChatComposerDraftModel() {
  return chatComposerDraftModel;
}

function composerDraftModelFocusOptions() {
  return { root: window, documentRef: document };
}

importChatComposerDraftModel().catch(() => null);

function suppressComposerAutoFocus(ms = 1200) {
  const model = currentChatComposerDraftModel();
  if (typeof model?.createComposerAutoFocusSuppressionPlan === "function") {
    const plan = model.createComposerAutoFocusSuppressionPlan({
      currentSuppressUntil: state.suppressComposerFocusUntil || 0,
      nowMs: Date.now(),
      durationMs: ms,
    });
    state.suppressComposerFocusUntil = plan.suppressUntil;
    return;
  }
  state.suppressComposerFocusUntil = Math.max(state.suppressComposerFocusUntil || 0, Date.now() + ms);
}

function composerAutoFocusAllowed() {
  const model = currentChatComposerDraftModel();
  if (typeof model?.composerAutoFocusAllowed === "function") {
    return model.composerAutoFocusAllowed({
      visibilityState: document.visibilityState,
      nowMs: Date.now(),
      suppressUntil: state.suppressComposerFocusUntil || 0,
    });
  }
  return document.visibilityState !== "hidden" && Date.now() >= (state.suppressComposerFocusUntil || 0);
}

function editableElementSelector() {
  const model = currentChatComposerDraftModel();
  if (typeof model?.editableElementSelector === "function") return model.editableElementSelector();
  return "textarea, input, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']";
}

function isEditableElement(element) {
  const model = currentChatComposerDraftModel();
  if (typeof model?.isEditableElement === "function") return model.isEditableElement(element);
  return Boolean(element?.matches?.(editableElementSelector()));
}

function nativeShellFocusGuardActive() {
  try {
    const search = String(window.location?.search || "");
    if (typeof URLSearchParams !== "undefined" && new URLSearchParams(search).get("nativeShell") === "ios") return true;
  } catch (_err) {}
  const root = typeof $ === "function" ? $("app") : null;
  if (root?.dataset?.nativeShell === "ios") return true;
  if (document.documentElement?.dataset?.nativeShell === "ios") return true;
  try {
    return window.localStorage?.getItem("homeAI.nativeShell") === "ios";
  } catch (_err) {
    return false;
  }
}

function elementMarkedInert(element) {
  return element?.inert === true || element?.hasAttribute?.("inert") === true;
}

function elementVisibleForFocus(element) {
  const model = currentChatComposerDraftModel();
  if (typeof model?.elementVisibleForFocus === "function") {
    return model.elementVisibleForFocus(element, composerDraftModelFocusOptions());
  }
  if (!element || !element.isConnected) return false;
  if (elementMarkedInert(element)) return false;
  const rects = typeof element.getClientRects === "function" ? element.getClientRects() : null;
  if (rects && typeof rects.length === "number" && rects.length === 0) return false;
  const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
  if (rect && (Number(rect.width) <= 0 || Number(rect.height) <= 0)) return false;
  let node = element;
  while (node && node.nodeType === 1) {
    if (node.hidden || elementMarkedInert(node) || node.getAttribute?.("aria-hidden") === "true") return false;
    const style = window.getComputedStyle?.(node);
    if (style?.display === "none" || style?.visibility === "hidden" || style?.pointerEvents === "none") return false;
    node = node.parentElement;
  }
  return true;
}

function composerInputVisibleForFocus() {
  const input = $("messageInput");
  const composer = $("composer");
  const model = currentChatComposerDraftModel();
  if (typeof model?.composerInputVisibleForFocus === "function") {
    return model.composerInputVisibleForFocus(input, composer, composerDraftModelFocusOptions());
  }
  return Boolean(input && composer && !composer.hidden && !input.disabled && elementVisibleForFocus(input));
}

function blurFocusedEditableIfStale(reason = "stale_focus", options = {}) {
  const active = document.activeElement;
  if (!isEditableElement(active)) return false;
  const composerInput = $("messageInput");
  const model = currentChatComposerDraftModel();
  const modelState = typeof model?.focusedEditableState === "function"
    ? model.focusedEditableState(Object.assign({}, composerDraftModelFocusOptions(), {
      activeElement: active,
      composerInput,
      composerContainer: $("composer"),
    }))
    : null;
  const stale = modelState
    ? modelState.stale
    : (!active.isConnected
      || active.disabled === true
      || active.getAttribute?.("aria-disabled") === "true"
      || !elementVisibleForFocus(active)
      || (active === composerInput && !composerInputVisibleForFocus()));
  if (!stale && options.force !== true) return false;
  try {
    active.blur?.();
  } catch (err) {
    state.lastEditableBlurFailure = String(err?.name || "blur_error").slice(0, 80);
  }
  if (active === composerInput) {
    state.composerFocused = false;
    closeGroupMentionMenu();
  }
  if (typeof clearKeyboardViewportMetrics === "function") clearKeyboardViewportMetrics();
  return true;
}

function blurComposerInput(reason = "composer_blur") {
  const input = $("messageInput");
  if (input && document.activeElement === input) input.blur();
  if (input && document.activeElement === input) blurFocusedEditableIfStale(reason, { force: true });
  state.composerFocused = false;
  closeGroupMentionMenu();
}

function eventTargetInsideFocusedEditable(active, target) {
  const model = currentChatComposerDraftModel();
  if (typeof model?.eventTargetInsideFocusedEditable === "function") {
    return model.eventTargetInsideFocusedEditable(active, target);
  }
  if (!active || !target) return false;
  if (active === target) return true;
  if (typeof active.contains === "function" && active.contains(target)) return true;
  return false;
}

function eventTargetInsideElement(element, target) {
  if (!element || !target) return false;
  if (element === target) return true;
  if (typeof element.contains === "function" && element.contains(target)) return true;
  return false;
}

function eventTargetActivatesComposerSend(target) {
  return Boolean(target?.closest?.("#sendMessage"));
}

function installStaleEditableFocusGuard() {
  if (window.__homeAiStaleEditableFocusGuardInstalled) return;
  window.__homeAiStaleEditableFocusGuardInstalled = true;
  let nativeComposerPasteMenuPreserveUntil = 0;
  const nativeComposerPasteMenuPreserveMs = 1800;
  const recordFocusGuardEvent = (type, detail = {}) => {
    const events = window.__homeAiComposerFocusGuardEvents;
    if (!Array.isArray(events)) return;
    events.push(Object.assign({
      type,
      at: Date.now(),
    }, detail));
  };
  const blurOnLifecycle = () => blurFocusedEditableIfStale("lifecycle");
  const restoreNativeComposerPasteFocus = (reason = "native_composer_paste_blur") => {
    const input = $("messageInput");
    if (!input || !nativeShellFocusGuardActive() || !composerInputVisibleForFocus()) return false;
    window.requestAnimationFrame(() => {
      if (!nativeShellFocusGuardActive() || !composerInputVisibleForFocus()) {
        recordFocusGuardEvent("native_composer_paste_refocus_skipped", { reason: "composer_unavailable" });
        return;
      }
      $("messageInput")?.focus({ preventScroll: true });
      state.composerFocused = true;
      if (typeof refreshKeyboardViewportDuringFocus === "function") refreshKeyboardViewportDuringFocus();
      if (typeof refreshComposerContextSoon === "function") refreshComposerContextSoon(0);
      recordFocusGuardEvent("native_composer_paste_refocused", { reason });
    });
    return true;
  };
  const blurOnNonEditableTouch = (event) => {
    const target = event?.target;
    if (eventTargetActivatesComposerSend(target)) return;
    const active = document.activeElement;
    const composerInput = $("messageInput");
    const nativeShell = nativeShellFocusGuardActive();
    const composer = $("composer");
    const now = Date.now();
    const targetInsideComposer = eventTargetInsideElement(composer, target);
    const nativeComposerFocusActive = nativeShell
      && active === composerInput
      && composerInputVisibleForFocus();
    if (nativeComposerFocusActive && targetInsideComposer) {
      nativeComposerPasteMenuPreserveUntil = Math.max(
        nativeComposerPasteMenuPreserveUntil,
        now + nativeComposerPasteMenuPreserveMs,
      );
    }
    if (target?.closest?.(editableElementSelector())) return;
    const preserveNativeComposerFocus = nativeShell
      && active === composerInput
      && composerInputVisibleForFocus()
      && (targetInsideComposer || now <= nativeComposerPasteMenuPreserveUntil);
    const forceNativeBlur = nativeShell
      && isEditableElement(active)
      && !preserveNativeComposerFocus
      && !eventTargetInsideFocusedEditable(active, target);
    blurFocusedEditableIfStale("non_editable_touch", { force: forceNativeBlur });
  };
  const preserveNativeComposerPasteBlur = (event) => {
    const input = $("messageInput");
    const now = Date.now();
    if (!input || event?.target !== input) return;
    if (!nativeShellFocusGuardActive()) return;
    if (now > nativeComposerPasteMenuPreserveUntil) return;
    if (!composerInputVisibleForFocus()) return;
    recordFocusGuardEvent("native_composer_paste_blur_preserved", { reason: "paste_window" });
    restoreNativeComposerPasteFocus("native_composer_paste_blur");
  };
  document.addEventListener("visibilitychange", blurOnLifecycle, { capture: true });
  window.addEventListener("pageshow", blurOnLifecycle);
  window.addEventListener("pagehide", blurOnLifecycle);
  document.addEventListener("pointerdown", blurOnNonEditableTouch, { capture: true, passive: true });
  document.addEventListener("touchstart", blurOnNonEditableTouch, { capture: true, passive: true });
  document.addEventListener("blur", preserveNativeComposerPasteBlur, { capture: true });
}

function handleAppBackgrounded() {
  suppressComposerAutoFocus(1800);
  blurComposerInput();
  clearTodoAutoRefresh();
  if (typeof persistAppRouteSnapshot === "function") persistAppRouteSnapshot("background");
}

function markSystemFilePickerOpened(durationMs = 600000) {
  const now = Date.now();
  const model = currentChatComposerDraftModel();
  if (typeof model?.createSystemFilePickerOpenPlan === "function") {
    const plan = model.createSystemFilePickerOpenPlan({
      nowMs: now,
      durationMs,
      currentSuppressUntil: state.attachFilePickerForegroundSuppressUntil || 0,
    });
    state.attachFilePickerActivationAt = plan.activationAt;
    state.attachFilePickerNativePending = plan.nativePending;
    state.attachFilePickerForegroundSuppressUntil = plan.suppressUntil;
    return;
  }
  state.attachFilePickerActivationAt = now;
  state.attachFilePickerNativePending = true;
  state.attachFilePickerForegroundSuppressUntil = Math.max(
    Number(state.attachFilePickerForegroundSuppressUntil || 0),
    now + Math.max(1000, Number(durationMs || 0)),
  );
}

function markSystemFilePickerReturned(durationMs = 2500) {
  const now = Date.now();
  const model = currentChatComposerDraftModel();
  if (typeof model?.createSystemFilePickerReturnPlan === "function") {
    const plan = model.createSystemFilePickerReturnPlan({
      nowMs: now,
      durationMs,
      currentSuppressUntil: state.attachFilePickerForegroundSuppressUntil || 0,
    });
    state.attachFilePickerNativePending = plan.nativePending;
    state.attachFilePickerForegroundSuppressUntil = plan.suppressUntil;
    return;
  }
  state.attachFilePickerNativePending = false;
  state.attachFilePickerForegroundSuppressUntil = Math.max(
    Number(state.attachFilePickerForegroundSuppressUntil || 0),
    now + Math.max(500, Number(durationMs || 0)),
  );
}

function systemFilePickerForegroundSuppressed() {
  const now = Date.now();
  const model = currentChatComposerDraftModel();
  if (typeof model?.systemFilePickerForegroundSuppressionState === "function") {
    return Boolean(model.systemFilePickerForegroundSuppressionState({
      nowMs: now,
      nativePending: state.attachFilePickerNativePending,
      suppressUntil: state.attachFilePickerForegroundSuppressUntil || 0,
      activationAt: state.attachFilePickerActivationAt || 0,
    }).suppressed);
  }
  return Boolean(
    state.attachFilePickerNativePending
    || now < Number(state.attachFilePickerForegroundSuppressUntil || 0)
    || now - Number(state.attachFilePickerActivationAt || 0) < 1800
  );
}

function consumeSystemFilePickerForegroundSuppression() {
  const now = Date.now();
  const model = currentChatComposerDraftModel();
  if (typeof model?.consumeSystemFilePickerForegroundSuppressionPlan === "function") {
    const plan = model.consumeSystemFilePickerForegroundSuppressionPlan({
      nowMs: now,
      nativePending: state.attachFilePickerNativePending,
      suppressUntil: state.attachFilePickerForegroundSuppressUntil || 0,
      activationAt: state.attachFilePickerActivationAt || 0,
      returnDurationMs: 2500,
    });
    if (!plan.consumed) return false;
    if (plan.returnPlan) {
      state.attachFilePickerNativePending = plan.returnPlan.nativePending;
      state.attachFilePickerForegroundSuppressUntil = plan.returnPlan.suppressUntil;
    } else {
      markSystemFilePickerReturned(2500);
    }
    return true;
  }
  if (!systemFilePickerForegroundSuppressed()) return false;
  markSystemFilePickerReturned(2500);
  return true;
}

function handleAppForegrounded() {
  const suppressFilePickerRefresh = consumeSystemFilePickerForegroundSuppression();
  if (typeof applyThemePreference === "function") applyThemePreference();
  suppressComposerAutoFocus(900);
  blurComposerInput();
  if (typeof persistAppRouteSnapshot === "function") persistAppRouteSnapshot("foreground");
  if (!suppressFilePickerRefresh) {
    refreshPendingCurrentThreadOnForeground();
    if (state.viewMode === "todos") scheduleTodoAutoRefresh();
    if (state.viewMode === "inbox") loadActionInbox({ silent: true, preserveScroll: true }).catch(showError);
  }
  if (typeof settleEmbeddedPluginViewportBroadcast === "function") settleEmbeddedPluginViewportBroadcast("host_foreground");
  if (typeof settleMobileBottomNavReservation === "function") settleMobileBottomNavReservation("host_foreground", [0, 80, 240, 520, 1000]);
  if (typeof scheduleClientLayoutDiagnostics === "function") scheduleClientLayoutDiagnostics("host_foreground", [0, 300, 1200]);
  if (!suppressFilePickerRefresh) scheduleConversationViewportRefresh();
}

function refreshPendingCurrentThreadOnForeground() {
  if (!["single", "tasks"].includes(state.viewMode)) return;
  if (typeof currentThreadHasPendingMessages !== "function") return;
  if (typeof requestCurrentThreadRefresh !== "function") return;
  if (!currentThreadHasPendingMessages()) return;
  const now = Date.now();
  if (now < Number(state.foregroundPendingThreadRefreshAfter || 0)) return;
  state.foregroundPendingThreadRefreshAfter = now + 2500;
  requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 120 });
}

function focusComposerSoon(options = {}) {
  window.requestAnimationFrame(() => {
    if (!options.force && !composerAutoFocusAllowed()) return;
    if (!composerInputVisibleForFocus()) return;
    $("messageInput")?.focus({ preventScroll: true });
  });
}

function composerHasDraft() {
  const searchMode = isChatSearchMode();
  const model = currentChatComposerDraftModel();
  if (typeof model?.composerHasDraftState === "function") {
    return model.composerHasDraftState({
      searchMode,
      text: getComposerText(),
      pendingArtifacts: state.pendingArtifacts,
    }).hasDraft;
  }
  if (searchMode) return false;
  return Boolean(getComposerText().trim() || state.pendingArtifacts.length);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installStaleEditableFocusGuard();
}
