const SHARE_IMAGE_MODEL_VERSION = "20260704-vite-share-image-model-v1";

function cleanShareString(value, maxLength = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxLength) || 4000));
}

function stripInlineMarkdownForShare(value) {
  return cleanShareString(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function shareImageBlocksFromText(text) {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  let paragraph = [];
  let codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: stripInlineMarkdownForShare(paragraph.join(" ")) });
    paragraph = [];
  };
  const pushTextBlock = (type, value, extra = {}) => {
    const textValue = stripInlineMarkdownForShare(value);
    if (textValue) blocks.push(Object.freeze(Object.assign({ type, text: textValue }, extra)));
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        blocks.push(Object.freeze({ type: "code", text: codeLines.join("\n").trimEnd() }));
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      pushTextBlock("heading", heading[2], { level: heading[1].length });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      pushTextBlock("list", bullet[1], { marker: "-" });
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      pushTextBlock("list", numbered[2], { marker: `${numbered[1]}.` });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      pushTextBlock("quote", quote[1]);
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      blocks.push(Object.freeze({ type: "code", text: trimmed }));
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines) blocks.push(Object.freeze({ type: "code", text: codeLines.join("\n").trimEnd() }));
  flushParagraph();
  return Object.freeze(blocks.length ? blocks : [Object.freeze({ type: "paragraph", text: "No content." })]);
}

function safeShareFilename(value = "", fallback = "homeai-share.png") {
  const fallbackName = cleanShareString(fallback, 120) || "homeai-share.png";
  const filename = cleanShareString(value || fallbackName, 180)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return filename || fallbackName;
}

function safeSharePrefix(value = "share") {
  return cleanShareString(value || "share", 80)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "share";
}

function nativeShareRequestId(prefix = "share", options = {}) {
  const nowText = cleanShareString(options.nowText || "", 40)
    || (Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs).toString(36) : "now");
  const randomText = cleanShareString(options.randomText || "", 24)
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 8)
    || "share";
  return `${safeSharePrefix(prefix)}-${nowText}-${randomText}`.slice(0, 96);
}

function nativeOutboundShareAvailable(input = {}) {
  return Boolean(input.outboundShare === true && input.hasShareFunction === true);
}

function createNativeOutboundShareRequest(input = {}) {
  const size = Number(input.size || 0);
  const mimeType = cleanShareString(input.mimeType || "image/png", 120) || "image/png";
  const dataBase64 = cleanShareString(input.dataBase64 || "", 20_000_000);
  if (!Number.isFinite(size) || size <= 0) return Object.freeze({ ok: false, code: "share_blob_empty" });
  if (mimeType !== "image/png") return Object.freeze({ ok: false, code: "share_mime_unsupported" });
  if (!dataBase64) return Object.freeze({ ok: false, code: "share_data_missing" });
  return Object.freeze({
    ok: true,
    code: "",
    request: Object.freeze({
      type: "homeai.nativeShare.share",
      version: 1,
      requestId: nativeShareRequestId(input.requestPrefix || "native-share", input),
      sourceSurface: cleanShareString(input.sourceSurface || "message_share_image", 80),
      title: cleanShareString(input.title || "Home AI", 120) || "Home AI",
      text: cleanShareString(input.text || "", 240),
      filename: safeShareFilename(input.filename, "homeai-share.png"),
      mimeType,
      dataBase64,
    }),
  });
}

export {
  SHARE_IMAGE_MODEL_VERSION,
  cleanShareString,
  createNativeOutboundShareRequest,
  nativeOutboundShareAvailable,
  nativeShareRequestId,
  safeShareFilename,
  shareImageBlocksFromText,
  stripInlineMarkdownForShare,
};
