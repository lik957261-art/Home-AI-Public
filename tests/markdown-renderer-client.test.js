"use strict";

const assert = require("node:assert/strict");
const clientRenderer = require("../public/markdown-renderer-client");
const serverRenderer = require("../adapters/markdown-renderer");

function testClientMatchesSharedServerCoreOutput() {
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
    clientRenderer.renderMarkdownDocument(markdown, { fontScale: "large" }),
    serverRenderer.renderMarkdownDocument(markdown, { fontScale: "large" }),
  );
}

function testClientBrowserAndFileViewerOptions() {
  const html = clientRenderer.renderMarkdownDocument("- [x] Done\n\n[bad](javascript:alert(1))\n\n![Cover](/api/music/cover.jpg)", {
    fontScale: "large",
    taskListCompatibility: true,
  });
  assert.equal(html.includes('class="hermes-markdown-doc hermes-markdown-mobile hermes-markdown-font-large"'), true);
  assert.equal(html.includes('class="hermes-markdown-list task-list hermes-markdown-task-list"'), true);
  assert.equal(html.includes('class="task-list-item hermes-markdown-task-item"'), true);
  assert.equal(html.includes('target="_blank"'), false);
  assert.equal(html.includes('<a href="#">bad</a>'), true);
  assert.equal(html.includes("javascript:"), false);
  assert.equal(html.includes('<img class="hermes-markdown-image" src="/api/music/cover.jpg" alt="Cover" loading="lazy" decoding="async">'), true);
}

function testExports() {
  assert.equal(typeof clientRenderer.escapeHtml, "function");
  assert.equal(typeof clientRenderer.markdownFontScaleForBase, "function");
  assert.equal(typeof clientRenderer.markdownFontScaleClass, "function");
  assert.equal(typeof clientRenderer.renderMarkdownDocument, "function");
  assert.equal(typeof clientRenderer.renderMarkdownToHtml, "function");
  assert.equal(typeof clientRenderer.sanitizeImageSrc, "function");
  assert.equal(typeof clientRenderer.sanitizeLinkHref, "function");
  assert.equal(clientRenderer.markdownFontScaleForBase("standard"), "standard");
  assert.equal(clientRenderer.markdownFontScaleForBase("large"), "large");
  assert.equal(clientRenderer.sanitizeImageSrc("data:image/png;base64,aaaa"), "#");
  assert.equal(clientRenderer.sanitizeImageSrc("http1280x1280.jpg"), "#");
  assert.equal(clientRenderer.sanitizeLinkHref("data:text/html,x"), "#");
}

testClientMatchesSharedServerCoreOutput();
testClientBrowserAndFileViewerOptions();
testExports();

console.log("markdown-renderer-client tests passed");
