const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const POWERSHELL_DIRS = [
  path.join(REPO_ROOT, "scripts"),
  path.join(REPO_ROOT, "tests"),
];

function walkFiles(root, predicate, output = []) {
  if (!fs.existsSync(root)) {
    return output;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      walkFiles(fullPath, predicate, output);
      continue;
    }
    if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function lineHasStartProcess(line) {
  return /\bStart-Process\b/i.test(line);
}

function lineHasNoWindow(line) {
  return /-WindowStyle\s+["']?Hidden["']?/i.test(line);
}

function fileDefinesHiddenStartInfo(content) {
  return /\$startInfo\s*=\s*@\{[\s\S]*?\bWindowStyle\s*=\s*["']Hidden["'][\s\S]*?\}/i.test(content);
}

function lineUsesHiddenStartInfo(line, content) {
  return /Start-Process\s+@startInfo\b/i.test(line) && fileDefinesHiddenStartInfo(content);
}

function lineDocumentsVisibleException(line) {
  return /VISIBLE_WINDOW_OK/i.test(line);
}

function lineHasComplexInlineException(line) {
  return /COMPLEX_INLINE_OK/i.test(line);
}

function lineHasComplexInlineCommand(line) {
  const text = String(line || "");
  if (/\bnode(?:\.exe)?\s+-e\b/i.test(text) && /=>|JSON\.stringify|matchAll|\/.*\/|[\u4e00-\u9fff]/.test(text)) {
    return true;
  }
  if (/\bpython(?:\.exe)?\s+-c\b/i.test(text) && /;|import\s+|[\u4e00-\u9fff]|["'].*["']/.test(text)) {
    return true;
  }
  if (/<<\s*['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/.test(text)) {
    return true;
  }
  if (/\bbash\s+-lc\b/i.test(text) && /[|<>`$]|\bnode\s+-e\b|\bpython\s+-c\b/.test(text)) {
    return true;
  }
  return false;
}

function repoRelative(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

const files = POWERSHELL_DIRS.flatMap((dir) =>
  walkFiles(dir, (file) => /\.(ps1|js|cmd|bat)$/i.test(file))
);

const violations = [];
const LEGACY_COMPLEX_INLINE_BASELINE = new Set([
  "scripts/provision-worker-external-connectors.ps1:133: complex inline command must be moved to a script file",
  "scripts/provision-worker-external-connectors.ps1:177: complex inline command must be moved to a script file",
  "scripts/provision-worker-external-connectors.ps1:223: complex inline command must be moved to a script file",
  "scripts/provision-worker-external-connectors.ps1:290: complex inline command must be moved to a script file",
  "scripts/provision-worker-stt-cache.ps1:72: complex inline command must be moved to a script file",
  "scripts/provision-worker-stt-cache.ps1:87: complex inline command must be moved to a script file",
  "scripts/start-gateway-pool.ps1:517: complex inline command must be moved to a script file",
  "scripts/start-gateway-pool.ps1:800: complex inline command must be moved to a script file",
  "scripts/start-weixin-front-gateway.ps1:88: complex inline command must be moved to a script file",
  "scripts/start-weixin-front-gateway.ps1:138: complex inline command must be moved to a script file",
  "scripts/start-weixin-front-gateway.ps1:161: complex inline command must be moved to a script file",
  "scripts/start-weixin-mobile-ingress-bridge.ps1:132: complex inline command must be moved to a script file",
  "scripts/start-weixin-mobile-ingress-bridge.ps1:181: complex inline command must be moved to a script file",
]);
const LEGACY_COMPLEX_INLINE_PATTERNS = [
  {
    relative: "scripts/start-gateway-pool.ps1",
    pattern: /cat > "\$runtime_bin\/hermes" <<EOF/,
  },
  {
    relative: "scripts/start-gateway-pool.ps1",
    pattern: /python3 - "\$gateway_pool_manifest_path" "\$profile" <<'PY'/,
  },
];

function isLegacyComplexInline(relative, line) {
  return LEGACY_COMPLEX_INLINE_PATTERNS.some(
    (entry) => entry.relative === relative && entry.pattern.test(line)
  );
}

for (const file of files) {
  const relative = repoRelative(file);
  const isPowerShellScript = /\.ps1$/i.test(file);
  const isWindowsScript = /\.(ps1|cmd|bat)$/i.test(file);
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!isPowerShellScript || !lineHasStartProcess(line)) {
      if (isWindowsScript && lineHasComplexInlineCommand(line) && !lineHasComplexInlineException(line)) {
        const violation = `${relative}:${index + 1}: complex inline command must be moved to a script file`;
        if (!LEGACY_COMPLEX_INLINE_BASELINE.has(violation) && !isLegacyComplexInline(relative, line)) {
          violations.push(violation);
        }
      }
      return;
    }
    if (lineHasNoWindow(line) || lineUsesHiddenStartInfo(line, content) || lineDocumentsVisibleException(line)) {
      return;
    }
    violations.push(`${relative}:${index + 1}: Start-Process must use -WindowStyle Hidden`);
  });
}

assert.deepStrictEqual(violations, []);
console.log(`no-window command harness passed (${files.length} PowerShell files checked)`);
