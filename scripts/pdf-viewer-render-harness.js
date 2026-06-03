"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const publicRoot = path.resolve(process.env.HERMES_PDF_VIEWER_PUBLIC_ROOT || path.join(repoRoot, "public"));

function makeSamplePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 180] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 42 >>\nstream\nBT /F1 20 Tf 48 96 Td (PDF OK) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(body, "binary");
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "binary");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "binary");
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function createServer() {
  const samplePdf = makeSamplePdf();
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/sample.pdf") {
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": samplePdf.length });
      res.end(samplePdf);
      return;
    }
    const normalizedPath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^[/\\]+/, "");
    const filePath = path.join(publicRoot, normalizedPath || "pdf-viewer.html");
    if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const url = `http://127.0.0.1:${port}/pdf-viewer.html?src=/sample.pdf&embed=1&name=sample.pdf`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.pdfStatus === "rendered", null, { timeout: 15000 });
    const result = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas[data-pdf-page]"));
      const first = canvases[0] || null;
      return {
        status: document.documentElement.dataset.pdfStatus || "",
        renderedPages: Number(document.documentElement.dataset.pdfRenderedPages || "0"),
        canvasCount: canvases.length,
        firstCanvasWidth: first?.width || 0,
        firstCanvasHeight: first?.height || 0,
        fallbackVisible: !document.getElementById("fallback")?.classList.contains("hidden"),
      };
    });
    if (result.status !== "rendered" || result.renderedPages < 1 || result.canvasCount < 1) {
      throw new Error(`PDF did not render: ${JSON.stringify(result)}`);
    }
    if (result.firstCanvasWidth <= 0 || result.firstCanvasHeight <= 0 || result.fallbackVisible) {
      throw new Error(`PDF rendered with invalid canvas/fallback state: ${JSON.stringify(result)}`);
    }
    console.log(`pdf-viewer-render ok ${JSON.stringify(result)}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
