"use strict";

const assert = require("node:assert/strict");
const {
  escapeHtml,
  renderMarkdownDocument,
  renderMarkdownToHtml,
  markdownFontScaleForBase,
  sanitizeImageSrc,
  sanitizeLinkHref,
} = require("../adapters/markdown-renderer");

function testHtmlEscape() {
  assert.equal(escapeHtml(`<script>"x" & 'y'</script>`), "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");

  const html = renderMarkdownToHtml(`# <img src=x onerror=alert(1)>\n\nRaw <b>html</b>.`);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<b>html</b>"), false);
  assert.equal(html.includes("&lt;img src=x onerror=alert(1)&gt;"), true);
  assert.equal(html.includes("Raw &lt;b&gt;html&lt;/b&gt;."), true);
}

function testLinkSanitize() {
  assert.equal(sanitizeLinkHref("javascript:alert(1)"), "#");
  assert.equal(sanitizeLinkHref(" java\nscript:alert(1)"), "#");
  assert.equal(sanitizeLinkHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(sanitizeLinkHref("/local/path"), "/local/path");

  const html = renderMarkdownToHtml("[safe](https://example.com) [bad](javascript:alert(1))");
  assert.equal(html.includes('<a href="https://example.com">safe</a>'), true);
  assert.equal(html.includes('<a href="#">bad</a>'), true);
  assert.equal(html.includes("javascript:"), false);
}

function testMarkdownImages() {
  assert.equal(sanitizeImageSrc("javascript:alert(1)"), "#");
  assert.equal(sanitizeImageSrc("data:image/png;base64,aaaa"), "#");
  assert.equal(sanitizeImageSrc("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
  assert.equal(sanitizeImageSrc("/api/music/cover.jpg"), "/api/music/cover.jpg");
  assert.equal(sanitizeImageSrc("covers/album.jpg"), "#");
  assert.equal(sanitizeImageSrc("http1280x1280.jpg"), "#");

  const html = renderMarkdownToHtml([
    'Cover: ![Cover <A>](https://example.com/cover.jpg "Album")',
    "",
    "Unsafe: ![Bad](javascript:alert(1))",
    "",
    "`![Code](https://example.com/code.jpg)`",
  ].join("\n"));
  assert.equal(html.includes('class="hermes-markdown-image"'), true);
  assert.equal(html.includes('src="https://example.com/cover.jpg"'), true);
  assert.equal(html.includes('alt="Cover &lt;A&gt;"'), true);
  assert.equal(html.includes('title="Album"'), true);
  assert.equal(html.includes('src="javascript:'), false);
  assert.equal(html.includes('<code>![Code](https://example.com/code.jpg)</code>'), true);
}

function testTable() {
  const html = renderMarkdownToHtml(`
| Name | Count |
| --- | ---: |
| Alpha | **2** |
| Beta | 3 |
`);
  assert.equal(html.includes('class="markdown-table-wrap hermes-markdown-table-wrapper table-wrapper"'), true);
  assert.equal(html.includes('<table class="hermes-markdown-table">'), true);
  assert.equal(html.includes("<th>Name</th>"), true);
  assert.equal(html.includes('<th data-align="right">Count</th>'), true);
  assert.equal(html.includes('<td data-label="Name">Alpha</td>'), true);
  assert.equal(html.includes('<td data-align="right" data-label="Count"><strong>2</strong></td>'), true);
  assert.equal(html.includes("<strong>2</strong>"), true);
}

function testTaskList() {
  const html = renderMarkdownToHtml("- [x] Done\n- [ ] Todo");
  assert.equal(html.includes("hermes-markdown-task-list"), true);
  assert.equal(html.includes("hermes-markdown-task-item"), true);
  assert.equal(html.includes('type="checkbox" disabled checked'), true);
  assert.equal(html.includes('type="checkbox" disabled'), true);
  assert.equal(html.includes("> Todo</li>"), true);
}

function testCodeFence() {
  const html = renderMarkdownToHtml("```js\nconst x = '<tag>';\n```\n\nUse `inline <code>`.");
  assert.equal(html.includes('<pre class="hermes-markdown-code" data-language="js"><code>'), true);
  assert.equal(html.includes("const x = &#39;&lt;tag&gt;&#39;"), true);
  assert.equal(html.includes("<code>inline &lt;code&gt;</code>"), true);
  assert.equal(html.includes("<tag>"), false);
}

function testMobileDocumentWrapperAndFontScale() {
  const html = renderMarkdownDocument("# Title", { fontScale: "large", className: "custom-doc unsafe<script>" });
  assert.equal(html.startsWith('<article class="hermes-markdown-doc hermes-markdown-mobile hermes-markdown-font-large custom-doc unsafescript"'), true);
  assert.equal(html.includes('data-font-scale="large"'), true);
  assert.equal(html.includes("<h1>Title</h1>"), true);

  const fallback = renderMarkdownDocument("Text", { fontScale: "oversized" });
  assert.equal(fallback.includes("hermes-markdown-font-standard"), true);
  assert.equal(fallback.includes('data-font-scale="standard"'), true);

  const defaultReader = renderMarkdownDocument("Text");
  assert.equal(defaultReader.includes("hermes-markdown-font-standard"), true);
  assert.equal(defaultReader.includes('data-font-scale="standard"'), true);
  assert.equal(markdownFontScaleForBase("small"), "small");
  assert.equal(markdownFontScaleForBase("standard"), "standard");
  assert.equal(markdownFontScaleForBase("large"), "large");
  assert.equal(markdownFontScaleForBase("xlarge"), "xlarge");
}

function testCoreBlocks() {
  const html = renderMarkdownToHtml(`
## Heading

Paragraph with **bold**, *italic*, and [relative](./file.md).

> Quote line

1. First
2. Second
`);
  assert.equal(html.includes("<h2>Heading</h2>"), true);
  assert.equal(html.includes("<strong>bold</strong>"), true);
  assert.equal(html.includes("<em>italic</em>"), true);
  assert.equal(html.includes('<a href="./file.md">relative</a>'), true);
  assert.equal(html.includes("<blockquote><p>Quote line</p></blockquote>"), true);
  assert.equal(html.includes('<ol class="hermes-markdown-list">'), true);
}

testHtmlEscape();
testLinkSanitize();
testMarkdownImages();
testTable();
testTaskList();
testCodeFence();
testMobileDocumentWrapperAndFontScale();
testCoreBlocks();

console.log("markdown-renderer tests passed");
