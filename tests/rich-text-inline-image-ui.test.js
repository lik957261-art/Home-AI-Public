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
  localStorage: {
    getItem(key) {
      return key === "hermesWebKey" ? "test-web-key" : "";
    },
  },
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
assert.equal(typeof sandbox.hydrateInlineMarkdownImages, "function");

const bareImage = renderInlineMarkdown("封面：https://cdn.example.com/front.jpg。");
assert.match(bareImage, /<img class="hermes-markdown-image" src="https:\/\/cdn\.example\.com\/front\.jpg"/);
assert.match(bareImage, /loading="lazy" decoding="async">。$/);

const ordinaryUrl = renderInlineMarkdown("下载：https://example.com/file.txt");
assert.doesNotMatch(ordinaryUrl, /hermes-markdown-image/);
assert.match(ordinaryUrl, /https:\/\/example\.com\/file\.txt/);

const codeUrl = renderInlineMarkdown("代码 `https://cdn.example.com/front.jpg`");
assert.doesNotMatch(codeUrl, /hermes-markdown-image/);
assert.match(codeUrl, /<code>https:\/\/cdn\.example\.com\/front\.jpg<\/code>/);

const sameOriginPreview = renderInlineMarkdown("同源 /api/files/preview?mime=image%2Fjpeg&name=cover.jpg&path=%2Fcover.jpg");
assert.match(sameOriginPreview, /src="data:image\/svg\+xml/);
assert.match(sameOriginPreview, /data-hermes-inline-image-src="\/api\/files\?mime=image%2Fjpeg&amp;name=cover\.jpg&amp;path=%2Fcover\.jpg"/);
assert.doesNotMatch(sameOriginPreview, /data-hermes-inline-image-src="\/api\/files\/preview/);

const sameOriginFile = renderInlineMarkdown("同源 /api/files?threadId=t1&path=%2Fcover.jpg");
assert.match(sameOriginFile, /data-hermes-inline-image-src="\/api\/files\?threadId=t1&amp;path=%2Fcover\.jpg"/);
assert.match(sameOriginFile, /data-hermes-inline-image-state="pending"/);

const musicCover = renderInlineMarkdown("封面 ![cover](/api/v1/music/local/covers/album.jpg)");
assert.match(musicCover, /src="data:image\/svg\+xml/);
assert.match(musicCover, /data-hermes-inline-image-src="\/api\/hermes-plugins\/music\/proxy\/api\/v1\/music\/local\/covers\/album\.jpg\?workspaceId=owner"/);
assert.match(musicCover, /data-hermes-inline-image-state="pending"/);

const markdownImage = renderInlineMarkdown("![cover](https://cdn.example.com/cover.png)");
assert.match(markdownImage, /<img class="hermes-markdown-image" src="https:\/\/cdn\.example\.com\/cover\.png" alt="cover"/);

const invalidRelativeImage = renderInlineMarkdown("![bad](http1280x1280.jpg)");
assert.doesNotMatch(invalidRelativeImage, /hermes-markdown-image/);
assert.equal(invalidRelativeImage, "![bad](http1280x1280.jpg)");

async function testHydrateAuthenticatedInlineImage() {
  let fetchInput = null;
  let fetchOptions = null;
  function URLWithBlob(value, base) {
    return new URL(value, base);
  }
  URLWithBlob.createObjectURL = () => "blob:test-cover";
  sandbox.URL = URLWithBlob;
  sandbox.fetch = async (input, options) => {
    fetchInput = input;
    fetchOptions = options;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "image/jpeg" },
      blob: async () => ({ size: 4, type: "image/jpeg" }),
    };
  };
  const image = {
    dataset: {
      hermesInlineImageSrc: "/api/files?threadId=t1&path=%2Fcover.jpg",
      hermesInlineImageState: "pending",
    },
    isConnected: true,
    src: "",
  };
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, "img.hermes-markdown-image[data-hermes-inline-image-src]");
      return [image];
    },
  };
  assert.equal(sandbox.hydrateInlineMarkdownImages(root), 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchInput, "/api/files?threadId=t1&path=%2Fcover.jpg");
  assert.equal(fetchOptions.credentials, "same-origin");
  assert.equal(fetchOptions.headers["X-Hermes-Web-Key"], "test-web-key");
  assert.equal(image.src, "blob:test-cover");
  assert.equal(image.dataset.hermesInlineImageState, "loaded");
}

testHydrateAuthenticatedInlineImage()
  .then(() => {
    console.log("rich text inline image UI tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
