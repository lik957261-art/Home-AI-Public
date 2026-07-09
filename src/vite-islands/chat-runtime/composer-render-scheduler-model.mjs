const CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION = "20260704-vite-chat-composer-render-scheduler-model-v1";

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function composerRenderSchedulePlan(input = {}) {
  const shouldSchedule = !input.renderScheduled && input.hasConversation === true;
  const shouldStickToBottom = shouldSchedule
    ? !input.userScrollProtected && (input.forceStickToBottom === true || input.nearBottom === true)
    : false;
  const preservedBottomOffset = shouldSchedule
    ? Math.max(0, finiteNumber(input.scrollHeight, 0) - finiteNumber(input.scrollTop, 0))
    : 0;
  return Object.freeze({
    version: CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
    shouldSchedule,
    shouldStickToBottom,
    preservedBottomOffset,
  });
}

function composerRenderFramePlan(input = {}) {
  const shouldRender = input.routeMatches !== false;
  return Object.freeze({
    version: CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
    shouldRender,
    renderOptions: shouldRender ? Object.freeze({ stickToBottom: Boolean(input.shouldStickToBottom) }) : null,
  });
}

export {
  CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
  composerRenderFramePlan,
  composerRenderSchedulePlan,
};
