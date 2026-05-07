"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const TEXT_EXTENSIONS = new Set([
  "",
  ".css",
  ".example",
  ".gitattributes",
  ".gitignore",
  ".html",
  ".js",
  ".json",
  ".md",
  ".ps1",
  ".py",
  ".sh",
  ".vbs",
  ".yml",
  ".yaml",
]);

const FORBIDDEN_PATH_PARTS = [
  ".agent-context",
  "AGENTS.md",
  "node_modules",
  "workspace/hermes-web/state.json",
  "workspace/hermes-web/access-keys.json",
  "workspace/hermes-web/web-push-vapid.json",
];

const FORBIDDEN_CONTENT = [
  { label: "Windows user path", pattern: /C:\\Users\\xuxin\b/i },
  { label: "WSL user path", pattern: /\/home\/xuxin\b/i },
  { label: "Tailnet host", pattern: new RegExp("tail" + "62e8ce", "i") },
  { label: "Agent private clone path", pattern: /pentiumxp\/Agent/i },
  { label: "Private mailbox", pattern: /582690954@qq\.com/i },
  { label: "Private key block", pattern: /BEGIN (?:RSA |OPENSSH |EC |DSA |)PRIVATE KEY/i },
  {
    label: "Committed auth key value",
    pattern: /^(?!\s*#)\s*(?:HERMES_WEB_KEY|HERMES_WEB_HERMES_API_KEY|API_SERVER_KEY)\s*=\s*[^$\s#]\S{11,}/m,
  },
  {
    label: "Committed VAPID private key value",
    pattern: /^(?!\s*#)\s*(?:WEB_PUSH_VAPID_PRIVATE_KEY|HERMES_WEB_VAPID_PRIVATE_KEY)\s*=\s*[^$\s#]\S{11,}/m,
  },
];

function gitFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean).sort();
}

function isTextFile(relativePath) {
  const ext = path.extname(relativePath);
  return TEXT_EXTENSIONS.has(ext);
}

function readText(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  const buffer = fs.readFileSync(fullPath);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

function scan() {
  const findings = [];
  for (const relativePath of gitFiles()) {
    const normalized = relativePath.replaceAll("\\", "/");
    for (const part of FORBIDDEN_PATH_PARTS) {
      if (normalized.includes(part)) {
        findings.push(`${relativePath}: forbidden path fragment "${part}"`);
      }
    }
    if (!isTextFile(relativePath)) continue;
    const text = readText(relativePath);
    if (text === null) continue;
    for (const rule of FORBIDDEN_CONTENT) {
      if (rule.pattern.test(text)) {
        findings.push(`${relativePath}: ${rule.label}`);
      }
    }
  }
  return findings;
}

const findings = scan();
if (findings.length) {
  console.error("Privacy scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Privacy scan passed.");
