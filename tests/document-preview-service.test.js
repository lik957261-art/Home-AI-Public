"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  createDocumentPreviewService,
  extractDocxTextFromBuffer,
  findZipEntry,
  truncateText,
  xmlDecode,
} = require("../adapters/document-preview-service");

function zipEntry(name, content, options = {}) {
  const nameBuffer = Buffer.from(name, "utf8");
  const raw = Buffer.from(content);
  const method = options.method === 8 ? 8 : 0;
  const compressed = method === 8 ? zlib.deflateRawSync(raw) : raw;
  return { nameBuffer, raw, compressed, method };
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = Buffer.alloc(30 + entry.nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(entry.compressed.length, 18);
    local.writeUInt32LE(entry.raw.length, 22);
    local.writeUInt16LE(entry.nameBuffer.length, 26);
    entry.nameBuffer.copy(local, 30);
    locals.push(local, entry.compressed);

    const central = Buffer.alloc(46 + entry.nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(entry.compressed.length, 20);
    central.writeUInt32LE(entry.raw.length, 24);
    central.writeUInt16LE(entry.nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    entry.nameBuffer.copy(central, 46);
    centrals.push(central);
    offset += local.length + entry.compressed.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function minimalDocxXml() {
  return `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Alpha &amp; Beta</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Gamma</w:t></w:r></w:p>
    <w:p><w:r><w:t>Line</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Break</w:t></w:r></w:p>
  </w:body>
</w:document>`;
}

function withTempFile(name, content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-preview-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  try {
    return fn(filePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testTextHelpers() {
  assert.equal(xmlDecode("&lt;x&gt;&amp;&quot;&apos;"), "<x>&\"'");
  assert.deepEqual(truncateText("abcdef", 4), { text: "abcd", totalChars: 6, truncated: true });
  assert.deepEqual(truncateText("abc", 4), { text: "abc", totalChars: 3, truncated: false });
}

function testZipEntryAndDocxExtraction() {
  const zip = makeZip([
    zipEntry("[Content_Types].xml", "<Types/>"),
    zipEntry("word/document.xml", minimalDocxXml()),
  ]);
  assert.equal(findZipEntry(zip, "missing.txt"), null);
  assert.equal(findZipEntry(zip, "word/document.xml").toString("utf8"), minimalDocxXml());

  const preview = extractDocxTextFromBuffer(zip, { maxPreviewChars: 1000 });
  assert.deepEqual(preview, {
    text: "Alpha & BetaGamma\n\nLine\nBreak",
    totalChars: 29,
    truncated: false,
  });
}

function testDeflatedZipEntry() {
  const zip = makeZip([zipEntry("word/document.xml", minimalDocxXml(), { method: 8 })]);
  assert.match(findZipEntry(zip, "word/document.xml").toString("utf8"), /Alpha/);
}

function testServiceReadsFilesAndTruncates() {
  const service = createDocumentPreviewService({ maxPreviewChars: 5 });
  withTempFile("sample.txt", "hello world", (filePath) => {
    assert.deepEqual(service.textFilePreview(filePath), {
      text: "hello",
      totalChars: 11,
      truncated: true,
    });
  });
  assert.deepEqual(service.textBufferPreview(Buffer.from("abcdef")), {
    text: "abcde",
    totalChars: 6,
    truncated: true,
  });

  const docx = makeZip([zipEntry("word/document.xml", minimalDocxXml())]);
  withTempFile("sample.docx", docx, (filePath) => {
    assert.equal(service.extractDocxText(filePath).text, "Alpha");
  });
}

function testErrorsStayStable() {
  assert.throws(() => findZipEntry(Buffer.from("not zip"), "word/document.xml"), /Invalid ZIP file/);
  const emptyDocx = makeZip([zipEntry("[Content_Types].xml", "<Types/>")]);
  assert.throws(() => extractDocxTextFromBuffer(emptyDocx), /DOCX document body not found/);
}

testTextHelpers();
testZipEntryAndDocxExtraction();
testDeflatedZipEntry();
testServiceReadsFilesAndTruncates();
testErrorsStayStable();

console.log("document preview service tests passed");
