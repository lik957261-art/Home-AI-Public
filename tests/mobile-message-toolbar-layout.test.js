"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

const stylesCss = read("public/styles.css");
const usageUi = read("public/app-message-usage-ui.js");
const skillUi = read("public/app-message-skill-ui.js");
const runProgressUi = read("public/app-run-progress-ui.js");

assert.match(
  stylesCss,
  /@media \(max-width: 520px\)[\s\S]*?\.message-footer-meta\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?gap:\s*4px;[\s\S]*?\}/,
  "mobile message footer metadata must stay on one row",
);

assert.match(
  stylesCss,
  /@media \(max-width: 520px\)[\s\S]*?\.message-footer-row \.usage summary,[\s\S]*?\.message-footer-row \.run-progress-history summary\s*\{[\s\S]*?width:\s*24px;[\s\S]*?min-width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?min-height:\s*24px;[\s\S]*?padding:\s*0;/,
  "mobile message footer summaries must have stable compact icon dimensions",
);

assert.match(
  stylesCss,
  /@media \(max-width: 520px\)[\s\S]*?\.message-footer-row \.message-footer-summary-label\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*1px;[\s\S]*?height:\s*1px;[\s\S]*?clip:\s*rect\(0 0 0 0\);/,
  "mobile message footer labels must be visually hidden without removing accessible names",
);

assert.match(usageUi, /message-footer-summary-icon message-line-icon/);
assert.match(usageUi, /<span class="message-footer-summary-label">Usage<\/span>/);
assert.match(usageUi, /aria-label="Usage: \$\{formatTokenCount\(total\)\} tokens"/);

assert.match(skillUi, /message-footer-summary-icon message-line-icon/);
assert.match(skillUi, /<span class="message-footer-summary-label">\$\{escapeHtml\(summary\)\}<\/span>/);
assert.match(skillUi, /<summary aria-label="\$\{escapeHtml\(label\)\}">/);

assert.match(runProgressUi, /message-footer-summary-icon message-line-icon/);
assert.match(runProgressUi, /<span class="message-footer-summary-label">\\u6a21\\u578b\\u72b6\\u6001<\/span>/);
assert.match(runProgressUi, /<summary aria-label="\$\{escapeHtml\(title\)\}">/);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${stylesCss}</style>
          <style>
            body { margin: 0; padding: 16px; background: #fff; }
            .fixture { width: 358px; }
          </style>
        </head>
        <body>
          <div class="fixture">
            <div class="message-footer-row" data-testid="footer">
              <span class="message-action-strip">
                <button class="message-mini-action-button" type="button" aria-label="Jump"><svg class="message-line-icon" viewBox="0 0 24 24"><path d="M12 19V5"></path></svg></button>
                <button class="message-mini-action-button" type="button" aria-label="Copy"><svg class="message-line-icon" viewBox="0 0 24 24"><path d="M8 8h9v9"></path></svg></button>
                <button class="message-mini-action-button" type="button" aria-label="Share"><svg class="message-line-icon" viewBox="0 0 24 24"><path d="M12 4v12"></path></svg></button>
                <button class="message-mini-action-button" type="button" aria-label="保存到 Note"><svg class="message-line-icon" viewBox="0 0 24 24"><path d="M7 3h10v18l-5-3-5 3Z"></path></svg></button>
              </span>
              <div class="message-footer-meta">
                <details class="usage"><summary aria-label="Usage: 120 tokens"><svg class="message-footer-summary-icon message-line-icon" viewBox="0 0 24 24"><path d="M4 19h16"></path></svg><span class="message-footer-summary-label">Usage</span></summary></details>
                <button class="message-wardrobe-action" type="button" aria-label="保存到衣橱"><svg class="message-line-icon" viewBox="0 0 24 24"><path d="M8 7.5 12 4l4 3.5"></path></svg></button>
                <details class="message-skills"><summary aria-label="1 skill, 1 tool"><svg class="message-footer-summary-icon message-line-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle></svg><span class="message-footer-summary-label">Skill · Tool</span></summary></details>
                <details class="run-progress-history"><summary aria-label="模型状态: 完成"><svg class="message-footer-summary-icon message-line-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle></svg><span class="message-footer-summary-label">模型状态</span></summary></details>
              </div>
            </div>
          </div>
        </body>
      </html>`);
    const metrics = await page.evaluate(() => {
      const footer = document.querySelector("[data-testid='footer']").getBoundingClientRect();
      const items = Array.from(document.querySelectorAll(".message-action-strip, .message-footer-meta > *"))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, right: rect.right };
        });
      return { footer: { height: footer.height, right: footer.right }, items };
    });
    assert.ok(metrics.footer.height <= 36, `mobile toolbar should fit one row, got height ${metrics.footer.height}`);
    assert.ok(
      metrics.items.every((item) => item.right <= metrics.footer.right + 0.5),
      "mobile toolbar items must not overflow the message footer width",
    );
  } finally {
    await browser.close();
  }
  console.log("mobile message toolbar layout harness passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
