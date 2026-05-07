"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = path.resolve(__dirname, "..");

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
  "__pycache__",
  "workspace/",
  "logs/",
  "outbox/",
  "uploads/",
  "tmp/",
  "temp/",
  ".hermes_web_secret_key",
  "workspace/hermes-web/state.json",
  "workspace/hermes-web/access-keys.json",
  "workspace/hermes-web/web-push-vapid.json",
  "access-keys.json",
  "web-push-vapid.json",
  "hermes-mobile.sqlite3",
];

const FORBIDDEN_CONTENT = [
  { label: "Windows user path", pattern: /[A-Z]:\\Users\\(?!Public\\|Default\\|Default User\\)[^\\\s"']+/i },
  { label: "WSL user path", pattern: /\/home\/(?!hermes\b|user\b|ubuntu\b|runner\b|example\b)[A-Za-z0-9._-]+/i },
  { label: "Windows-mounted user path", pattern: /\/mnt\/[a-z]\/Users\//i },
  { label: "Tailnet host", pattern: /(?:^|[\s/"'])[\w.-]*tail[a-z0-9-]+\.ts\.net\b/i },
  { label: "Agent private clone path", pattern: new RegExp("pentium" + "xp" + "\\/Agent", "i") },
  { label: "Private Hermes Mobile clone path", pattern: new RegExp("pentium" + "xp" + "\\/hermes-mobile", "i") },
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

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "workspace",
  "logs",
  "outbox",
  "uploads",
  "tmp",
  "temp",
  "__pycache__",
]);

const SKIP_TEXT_PREFIXES = [
  "public/vendor/",
];

function parseArgs(argv) {
  const out = {
    root: DEFAULT_ROOT,
    allFiles: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      out.root = path.resolve(argv[++index] || out.root);
    } else if (arg === "--all-files") {
      out.allFiles = true;
    } else if (arg === "--help") {
      console.log("Usage: node scripts/privacy-scan.js [--root <dir>] [--all-files]");
      process.exit(0);
    }
  }
  if (out.root !== DEFAULT_ROOT) out.allFiles = true;
  return out;
}

function gitFiles(root) {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean).sort();
}

function allFiles(root) {
  const result = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        result.push(relativePath);
      }
    }
  }
  visit(root);
  return result.sort();
}

function isTextFile(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (SKIP_TEXT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  const ext = path.extname(relativePath);
  return TEXT_EXTENSIONS.has(ext);
}

function readText(root, relativePath) {
  const fullPath = path.join(root, relativePath);
  const buffer = fs.readFileSync(fullPath);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

function forbiddenPathFindings(relativePath) {
  const findings = [];
  const normalized = relativePath.replaceAll("\\", "/");
  const base = path.basename(normalized);
  for (const part of FORBIDDEN_PATH_PARTS) {
    if (normalized.includes(part)) {
      findings.push(`${relativePath}: forbidden path fragment "${part}"`);
    }
  }
  if ((base === ".env" || (base.startsWith(".env.") && base !== ".env.example"))) {
    findings.push(`${relativePath}: forbidden environment file`);
  }
  if (/state(?:-[^/\\]+)?\.json$/i.test(base) && normalized.includes("/")) {
    findings.push(`${relativePath}: forbidden runtime state file`);
  }
  return findings;
}

function scan(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const files = options.allFiles ? allFiles(root) : gitFiles(root);
  const findings = [];
  for (const relativePath of files) {
    findings.push(...forbiddenPathFindings(relativePath));
    if (!isTextFile(relativePath)) continue;
    const text = readText(root, relativePath);
    if (text === null) continue;
    for (const rule of FORBIDDEN_CONTENT) {
      if (rule.pattern.test(text)) {
        findings.push(`${relativePath}: ${rule.label}`);
      }
    }
  }
  return findings;
}

const options = parseArgs(process.argv.slice(2));
const findings = scan(options);
if (findings.length) {
  console.error("Privacy scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Privacy scan passed.");
