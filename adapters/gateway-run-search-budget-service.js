"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function explicitSearchText(value = "") {
  return cleanString(value).toLowerCase();
}

function textExplicitlyRequestsWebSearch(value = "") {
  const text = explicitSearchText(value);
  if (!text) return false;
  if (/\b(web|web_search|search|online|internet|current|latest|price|quote|news|x|x_search)\b/.test(text)) {
    return true;
  }
  return /(联网|搜索|搜一下|查一下|查询|当前|现在|实时|最新|今日|今天|新闻|价格|报价|行情|汇率|比特币|黄金|微博|推特|小红书)/.test(text);
}

function explicitSearchContext(values = {}) {
  const fields = [
    values.searchSource,
    values.search_source,
    values.sourceIntent,
    values.source_intent,
    values.sourceMode,
    values.source_mode,
    values.latestText,
    values.latest_text,
    values.userText,
    values.user_text,
    values.messageText,
    values.message_text,
  ].map(explicitSearchText);
  const text = fields.join(" ");
  return {
    explicitWeb: textExplicitlyRequestsWebSearch(text),
    explicitX: /\b(x|x_search)\b/.test(text) || /(微博|推特|小红书)/.test(text),
  };
}

module.exports = {
  explicitSearchContext,
  textExplicitlyRequestsWebSearch,
};
