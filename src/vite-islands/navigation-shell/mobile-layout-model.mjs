export const MOBILE_LAYOUT_MODEL_VERSION = "20260706-mobile-layout-model-v1";

function roundNonNegative(value) {
  const next = Math.round(Number(value || 0));
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function visualViewportKeyboardMetricsPlan({
  layoutHeight = 0,
  viewportHeight = 0,
  offsetTop = 0,
} = {}) {
  const layout = roundNonNegative(layoutHeight);
  const height = roundNonNegative(viewportHeight);
  if (!layout || !height) return null;
  const top = Math.max(0, Math.round(Number(offsetTop || 0) || 0));
  const bottomInset = Math.max(0, Math.round(layout - height - top));
  return Object.freeze({
    version: MOBILE_LAYOUT_MODEL_VERSION,
    height,
    offsetTop: top,
    bottomInset,
    keyboardLikely: bottomInset > 80 || height < layout * 0.82,
  });
}

export function stableKeyboardViewportMetricsPlan({ previous = null, metrics = null, active = false } = {}) {
  if (!metrics) return Object.freeze({ version: MOBILE_LAYOUT_MODEL_VERSION, metrics: null, reusePrevious: false });
  const next = Object.freeze({
    height: roundNonNegative(metrics.height),
    offsetTop: roundNonNegative(metrics.offsetTop),
    bottomInset: roundNonNegative(metrics.bottomInset),
    keyboardLikely: Boolean(metrics.keyboardLikely),
  });
  if (
    active &&
    previous &&
    previous.keyboardLikely === next.keyboardLikely &&
    Math.abs(Number(previous.height || 0) - next.height) <= 3 &&
    Math.abs(Number(previous.offsetTop || 0) - next.offsetTop) <= 3 &&
    Math.abs(Number(previous.bottomInset || 0) - next.bottomInset) <= 3
  ) {
    return Object.freeze({ version: MOBILE_LAYOUT_MODEL_VERSION, metrics: previous, reusePrevious: true });
  }
  return Object.freeze({ version: MOBILE_LAYOUT_MODEL_VERSION, metrics: next, reusePrevious: false });
}

export function keyboardViewportActivePlan({
  mobileLayout = false,
  keyboardLikely = false,
  composerFocused = false,
  nativeEmbeddedPluginActive = false,
} = {}) {
  return Object.freeze({
    version: MOBILE_LAYOUT_MODEL_VERSION,
    active: Boolean(mobileLayout && keyboardLikely && (composerFocused || nativeEmbeddedPluginActive)),
  });
}

export function pluginContextViewportBottomInsetPlan({
  active = false,
  navVisible = false,
  navHeight = 0,
  appHeight = 0,
  visualViewportHeight = 0,
  innerHeight = 0,
  documentHeight = 0,
  navTop = 0,
  navBottom = 0,
  viewportOverflowClamp = 0,
} = {}) {
  const layoutViewportHeight = Math.max(
    roundNonNegative(innerHeight),
    roundNonNegative(documentHeight),
    roundNonNegative(visualViewportHeight),
  );
  const viewportHeight = layoutViewportHeight || roundNonNegative(appHeight);
  if (!active || !navVisible || !viewportHeight) {
    return Object.freeze({
      version: MOBILE_LAYOUT_MODEL_VERSION,
      active: false,
      bottomInset: 0,
      viewportHeight,
      layoutViewportHeight,
    });
  }
  const height = roundNonNegative(navHeight);
  const top = Math.round(Number(navTop || 0) || 0);
  const bottom = Math.round(Number(navBottom || 0) || 0);
  const viewportOverflowRaw = Math.max(0, roundNonNegative(appHeight) - viewportHeight);
  const viewportOverflow = Math.min(viewportOverflowRaw, roundNonNegative(viewportOverflowClamp));
  const navVisibleTopInset = Math.ceil(Math.max(0, viewportHeight - top)) || height;
  return Object.freeze({
    version: MOBILE_LAYOUT_MODEL_VERSION,
    active: true,
    layoutViewportHeight,
    viewportHeight,
    viewportOverflowRaw,
    viewportOverflow,
    navVisibleTopInset,
    bottomInset: Math.max(0, navVisibleTopInset + viewportOverflow),
    navRect: Object.freeze({
      top: Math.round(top),
      bottom: Math.round(bottom),
      height,
    }),
  });
}
