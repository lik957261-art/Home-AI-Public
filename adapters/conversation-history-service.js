"use strict";

const { createContextAssemblyService } = require("./context-assembly-service");

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  const limit = Math.max(0, Number(maxChars || 0) || 0);
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit);
}

function createConversationHistoryService(options = {}) {
  const policyHasToolset = typeof options.policyHasToolset === "function"
    ? options.policyHasToolset
    : ((policy, toolset) => {
      const allowed = Array.isArray(policy?.allowed_toolsets) ? policy.allowed_toolsets : [];
      return allowed.map((item) => String(item || "").trim()).includes(String(toolset || "").trim());
    });
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const isSingleWindowConversationTaskGroupId = typeof options.isSingleWindowConversationTaskGroupId === "function"
    ? options.isSingleWindowConversationTaskGroupId
    : ((value) => Boolean(value));
  const maxHistoryMessages = Math.max(0, Number(options.maxHistoryMessages || 30) || 30);
  const chatContextMaxMessages = Math.max(0, Number(options.chatContextMaxMessages || 16) || 16);
  const chatContextMaxChars = Math.max(0, Number(options.chatContextMaxChars || 20_000) || 20_000);
  const maxApiTextChars = Math.max(1, Number(options.maxApiTextChars || 80_000) || 80_000);

  function isToolUnavailableClaimText(text) {
    const content = String(text || "");
    if (!content.trim()) return false;
    return (
      /not available|unavailable|missing|no callable|no\s+.*tool|cannot call|can't call|unable to call|not exposed/i.test(content)
      || /\u6ca1\u6709|\u4ecd\u6ca1\u6709|\u672a\u770b\u5230|\u770b\u4e0d\u5230|\u672a\u6302\u8f7d|\u6ca1\u6302\u8f7d|\u7f3a\u5c11|\u4e0d\u53ef\u7528|\u65e0\u6cd5\u8c03\u7528|\u4e0d\u80fd\u8c03\u7528|\u4e0d\u80fd\u6267\u884c/.test(content)
    );
  }

  function isStaleHttpToolAvailabilityClaim(text) {
    const content = String(text || "");
    if (!content.trim()) return false;
    const mentionsHttpTool = /http_request|web_request|http\s*tool|http\s*function|HTTP\s*(?:\u5de5\u5177|\u51fd\u6570|\u65b9\u6cd5)|HTTP\/API|API\s*Program/i.test(content);
    if (!mentionsHttpTool) return false;
    return isToolUnavailableClaimText(content);
  }

  function isStaleImageToolAvailabilityClaim(text) {
    const content = String(text || "");
    if (!content.trim()) return false;
    const mentionsImageTool = /image_generate|chatgpt_image_edit|chatgpt_image_erase|image_edit|image_erase|image\s*(?:tool|function|edit|erase|editing|retouch|inpainting)|ChatGPT\s*Image|P\s*\u56fe|\u4fee\u56fe|\u56fe\u7247\u7f16\u8f91|\u56fe\u50cf\u7f16\u8f91|\u5c40\u90e8\u64e6\u9664|\u64e6\u9664\u5de5\u5177/i.test(content);
    if (!mentionsImageTool) return false;
    return isToolUnavailableClaimText(content);
  }

  function isStaleDocxToolAvailabilityClaim(text) {
    const content = String(text || "");
    if (!content.trim()) return false;
    const mentionsDocxTool = /docx_extract_text|DOCX|docm|dotx|dotm|Word\s*(?:tool|function|parser|extract|unpack|document)|Office\s*Open\s*XML|Office\s*(?:tool|function|parser)|\u89e3\u5305|\u89e3\u6790\s*(?:Word|DOCX|docx)|Word\s*\u6587\u6863|\u6587\u6863\u89e3\u6790|\u89e3\u6790\u5de5\u5177/i.test(content);
    if (!mentionsDocxTool) return false;
    return isToolUnavailableClaimText(content);
  }

  function isStaleAudioToolAvailabilityClaim(text) {
    const content = String(text || "");
    if (!content.trim()) return false;
    const mentionsAudioTool = /audio_transcribe|audio\s*(?:tool|function|transcrib|transcription|ASR)|voice\s*(?:note|memo|recording)|Whisper|faster[-_ ]?whisper|speech[-_ ]?to[-_ ]?text|mp3|m4a|wav|aac|ogg|opus|amr|flac|video_analyze.*(?:mp3|audio)|(?:mp3|audio).*video_analyze|\u97f3\u9891|\u5f55\u97f3|\u8bed\u97f3|\u8f6c\u5199|\u542c\u5199|\u97f3\u9891\u8f6c\u6587\u5b57|\u590d\u8ff0\u5f55\u97f3/i.test(content);
    if (!mentionsAudioTool) return false;
    return isToolUnavailableClaimText(content);
  }

  function stripDirectoryAliasLinesForChatHistory(text) {
    return String(text || "")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:[-*]\s*)?(?:\u76ee\u5f55\u522b\u540d|Directory aliases?)\s*[:\uff1a]/i.test(line))
      .join("\n")
      .trim();
  }

  function conversationHistoryContentForMessage(msg, policy = {}) {
    let content = stripDirectoryAliasLinesForChatHistory(msg?.content || "");
    if (msg?.role === "assistant" && policyHasToolset(policy, "http") && isStaleHttpToolAvailabilityClaim(content)) {
      content = [
        "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
        "The current run policy enables the `http` toolset; current callable functions supersede older assistant statements about `http_request` or HTTP/API Program availability.",
      ].join(" ");
    } else if (msg?.role === "assistant" && policyHasToolset(policy, "image_gen") && isStaleImageToolAvailabilityClaim(content)) {
      content = [
        "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
        "The current run policy enables the `image_gen` toolset; current callable functions supersede older assistant statements about `chatgpt_image_edit`, `chatgpt_image_erase`, `image_edit`, `image_erase`, or image editing availability.",
      ].join(" ");
    } else if (msg?.role === "assistant" && policyHasToolset(policy, "file") && isStaleDocxToolAvailabilityClaim(content)) {
      content = [
        "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
        "The current run policy enables the `file` toolset; current callable functions supersede older assistant statements about `docx_extract_text`, DOCX extraction, or Word parser availability.",
      ].join(" ");
    } else if (msg?.role === "assistant" && policyHasToolset(policy, "file") && isStaleAudioToolAvailabilityClaim(content)) {
      content = [
        "[Stale assistant tool-availability claim omitted by Hermes Mobile.]",
        "The current run policy enables the `file` toolset; current callable functions supersede older assistant statements about `audio_transcribe`, MP3/audio transcription, or video_analyze-as-audio-workaround availability.",
      ].join(" ");
    }
    return content;
  }

  function compactConversationHistory(messages, maxMessages, maxChars, policy = {}) {
    const recent = (Array.isArray(messages) ? messages : []).slice(-Math.max(0, maxMessages));
    const result = [];
    let remainingChars = Math.max(0, maxChars);
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if (remainingChars <= 0) break;
      const msg = recent[index];
      let content = conversationHistoryContentForMessage(msg, policy);
      if (!content) continue;
      if (msg.role === "user" && msg.senderLabel) {
        content = `${msg.senderLabel}: ${content}`;
      }
      if (content.length > remainingChars) {
        const marker = "[Earlier chat content omitted]\n";
        const allowed = Math.max(0, remainingChars - marker.length);
        content = allowed > 0 ? `${marker}${content.slice(-allowed)}` : content.slice(-remainingChars);
      }
      result.push({
        role: msg.role,
        content: compactText(content, Math.min(maxApiTextChars, chatContextMaxChars)),
      });
      remainingChars -= content.length;
    }
    return result.reverse();
  }

  function legacyBuildConversationHistory(thread, latestUserMessageId, policy = {}) {
    const allMessages = Array.isArray(thread?.messages) ? thread.messages : [];
    const latestIndex = allMessages.findIndex((msg) => msg.id === latestUserMessageId);
    const latest = latestIndex >= 0 ? allMessages[latestIndex] : null;
    if (thread?.singleWindow && !latest?.taskGroupId) return [];
    const messages = allMessages
      .slice(0, latestIndex >= 0 ? latestIndex : allMessages.length)
      .filter((msg) => !thread?.singleWindow || msg.taskGroupId === latest.taskGroupId)
      .filter((msg) => (msg.role === "user" || msg.role === "assistant") && msg.status !== "running")
      .filter((msg) => String(msg.content || "").trim());
    if (thread?.singleWindow && isSingleWindowConversationTaskGroupId(latest?.taskGroupId)) {
      return compactConversationHistory(messages, chatContextMaxMessages, chatContextMaxChars, policy);
    }
    return messages.slice(-maxHistoryMessages).map((msg) => ({
      role: msg.role,
      content: compactText(conversationHistoryContentForMessage(msg, policy), maxApiTextChars),
    }));
  }

  const contextAssemblyService = createContextAssemblyService({
    mode: options.contextAssemblyMode || "legacy",
    compactText,
    maxApiTextChars,
    topicContextService: options.topicContextService,
    legacyBuildConversationHistory,
    normalRecentMessages: options.contextAssemblyNormalRecentMessages,
    toolDenseRecentMessages: options.contextAssemblyToolDenseRecentMessages,
    historicalEvidenceRefs: options.contextAssemblyHistoricalEvidenceRefs,
  });

  function buildConversationHistory(thread, latestUserMessageId, policy = {}) {
    return contextAssemblyService.buildConversationHistory(thread, latestUserMessageId, policy);
  }

  function deriveTitle(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "New thread";
    return cleaned.length <= 42 ? cleaned : `${cleaned.slice(0, 42)}...`;
  }

  return Object.freeze({
    isToolUnavailableClaimText,
    isStaleHttpToolAvailabilityClaim,
    isStaleImageToolAvailabilityClaim,
    isStaleDocxToolAvailabilityClaim,
    isStaleAudioToolAvailabilityClaim,
    stripDirectoryAliasLinesForChatHistory,
    conversationHistoryContentForMessage,
    compactConversationHistory,
    legacyBuildConversationHistory,
    buildConversationHistory,
    contextAssemblyDebug: contextAssemblyService.lastAssemblyDebug,
    deriveTitle,
  });
}

module.exports = {
  createConversationHistoryService,
};
