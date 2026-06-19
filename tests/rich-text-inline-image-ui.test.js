"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-rich-text-directory-ui.js"), "utf8");

const sandbox = {
  URL,
  location: { origin: "http://127.0.0.1:8797" },
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "app-rich-text-directory-ui.js" });

const renderInlineMarkdown = sandbox.renderInlineMarkdown;
assert.equal(typeof renderInlineMarkdown, "function");

const bareImage = renderInlineMarkdown("封面：https://cdn.example.com/front.jpg。");
assert.match(bareImage, /<img class="hermes-markdown-image" src="https:\/\/cdn\.example\.com\/front\.jpg"/);
assert.match(bareImage, /loading="lazy" decoding="async">。$/);

const ordinaryUrl = renderInlineMarkdown("下载：https://example.com/file.txt");
assert.doesNotMatch(ordinaryUrl, /hermes-markdown-image/);
assert.match(ordinaryUrl, /https:\/\/example\.com\/file\.txt/);

const codeUrl = renderInlineMarkdown("代码 `https://cdn.example.com/front.jpg`");
assert.doesNotMatch(codeUrl, /hermes-markdown-image/);
assert.match(codeUrl, /<code>https:\/\/cdn\.example\.com\/front\.jpg<\/code>/);

const sameOriginPreview = renderInlineMarkdown("同源 /api/files/preview?mime=image%2Fjpeg&name=cover");
assert.match(sameOriginPreview, /<img class="hermes-markdown-image" src="\/api\/files\/preview\?mime=image%2Fjpeg&amp;name=cover"/);

const markdownImage = renderInlineMarkdown("![cover](https://cdn.example.com/cover.png)");
assert.match(markdownImage, /<img class="hermes-markdown-image" src="https:\/\/cdn\.example\.com\/cover\.png" alt="cover"/);

console.log("rich text inline image UI tests passed");
