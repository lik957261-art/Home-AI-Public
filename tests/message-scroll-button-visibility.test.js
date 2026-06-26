"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const appMessageActionsUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-message-actions-ui.js"), "utf8");
const appThreadListUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-thread-list-ui.js"), "utf8");
const appRunProgressUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-run-progress-ui.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const appThreadCardMessageUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-thread-card-message-ui.js"), "utf8");

assert.match(
  appMessageActionsUiJs,
  /function handleConversationScrollState\(\) \{[\s\S]*?const conversation = \$\("conversation"\);[\s\S]*?scheduleMessageScrollButtonVisibility\(conversation\);/,
  "message scroll buttons must be recalculated during ordinary conversation scrolls"
);

assert.match(
  appMessageActionsUiJs,
  /function setConversationReadAnchor\(messageId = "", scrollTop = 0\) \{[\s\S]*?state\.conversationReadAnchorMessageId = id;[\s\S]*?state\.conversationReadAnchorScrollTop = Math\.max/,
  "jumping to the start of a long receipt must create a durable read anchor"
);

assert.match(
  appMessageActionsUiJs,
  /function restoreConversationReadAnchorScroll\(conversation = \$\("conversation"\)\) \{[\s\S]*?conversation\.scrollTop = targetTop;[\s\S]*?state\.conversationPinnedToBottom = false;/,
  "render refreshes must restore the long-receipt read anchor instead of preserving bottom offset"
);

assert.match(
  appMessageActionsUiJs,
  /function shouldForceChatStickToBottom\(\) \{[\s\S]*?!conversationReadAnchorActive\(\)[\s\S]*?forceChatStickToBottomUntil/,
  "manual long-receipt reading must suppress automatic chat bottom sticking"
);

assert.match(
  appMessageActionsUiJs,
  /function messageScrollCanReturnToStart\(articleRect, conversationRect\) \{[\s\S]*?startPassed[\s\S]*?stillInsideMessage/,
  "visible historical long messages must detect when their start is above the viewport"
);

assert.match(
  appMessageActionsUiJs,
  /function conversationIsAtBottom\(el = \$\("conversation"\), threshold = 24\) \{[\s\S]*?conversationBottomOffset\(el\) <= threshold;/,
  "conversation bottom detection must drive mutually exclusive up/down receipt navigation"
);

assert.match(
  appMessageActionsUiJs,
  /function conversationJumpBottomShouldShow\(conversation = \$\("conversation"\)\) \{[\s\S]*?!conversationIsAtBottom\(conversation\)/,
  "global down-arrow visibility must use one shared conversation-bottom predicate"
);

assert.doesNotMatch(
  appMessageActionsUiJs,
  /function updateConversationJumpBottomButton\(\) \{[\s\S]*?hideInlineMessageStartScrollButtons\(conversation\);[\s\S]*?\n\}/,
  "the right-side global down arrow must not hide the inline reply-start arrow in the Usage row"
);

assert.match(
  appMessageActionsUiJs,
  /function setConversationJumpButtonMode\(button, mode, messageId = ""\) \{[\s\S]*?button\.dataset\.scrollMode = startMode \? "message-start" : "bottom";[\s\S]*?setConversationJumpBottomGlyph\(button, startMode \? "&#8593;" : "&#8595;"\);/,
  "the global jump-bottom slot must switch between down and reply-start modes"
);

assert.match(
  appMessageActionsUiJs,
  /button\.classList\.toggle\("floating", shouldFloat\);[\s\S]*?positionFloatingMessageScrollButton\(button, shouldFloat, articleRect, conversationRect\);/,
  "the shared arrow cleanup path must still restore inline styles when older DOM had floating state"
);

assert.match(
  appMessageActionsUiJs,
  /function messageScrollVisibilityTarget\(root\) \{[\s\S]*?if \(document\.body\.contains\(root\)\) return root;[\s\S]*?return conversation \|\| root;/,
  "queued long-message arrow recalculation must fall back to the current conversation when a terminal refresh replaced the old message DOM"
);

assert.match(
  appMessageActionsUiJs,
  /function scheduleMessageScrollButtonVisibility\(root\) \{[\s\S]*?rememberMessageScrollVisibilityTarget\(root\);[\s\S]*?const target = state\.messageScrollVisibilityRoot;[\s\S]*?state\.messageScrollVisibilityRoot = null;[\s\S]*?applyMessageScrollButtonVisibility\(target\);/,
  "message arrow recalculation must resolve the target at execution time instead of trusting a stale queued node"
);

assert.match(
  appMessageActionsUiJs,
  /function scheduleMessageScrollButtonVisibilitySettle\(root, delays = \[100, 280, 900, 1600\]\) \{[\s\S]*?window\.setTimeout\(\(\) => applyMessageScrollButtonVisibility\(target\), Math\.max\(0, delay\)\);/,
  "terminal long replies need delayed arrow settling after final markdown/layout replacement"
);

assert.match(
  appMessageActionsUiJs,
  /const contentEligible = previouslyEligible \|\| measuredLong \|\| wasShown;[\s\S]*?if \(contentEligible\) article\.dataset\.messageScrollEligible = "1";/,
  "once a reply is proven long, later Usage or run-progress refreshes must not clear long-reply arrow eligibility"
);

assert.match(
  appMessageActionsUiJs,
  /function messageScrollEligibleByContent\(message = \{\}\) \{[\s\S]*?estimatedLines[\s\S]*?> 22;/,
  "initial long-reply arrow eligibility may use a screen-line estimate, not the rich-render character limit"
);

assert.match(
  appMessageActionsUiJs,
  /function renderMessageScrollButton\(message, position\) \{[\s\S]*?data-scroll-position="\$\{end \? "end" : "start"\}"[\s\S]*?message-scroll-glyph[\s\S]*?\$\{end \? "&#8595;" : "&#8593;"\}/,
  "reply navigation must render the long-standing inline footer arrow"
);

assert.match(
  appMessageActionsUiJs,
  /function renderMessageActionStrip\(message, scrollPosition\) \{[\s\S]*?const controls = \[[\s\S]*?renderMessageScrollButton\(message, scrollPosition\),[\s\S]*?renderMessageCopyButton\(message\),/,
  "the inline reply arrow must remain before the copy button in the message footer controls"
);

assert.doesNotMatch(
  appMessageActionsUiJs,
  /function messageScrollEligibleByContent\(message = \{\}\) \{[\s\S]*?ACTIVE_MESSAGE_RICH_RENDER_LIMIT[\s\S]*?\}/,
  "long-reply arrow eligibility must not be tied to the 6000-character rich-render threshold"
);

assert.match(
  appThreadCardMessageUiJs,
  /const scrollEligibleAttr = messageScrollEligibleByContent\(message\) \? ` data-message-scroll-eligible="1"` : "";/,
  "message render must persist long-reply arrow eligibility into the article DOM"
);

assert.match(
  appMessageActionsUiJs,
  /const messageHeight = Math\.max\([\s\S]*?messageBody\?\.scrollHeight \|\| 0[\s\S]*?messageHeight > showThreshold/,
  "arrow visibility must use measured message height to determine whether the rendered reply fits in one screen"
);

assert.match(
  appMessageActionsUiJs,
  /const canReturnToStart = messageScrollCanReturnToStart\(articleRect, conversationRect\);[\s\S]*?const canJumpToEnd = messageScrollCanJumpToEnd\(articleRect, conversationRect\);[\s\S]*?canReturnToStart[\s\S]*?\|\| canJumpToEnd/,
  "arrow visibility must use viewport geometry so a reply that has scrolled past its start can jump back even when character heuristics are unavailable"
);

assert.match(
  appMessageActionsUiJs,
  /const startFooterVisible = Boolean\([\s\S]*?isStartButton[\s\S]*?&& contentEligible[\s\S]*?&& canReturnToStart[\s\S]*?&& footerVisible[\s\S]*?\);[\s\S]*?const buttonVisible = isStartButton \? startFooterVisible : endVisible;[\s\S]*?const shouldFloat = false;/,
  "the reply-start candidate must show the inline footer arrow in the Usage row independent of the global down arrow"
);

assert.match(
  appMessageActionsUiJs,
  /const footerSafeBottom = conversationBottom - 8;[\s\S]*?articleBottom <= footerSafeBottom/,
  "the reply-start arrow must not appear while the receipt footer is still below the visible bottom safe line"
);

assert.match(
  appMessageActionsUiJs,
  /function wireMessageScrollButtons\(root\) \{[\s\S]*?applyMessageScrollButtonVisibility\(root\);[\s\S]*?\}/,
  "message scroll arrows must be recalculated immediately after binding instead of waiting only for a later async pass"
);

assert.match(
  appMessageActionsUiJs,
  /if \(button\.dataset\.scrollMode === "message-start" && button\.dataset\.scrollMessage\) \{[\s\S]*?scrollMessageIntoView\(button\.dataset\.scrollMessage, "start"\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?scrollConversationToBottomSmooth\(\);/,
  "the shared global navigation slot must route clicks by its current mode"
);

assert.match(
  appMessageActionsUiJs,
  /if \(position === "start"\) setConversationReadAnchor\(messageId, top\);[\s\S]*?else clearConversationReadAnchor\(\);/,
  "the long-reply start arrow must lock the read anchor and bottom navigation must clear it"
);

assert.match(
  appThreadListUiJs,
  /const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive\(conversation\);[\s\S]*?const stickToBottom = !readAnchorActive && Boolean\(options\.stickToBottom \|\| forceChatBottom\);/,
  "thread rendering must not apply stick-to-bottom while a long-receipt read anchor is active"
);

assert.match(
  appThreadListUiJs,
  /restoreConversationReadAnchorScroll\(conversation\)[\s\S]*?state\.conversationPinnedToBottom = false;/,
  "thread rendering must restore the long-receipt read anchor after refresh"
);

assert.match(
  appRunProgressUiJs,
  /function stickRunProgressToConversationBottom\(conversation, shouldStick, beforeMetrics = null\) \{[\s\S]*?conversationReadAnchorActive\(conversation\)\) return;/,
  "run-progress layout updates must not drag a manual long-receipt read anchor to the bottom"
);

assert.match(
  stylesCss,
  /\.message-scroll-button\.hidden\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/,
  "hidden arrows must remain non-interactive when the message is not eligible"
);

assert.match(
  stylesCss,
  /\.message-scroll-button\s*\{[\s\S]*?display:\s*inline-grid;/,
  "inline reply arrows must be allowed to occupy their original footer slot"
);

let queuedFrame = null;
let liveButtonHidden = true;
let liveButtonFloating = null;
let jumpBottomHidden = true;
let jumpBottomAriaHidden = "true";
let jumpBottomAriaLabel = "";
let jumpBottomTitle = "";
let jumpBottomGlyph = "";
const liveButtonStyles = new Map();
const jumpBottomButton = {
  dataset: { scrollMode: "bottom", scrollMessage: "" },
  disabled: true,
  classList: {
    toggle(name, hidden) {
      if (name === "hidden") jumpBottomHidden = Boolean(hidden);
    },
  },
  querySelector(selector) {
    if (selector === "[data-conversation-jump-glyph]" || selector === "span") {
      return {
        set innerHTML(value) { jumpBottomGlyph = value; },
        get innerHTML() { return jumpBottomGlyph; },
      };
    }
    return null;
  },
  setAttribute(name, value) {
    if (name === "aria-hidden") jumpBottomAriaHidden = String(value);
    if (name === "aria-label") jumpBottomAriaLabel = String(value);
    if (name === "title") jumpBottomTitle = String(value);
  },
};
const liveButton = {
  dataset: { scrollPosition: "start", scrollMessage: "reply-1" },
  classList: {
    toggle(name, hidden) {
      if (name === "hidden") liveButtonHidden = Boolean(hidden);
      if (name === "floating") liveButtonFloating = Boolean(hidden);
    },
  },
  style: {
    setProperty(name, value) {
      liveButtonStyles.set(name, value);
    },
    removeProperty(name) {
      liveButtonStyles.delete(name);
    },
  },
  setAttribute() {},
  tabIndex: -1,
};
let liveArticleRect = { top: -260, bottom: 360, height: 620, left: 0, right: 390 };
const liveArticle = {
  dataset: { messageId: "reply-1" },
  offsetHeight: 620,
  scrollHeight: 620,
  matches() { return true; },
  getBoundingClientRect() { return liveArticleRect; },
  querySelector(selector) {
    if (selector === ".run-progress-panel.inline:not(.terminal)") return null;
    if (selector === ".message-body") return { offsetHeight: 590, scrollHeight: 590 };
    return null;
  },
  querySelectorAll(selector) {
    return selector === ".message-scroll-button" ? [liveButton] : [];
  },
};
const liveConversation = {
  clientHeight: 520,
  scrollHeight: 1300,
  scrollTop: 0,
  matches() { return false; },
  contains(node) { return node === liveArticle || node === liveButton; },
  getBoundingClientRect() { return { top: 0, bottom: 520, left: 0, right: 390 }; },
  querySelectorAll(selector) {
    if (selector === '.message-scroll-button[data-scroll-position="start"]') return [liveButton];
    if (selector === "[data-message-id]") return [liveArticle];
    return selector === ".message[data-message-id]" ? [liveArticle] : [];
  },
};
const detachedArticle = {
  matches() { return true; },
  querySelectorAll() { return []; },
};
const contained = new Set([liveConversation, liveArticle]);
const context = {
  document: { body: { contains: (node) => contained.has(node) } },
  state: { messageScrollVisibilityScheduled: false, messageScrollVisibilityRoot: null, currentThread: {} },
  window: { innerWidth: 390, visualViewport: null },
  requestAnimationFrame(fn) { queuedFrame = fn; },
  escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
  },
  renderMessageSkillPanel() { return ""; },
  isChatSearchMode() { return false; },
  isTaskDetailView() { return false; },
  isSingleWindowChatView() { return true; },
  isSingleWindowView() { return true; },
  $: (id) => {
    if (id === "conversation") return liveConversation;
    if (id === "conversationJumpBottom") return jumpBottomButton;
    return null;
  },
};
vm.createContext(context);
vm.runInContext(`${appMessageActionsUiJs}
globalThis.messageScrollHarness = { scheduleMessageScrollButtonVisibility, updateConversationJumpBottomButton, renderMessageFooter };`, context);
const footerHtml = context.messageScrollHarness.renderMessageFooter(
  { id: "reply-1", role: "assistant", content: "x".repeat(2200) },
  '<details class="usage"><summary>Usage</summary></details>'
);
const actionStripIndex = footerHtml.indexOf("message-action-strip");
const footerArrowIndex = footerHtml.indexOf('data-scroll-position="start"', actionStripIndex);
const copyButtonIndex = footerHtml.indexOf('data-copy-message="reply-1"', actionStripIndex);
const usageIndex = footerHtml.indexOf('<details class="usage"');
assert.ok(actionStripIndex >= 0, "message footer must render the action strip on the Usage row");
assert.ok(footerArrowIndex > actionStripIndex, "message footer must render the inline up arrow in the action strip");
assert.ok(copyButtonIndex > footerArrowIndex, "message footer must keep the inline up arrow before the copy button");
assert.ok(usageIndex > copyButtonIndex, "message footer controls must remain before Usage metadata in the row");
context.messageScrollHarness.scheduleMessageScrollButtonVisibility(detachedArticle);
assert.strictEqual(typeof queuedFrame, "function");
queuedFrame();
assert.strictEqual(liveButtonHidden, false, "non-bottom long replies may show the Usage-row reply-start arrow while the global down arrow is visible");
assert.strictEqual(liveButtonFloating, false, "non-bottom long replies must not float the reply-start arrow");
assert.strictEqual(jumpBottomHidden, false, "non-bottom conversation state must show the global down arrow");
assert.strictEqual(jumpBottomButton.disabled, false, "non-bottom global down arrow must be interactive");
assert.strictEqual(jumpBottomButton.dataset.scrollMode, "bottom", "non-bottom global navigation slot must stay in bottom mode");
assert.strictEqual(jumpBottomButton.dataset.scrollMessage, "", "bottom-mode navigation must not carry a reply-start target");
assert.strictEqual(jumpBottomGlyph, "&#8595;", "non-bottom global navigation slot must show the down arrow");

liveButtonHidden = false;
liveButtonFloating = true;
liveButtonStyles.set("position", "fixed");
context.messageScrollHarness.updateConversationJumpBottomButton();
assert.strictEqual(liveButtonHidden, false, "showing the global down arrow must leave the Usage-row reply-start arrow visible");
assert.strictEqual(liveButtonFloating, true, "global down-arrow updates must not mutate the inline reply-start arrow state");
assert.strictEqual(liveButtonStyles.has("position"), true, "global down-arrow updates must not clear inline reply-start arrow styles");

queuedFrame = null;
liveButtonHidden = true;
liveButtonFloating = null;
jumpBottomHidden = false;
jumpBottomButton.disabled = false;
liveButtonStyles.clear();
liveConversation.scrollTop = liveConversation.scrollHeight - liveConversation.clientHeight;
context.messageScrollHarness.scheduleMessageScrollButtonVisibility(detachedArticle);
assert.strictEqual(typeof queuedFrame, "function");
queuedFrame();
assert.strictEqual(liveButtonHidden, false, "at-bottom long replies must show the inline reply-start arrow in the Usage row");
assert.strictEqual(liveButtonFloating, false, "at-bottom reply-start navigation must remain in the footer action strip");
assert.strictEqual(jumpBottomHidden, true, "at-bottom reply-start navigation must not show the shared global navigation slot");
assert.strictEqual(jumpBottomButton.disabled, true, "at-bottom reply-start navigation must keep the shared slot inactive");
assert.strictEqual(jumpBottomButton.dataset.scrollMode, "bottom", "at-bottom global navigation slot must remain in bottom mode");
assert.strictEqual(jumpBottomButton.dataset.scrollMessage, "", "inline reply-start navigation must not put a message target on the global slot");

queuedFrame = null;
liveButtonHidden = true;
liveButtonFloating = null;
jumpBottomHidden = true;
jumpBottomButton.disabled = true;
liveButtonStyles.clear();
liveArticleRect = { top: -102, bottom: 518, height: 620, left: 0, right: 390 };
liveConversation.scrollTop = liveConversation.scrollHeight - liveConversation.clientHeight;
context.messageScrollHarness.scheduleMessageScrollButtonVisibility(detachedArticle);
assert.strictEqual(typeof queuedFrame, "function");
queuedFrame();
assert.strictEqual(liveButtonHidden, true, "at-bottom replies must not show the reply-start arrow while the receipt footer is below the bottom safe line");
assert.strictEqual(liveButtonFloating, false, "safe-line-hidden reply-start arrows must not float");
assert.strictEqual(jumpBottomHidden, true, "scroll-bottom state still hides the shared global navigation slot when no reply-start candidate is visible");

console.log("message scroll button visibility harness passed");
