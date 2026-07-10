"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-docx", "__init__.py");

function runPython(script, env = {}) {
  return execFileSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-office-plugin-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testExtractsPowerPointAndExcelText() {
  withTempRoot((root) => {
    const pptxPath = path.join(root, "deck.pptx");
    const xlsxPath = path.join(root, "sheet.xlsx");
    const script = `
import importlib.util, json, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_docx", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
pptx_path = Path(${JSON.stringify(pptxPath)})
xlsx_path = Path(${JSON.stringify(xlsxPath)})
with zipfile.ZipFile(pptx_path, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("[Content_Types].xml", "<Types/>")
    archive.writestr("ppt/slides/slide1.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:t>First slide title</a:t><a:t>Key finding</a:t></p:sld>')
    archive.writestr("ppt/notesSlides/notesSlide1.xml", '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Speaker note</a:t></p:notes>')
with zipfile.ZipFile(xlsx_path, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("[Content_Types].xml", "<Types/>")
    archive.writestr("xl/sharedStrings.xml", '<sst xmlns="x"><si><t>Patient</t></si><si><t>Result OK</t></si></sst>')
    archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="x"><sheetData><row><c t="s"><v>0</v></c><c><v>188.5</v></c><c t="inlineStr"><is><t>Inline note</t></is></c></row></sheetData></worksheet>')
pptx = json.loads(module._office_extract_text_handler({"file_path": str(pptx_path), "max_chars": 1000}))
xlsx = json.loads(module._office_extract_text_handler({"file_path": str(xlsx_path), "max_chars": 1000}))
print(json.dumps({"pptx": pptx, "xlsx": xlsx}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, { HERMES_MOBILE_DOCX_ALLOWED_ROOTS: root }));
    assert.equal(result.pptx.ok, true);
    assert.equal(result.pptx.tool, "office_extract_text");
    assert.equal(result.pptx.format, "powerpoint");
    assert.match(result.pptx.text, /First slide title/);
    assert.match(result.pptx.text, /Speaker note/);
    assert.equal(result.xlsx.ok, true);
    assert.equal(result.xlsx.format, "excel");
    assert.match(result.xlsx.text, /Patient/);
    assert.match(result.xlsx.text, /188\.5/);
    assert.match(result.xlsx.text, /Inline note/);
  });
}

function testCreatesAndExtractsDocxDeliverable() {
  withTempRoot((root) => {
    const docxPath = path.join(root, "medication.docx");
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_docx", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
created = json.loads(module._docx_create_handler({
  "title": "用药说明",
  "markdown": "# 用药说明\\n\\n- 阿司匹林 100mg 每日一次\\n- 饭后服用",
  "output_path": ${JSON.stringify(docxPath)}
}))
extracted = json.loads(module._docx_extract_text_handler({"file_path": ${JSON.stringify(docxPath)}, "max_chars": 2000}))
print(json.dumps({"created": created, "extracted": extracted}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_DOCX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_DOCX_OUTPUT_ROOTS: root,
    }));
    assert.equal(result.created.ok, true);
    assert.equal(result.created.tool, "docx_create");
    assert.match(result.created.media, /^MEDIA:/);
    assert.equal(fs.existsSync(docxPath), true);
    assert.equal(path.extname(docxPath), ".docx");
    assert.equal(result.extracted.ok, true);
    assert.match(result.extracted.text, /用药说明/);
    assert.match(result.extracted.text, /阿司匹林 100mg/);
  });
}

testExtractsPowerPointAndExcelText();
testCreatesAndExtractsDocxDeliverable();
