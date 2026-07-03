"use strict";

function scheduleRenderCurrentThread() {
  if (state.renderScheduled) return;
  const conversation = $("conversation");
  if (!conversation) return;
  const routeSnapshot = currentThreadRouteSnapshot();
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  state.shouldStickToBottom = !userScrollProtected && (shouldForceChatStickToBottom() || isNearBottom());
  state.preservedBottomOffset = conversation.scrollHeight - conversation.scrollTop;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    if (!currentThreadRouteMatches(routeSnapshot)) return;
    renderCurrentThread({ stickToBottom: state.shouldStickToBottom });
  });
}
