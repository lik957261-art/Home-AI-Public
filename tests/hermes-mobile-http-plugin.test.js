"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-http", "__init__.py");
const scratchRoot = path.join(repoRoot, "workspace", "test-http-plugin");

function runPython(script, env = {}) {
  return execFileSync("python", ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function testFileBodyLoadsAllowedImageBytes() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const imagePath = path.join(tempDir, "front.jpg");
  const relativeTempDir = path.relative(repoRoot, tempDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  fs.writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_http", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
headers = {}
body, meta = module._body({
    "file_body": {
        "path": ${JSON.stringify(relativeImagePath)},
        "filename": "IMG_5155.jpeg",
    }
}, headers)
print(json.dumps({
    "body_hex": body.hex(),
    "content_type": headers.get("Content-Type"),
    "x_filename": headers.get("X-Filename"),
    "mode": meta.get("request_body_mode"),
    "names": meta.get("request_file_names"),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_HTTP_FILE_ROOTS: relativeTempDir,
  }));
  assert.equal(result.body_hex, "ffd8ffd9");
  assert.equal(result.content_type, "image/jpeg");
  assert.equal(result.x_filename, "IMG_5155.jpeg");
  assert.equal(result.mode, "file_body");
  assert.deepEqual(result.names, ["IMG_5155.jpeg"]);
}

function testMultipartLoadsAllowedImageBytes() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const imagePath = path.join(tempDir, "front.png");
  const relativeTempDir = path.relative(repoRoot, tempDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_http", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
headers = {}
body, meta = module._body({
    "multipart_fields": {"dry_run": "true"},
    "multipart_files": [{
        "field": "photos[]",
        "path": ${JSON.stringify(relativeImagePath)},
    }]
}, headers)
text = body.decode("latin1")
print(json.dumps({
    "content_type": headers.get("Content-Type"),
    "has_field": "name=\\"dry_run\\"" in text,
    "has_file": "name=\\"photos[]\\"" in text and "filename=\\"front.png\\"" in text,
    "has_bytes": "\\x89PNG" in text,
    "mode": meta.get("request_body_mode"),
    "file_count": meta.get("request_file_count"),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_HTTP_FILE_ROOTS: relativeTempDir,
  }));
  assert.match(result.content_type, /^multipart\/form-data; boundary=----HermesMobileHTTP/);
  assert.equal(result.has_field, true);
  assert.equal(result.has_file, true);
  assert.equal(result.has_bytes, true);
  assert.equal(result.mode, "multipart");
  assert.equal(result.file_count, 1);
}

function testRejectsOutOfScopeUploadPath() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const allowedDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const otherDir = fs.mkdtempSync(path.join(scratchRoot, "other-"));
  const imagePath = path.join(otherDir, "front.jpg");
  const relativeAllowedDir = path.relative(repoRoot, allowedDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  fs.writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_http", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module._body({"file_body": {"path": ${JSON.stringify(relativeImagePath)}}}, {})
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, { HERMES_MOBILE_HTTP_FILE_ROOTS: relativeAllowedDir }));
  assert.equal(result.error, "file_path_outside_allowed_roots");
}

testFileBodyLoadsAllowedImageBytes();
testMultipartLoadsAllowedImageBytes();
testRejectsOutOfScopeUploadPath();

console.log("hermes-mobile-http-plugin tests passed");
