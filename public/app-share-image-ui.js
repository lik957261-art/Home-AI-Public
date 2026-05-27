"use strict";

function messageShareText(message) {
  if (!message) return "";
  const content = cleanDisplayText(rewriteDirectoryPathsForDisplay(message.content || ""));
  const error = message.error ? `Error: ${message.error}` : "";
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts
      .map((artifact) => String(artifact?.name || artifact?.id || "").trim())
      .filter(Boolean)
    : [];
  const artifactText = artifacts.length ? `Attachments:\n${artifacts.map((name) => `- ${name}`).join("\n")}` : "";
  return [content, error, artifactText].filter(Boolean).join("\n\n").trim();
}

async function copyMessageContent(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no copyable content");
  await copyTextToClipboard(text);
}

function messageShareTitle(message) {
  if (!message) return "Hermes Mobile";
  if (message.taskGroupId && !isSingleWindowConversationTaskGroupId(message.taskGroupId)) {
    return `Hermes Mobile - ${shortTaskDisplayId(messageTaskDisplayId(message))}`;
  }
  return "Hermes Mobile";
}

function stripInlineMarkdownForShare(value) {
  return String(value || "")
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
    if (textValue) blocks.push(Object.assign({ type, text: textValue }, extra));
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
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
      blocks.push({ type: "code", text: trimmed });
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
  flushParagraph();
  return blocks.length ? blocks : [{ type: "paragraph", text: "No content." }];
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const sourceLine of String(text || "").split(/\r?\n/)) {
    const chars = Array.from(sourceLine);
    let line = "";
    for (const char of chars) {
      const next = `${line}${char}`;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd());
        line = char.trimStart();
      } else {
        line = next;
      }
    }
    if (line) lines.push(line.trimEnd());
    else if (!chars.length) lines.push("");
  }
  return lines;
}

function setShareImageFont(ctx, size, weight = 400, family = "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Aptos\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Segoe UI\", sans-serif") {
  ctx.font = `${weight} ${size}px ${family}`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function layoutShareImage(ctx, message, text) {
  const width = SHARE_IMAGE_WIDTH;
  const margin = 96;
  const contentWidth = width - margin * 2;
  const items = [];
  let y = 72;
  const title = messageShareTitle(message);
  const meta = [messageDisplayTimeLabel(message), state.currentThread?.title || ""].filter(Boolean).join(" - ");

  setShareImageFont(ctx, 36, 800);
  items.push({ type: "brand", x: margin, y, text: "Hermes Mobile", size: 36, weight: 800 });
  y += 58;
  setShareImageFont(ctx, 62, 760);
  const titleLines = wrapCanvasText(ctx, title, contentWidth);
  items.push({ type: "text", x: margin, y, lines: titleLines, size: 62, weight: 760, lineHeight: 76, color: "#142027" });
  y += titleLines.length * 76 + 18;
  if (meta) {
    setShareImageFont(ctx, 34, 500);
    const metaLines = wrapCanvasText(ctx, meta, contentWidth);
    items.push({ type: "text", x: margin, y, lines: metaLines, size: 34, weight: 500, lineHeight: 46, color: "#6f6a5f" });
    y += metaLines.length * 46 + 32;
  }
  items.push({ type: "rule", x: margin, y, width: contentWidth });
  y += 48;

  for (const block of shareImageBlocksFromText(text)) {
    if (block.type === "heading") {
      const size = block.level <= 1 ? 64 : block.level === 2 ? 58 : 54;
      const lineHeight = block.level <= 1 ? 84 : block.level === 2 ? 78 : 74;
      setShareImageFont(ctx, size, 780);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size, weight: 780, lineHeight, color: "#182833" });
      y += lines.length * lineHeight + 28;
    } else if (block.type === "list") {
      setShareImageFont(ctx, 52, 500);
      const markerWidth = 66;
      const lines = wrapCanvasText(ctx, block.text, contentWidth - markerWidth);
      items.push({ type: "list", x: margin, y, marker: block.marker || "-", lines, size: 52, weight: 500, lineHeight: 80, markerWidth, color: "#182833" });
      y += lines.length * 80 + 14;
    } else if (block.type === "quote") {
      setShareImageFont(ctx, 48, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 68);
      const height = lines.length * 74 + 42;
      items.push({ type: "quote", x: margin, y, width: contentWidth, height, lines, size: 48, weight: 500, lineHeight: 74, color: "#374742" });
      y += height + 28;
    } else if (block.type === "code") {
      setShareImageFont(ctx, 40, 500, "\"Cascadia Mono\", Consolas, monospace");
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 56);
      const height = lines.length * 58 + 44;
      items.push({ type: "code", x: margin, y, width: contentWidth, height, lines, size: 40, weight: 500, lineHeight: 58, color: "#22302d" });
      y += height + 28;
    } else {
      setShareImageFont(ctx, 54, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size: 54, weight: 500, lineHeight: 84, color: "#182833" });
      y += lines.length * 84 + 30;
    }
  }

  y += 32;
  items.push({ type: "footer", x: margin, y, text: "Shared from Hermes Mobile", size: 30, weight: 500 });
  y += 72;
  return { width, height: Math.max(640, Math.ceil(y)), items };
}

function drawShareImage(ctx, layout) {
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, layout.width, layout.height);
  fillRoundRect(ctx, 28, 28, layout.width - 56, layout.height - 56, 24, "rgba(255, 252, 246, 0.84)");
  ctx.strokeStyle = "rgba(95, 83, 63, 0.12)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, 28, 28, layout.width - 56, layout.height - 56, 24);
  ctx.stroke();

  for (const item of layout.items) {
    if (item.type === "brand") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "rule") {
      ctx.strokeStyle = "rgba(135, 111, 60, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.width, item.y);
      ctx.stroke();
      continue;
    }
    if (item.type === "footer") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#8a8478";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "quote") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(235, 229, 216, 0.72)");
      ctx.fillStyle = "#b28b47";
      ctx.fillRect(item.x + 20, item.y + 18, 5, item.height - 36);
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 44, item.y + 24 + item.lineHeight * (index + 0.75)));
      continue;
    }
    if (item.type === "code") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(226, 231, 225, 0.82)");
      setShareImageFont(ctx, item.size, item.weight, "\"Cascadia Mono\", Consolas, monospace");
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 22, item.y + 18 + item.lineHeight * (index + 0.78)));
      continue;
    }
    if (item.type === "list") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.marker, item.x, item.y + item.lineHeight * 0.78);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + item.markerWidth, item.y + item.lineHeight * (index + 0.78)));
      continue;
    }
    setShareImageFont(ctx, item.size, item.weight);
    ctx.fillStyle = item.color;
    item.lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + item.lineHeight * (index + 0.78)));
  }
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render image"));
    }, type);
  });
}

function shareImageRenderScale(layout) {
  const width = Math.max(1, Number(layout?.width || 1));
  const height = Math.max(1, Number(layout?.height || 1));
  const maxByPixels = Math.sqrt(SHARE_IMAGE_MAX_PIXELS / (width * height));
  const maxByDimension = Math.min(SHARE_IMAGE_MAX_DIMENSION / width, SHARE_IMAGE_MAX_DIMENSION / height);
  return Math.max(1, Math.min(SHARE_IMAGE_SCALE, maxByPixels, maxByDimension));
}

async function renderMessageShareImageBlob(message) {
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no image content");
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const layout = layoutShareImage(measureCtx, message, text);
  if (layout.height > 30000) throw new Error("Reply is too long for one image");
  const scale = shareImageRenderScale(layout);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  drawShareImage(ctx, layout);
  return canvasToBlob(canvas, "image/png");
}

async function copyImageBlobToClipboard(blob) {
  if (!navigator.clipboard?.write || !window.ClipboardItem || !window.isSecureContext) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  showPushToast("\u56fe\u7247\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f", "success");
  return true;
}

function openImageBlobPreview(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hermes-reply-${Date.now().toString(36)}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  showPushToast("\u5df2\u751f\u6210\u56fe\u7247\u6587\u4ef6", "success");
}

async function shareMessageImage(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const blob = await renderMessageShareImageBlob(message);
  const title = messageShareTitle(message);
  if (typeof File !== "undefined" && navigator.share && navigator.canShare) {
    const file = new File([blob], `hermes-reply-${Date.now().toString(36)}.png`, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  }
  if (await copyImageBlobToClipboard(blob)) return;
  openImageBlobPreview(blob);
}
