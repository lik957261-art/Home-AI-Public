const FOCUS_LIFECYCLE_GUARD_VERSION = "20260702-vite-focus-lifecycle-guard-v1";
const EDITABLE_ELEMENT_SELECTOR = "textarea, input, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']";

function noop() {}

function isElementLike(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

function editableElementSelector() {
  return EDITABLE_ELEMENT_SELECTOR;
}

function isEditableElement(element) {
  return Boolean(isElementLike(element) && element.matches?.(EDITABLE_ELEMENT_SELECTOR));
}

function elementMarkedInert(element) {
  return element?.inert === true || element?.hasAttribute?.("inert") === true;
}

function rectListEmpty(element) {
  const rects = typeof element?.getClientRects === "function" ? element.getClientRects() : null;
  return Boolean(rects && typeof rects.length === "number" && rects.length === 0);
}

function rectHasNoArea(element) {
  const rect = typeof element?.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
  if (!rect) return false;
  return Number(rect.width) <= 0 || Number(rect.height) <= 0;
}

function computedStyleFor(element, options = {}) {
  const getComputedStyle = typeof options.getComputedStyle === "function"
    ? options.getComputedStyle
    : options.root?.getComputedStyle;
  try {
    return typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  } catch (_error) {
    return null;
  }
}

function elementVisibleForFocus(element, options = {}) {
  if (!isElementLike(element)) return false;
  if (element.isConnected === false) return false;
  if (elementMarkedInert(element)) return false;
  if (rectListEmpty(element) || rectHasNoArea(element)) return false;

  let node = element;
  while (isElementLike(node)) {
    if (node.hidden || elementMarkedInert(node) || node.getAttribute?.("aria-hidden") === "true") return false;
    const style = computedStyleFor(node, options);
    if (style?.display === "none" || style?.visibility === "hidden" || style?.pointerEvents === "none") return false;
    node = node.parentElement;
  }
  return true;
}

function composerInputVisibleForFocus(input, container, options = {}) {
  return Boolean(input && container && !container.hidden && input.disabled !== true && elementVisibleForFocus(input, options));
}

function focusedEditableState(options = {}) {
  const documentRef = options.documentRef || null;
  const active = options.activeElement || documentRef?.activeElement || null;
  const input = typeof options.getComposerInput === "function" ? options.getComposerInput() : options.composerInput;
  const container = typeof options.getComposerContainer === "function" ? options.getComposerContainer() : options.composerContainer;
  if (!isEditableElement(active)) {
    return Object.freeze({
      version: FOCUS_LIFECYCLE_GUARD_VERSION,
      active,
      editable: false,
      stale: false,
      reason: "no_active_editable",
      composerFocused: false,
    });
  }
  let reason = "";
  if (active.isConnected === false) reason = "detached";
  else if (active.disabled === true) reason = "disabled";
  else if (active.getAttribute?.("aria-disabled") === "true") reason = "aria_disabled";
  else if (active === input && !composerInputVisibleForFocus(input, container, options)) reason = "composer_unavailable";
  else if (!elementVisibleForFocus(active, options)) reason = "invisible";
  return Object.freeze({
    version: FOCUS_LIFECYCLE_GUARD_VERSION,
    active,
    editable: true,
    stale: Boolean(reason),
    reason: reason || "active_editable_visible",
    composerFocused: active === input,
  });
}

function eventTargetInsideFocusedEditable(active, target) {
  if (!active || !target) return false;
  if (active === target) return true;
  return Boolean(typeof active.contains === "function" && active.contains(target));
}

function eventTargetIsEditable(target) {
  return Boolean(target?.closest?.(EDITABLE_ELEMENT_SELECTOR));
}

function blurFocusedEditableIfStale(options = {}) {
  const state = focusedEditableState(options);
  const force = options.force === true;
  if (!state.editable) return Object.freeze({ blurred: false, reason: state.reason, state });
  if (!state.stale && !force) return Object.freeze({ blurred: false, reason: state.reason, state });
  try {
    state.active.blur?.();
  } catch (error) {
    const failure = String(error?.name || error?.message || "blur_error").slice(0, 120);
    options.onBlurFailure?.(failure, state);
    return Object.freeze({ blurred: false, reason: "blur_failed", failure, state });
  }
  if (state.composerFocused) options.onComposerBlur?.(state);
  options.onKeyboardMetricsClear?.(state);
  options.onBlur?.(state.reason, state);
  return Object.freeze({ blurred: true, reason: state.reason, forced: force, state });
}

function createEditableFocusLifecycleGuard(options = {}) {
  const documentRef = options.documentRef || null;
  const root = options.root || null;
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : noop;
  let installed = false;
  let latestStatus = Object.freeze({
    version: FOCUS_LIFECYCLE_GUARD_VERSION,
    installed: false,
    lastAction: "idle",
    lastBlurred: false,
    lastReason: "",
  });

  function emitStatus(patch = {}) {
    latestStatus = Object.freeze(Object.assign({}, latestStatus, patch, {
      version: FOCUS_LIFECYCLE_GUARD_VERSION,
      installed,
    }));
    onStatus(latestStatus);
    return latestStatus;
  }

  function blur(reason = "stale_focus", blurOptions = {}) {
    const result = blurFocusedEditableIfStale(Object.assign({}, options, blurOptions, { reason }));
    emitStatus({
      lastAction: reason,
      lastBlurred: result.blurred,
      lastReason: result.reason,
      lastForced: Boolean(result.forced),
    });
    return result;
  }

  function handleLifecycle(eventOrReason = "lifecycle") {
    const reason = typeof eventOrReason === "string" ? eventOrReason : eventOrReason?.type || "lifecycle";
    return blur(reason);
  }

  function handleNonEditablePointer(event = {}) {
    const target = event.target || null;
    if (eventTargetIsEditable(target)) {
      return emitStatus({
        lastAction: event.type || "non_editable_pointer",
        lastBlurred: false,
        lastReason: "target_editable",
      });
    }
    const state = focusedEditableState(options);
    const nativeShell = typeof options.isNativeShell === "function"
      ? Boolean(options.isNativeShell())
      : Boolean(options.isNativeShell);
    const force = nativeShell && state.editable && !eventTargetInsideFocusedEditable(state.active, target);
    blur(event.type || "non_editable_pointer", { force });
    return latestStatus;
  }

  const listeners = Object.freeze({
    visibilitychange: () => handleLifecycle("visibilitychange"),
    pageshow: () => handleLifecycle("pageshow"),
    pagehide: () => handleLifecycle("pagehide"),
    pointerdown: (event) => handleNonEditablePointer(Object.assign({ type: "pointerdown" }, event || {})),
    touchstart: (event) => handleNonEditablePointer(Object.assign({ type: "touchstart" }, event || {})),
  });

  function install() {
    if (installed) return latestStatus;
    installed = true;
    documentRef?.addEventListener?.("visibilitychange", listeners.visibilitychange, { capture: true });
    root?.addEventListener?.("pageshow", listeners.pageshow);
    root?.addEventListener?.("pagehide", listeners.pagehide);
    documentRef?.addEventListener?.("pointerdown", listeners.pointerdown, { capture: true, passive: true });
    documentRef?.addEventListener?.("touchstart", listeners.touchstart, { capture: true, passive: true });
    return emitStatus({ lastAction: "installed", lastBlurred: false, lastReason: "" });
  }

  function dispose() {
    if (!installed) return latestStatus;
    documentRef?.removeEventListener?.("visibilitychange", listeners.visibilitychange, { capture: true });
    root?.removeEventListener?.("pageshow", listeners.pageshow);
    root?.removeEventListener?.("pagehide", listeners.pagehide);
    documentRef?.removeEventListener?.("pointerdown", listeners.pointerdown, { capture: true, passive: true });
    documentRef?.removeEventListener?.("touchstart", listeners.touchstart, { capture: true, passive: true });
    installed = false;
    return emitStatus({ lastAction: "disposed", lastBlurred: false, lastReason: "" });
  }

  return Object.freeze({
    version: FOCUS_LIFECYCLE_GUARD_VERSION,
    install,
    dispose,
    blur,
    handleLifecycle,
    handleNonEditablePointer,
    status: () => latestStatus,
  });
}

export {
  EDITABLE_ELEMENT_SELECTOR,
  FOCUS_LIFECYCLE_GUARD_VERSION,
  blurFocusedEditableIfStale,
  composerInputVisibleForFocus,
  createEditableFocusLifecycleGuard,
  editableElementSelector,
  elementVisibleForFocus,
  eventTargetInsideFocusedEditable,
  focusedEditableState,
  isEditableElement,
};
