"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/document-preview/markdown-renderer-model.mjs");
const source = fs.readFileSync(modelPath, "utf8");
const serverRenderer = require("../adapters/markdown-renderer");

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await import(`file://${modelPath}`);

  await test("markdown renderer model stays browser-boundary free", () => {
    assert.equal(model.MARKDOWN_RENDERER_MODEL_VERSION, "20260705-vite-markdown-renderer-model-v1");
    assert.doesNotMatch(source, /(?:^|[^\w-])window(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /(?:^|[^\w-])document(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bFileReader\b|\bBlob\b|createObjectURL|revokeObjectURL/);
  });

  await test("core markdown output matches existing server renderer defaults", () => {
    const markdown = [
      "# Title",
      "",
      'Paragraph with **bold**, `code`, [link](https://example.com), and ![Cover](https://example.com/cover.jpg "Album").',
      "",
      "| Name | Count |",
      "| --- | ---: |",
      "| Alpha | **2** |",
      "",
      "- [x] Done",
      "- [ ] Todo",
      "",
      "```js",
      "const x = '<tag>';",
      "```",
    ].join("\n");
    assert.equal(
      model.renderMarkdownDocument(markdown, { fontScale: "large" }),
      serverRenderer.renderMarkdownDocument(markdown, { fontScale: "large" }),
    );
  });

  await test("browser compatibility options remain deterministic", () => {
    const html = model.renderMarkdownDocument("- [x] Done\n\n[bad](javascript:alert(1))\n\n![Cover](/api/music/cover.jpg)", {
      fontScale: "large",
      taskListCompatibility: true,
      className: "custom unsafe<script>",
    });
    assert.match(html, /class="hermes-markdown-doc hermes-markdown-mobile hermes-markdown-font-large custom unsafescript"/);
    assert.match(html, /class="hermes-markdown-list task-list hermes-markdown-task-list"/);
    assert.match(html, /class="task-list-item hermes-markdown-task-item"/);
    assert.match(html, /<a href="#">bad<\/a>/);
    assert.doesNotMatch(html, /javascript:/);
    assert.match(html, /<img class="hermes-markdown-image" src="\/api\/music\/cover\.jpg" alt="Cover" loading="lazy" decoding="async">/);
  });

  await test("escaped newline markdown reports render as structured markdown", () => {
    const escaped = "\\n\\n#### 1. owner / 徐欣\\n\\n- 线程: Single Window\\n- 消息量: 14 条\\n\\n#### 核心话题\\n\\n1. **年度消费与预算约束**\\n - 用户明确预算。";
    assert.equal(model.shouldDecodeEscapedMarkdownNewlines(escaped), true);
    const normalized = model.normalizeMarkdownInput(escaped);
    assert.match(normalized, /^\n\n#### 1\. owner/);
    assert.doesNotMatch(model.renderMarkdownToHtml(escaped), /\\n/);
    assert.match(model.renderMarkdownToHtml(escaped), /<h4>1\. owner \/ 徐欣<\/h4>/);
    assert.match(model.renderMarkdownToHtml(escaped), /<li>线程: Single Window<\/li>/);
    assert.match(model.renderMarkdownToHtml(escaped), /<strong>年度消费与预算约束<\/strong>/);
  });

  await test("ordinary literal newline tokens are preserved when not document-shaped", () => {
    const html = model.renderMarkdownToHtml("Use `\\n` when documenting an escaped newline token.");
    assert.match(html, /<code>\\n<\/code>/);
  });

  await test("exported helpers cover table, inline, class, and sanitizer plans", () => {
    assert.equal(model.escapeAttribute("`<x>`"), "&#96;&lt;x&gt;&#96;");
    assert.deepEqual(model.safeClassNames("ok bad<script> also_ok"), ["ok", "badscript", "also_ok"]);
    assert.equal(model.sanitizeLinkHref("java\nscript:alert(1)"), "#");
    assert.equal(model.sanitizeLinkHref("./local.md"), "./local.md");
    assert.equal(model.sanitizeImageSrc("data:image/png;base64,x"), "#");
    assert.equal(model.sanitizeImageSrc("https://example.com/image.png"), "https://example.com/image.png");
    assert.equal(model.markdownFontScaleForBase("xlarge"), "xlarge");
    assert.equal(model.markdownFontScaleClass("bad"), "hermes-markdown-font-standard");
    assert.equal(model.isListLine("- item"), true);
    assert.equal(model.isTableStart(["| A | B |", "| --- | --- |"], 0), true);
    assert.deepEqual(model.splitTableRow("| A | B |"), ["A", "B"]);
    assert.match(model.renderInline("**bold** _em_ `code`"), /<strong>bold<\/strong>/);
    assert.match(model.renderInline("**bold** _em_ `code`"), /<em>em<\/em>/);
    assert.match(model.tableCell("td", "value", "right", {}, "Label"), /data-align="right" data-label="Label"/);
  });

  await test("code fence and table compatibility options are preserved", () => {
    const noLanguage = model.renderMarkdownToHtml("```js\nconst x = 1;\n```", {
      codeFenceLanguage: false,
    });
    assert.doesNotMatch(noLanguage, /data-language=/);
    const noLabels = model.renderMarkdownToHtml("| A |\n| --- |\n| B |", {
      tableLabels: false,
    });
    assert.doesNotMatch(noLabels, /data-label=/);
    const target = model.renderInline("[site](https://example.com)", {
      linkTarget: "_blank",
    });
    assert.equal(target, '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>');
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
