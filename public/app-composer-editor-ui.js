"use strict";

function getComposerText() {
  const input = $("messageInput");
  if (input && "value" in input) return String(input.value || "").replace(/\u00a0/g, " ");
  return String(input?.innerText || "").replace(/\u00a0/g, " ");
}

function utf8ByteLength(text) {
  const value = String(text || "");
  if (!value) return 0;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
  if (typeof Blob === "function") return new Blob([value]).size;
  return unescape(encodeURIComponent(value)).length;
}

function composerRequestSizeError(text, serializedBody) {
  if (String(text || "").length > COMPOSER_MAX_TEXT_CHARS) {
    return "内容太长，单条消息最多约 24 万字，请拆成几条发送，或作为文件上传。";
  }
  if (utf8ByteLength(serializedBody) > COMPOSER_MAX_BODY_BYTES) {
    return "内容太长，当前消息包超过发送上限，请拆成几条发送，或作为文件上传。";
  }
  return "";
}

function clearComposerSendAfterCompositionFallback() {
  if (!state.composerSendAfterCompositionTimer) return;
  clearTimeout(state.composerSendAfterCompositionTimer);
  state.composerSendAfterCompositionTimer = null;
}

function scheduleComposerSendAfterCompositionFallback() {
  clearComposerSendAfterCompositionFallback();
  state.composerSendAfterCompositionTimer = setTimeout(() => {
    state.composerSendAfterCompositionTimer = null;
    if (!state.composerSendAfterComposition) return;
    state.composerComposing = false;
    state.composerSendAfterComposition = false;
    updateComposerAction();
    updateGroupMentionMenu();
    void sendMessage();
  }, 450);
}

function setComposerText(text) {
  const input = $("messageInput");
  if (!input) return;
  if ("value" in input) input.value = text || "";
  else input.textContent = text || "";
  autoSizeComposerEditor(input);
  updateComposerAction();
}

function clearComposerAfterSuccessfulSend(sentText = "") {
  const currentText = getComposerText();
  const normalizedCurrent = String(currentText || "").trim();
  const normalizedSent = String(sentText || "").trim();
  if (!normalizedCurrent || normalizedCurrent === normalizedSent) {
    setComposerText("");
    return true;
  }
  return false;
}

function composerCaretOffset() {
  const input = $("messageInput");
  if (input && typeof input.selectionStart === "number") return input.selectionStart;
  const selection = window.getSelection?.();
  if (!input || !selection || !selection.rangeCount) return getComposerText().length;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.endContainer)) return getComposerText().length;
  const before = document.createRange();
  before.selectNodeContents(input);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/\u00a0/g, " ").length;
}

function setComposerCaretOffset(offset) {
  const input = $("messageInput");
  if (!input) return;
  const target = Math.max(0, Number(offset) || 0);
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(target, target);
    return;
  }
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let node = walker.nextNode();
  const selection = window.getSelection?.();
  const range = document.createRange();
  while (node) {
    const length = node.nodeValue.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function autoSizeComposerEditor(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(180, Math.max(44, el.scrollHeight))}px`;
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  const input = $("messageInput");
  if (input && typeof input.setRangeText === "function") {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(text, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("insertText", false, text);
}

function handleComposerKeydown(event) {
  if (composerMentionAvailable() && state.groupMentionOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGroupMentionSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGroupMentionSelection(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeGroupMentionMenu();
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      void chooseGroupMention();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  void sendMessage();
}
