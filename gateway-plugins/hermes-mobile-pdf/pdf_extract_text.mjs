import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function loadPdfjs() {
  const candidates = [
    process.env.HERMES_MOBILE_PDFJS_MODULE,
    process.env.HERMES_MOBILE_PDFJS_DIST_PATH,
    process.env.HERMES_MOBILE_NODE_MODULES
      ? path.join(process.env.HERMES_MOBILE_NODE_MODULES, "pdfjs-dist/legacy/build/pdf.mjs")
      : "",
    process.env.HERMES_MOBILE_APP_ROOT
      ? path.join(process.env.HERMES_MOBILE_APP_ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")
      : "",
    process.env.HERMES_MOBILE_ROOT
      ? path.join(process.env.HERMES_MOBILE_ROOT, "app/node_modules/pdfjs-dist/legacy/build/pdf.mjs")
      : "",
    path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    "/Users/hermes-host/HermesMobile/app/node_modules/pdfjs-dist/legacy/build/pdf.mjs",
    "/Users/hermes-dev/HermesMobileDev/app/node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) return import(pathToFileURL(candidate).href);
  }
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

async function main() {
  const input = JSON.parse(await readStdin() || "{}");
  const filePath = String(input.file_path || "");
  const maxPages = boundedInteger(input.max_pages, 80, 1, 500);
  const maxChars = boundedInteger(input.max_chars, 50000, 1000, 200000);
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const pagesToRead = Math.min(pageCount, maxPages);
  const pageSummaries = [];
  const chunks = [];
  let totalChars = 0;

  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent({ includeMarkedContent: false });
    const text = textContent.items
      .map((item) => typeof item.str === "string" ? item.str : "")
      .filter(Boolean)
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) chunks.push(`Page ${pageNumber}\n${text}`);
    totalChars += text.length;
    pageSummaries.push({ page: pageNumber, chars: text.length });
  }

  const fullText = chunks.join("\n\n").trim();
  const textPreview = fullText.slice(0, maxChars);
  const output = {
    ok: true,
    source: "pdfjs",
    pageCount,
    pagesRead: pagesToRead,
    hasTextLayer: totalChars > 0,
    textChars: fullText.length,
    truncated: fullText.length > maxChars,
    text: textPreview,
    textPreview,
    pages: pageSummaries,
  };
  await document.destroy();
  process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: error && (error.message || String(error)) || "pdf_extract_text_failed",
  }));
  process.exit(0);
});
