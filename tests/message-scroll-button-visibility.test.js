"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const appMessageActionsUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-message-actions-ui.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

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
  /const shouldFloatStart = shouldShow && messageScrollCanReturnToStart\(articleRect, conversationRect\);/,
  "the start arrow should float only after the long message is eligible for normal scroll controls"
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
  /function scheduleMessageScrollButtonVisibilitySettle\(root, delays = \[100, 280\]\) \{[\s\S]*?window\.setTimeout\(\(\) => applyMessageScrollButtonVisibility\(target\), Math\.max\(0, delay\)\);/,
  "terminal long replies need delayed arrow settling after final markdown/layout replacement"
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
const jumpBottomButton = {
  classList: { toggle() {} },
  setAttribute() {},
};
const liveButton = {
  dataset: { scrollPosition: "start" },
  classList: {
    toggle(name, hidden) {
      if (name === "hidden") liveButtonHidden = Boolean(hidden);
    },
  },
  style: { setProperty() {}, removeProperty() {} },
  setAttribute() {},
  tabIndex: -1,
};
const liveArticle = {
  dataset: {},
  offsetHeight: 900,
  matches() { return true; },
  getBoundingClientRect() { return { top: 0, bottom: 900, left: 0, right: 390 }; },
  querySelector(selector) {
    if (selector === ".run-progress-panel.inline:not(.terminal)") return null;
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
assert.strictEqual(liveButtonHidden, false, "detached queued message nodes must fall back to the live conversation and reveal eligible long-reply arrows");

console.log("message scroll button visibility harness passed");
