"use strict";

function suppressComposerAutoFocus(ms = 1200) {
  state.suppressComposerFocusUntil = Math.max(state.suppressComposerFocusUntil || 0, Date.now() + ms);
}

function composerAutoFocusAllowed() {
  return document.visibilityState !== "hidden" && Date.now() >= (state.suppressComposerFocusUntil || 0);
}

function editableElementSelector() {
  return "textarea, input, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']";
}

function isEditableElement(element) {
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
  return Boolean(input && composer && !composer.hidden && !input.disabled && elementVisibleForFocus(input));
}

function blurFocusedEditableIfStale(reason = "stale_focus", options = {}) {
  const active = document.activeElement;
  if (!isEditableElement(active)) return false;
  const composerInput = $("messageInput");
  const stale = !active.isConnected
    || active.disabled === true
    || active.getAttribute?.("aria-disabled") === "true"
    || !elementVisibleForFocus(active)
    || (active === composerInput && !composerInputVisibleForFocus());
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
  if (!active || !target) return false;
  if (active === target) return true;
  if (typeof active.contains === "function" && active.contains(target)) return true;
  return false;
}

function installStaleEditableFocusGuard() {
  if (window.__homeAiStaleEditableFocusGuardInstalled) return;
  window.__homeAiStaleEditableFocusGuardInstalled = true;
  const blurOnLifecycle = () => blurFocusedEditableIfStale("lifecycle");
  const blurOnNonEditableTouch = (event) => {
    const target = event?.target;
    if (target?.closest?.(editableElementSelector())) return;
    const active = document.activeElement;
    const forceNativeBlur = nativeShellFocusGuardActive()
      && isEditableElement(active)
      && !eventTargetInsideFocusedEditable(active, target);
    blurFocusedEditableIfStale("non_editable_touch", { force: forceNativeBlur });
  };
  document.addEventListener("visibilitychange", blurOnLifecycle, { capture: true });
  window.addEventListener("pageshow", blurOnLifecycle);
  window.addEventListener("pagehide", blurOnLifecycle);
  document.addEventListener("pointerdown", blurOnNonEditableTouch, { capture: true, passive: true });
  document.addEventListener("touchstart", blurOnNonEditableTouch, { capture: true, passive: true });
}

function handleAppBackgrounded() {
  suppressComposerAutoFocus(1800);
  blurComposerInput();
  clearTodoAutoRefresh();
  if (typeof persistAppRouteSnapshot === "function") persistAppRouteSnapshot("background");
}

function markSystemFilePickerOpened(durationMs = 600000) {
  const now = Date.now();
  state.attachFilePickerActivationAt = now;
  state.attachFilePickerNativePending = true;
  state.attachFilePickerForegroundSuppressUntil = Math.max(
    Number(state.attachFilePickerForegroundSuppressUntil || 0),
    now + Math.max(1000, Number(durationMs || 0)),
  );
}

function markSystemFilePickerReturned(durationMs = 2500) {
  const now = Date.now();
  state.attachFilePickerNativePending = false;
  state.attachFilePickerForegroundSuppressUntil = Math.max(
    Number(state.attachFilePickerForegroundSuppressUntil || 0),
    now + Math.max(500, Number(durationMs || 0)),
  );
}

function systemFilePickerForegroundSuppressed() {
  const now = Date.now();
  return Boolean(
    state.attachFilePickerNativePending
    || now < Number(state.attachFilePickerForegroundSuppressUntil || 0)
    || now - Number(state.attachFilePickerActivationAt || 0) < 1800
  );
}

function consumeSystemFilePickerForegroundSuppression() {
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
  if (isChatSearchMode()) return false;
  return Boolean(getComposerText().trim() || state.pendingArtifacts.length);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installStaleEditableFocusGuard();
}
