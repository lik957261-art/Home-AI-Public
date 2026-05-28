"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

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
  /button\.style\.setProperty\("position", "fixed"\);[\s\S]*?button\.style\.setProperty\("left", `\$\{Math\.round\(left\)\}px`\);[\s\S]*?button\.style\.setProperty\("top", `\$\{Math\.round\(top\)\}px`\);[\s\S]*?button\.style\.setProperty\("z-index", "38"\);/,
  "floating long-message start arrows must be positioned outside the footer flow"
);

assert.match(
  stylesCss,
  /\.message-scroll-button\.hidden\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/,
  "hidden arrows must remain non-interactive when the message is not eligible"
);

console.log("message scroll button visibility harness passed");
