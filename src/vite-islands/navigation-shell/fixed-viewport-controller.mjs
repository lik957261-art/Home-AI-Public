export const FIXED_VIEWPORT_CONTROLLER_VERSION = "20260706-fixed-viewport-controller-v1";

export function fixedViewportListenerPlan() {
  return Object.freeze({
    version: FIXED_VIEWPORT_CONTROLLER_VERSION,
    rootClass: "fixed-viewport",
    gestureEvents: Object.freeze(["gesturestart", "gesturechange", "gestureend"]),
    doubleTapWindowMs: 300,
  });
}

export function shouldPreventMultiTouchMove({ touchCount = 0 } = {}) {
  return Number(touchCount || 0) > 1;
}

export function doubleTapTouchEndPlan({ now = 0, lastTouchEnd = 0, thresholdMs = 300 } = {}) {
  const current = Number(now || 0) || 0;
  const previous = Number(lastTouchEnd || 0) || 0;
  const threshold = Math.max(0, Number(thresholdMs || 0) || 0);
  return Object.freeze({
    version: FIXED_VIEWPORT_CONTROLLER_VERSION,
    prevent: Boolean(previous && current - previous <= threshold),
    nextLastTouchEnd: current,
  });
}

export function shouldPreventWheelZoom({ ctrlKey = false, metaKey = false } = {}) {
  return Boolean(ctrlKey || metaKey);
}

export function installFixedViewportController({
  documentRef = globalThis.document,
  now = () => Date.now(),
} = {}) {
  const plan = fixedViewportListenerPlan();
  if (!documentRef?.documentElement || typeof documentRef.addEventListener !== "function") {
    return Object.freeze({ version: FIXED_VIEWPORT_CONTROLLER_VERSION, installed: false, reason: "document_unavailable" });
  }
  const prevent = (event) => event.preventDefault();
  documentRef.documentElement.classList.add(plan.rootClass);
  for (const name of plan.gestureEvents) {
    documentRef.addEventListener(name, prevent, { passive: false });
  }
  documentRef.addEventListener("touchmove", (event) => {
    if (shouldPreventMultiTouchMove({ touchCount: event.touches?.length || 0 })) event.preventDefault();
  }, { passive: false });
  let lastTouchEnd = 0;
  documentRef.addEventListener("touchend", (event) => {
    const touchPlan = doubleTapTouchEndPlan({ now: now(), lastTouchEnd, thresholdMs: plan.doubleTapWindowMs });
    if (touchPlan.prevent) event.preventDefault();
    lastTouchEnd = touchPlan.nextLastTouchEnd;
  }, { passive: false });
  documentRef.addEventListener("wheel", (event) => {
    if (shouldPreventWheelZoom({ ctrlKey: event.ctrlKey, metaKey: event.metaKey })) event.preventDefault();
  }, { passive: false });
  return Object.freeze({ version: FIXED_VIEWPORT_CONTROLLER_VERSION, installed: true, listenerPlan: plan });
}
