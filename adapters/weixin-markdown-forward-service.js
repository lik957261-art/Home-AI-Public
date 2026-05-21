"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { renderWeixinMarkdownForwardHtml } = require("./markdown-renderer");

const DEFAULT_MARKDOWN_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_PDF_TIMEOUT_MS = 30000;
const DEFAULT_DATA_DIR = path.join(process.cwd(), "workspace", "hermes-web");

function defaultSafeFileName(value) {
  const name = path.basename(String(value || "upload.bin")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return name || "upload.bin";
}

function defaultMimeFor(file) {
  const ext = path.extname(String(file || "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".md" || ext === ".markdown") return "text/markdown; charset=utf-8";
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function markdownMaxBytes(env = process.env) {
  const raw = env.HERMES_MOBILE_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
    || env.HERMES_WEB_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
    || String(DEFAULT_MARKDOWN_MAX_BYTES);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MARKDOWN_MAX_BYTES;
}

function serviceDeps(options = {}) {
  return {
    dataDir: options.dataDir || DEFAULT_DATA_DIR,
    env: options.env || process.env,
    fs: options.fs || fs,
    makeId: typeof options.makeId === "function"
      ? options.makeId
      : ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`),
    maxBytes: Number.isFinite(Number(options.maxBytes)) && Number(options.maxBytes) > 0
      ? Number(options.maxBytes)
      : markdownMaxBytes(options.env || process.env),
    mimeFor: typeof options.mimeFor === "function" ? options.mimeFor : defaultMimeFor,
    normalizeLocalPath: typeof options.normalizeLocalPath === "function"
      ? options.normalizeLocalPath
      : ((rawPath) => String(rawPath || "")),
    nowIso: typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString()),
    path: options.path || path,
    pathToFileURL: typeof options.pathToFileURL === "function" ? options.pathToFileURL : pathToFileURL,
    pdfTimeoutMs: Number.isFinite(Number(options.pdfTimeoutMs)) && Number(options.pdfTimeoutMs) > 0
      ? Number(options.pdfTimeoutMs)
      : DEFAULT_PDF_TIMEOUT_MS,
    renderHtml: typeof options.renderHtml === "function" ? options.renderHtml : renderWeixinMarkdownForwardHtml,
    safeFileName: typeof options.safeFileName === "function" ? options.safeFileName : defaultSafeFileName,
    spawnSync: typeof options.spawnSync === "function" ? options.spawnSync : spawnSync,
  };
}

function isMarkdownForwardFile(file) {
  const name = String(file?.name || file?.displayPath || file?.localPath || "").toLowerCase();
  const mime = String(file?.mime || "").toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown") || mime.includes("markdown");
}

function weixinMarkdownForwardDir(workspaceId, options = {}) {
  const deps = serviceDeps(options);
  const dir = deps.path.join(
    deps.dataDir,
    "artifacts",
    "weixin-forward",
    deps.safeFileName(workspaceId || "owner"),
    "markdown",
  );
  deps.fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function chromiumExecutableCandidates(env = process.env) {
  return [
    env.HERMES_MOBILE_WEIXIN_MARKDOWN_PDF_BROWSER,
    env.HERMES_WEB_WEIXIN_MARKDOWN_PDF_BROWSER,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "msedge.exe",
    "chrome.exe",
    "chromium",
    "google-chrome",
  ].filter(Boolean);
}

function findFirstExistingFile(paths, options = {}) {
  const deps = serviceDeps(options);
  for (const candidate of paths || []) {
    if (!candidate) continue;
    try {
      if (deps.fs.existsSync(candidate)) return candidate;
    } catch (_) {
      // Ignore inaccessible candidate paths.
    }
  }
  return "";
}

function existingFileStat(filePath, deps) {
  if (!filePath || !deps.fs.existsSync(filePath)) return null;
  const stat = deps.fs.statSync(filePath);
  return stat.isFile() ? stat : null;
}

function markdownForwardStem(title, source, deps) {
  return deps.path.parse(deps.safeFileName(title || source)).name || "markdown";
}

function renderMarkdownForwardPdf(markdownPath, workspaceId, title, options = {}) {
  const deps = serviceDeps(options);
  const source = deps.normalizeLocalPath(markdownPath);
  const stat = existingFileStat(source, deps);
  if (!stat || stat.size > deps.maxBytes) return null;

  const markdown = deps.fs.readFileSync(source, "utf8");
  const dir = weixinMarkdownForwardDir(workspaceId, options);
  const stem = markdownForwardStem(title, source, deps);
  const id = `${Date.now()}-${deps.makeId("md")}`;
  const htmlPath = deps.path.join(dir, `${id}-${stem}.html`);
  const pdfPath = deps.path.join(dir, `${id}-${stem}.pdf`);
  deps.fs.writeFileSync(htmlPath, deps.renderHtml(stem, source, markdown), "utf8");

  const candidates = chromiumExecutableCandidates(deps.env);
  const browser = findFirstExistingFile(candidates, options)
    || candidates.find((candidate) => !deps.path.isAbsolute(candidate));
  if (!browser) return null;

  const result = deps.spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--print-to-pdf=${pdfPath}`,
    deps.pathToFileURL(htmlPath).href,
  ], {
    windowsHide: true,
    timeout: deps.pdfTimeoutMs,
    stdio: "ignore",
  });
  if (result?.error || result?.status !== 0) return null;
  const pdfStat = existingFileStat(pdfPath, deps);
  if (!pdfStat || pdfStat.size < 500) return null;
  return pdfPath;
}

function materializeMarkdownForwardText(markdownPath, workspaceId, title, options = {}) {
  const deps = serviceDeps(options);
  const source = deps.normalizeLocalPath(markdownPath);
  const stat = existingFileStat(source, deps);
  if (!stat || stat.size > Math.max(1024, deps.maxBytes)) return null;

  const dir = weixinMarkdownForwardDir(workspaceId, options);
  const stem = markdownForwardStem(title, source, deps);
  const outPath = deps.path.join(dir, `${Date.now()}-${deps.makeId("md")}-${stem}.txt`);
  deps.fs.writeFileSync(outPath, deps.fs.readFileSync(source, "utf8"), "utf8");
  return outPath;
}

function materializeWeixinForwardFile(file, workspaceId, options = {}) {
  if (!isMarkdownForwardFile(file)) return file;
  const deps = serviceDeps(options);
  const source = deps.normalizeLocalPath(file?.localPath || "");
  const name = deps.safeFileName(file?.name || deps.path.basename(source || "markdown.md"));
  const pdfPath = renderMarkdownForwardPdf(source, workspaceId, name, options);
  const outPath = pdfPath || materializeMarkdownForwardText(source, workspaceId, name, options);
  if (!outPath) return file;
  const stat = deps.fs.statSync(outPath);
  return Object.assign({}, file, {
    localPath: outPath,
    displayPath: outPath,
    name: `${deps.path.parse(name).name || "markdown"}${deps.path.extname(outPath).toLowerCase()}`,
    mime: deps.mimeFor(outPath),
    size: stat.size,
    updatedAt: deps.nowIso(),
    sourceMarkdownPath: source,
  });
}

module.exports = {
  chromiumExecutableCandidates,
  findFirstExistingFile,
  isMarkdownForwardFile,
  materializeMarkdownForwardText,
  materializeWeixinForwardFile,
  renderMarkdownForwardPdf,
  weixinMarkdownForwardDir,
};
