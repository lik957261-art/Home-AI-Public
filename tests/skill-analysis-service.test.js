"use strict";

const assert = require("node:assert/strict");
const {
  MODEL_REWRITE_FIX_ID,
  X_SEARCH_FIX_ID,
  createSkillAnalysisService,
} = require("../adapters/skill-analysis-service");

function visibleAnalysisText(analysis) {
  return [
    analysis.summary,
    ...analysis.capabilities,
    ...analysis.invocationConditions,
    ...analysis.nonInvocationConditions,
    ...analysis.inputsOutputs,
    ...analysis.modificationNotes,
    ...(analysis.fixes || []).flatMap((fix) => [fix.label, fix.description]),
  ].join("\n");
}

function xSkillContent() {
  return `---
name: x-social-monitoring-and-briefs
description: Use when a task needs X search, X account monitoring, or social-media briefs.
---

# X Social Monitoring

Use this skill when the user asks to search X posts, inspect an X account, or build a social-media monitoring brief.

## Workflow

1. Choose access path: local x-bridge Chrome session for live validation/briefs, x-cli/xurl for API-style actions, or public monitoring when no auth/API is available.
2. Define target: following feed, topic query, single account, project watchlist, or scheduled brief.
3. Validate login/session state before assuming content is unavailable.
4. Capture evidence: post URL/ID, author, timestamp, text, media note, and retrieval method.
5. For user-facing briefs, verify artifact size/readability and deliver the actual Markdown file by default.

## Scheduled X brief hardening

- Keep canonical Markdown in X/Briefs/, raw artifacts in X/Runs/, and delivery Markdown copies in the active Hermes Mobile delivery directory.
- Prefer auth-check, then following-report --hours 12 --accounts 18 --limit 2, then watchlist-brief --hours 12 --limit 8.
- If auth-check succeeds but following-report times out, do not call the session expired and do not invent following coverage numbers.
- Treat coverageComplete and stopReason as authoritative coverage qualifiers.

## Do not use

- Do not use for ordinary local data lookup.
- Do not use when the user only asks for a general answer.

## Inputs and outputs

- Input: query, timeframe, and target account when available.
- Output: compact brief with sources.
`;
}

async function run() {
  let modelRequest = null;
  let modelTimeoutMs = 0;
  const modelCalls = [];
  const service = createSkillAnalysisService({
    timeoutMs: 1,
    async hermesModelText(body, timeoutMs) {
      modelRequest = body;
      modelTimeoutMs = timeoutMs;
      modelCalls.push({ body, timeoutMs });
      if (String(body?.input || "").includes('"content"')) {
        return JSON.stringify({
          content: `---
name: x-social-monitoring-and-briefs
description: Use only when X/Twitter is the requested evidence source.
---

# X Social Monitoring

Use this skill for explicit X/Twitter monitoring and briefs.

## Workflow

1. Validate x-bridge/x-cli/xurl access before collecting evidence.
2. Preserve post URL/ID, author, timestamp, and retrieval method.

## Do not use

- Do not use for ordinary local data lookup or non-X web search.
`,
          changeSummary: ["Narrowed trigger wording and kept evidence requirements."],
        });
      }
      return JSON.stringify({
        summary: "用于 X/Twitter 账号、主题和项目监控简报；重点是选择 x-bridge/x-cli/xurl 访问路径、验证登录状态、保留证据，并按固定目录交付 Markdown/PDF。",
        capabilities: [
          "在 local x-bridge Chrome session、x-cli/xurl 和 public monitoring 之间选择访问路径。",
          "支持 following feed、topic query、single account、project watchlist 和 scheduled brief 等目标类型。",
          "通过 auth-check、following-report、watchlist-brief 等命令做有界采集，并处理超时或路径缺失的降级。",
          "生成面向用户的简报前检查产物大小、可读性，并默认交付实际 Markdown 文件。",
        ],
        invocationConditions: [
          "用户明确要求 X/Twitter 监控、账号/主题简报、项目 watchlist、定时简报或 x-cli/xurl 操作时调用。",
          "需要验证 X 登录/session 状态或排查 x-bridge 位置、auth-check、following-report、watchlist-brief 时调用。",
          "需要把 X 证据沉淀到 X/Briefs、X/Runs 或 Hermes Mobile delivery 目录时调用。",
        ],
        nonInvocationConditions: [
          "普通本地数据查询、一般问答和非 X 网络搜索不要调用。",
          "following-report 超时但 auth-check 成功时，不要直接判断 X 认证过期，也不要编造 coverage 数字。",
          "不要把 X artifacts 放在 sync-folder root、current directory 或 ChatGPT-Drive root。",
        ],
        inputsOutputs: [
          "输入包括目标类型、时间窗口、账号或主题、是否需要 phone PDF，以及可用的 x-bridge/x-cli/xurl 访问方式。",
          "证据应包含 post URL/ID、author、timestamp、text、media note 和 retrieval method。",
          "输出包括 canonical Markdown、raw artifacts、delivery Markdown copy、可选 PDF，以及 registry/HANDOFF writeback。",
        ],
        modificationNotes: [
          "这个 Skill 内容已经覆盖多个子场景；如果频繁误触发，应把 X 搜索、定时简报、x-bridge 故障排查拆成更窄的 Skill。",
          "调用条件需要强调“用户明确要求 X/Twitter 作为信源”，避免普通社媒或 Web 搜索误触发。",
        ],
      });
    },
  });
  const analysis = await service.analyze({
    id: "x-social-monitoring-and-briefs",
    label: "x-social-monitoring-and-briefs",
    namespace: "social-media",
    path: "social-media/x-social-monitoring-and-briefs",
    totalChars: 1000,
    truncated: false,
    content: xSkillContent(),
  });

  assert.equal(analysis.skill.path, "social-media/x-social-monitoring-and-briefs");
  assert.equal(analysis.analysisMethod, "model_assisted");
  assert.equal(analysis.modelStatus, "completed");
  assert.equal(modelTimeoutMs, 60000);
  assert.equal(modelCalls.length, 1);
  assert(modelRequest.input.includes("Scheduled X brief hardening"));
  assert(analysis.summary.includes("x-bridge/x-cli/xurl"));
  assert(analysis.capabilities.some((item) => item.includes("following-report")));
  assert(analysis.invocationConditions.some((item) => item.includes("X/Briefs")));
  assert(analysis.nonInvocationConditions.some((item) => item.includes("coverage")));
  assert(analysis.inputsOutputs.some((item) => item.includes("post URL/ID")));
  assert(analysis.modificationNotes.some((item) => item.includes("拆成更窄")));
  assert.equal(analysis.fixes[0].id, MODEL_REWRITE_FIX_ID);
  assert(analysis.fixes.some((fix) => fix.id === X_SEARCH_FIX_ID));
  assert.deepEqual(analysis.source.frontmatterKeys, ["name", "description"]);
  assert(analysis.source.sectionTitles.includes("Do not use"));

  const visible = visibleAnalysisText(analysis);
  assert.equal(/Use when|Use this skill|Do not use|Input:|Output:|Search X|Summarize claims|query, timeframe/i.test(visible), false);

  const applied = await service.applyFix({
    path: "social-media/x-social-monitoring-and-briefs",
    content: `---
name: x-social-monitoring-and-briefs
description: Use when a task needs social-media briefs.
---

# X Social
`,
  }, "narrow-x-search-invocation");
  assert.equal(applied.changed, true);
  assert.match(applied.content, /Use only when the user explicitly asks to search X\/Twitter/);
  assert.match(applied.content, /Do not use for ordinary local data lookup/);

  const rewritten = await service.applyFix({
    path: "social-media/x-social-monitoring-and-briefs",
    content: xSkillContent(),
  }, MODEL_REWRITE_FIX_ID);
  assert.equal(rewritten.changed, true);
  assert.match(rewritten.content, /Use only when X\/Twitter is the requested evidence source/);
  assert.match(rewritten.content, /Validate x-bridge\/x-cli\/xurl access/);
  assert(rewritten.fix.changeSummary.some((item) => item.includes("Narrowed trigger")));
  assert.equal(modelCalls.length, 2);
  assert.equal(modelCalls.at(-1).timeoutMs, 240000);
  assert.equal(rewritten.analysis.modelStatus, "rewrite_completed");

  const fallbackService = createSkillAnalysisService();
  const fallback = await fallbackService.analyze({
    id: "x-social-monitoring-and-briefs",
    label: "x-social-monitoring-and-briefs",
    path: "social-media/x-social-monitoring-and-briefs",
    content: "# X Social\n\nUse this skill when the user asks to search X posts.",
  });
  assert.equal(fallback.analysisMethod, "deterministic_fallback");
  assert.equal(fallback.modelStatus, "unavailable");

  await assert.rejects(
    () => fallbackService.analyze({ path: "empty", content: "" }),
    /Skill content is empty/,
  );

  console.log("skill analysis service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
