"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const appMessageActionsUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-message-actions-ui.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const appThreadCardMessageUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-thread-card-message-ui.js"), "utf8");

assert.match(
  appMessageActionsUiJs,
  /function handleConversationScrollState\(\) \{\s*scheduleMessageScrollButtonVisibility\(\$\("conversation"\)\);/,
  "message scroll buttons must be recalculated during ordinary conversation scrolls"
);

assert.match(
  appMessageActionsUiJs,
  /function messageScrollCanReturnToStart\(articleRect, conversationRect\) \{[\s\S]*?startPassed[\s\S]*?stillInsideMessage/,
  "visible historical long messages must detect when their start is above the viewport"
);

assert.match(
  appMessageActionsUiJs,
  /const shouldFloatStart = shouldShow && canReturnToStart && !footerVisible;/,
  "the start arrow should float only when the reply start has passed and the footer is not already visible"
);

assert.match(
  appMessageActionsUiJs,
  /button\.classList\.toggle\("floating", shouldFloat\);[\s\S]*?positionFloatingMessageScrollButton\(button, shouldFloat, articleRect, conversationRect\);/,
  "the same start arrow should be restored as a floating control for visible historical long messages"
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
  /const footerVisible = messageScrollFooterVisible\(articleRect, conversationRect\);[\s\S]*?const shouldFloatStart = shouldShow && canReturnToStart && !footerVisible;/,
  "the footer up arrow must stay beside Usage when the reply footer is already visible"
);

assert.match(
  appMessageActionsUiJs,
  /function wireMessageScrollButtons\(root\) \{[\s\S]*?applyMessageScrollButtonVisibility\(root\);[\s\S]*?\}/,
  "message scroll arrows must be recalculated immediately after binding instead of waiting only for a later async pass"
);

assert.match(
  appMessageActionsUiJs,
  /button\.style\.setProperty\("position", "fixed"\);[\s\S]*?button\.style\.setProperty\("left", `\$\{Math\.round\(left\)\}px`\);[\s\S]*?button\.style\.setProperty\("top", `\$\{Math\.round\(top\)\}px`\);[\s\S]*?button\.style\.setProperty\("z-index", "38"\);/,
  "floating long-message start arrows must be positioned outside the footer flow"
);

assert.match(
  stylesCss,
  /\.message-scroll-button\.hidden\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/,
  "hidden arrows must remain non-interactive when the message is not eligible"
);

let queuedFrame = null;
let liveButtonHidden = true;
let liveButtonFloating = null;
const jumpBottomButton = {
  classList: { toggle() {} },
  setAttribute() {},
};
const liveButton = {
  dataset: { scrollPosition: "start" },
  classList: {
    toggle(name, hidden) {
      if (name === "hidden") liveButtonHidden = Boolean(hidden);
      if (name === "floating") liveButtonFloating = Boolean(hidden);
    },
  },
  style: { setProperty() {}, removeProperty() {} },
  setAttribute() {},
  tabIndex: -1,
};
const liveArticle = {
  dataset: {},
  offsetHeight: 620,
  scrollHeight: 620,
  matches() { return true; },
  getBoundingClientRect() { return { top: -260, bottom: 360, height: 620, left: 0, right: 390 }; },
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
  getBoundingClientRect() { return { top: 0, bottom: 520, left: 0, right: 390 }; },
  querySelectorAll(selector) {
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
  state: { messageScrollVisibilityScheduled: false, messageScrollVisibilityRoot: null },
  window: { innerWidth: 390, visualViewport: null },
  requestAnimationFrame(fn) { queuedFrame = fn; },
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
globalThis.messageScrollHarness = { scheduleMessageScrollButtonVisibility };`, context);
context.messageScrollHarness.scheduleMessageScrollButtonVisibility(detachedArticle);
assert.strictEqual(typeof queuedFrame, "function");
queuedFrame();
assert.strictEqual(liveButtonHidden, false, "detached queued message nodes must fall back to the live conversation and reveal one-screen-overflow long-reply arrows");
assert.strictEqual(liveButtonFloating, false, "the reply-end up arrow must remain inline beside the footer controls when the reply footer is visible");

console.log("message scroll button visibility harness passed");
