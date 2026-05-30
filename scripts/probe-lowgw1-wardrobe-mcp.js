"use strict";

const fs = require("node:fs");

async function main() {
  const manifest = JSON.parse(fs.readFileSync("C:/ProgramData/HermesMobile/data/gateway-pool-manifest.json", "utf8"));
  const worker = manifest.workers.find((entry) => entry.profile === "lowgw1");
  if (!worker) {
    throw new Error("lowgw1 not found in gateway pool manifest");
  }
  const input = [
    "这是一次工具可用性测试。",
    "请调用 mcp_wardrobe_wardrobe_search_items 搜索关键词 test。",
    "如果工具不可用，请明确说 unavailable。",
  ].join("");
  const response = await fetch("http://127.0.0.1:18751/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${worker.api_key}`,
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      input,
      stream: false,
      metadata: {
        hermes_probe: "lowgw1-wardrobe-tool-call",
      },
    }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    parsed = null;
  }
  const output = Array.isArray(parsed?.output) ? parsed.output : [];
  const outputItems = output.map((item) => ({
    type: item?.type || "",
    name: item?.name || "",
    call_id: item?.call_id || "",
    outputStart: typeof item?.output === "string" ? item.output.slice(0, 500) : "",
    textStart: Array.isArray(item?.content)
      ? item.content.map((part) => part?.text || "").join("\n").slice(0, 500)
      : "",
  }));
  const names = Array.from(text.matchAll(/"name":\s*"([^"]+)"/g)).map((match) => match[1]);
  const summary = {
    status: response.status,
    contentType: response.headers.get("content-type"),
    hasWardrobeText: text.includes("mcp_wardrobe_"),
    hasUnavailableText: outputItems.some((item) => /unavailable|不可用|没有.*工具|not available/i.test(item.outputStart + item.textStart)),
    hasWardrobeCall: outputItems.some((item) => item.type === "function_call" && item.name.startsWith("mcp_wardrobe_")),
    hasWardrobeOutput: outputItems.some((item) => item.type === "function_call_output" && /wardrobe|衣橱|item|history|result|error|ok/i.test(item.outputStart)),
    names: names.slice(0, 24),
    outputItems,
    bodyStart: text.slice(0, 1600),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
