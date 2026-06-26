"use strict";

const fs = require("node:fs");
const zlib = require("node:zlib");

const DEFAULT_MAX_PREVIEW_CHARS = 180000;

function previewLimit(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_PREVIEW_CHARS;
}

function truncateText(text, maxPreviewChars = DEFAULT_MAX_PREVIEW_CHARS) {
  const source = String(text || "");
  const limit = previewLimit(maxPreviewChars);
  const truncated = source.length > limit;
  return {
    text: truncated ? source.slice(0, limit) : source,
    totalChars: source.length,
    truncated,
  };
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractParagraphText(paragraph) {
  let text = "";
  const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g;
  let tokenMatch;
  while ((tokenMatch = tokenPattern.exec(paragraph))) {
    const token = tokenMatch[0];
    if (/^<w:tab\b/.test(token)) text += "\t";
    else if (/^<w:t\b/.test(token)) text += xmlDecode(tokenMatch[1] || "");
    else text += "\n";
  }
  return normalizeExtractedText(text);
}

function markdownTableCell(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, "<br>")
    .trim();
}

function docxTableToMarkdown(tableXml) {
  const rows = [];
  const rowPattern = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableXml))) {
    const rowXml = rowMatch[0];
    const cells = [];
    const cellPattern = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowXml))) {
      const cellXml = cellMatch[0];
      const paragraphs = [];
      const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/g;
      let paragraphMatch;
      while ((paragraphMatch = paragraphPattern.exec(cellXml))) {
        const text = extractParagraphText(paragraphMatch[0]);
        if (text) paragraphs.push(text);
      }
      cells.push(markdownTableCell(paragraphs.join("\n")));
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (!rows.length || width < 2) {
    return rows.flat().filter(Boolean).join("\n");
  }
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || ""));
  const header = normalized[0].map((cell, index) => cell || `Column ${index + 1}`);
  const separator = header.map(() => "---");
  const bodyRows = normalized.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function findZipEntry(buffer, entryName, options = {}) {
  const inflateRawSync = options.inflateRawSync || zlib.inflateRawSync;
  const minEocdOffset = Math.max(0, buffer.length - 0xffff - 22);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= minEocdOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid ZIP file");
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset + 46 <= end && offset + 46 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameBuffer = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
    const name = nameBuffer.toString(flags & 0x0800 ? "utf8" : "latin1");
    if (name === entryName) {
      const local = localHeaderOffset;
      if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid ZIP local header");
      const localNameLength = buffer.readUInt16LE(local + 26);
      const localExtraLength = buffer.readUInt16LE(local + 28);
      const dataStart = local + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function extractDocxTextFromBuffer(buffer, options = {}) {
  const xmlBuffer = findZipEntry(buffer, "word/document.xml", options);
  if (!xmlBuffer) throw new Error("DOCX document body not found");
  const xml = xmlBuffer.toString("utf8");
  const body = xml.match(/<w:body[\s\S]*?<\/w:body>/)?.[0] || xml;
  const blocks = [];
  const blockPattern = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  let blockMatch;
  while ((blockMatch = blockPattern.exec(body))) {
    const block = blockMatch[0];
    const text = /^<w:tbl\b/.test(block)
      ? docxTableToMarkdown(block)
      : extractParagraphText(block);
    if (text) blocks.push(text);
  }
  return truncateText(blocks.join("\n\n").trim(), options.maxPreviewChars);
}

function createDocumentPreviewService(options = {}) {
  const fsImpl = options.fs || fs;
  const maxPreviewChars = previewLimit(options.maxPreviewChars);

  function extractDocxText(filePath) {
    return extractDocxTextFromBuffer(fsImpl.readFileSync(filePath), {
      inflateRawSync: options.inflateRawSync,
      maxPreviewChars,
    });
  }

  function textFilePreview(filePath) {
    return truncateText(fsImpl.readFileSync(filePath, "utf8"), maxPreviewChars);
  }

  function textBufferPreview(buffer) {
    return truncateText(Buffer.from(buffer || "").toString("utf8"), maxPreviewChars);
  }

  return {
    extractDocxText,
    textBufferPreview,
    textFilePreview,
  };
}

module.exports = {
  createDocumentPreviewService,
  extractDocxTextFromBuffer,
  findZipEntry,
  truncateText,
  xmlDecode,
};
