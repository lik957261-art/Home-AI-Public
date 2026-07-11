"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

const navMatch = indexHtml.match(/<nav id="bottomNav"[\s\S]*?<\/nav>/);
assert.ok(navMatch, "bottom nav markup should exist in public/index.html");

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const SCENARIOS = [
  {
    name: "seven-tabs-with-codex-music-workspace",
    visibleIds: [
      "bottomChatMode",
      "bottomInboxMode",
      "bottomWorkspaceMode",
      "bottomTasksMode",
      "bottomCodexMode",
      "bottomMusicMode",
      "bottomMovieMode",
    ],
    requiredLabels: ["工作区", "Codex", "音乐"],
  },
  {
    name: "non-owner-six-tabs-without-workspace",
    visibleIds: [
      "bottomChatMode",
      "bottomInboxMode",
      "bottomTasksMode",
      "bottomCodexMode",
      "bottomMusicMode",
      "bottomMovieMode",
    ],
    requiredLabels: ["Codex", "音乐"],
    forbiddenLabels: ["工作区"],
  },
  {
    name: "eight-tabs-defensive-capacity",
    visibleIds: [
      "bottomChatMode",
      "bottomInboxMode",
      "bottomWorkspaceMode",
      "bottomTasksMode",
      "bottomCodexMode",
      "bottomHealthMode",
      "bottomMusicMode",
      "bottomMovieMode",
    ],
    requiredLabels: ["工作区", "Codex", "音乐"],
  },
];

function shellHtml() {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${stylesCss}</style>
  <style>
    body { margin: 0; min-height: 100vh; }
    .app { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="app" class="app">
    ${navMatch[0]}
  </div>
</body>
</html>`;
}

async function measureScenario(page, scenario) {
  return page.evaluate(({ visibleIds }) => {
    const nav = document.getElementById("bottomNav");
    const visible = new Set(visibleIds);
    Array.from(nav.querySelectorAll(".bottom-tab")).forEach((button) => {
      const show = visible.has(button.id);
      button.hidden = !show;
      button.setAttribute("aria-hidden", show ? "false" : "true");
    });
    const visibleTabs = Array.from(nav.querySelectorAll(".bottom-tab"))
      .filter((button) => !button.hidden && button.getAttribute("aria-hidden") !== "true");
    for (let index = 1; index <= 8; index += 1) {
      nav.classList.toggle(`bottom-nav-count-${index}`, visibleTabs.length === index);
    }

    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        bottom: Math.round(rect.bottom * 100) / 100,
        left: Math.round(rect.left * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    };
    const navRect = rectOf(nav);
    const tabs = visibleTabs.map((button) => {
      const label = button.querySelector(".bottom-tab-label");
      const labelRect = rectOf(label);
      const tabRect = rectOf(button);
      const labelStyle = window.getComputedStyle(label);
      return {
        id: button.id,
        text: label.textContent.trim(),
        tabRect,
        labelRect,
        labelClientRectCount: label.getClientRects().length,
        labelWhiteSpace: labelStyle.whiteSpace,
        labelOverflow: labelStyle.overflow,
      };
    });
    const oneRow = tabs.every((tab) => Math.abs(tab.tabRect.top - tabs[0].tabRect.top) <= 1);
    const labelsInsideNav = tabs.every((tab) => (
      tab.labelRect.left >= navRect.left - 1
      && tab.labelRect.right <= navRect.right + 1
      && tab.labelRect.top >= navRect.top - 1
      && tab.labelRect.bottom <= navRect.bottom + 1
      && tab.labelRect.width >= 8
      && tab.labelRect.height >= 8
    ));
    const labelsNoWrap = tabs.every((tab) => (
      tab.labelWhiteSpace === "nowrap"
      && tab.labelClientRectCount === 1
      && tab.labelRect.height <= 14
    ));
    let labelOverlap = false;
    for (let a = 0; a < tabs.length; a += 1) {
      for (let b = a + 1; b < tabs.length; b += 1) {
        const ar = tabs[a].labelRect;
        const br = tabs[b].labelRect;
        const separated = ar.right <= br.left || br.right <= ar.left || ar.bottom <= br.top || br.bottom <= ar.top;
        if (!separated) labelOverlap = true;
      }
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visibleCount: tabs.length,
      navRect,
      tabs,
      oneRow,
      labelsInsideNav,
      labelsNoWrap,
      labelOverlap,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  }, { visibleIds: scenario.visibleIds });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  try {
    const results = [];
    for (const viewport of VIEWPORTS) {
      for (const scenario of SCENARIOS) {
        const page = await browser.newPage({
          viewport,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });
        await page.setContent(shellHtml(), { waitUntil: "load" });
        const metrics = await measureScenario(page, scenario);
        await page.close();

        for (const label of scenario.requiredLabels) {
          assert.ok(metrics.tabs.some((tab) => tab.text === label), `${scenario.name} ${viewport.width} should include ${label}`);
        }
        for (const label of scenario.forbiddenLabels || []) {
          assert.equal(metrics.tabs.some((tab) => tab.text === label), false, `${scenario.name} ${viewport.width} should hide ${label}`);
        }
        assert.equal(metrics.visibleCount, scenario.visibleIds.length, `${scenario.name} ${viewport.width} visible tab count`);
        assert.equal(metrics.oneRow, true, `${scenario.name} ${viewport.width} bottom tabs should stay on one row`);
        assert.equal(metrics.labelsInsideNav, true, `${scenario.name} ${viewport.width} labels should stay inside nav`);
        assert.equal(metrics.labelsNoWrap, true, `${scenario.name} ${viewport.width} labels should not wrap`);
        assert.equal(metrics.labelOverlap, false, `${scenario.name} ${viewport.width} labels should not overlap`);
        assert.equal(metrics.horizontalOverflow, false, `${scenario.name} ${viewport.width} should not create horizontal overflow`);
        results.push({
          scenario: scenario.name,
          viewport,
          visibleCount: metrics.visibleCount,
          navRect: metrics.navRect,
          labels: metrics.tabs.map((tab) => ({ id: tab.id, text: tab.text, rect: tab.labelRect })),
        });
      }
    }
    console.log(JSON.stringify({ ok: true, checked: results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
