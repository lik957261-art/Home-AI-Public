"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const INDEX_HTML_PATH = path.join(REPO_ROOT, "public/index.html");
const INVENTORY_DOC_PATH = path.join(
  REPO_ROOT,
  "docs/IMPLEMENTATION_NOTES/static-client-boot-inventory.md",
);

const GROUP_RULES = [
  ["pwa-native", /(fixed-viewport|pwa|push|native|mobile-layout|platform-status)/],
  ["foundation", /(^app\.js$|markdown-renderer|artifact-helpers|api-client|runtime-facade|platform-ui|dialog|shell|access-key|shared-directory|route-snapshot)/],
  ["runtime", /(event-stream|events-composer|run-progress|composer-event|current-thread|streaming|refresh|invalidation|navigation|viewport|start|wire-start|chat-scope|thread-state|thread-list)/],
  ["input", /(composer|voice|attachment|draft-thread|send-pipeline|pending-send|editor|model|source)/],
  ["plugin-host", /(embedded-plugin|plugin-|plugin-admin|plugin-topics)/],
  ["viewers", /(directory|rich-text|long-message|share-image|message|skill|usage|markdown|file|artifact)/],
  ["surfaces", /(owner-system-console|workspace-console|ai-ops|automation|action-inbox|kanban|learning|growth|task|todo|sidebar|group-topic|workspace-admin|wardrobe)/],
];

const FACADE_CANDIDATES = [
  "state",
  "api",
  "$",
  "showError",
  "setStatus",
  "renderApp",
  "renderConversation",
  "loadThreads",
  "selectThread",
  "currentWorkspaceId",
  "openFeedbackMenu",
  "window",
  "document",
  "localStorage",
  "navigator",
  "history",
];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeScriptPath(src) {
  const clean = String(src || "").split("?")[0].replace(/^\/+/, "");
  if (!clean || clean.startsWith("http://") || clean.startsWith("https://")) return "";
  return clean;
}

function scriptVersion(src) {
  const match = String(src || "").match(/[?&]v=([^&#]+)/);
  return match ? match[1] : "";
}

function extractScripts(html) {
  const out = [];
  const regex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const src = match[1];
    const scriptPath = normalizeScriptPath(src);
    if (!scriptPath) continue;
    out.push({
      index: out.length + 1,
      src,
      path: scriptPath,
      version: scriptVersion(src),
    });
  }
  return out;
}

function classifyModule(scriptPath) {
  const lower = scriptPath.toLowerCase();
  for (const [group, regex] of GROUP_RULES) {
    if (regex.test(lower)) return group;
  }
  return "unclassified";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function limited(values, max = 16) {
  return values.slice(0, max);
}

function extractProducedSymbols(text) {
  const symbols = [];
  const functionRegex = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const lexicalRegex = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  const assignmentRegex = /\b(?:window|globalThis|root)\.([A-Za-z_$][\w$]*)\s*=/g;
  for (const regex of [functionRegex, lexicalRegex, assignmentRegex]) {
    let match;
    while ((match = regex.exec(text))) symbols.push(match[1]);
  }
  return uniqueSorted(symbols);
}

function extractDomRoots(text) {
  const roots = [];
  const idRegexes = [
    /\b(?:document\.)?getElementById\(\s*["']([^"']+)["']\s*\)/g,
    /\$\(\s*["']([^"']+)["']\s*\)/g,
    /\bquerySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)/g,
  ];
  const dataRegex = /\[data-([a-z0-9-]+)/g;
  for (const regex of idRegexes) {
    let match;
    while ((match = regex.exec(text))) roots.push(`#${match[1]}`);
  }
  let match;
  while ((match = dataRegex.exec(text))) roots.push(`[data-${match[1]}]`);
  return uniqueSorted(roots);
}

function extractSideEffects(text) {
  const effects = [];
  if (/\b(?:window|document)\.addEventListener\(/.test(text)) effects.push("global_event_listener");
  if (/\baddEventListener\(["'](?:DOMContentLoaded|load|visibilitychange|beforeunload|pagehide|pageshow)/.test(text)) {
    effects.push("lifecycle_listener");
  }
  if (/\bsetInterval\(/.test(text)) effects.push("interval_timer");
  if (/\bsetTimeout\(/.test(text)) effects.push("timeout_timer");
  if (/^\s*\([^)]*function\b|^\s*!function\b|^\s*\(function\b/m.test(text)) effects.push("iife");
  if (/^\s*start\(\s*\)\s*;?\s*$/m.test(text)) effects.push("starts_app");
  if (/\bserviceWorker\b/.test(text)) effects.push("service_worker");
  if (/\blocalStorage\b/.test(text)) effects.push("local_storage");
  if (/\bnavigator\b/.test(text)) effects.push("browser_capability");
  return uniqueSorted(effects);
}

function extractIdentifierUses(text) {
  const identifiers = new Set();
  const regex = /\b[A-Za-z_$][\w$]*\b/g;
  let match;
  while ((match = regex.exec(text))) identifiers.add(match[0]);
  return identifiers;
}

function scriptOrderHash(scripts) {
  const payload = scripts.map((script) => script.path).join("\n");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function buildInventory() {
  const html = readText(INDEX_HTML_PATH);
  const scripts = extractScripts(html);
  const perScript = scripts.map((script) => {
    const filePath = path.join(REPO_ROOT, "public", script.path);
    const exists = fs.existsSync(filePath);
    const text = exists ? readText(filePath) : "";
    return Object.assign({}, script, {
      exists,
      group: classifyModule(script.path),
      producedSymbols: extractProducedSymbols(text),
      identifierUses: extractIdentifierUses(text),
      domRoots: extractDomRoots(text),
      sideEffects: extractSideEffects(text),
    });
  });
  const allProduced = new Set(perScript.flatMap((script) => script.producedSymbols));
  const enrichedScripts = perScript.map((script) => {
    const localProduced = new Set(script.producedSymbols);
    const consumedSymbols = [...allProduced]
      .filter((symbol) => script.identifierUses.has(symbol) && !localProduced.has(symbol))
      .sort((a, b) => a.localeCompare(b));
    const facadeUses = FACADE_CANDIDATES
      .filter((symbol) => script.identifierUses.has(symbol))
      .sort((a, b) => a.localeCompare(b));
    return Object.assign({}, script, {
      consumedSymbols,
      facadeUses,
    });
  });
  const groupCounts = countBy(enrichedScripts.map((script) => script.group));
  const facadeCounts = countBy(enrichedScripts.flatMap((script) => script.facadeUses));
  return {
    generatedFrom: {
      indexHtml: "public/index.html",
      scriptCount: enrichedScripts.length,
      scriptOrderHash: scriptOrderHash(enrichedScripts),
    },
    groupCounts,
    facadeCounts,
    scripts: enrichedScripts,
  };
}

function mdCell(value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value == null ? "" : value);
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "-";
}

function renderMarkdown(inventory) {
  const lines = [];
  lines.push("# Static Client Boot Inventory");
  lines.push("");
  lines.push("<!-- generated-by: scripts/static-client-boot-inventory.js -->");
  lines.push(`<!-- script-count: ${inventory.generatedFrom.scriptCount} -->`);
  lines.push(`<!-- script-order-sha256: ${inventory.generatedFrom.scriptOrderHash} -->`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("This inventory captures the current classic Home AI frontend boot graph");
  lines.push("before the primary shell is migrated to Vite. It is generated from");
  lines.push("`public/index.html` and the referenced static JavaScript files. The");
  lines.push("inventory is a migration aid, not a runtime contract.");
  lines.push("");
  lines.push("## Group Counts");
  lines.push("");
  lines.push("| Group | Script count |");
  lines.push("| --- | ---: |");
  for (const [group, count] of inventory.groupCounts) lines.push(`| ${mdCell(group)} | ${count} |`);
  lines.push("");
  lines.push("## Runtime Facade Candidate Uses");
  lines.push("");
  lines.push("| Symbol | Referencing scripts |");
  lines.push("| --- | ---: |");
  for (const [symbol, count] of inventory.facadeCounts) lines.push(`| \`${mdCell(symbol)}\` | ${count} |`);
  lines.push("");
  lines.push("## Ordered Script Inventory");
  lines.push("");
  lines.push("| # | Group | Path | Version | Produced globals | Consumed globals | DOM roots | Import side effects |");
  lines.push("| ---: | --- | --- | --- | --- | --- | --- | --- |");
  for (const script of inventory.scripts) {
    lines.push([
      script.index,
      mdCell(script.group),
      `\`${mdCell(script.path)}\``,
      mdCell(script.version),
      mdCell(limited(script.producedSymbols).map((value) => `\`${value}\``)),
      mdCell(limited(script.consumedSymbols).map((value) => `\`${value}\``)),
      mdCell(limited(script.domRoots)),
      mdCell(script.sideEffects),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  lines.push("## Notes For Vite Migration");
  lines.push("");
  lines.push("- Script order is part of the current classic shell behavior. If");
  lines.push("  `public/index.html` script order changes, regenerate this inventory in the");
  lines.push("  same change.");
  lines.push("- `Produced globals` and `Consumed globals` are heuristic static-analysis");
  lines.push("  fields used to plan ES-module extraction. They must be verified when moving");
  lines.push("  each module.");
  lines.push("- `Runtime Facade Candidate Uses` identifies symbols that should move behind");
  lines.push("  an explicit client runtime facade before bundling the primary shell.");
  lines.push("- `Import side effects` marks files that may need mount functions or");
  lines.push("  lifecycle adapters before they are safe to import from Vite.");
  return `${lines.join("\n")}\n`;
}

function writeInventory() {
  const inventory = buildInventory();
  fs.mkdirSync(path.dirname(INVENTORY_DOC_PATH), { recursive: true });
  fs.writeFileSync(INVENTORY_DOC_PATH, renderMarkdown(inventory));
  return inventory;
}

function main() {
  const shouldWrite = process.argv.includes("--write");
  const inventory = shouldWrite ? writeInventory() : buildInventory();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({
      scriptCount: inventory.generatedFrom.scriptCount,
      scriptOrderHash: inventory.generatedFrom.scriptOrderHash,
      groupCounts: Object.fromEntries(inventory.groupCounts),
    }, null, 2)}\n`);
    return;
  }
  if (shouldWrite) {
    console.log(`static client boot inventory written: ${path.relative(REPO_ROOT, INVENTORY_DOC_PATH)}`);
  } else {
    process.stdout.write(renderMarkdown(inventory));
  }
}

if (require.main === module) main();

module.exports = {
  buildInventory,
  renderMarkdown,
  scriptOrderHash,
};
