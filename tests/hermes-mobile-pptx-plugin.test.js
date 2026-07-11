"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-pptx", "__init__.py");
const officePluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-docx", "__init__.py");

function runPython(script, env = {}) {
  return execFileSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-pptx-plugin-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testCreatesReadablePptxWithImageAndMediaLine() {
  withTempRoot((root) => {
    const outputPath = path.join(root, "deliverable", "allergy-brief.pptx");
    const imagePath = path.join(root, "source.png");
    fs.writeFileSync(imagePath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ));
    const script = `
import importlib.util, json, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_pptx", ${JSON.stringify(pluginPath)})
pptx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pptx)
office_spec = importlib.util.spec_from_file_location("hermes_mobile_docx", ${JSON.stringify(officePluginPath)})
office = importlib.util.module_from_spec(office_spec)
office_spec.loader.exec_module(office)
out = Path(${JSON.stringify(outputPath)})
image = Path(${JSON.stringify(imagePath)})
created = json.loads(pptx._pptx_create_handler({
    "output_path": str(out),
    "title": "Allergy materials brief",
    "slides": [
        {"title": "Overview", "body": "Prepared from in-scope materials.", "bullets": ["Confirmed facts only", "Review before external sharing"], "image_path": str(image), "image_alt": "source image"},
        {"title": "Next steps", "bullets": ["Keep source records attached", "Use mobile preview/download"]}
    ],
}))
if not created.get("ok"):
    print(json.dumps({"created": created}, ensure_ascii=False))
    raise SystemExit(0)
with zipfile.ZipFile(out) as archive:
    names = sorted(archive.namelist())
    slide1 = archive.read("ppt/slides/slide1.xml").decode("utf-8")
    rels = archive.read("ppt/slides/_rels/slide1.xml.rels").decode("utf-8")
extracted = json.loads(office._office_extract_text_handler({"file_path": str(out), "max_chars": 2000}))
validated = json.loads(pptx._pptx_validate_handler({"file_path": str(out)}))
print(json.dumps({"created": created, "validated": validated, "names": names, "slide1": slide1, "rels": rels, "extracted": extracted}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PPTX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PPTX_OUTPUT_ROOTS: root,
      HERMES_MOBILE_DOCX_ALLOWED_ROOTS: root,
    }));
    assert.equal(
      result.created.ok,
      true,
      result.created.validation?.issues?.join(", ") || result.created.error || JSON.stringify(result.created),
    );
    assert.equal(result.created.tool, "pptx_create");
    assert.equal(result.created.compatibility, "validated");
    assert.equal(result.created.validation.ok, true);
    assert.deepEqual(result.created.validation.issues, []);
    assert.equal(result.validated.ok, true);
    assert.equal(result.validated.tool, "pptx_validate");
    assert.equal(result.validated.slide_count, 2);
    assert.equal(result.created.slide_count, 2);
    assert.equal(result.created.image_count, 1);
    assert.match(result.created.media_line, /^MEDIA:/);
    assert.ok(fs.existsSync(outputPath));
    assert.ok(result.names.includes("[Content_Types].xml"));
    assert.ok(result.names.includes("ppt/presentation.xml"));
    assert.ok(result.names.includes("ppt/presProps.xml"));
    assert.ok(result.names.includes("ppt/viewProps.xml"));
    assert.ok(result.names.includes("ppt/tableStyles.xml"));
    assert.ok(result.names.includes("ppt/slides/slide1.xml"));
    assert.ok(result.names.includes("ppt/slideLayouts/_rels/slideLayout1.xml.rels"));
    assert.ok(result.names.some((name) => name.startsWith("ppt/media/image1-") && name.endsWith(".png")));
    assert.match(result.slide1, /Overview/);
    assert.match(result.slide1, /Confirmed facts only/);
    assert.match(result.rels, /relationships\/image/);
    assert.equal(result.extracted.ok, true);
    assert.equal(result.extracted.format, "powerpoint");
    assert.match(result.extracted.text, /Allergy materials brief|Overview/);
    assert.match(result.extracted.text, /Next steps/);
  });
}

function testCreatesPowerPointCompatibleChineseThreeSlideDeck() {
  withTempRoot((root) => {
    const outputPath = path.join(root, "deliverable", "健康资料说明.pptx");
    const script = `
import importlib.util, json, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_pptx", ${JSON.stringify(pluginPath)})
pptx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pptx)
office_spec = importlib.util.spec_from_file_location("hermes_mobile_docx", ${JSON.stringify(officePluginPath)})
office = importlib.util.module_from_spec(office_spec)
office_spec.loader.exec_module(office)
out = Path(${JSON.stringify(outputPath)})
created = json.loads(pptx._pptx_create_handler({
    "output_path": str(out),
    "title": "凡凡过敏资料说明",
    "slides": [
        {"title": "资料概览", "body": "这是一份用于家庭沟通的三页演示文稿。", "bullets": ["仅包含已确认信息", "适合移动端分享"]},
        {"title": "重点事项", "bullets": ["记录过敏来源", "区分症状和处理建议", "保留原始资料"]},
        {"title": "后续动作", "body": "如需外部沟通，应先复核内容，再通过 PowerPoint 或系统分享发送。"}
    ],
    "theme": {"accent_color": "0F766E", "background_color": "FFFFFF", "text_color": "111827"}
}))
with zipfile.ZipFile(out) as archive:
    names = sorted(archive.namelist())
    theme = archive.read("ppt/theme/theme1.xml").decode("utf-8")
    master = archive.read("ppt/slideMasters/slideMaster1.xml").decode("utf-8")
    rels = archive.read("ppt/_rels/presentation.xml.rels").decode("utf-8")
validated = json.loads(pptx._pptx_validate_handler({"file_path": str(out)}))
extracted = json.loads(office._office_extract_text_handler({"file_path": str(out), "max_chars": 4000}))
print(json.dumps({"created": created, "validated": validated, "extracted": extracted, "names": names, "theme": theme, "master": master, "rels": rels}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PPTX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PPTX_OUTPUT_ROOTS: root,
      HERMES_MOBILE_DOCX_ALLOWED_ROOTS: root,
    }));
    assert.equal(result.created.ok, true);
    assert.equal(result.validated.ok, true);
    assert.equal(result.validated.slide_count, 3);
    assert.equal(result.created.slide_count, 3);
    assert.deepEqual(result.validated.issues, []);
    assert.ok(result.names.includes("ppt/presProps.xml"));
    assert.ok(result.names.includes("ppt/viewProps.xml"));
    assert.ok(result.names.includes("ppt/tableStyles.xml"));
    assert.match(result.rels, /relationships\/presProps/);
    assert.match(result.rels, /relationships\/viewProps/);
    assert.match(result.rels, /relationships\/tableStyles/);
    assert.match(result.theme, /<a:accent6>/);
    assert.match(result.theme, /<a:folHlink>/);
    assert.match(result.theme, /<a:fillStyleLst>[\s\S]*<a:gradFill/);
    assert.match(result.master, /<p:clrMap /);
    assert.equal(result.extracted.ok, true);
    assert.match(result.extracted.text, /凡凡过敏资料说明|资料概览/);
    assert.match(result.extracted.text, /后续动作/);
  });
}

function testValidateRejectsMissingLayoutMasterRelationship() {
  withTempRoot((root) => {
    const outputPath = path.join(root, "deliverable", "broken.pptx");
    const script = `
import importlib.util, json, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_pptx", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
out = Path(${JSON.stringify(outputPath)})
created = json.loads(module._pptx_create_handler({
    "output_path": str(out),
    "title": "Broken deck",
    "slides": [{"title": "Overview", "bullets": ["One"]}],
}))
tmp = out.with_suffix(".rewrite.pptx")
with zipfile.ZipFile(out, "r") as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
    for name in src.namelist():
        if name == "ppt/slideLayouts/_rels/slideLayout1.xml.rels":
            continue
        dst.writestr(name, src.read(name))
tmp.replace(out)
validated = json.loads(module._pptx_validate_handler({"file_path": str(out)}))
print(json.dumps({"created": created, "validated": validated}, ensure_ascii=False))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PPTX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PPTX_OUTPUT_ROOTS: root,
    }));
    assert.equal(result.created.ok, true);
    assert.equal(result.validated.ok, false);
    assert.equal(result.validated.tool, "pptx_validate");
    assert.ok(result.validated.issues.some((issue) => /layout_master_relationship_missing|missing_relationships:ppt\/slideLayouts\/_rels\/slideLayout1\.xml\.rels/.test(issue)));
    assert.doesNotMatch(JSON.stringify(result.validated), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}

function testCreateBlocksMediaLineWhenThemeIsTooMinimalForPowerPoint() {
  withTempRoot((root) => {
    const outputPath = path.join(root, "deliverable", "minimal-theme.pptx");
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_pptx", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module._theme_xml = lambda colors: """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Too Minimal">
  <a:themeElements>
    <a:clrScheme name="Too Minimal"><a:dk1><a:srgbClr val="111827"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="2563EB"/></a:accent1></a:clrScheme>
    <a:fontScheme name="Too Minimal"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Too Minimal"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>"""
print(module._pptx_create_handler({
    "output_path": ${JSON.stringify(outputPath)},
    "title": "Blocked minimal theme",
    "slides": [{"title": "Overview", "bullets": ["One"]}],
}))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PPTX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PPTX_OUTPUT_ROOTS: root,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.error, "pptx_compatibility_validation_failed");
    assert.equal(result.validation.ok, false);
    assert.ok(result.validation.issues.some((issue) => /theme_color_scheme_incomplete|theme_format_list_incomplete|theme_font_scheme_incomplete/.test(issue)));
    assert.equal(result.media_line, undefined);
    assert.equal(fs.existsSync(outputPath), false);
  });
}

function testCreateBlocksMediaLineWhenCompatibilityValidationFails() {
  withTempRoot((root) => {
    const outputPath = path.join(root, "deliverable", "blocked.pptx");
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_pptx", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module._slide_layout_rels = lambda: """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>"""
print(module._pptx_create_handler({
    "output_path": ${JSON.stringify(outputPath)},
    "title": "Blocked deck",
    "slides": [{"title": "Overview", "bullets": ["One"]}],
}))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PPTX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PPTX_OUTPUT_ROOTS: root,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.tool, "pptx_create");
    assert.equal(result.error, "pptx_compatibility_validation_failed");
    assert.equal(result.validation.ok, false);
    assert.ok(result.validation.issues.some((issue) => /layout_master_relationship_missing/.test(issue)));
    assert.equal(result.media_line, undefined);
    assert.equal(fs.existsSync(outputPath), false);
  });
}

function testRejectsOutputOutsideAllowedRoots() {
  withTempRoot((root) => {
    const outside = path.join(os.tmpdir(), `homeai-pptx-outside-${Date.now()}.pptx`);
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_pptx", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module._pptx_create_handler({"output_path": ${JSON.stringify(outside)}, "slides": [{"title": "Blocked"}]}))
`;
    const result = JSON.parse(runPython(script, {
      HERMES_MOBILE_PPTX_ALLOWED_ROOTS: root,
      HERMES_MOBILE_PPTX_OUTPUT_ROOTS: root,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.tool, "pptx_create");
    assert.match(result.error, /output_path_outside_allowed_roots/);
    assert.equal(fs.existsSync(outside), false);
  });
}

testCreatesReadablePptxWithImageAndMediaLine();
testCreatesPowerPointCompatibleChineseThreeSlideDeck();
testValidateRejectsMissingLayoutMasterRelationship();
testCreateBlocksMediaLineWhenThemeIsTooMinimalForPowerPoint();
testCreateBlocksMediaLineWhenCompatibilityValidationFails();
testRejectsOutputOutsideAllowedRoots();
