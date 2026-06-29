"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-pdf", "__init__.py");

function runPython(script, env = {}) {
  return execFileSync("python", ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-pdf-plugin-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testExtractsTextAndRendersPages() {
  withTempRoot((root) => {
    const pdfPath = path.join(root, "school-report.pdf");
    const outputDir = path.join(root, "rendered");
    const script = `
import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_pdf", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
pdf_path = Path(${JSON.stringify(pdfPath)})
output_dir = Path(${JSON.stringify(outputDir)})
objects = []
def add(value):
    objects.append(value)
c1 = "BT /F1 16 Tf 40 90 Td (Page One PDF Tool Smoke) Tj ET"
c2 = "BT /F1 16 Tf 40 90 Td (Page Two PDF Tool Smoke) Tj ET"
add("<< /Type /Catalog /Pages 2 0 R >>")
add("<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>")
add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>")
add(f"<< /Length {len(c1)} >>\\nstream\\n{c1}\\nendstream")
add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>")
add(f"<< /Length {len(c2)} >>\\nstream\\n{c2}\\nendstream")
add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
pdf = "%PDF-1.4\\n"
offsets = [0]
for index, obj in enumerate(objects, start=1):
    offsets.append(len(pdf.encode("utf-8")))
    pdf += f"{index} 0 obj\\n{obj}\\nendobj\\n"
xref = len(pdf.encode("utf-8"))
pdf += f"xref\\n0 {len(objects) + 1}\\n0000000000 65535 f \\n"
for offset in offsets[1:]:
    pdf += f"{offset:010d} 00000 n \\n"
pdf += f"trailer<< /Size {len(objects) + 1} /Root 1 0 R >>\\nstartxref\\n{xref}\\n%%EOF\\n"
pdf_path.write_text(pdf, encoding="utf-8")
extracted = json.loads(module._pdf_extract_text_handler({"file_path": str(pdf_path), "max_pages": 2, "max_chars": 5000}))
rendered = json.loads(module._pdf_render_pages_handler({"file_path": str(pdf_path), "output_dir": str(output_dir), "max_pages": 2, "scale": 1.0}))
print(json.dumps({"extracted": extracted, "rendered": rendered}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PDF_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PDF_OUTPUT_ROOTS: root,
      HERMES_MOBILE_NODE_MODULES: path.join(repoRoot, "node_modules"),
      HERMES_MOBILE_APP_ROOT: repoRoot,
    }));
    assert.equal(result.extracted.ok, true);
    assert.equal(result.extracted.tool, "pdf_extract_text");
    assert.equal(result.extracted.hasTextLayer, true);
    assert.match(result.extracted.text, /Page One PDF Tool Smoke/);
    assert.equal(result.rendered.ok, true);
    assert.equal(result.rendered.tool, "pdf_render_pages");
    assert.equal(result.rendered.pagesRendered, 2);
    assert.equal(result.rendered.imagePaths.length, 2);
    for (const imagePath of result.rendered.imagePaths) {
      assert.equal(fs.existsSync(imagePath), true);
      assert.equal(path.extname(imagePath), ".png");
    }
  });
}

function testCreatesPdfDeliverable() {
  withTempRoot((root) => {
    const pdfPath = path.join(root, "medication.pdf");
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_pdf", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
created = json.loads(module._pdf_create_handler({
  "title": "用药说明",
  "markdown": "# 用药说明\\n\\n阿司匹林 100mg 每日一次",
  "output_path": ${JSON.stringify(pdfPath)}
}))
extracted = json.loads(module._pdf_extract_text_handler({"file_path": ${JSON.stringify(pdfPath)}, "max_pages": 2, "max_chars": 5000}))
print(json.dumps({"created": created, "extracted": extracted}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PDF_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PDF_OUTPUT_ROOTS: root,
      HERMES_MOBILE_NODE_MODULES: path.join(repoRoot, "node_modules"),
      HERMES_MOBILE_APP_ROOT: repoRoot,
    }));
    assert.equal(result.created.ok, true);
    assert.equal(result.created.tool, "pdf_create");
    assert.match(result.created.media, /^MEDIA:/);
    assert.equal(fs.existsSync(pdfPath), true);
    assert.equal(path.extname(pdfPath), ".pdf");
    assert.equal(result.extracted.ok, true);
    assert.match(result.extracted.text, /用药说明|阿司匹林/);
  });
}

function testRejectsOutOfScopePdf() {
  withTempRoot((root) => {
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.pdf`);
    fs.writeFileSync(outside, "%PDF-1.4\n%%EOF\n", "utf8");
    try {
      const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_pdf", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module._pdf_extract_text_handler({"file_path": ${JSON.stringify(outside)}}))
`;
      const result = JSON.parse(runPython(script, { HERMES_MOBILE_PDF_ALLOWED_ROOTS: root }));
      assert.equal(result.ok, false);
      assert.equal(result.error, "file_path_outside_allowed_roots");
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
}

testExtractsTextAndRendersPages();
testCreatesPdfDeliverable();
testRejectsOutOfScopePdf();
