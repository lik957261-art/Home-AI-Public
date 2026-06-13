"use strict";

const assert = require("node:assert/strict");
const {
  createChatDataContextSelectorService,
  requestedDateForText,
  shouldPrepareDiscussionContext,
} = require("../adapters/chat-data-context-selector-service");

assert.equal(requestedDateForText("帮我总结昨天各工作区讨论内容"), "previous_day");
assert.equal(requestedDateForText("分析今天 Home AI 工作区聊天风险"), "today");
assert.equal(requestedDateForText("总结 2026-06-12 各工作区讨论"), "2026-06-12");
assert.equal(shouldPrepareDiscussionContext("帮我总结昨天各工作区讨论内容"), true);
assert.equal(shouldPrepareDiscussionContext("今天天气怎么样"), false);
assert.equal(shouldPrepareDiscussionContext("帮我写一段普通总结"), false);

{
  const calls = [];
  const service = createChatDataContextSelectorService({
    dataContextService: {
      prepare(input) {
        calls.push(input);
        return {
          ok: true,
          type: input.type,
          context: {
            type: input.type,
            targetDate: "2026-06-12",
            audit: {
              workspaceCount: 3,
              threadCount: 3,
              includedMessageCount: 71,
              excludedNoiseOrOutOfScopeCount: 1,
            },
          },
          markdown: "# discussion_activity_daily Data Context\n\n- Included messages: 71\n",
        };
      },
    },
  });
  const result = service.prepareForMessage({
    text: "帮我总结昨天各工作区讨论内容和待办",
    workspaceId: "owner",
    actorId: "owner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected, true);
  assert.equal(calls[0].type, "discussion_activity_daily");
  assert.equal(calls[0].date, "previous_day");
  assert.match(result.instructions, /\[HOME AI DATA CONTEXT\]/);
  assert.match(result.instructions, /included_messages=71/);
}

console.log("chat data context selector service tests passed");
