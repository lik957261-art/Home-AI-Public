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

function testSaveBase64ImagePayload() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const saveDir = fs.mkdtempSync(path.join(scratchRoot, "save-"));
  const relativeSaveDir = path.relative(repoRoot, saveDir);
  const script = `
import importlib.util, json, os
spec = importlib.util.spec_from_file_location("hermes_mobile_http", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
payload = {"json": {"image": {"dataBase64": "iVBORw0KGgo="}}}
result = module._save_base64_from_payload(payload, {
    "save_base64": {
        "json_path": "image.dataBase64",
        "filename": "wardrobe-photo.png",
    }
})
saved = result["saved_file"]["path"]
print(json.dumps({
    "name": result["saved_file"]["name"],
    "mime": result["saved_file"]["mime"],
    "bytes": result["saved_file"]["bytes"],
    "exists": os.path.isfile(saved),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, { HERMES_MOBILE_HTTP_SAVE_ROOT: relativeSaveDir }));
  assert.equal(result.name, "wardrobe-photo.png");
  assert.equal(result.mime, "image/png");
  assert.equal(result.bytes, 8);
  assert.equal(result.exists, true);
}

function testSaveBinaryHttpResponsePayload() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const saveDir = fs.mkdtempSync(path.join(scratchRoot, "binary-save-"));
  const relativeSaveDir = path.relative(repoRoot, saveDir);
  const script = `
import importlib.util, json, os
spec = importlib.util.spec_from_file_location("hermes_mobile_http", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result = module._save_response_body(b"\\xff\\xd8\\xff\\xd9", {
    "save_as": {
        "filename": "IMG_4321.jpeg",
    }
}, "image/jpeg")
saved = result["saved_file"]["path"]
parsed = module._parse_response(b"\\xff\\xd8\\xff\\xd9", "image/jpeg")
print(json.dumps({
    "name": result["saved_file"]["name"],
    "mime": result["saved_file"]["mime"],
    "bytes": result["saved_file"]["bytes"],
    "exists": os.path.isfile(saved),
    "body_omitted": parsed.get("body_omitted"),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, { HERMES_MOBILE_HTTP_SAVE_ROOT: relativeSaveDir }));
  assert.equal(result.name, "IMG_4321.jpeg");
  assert.equal(result.mime, "image/jpeg");
  assert.equal(result.bytes, 4);
  assert.equal(result.exists, true);
  assert.equal(result.body_omitted, "binary_response");
}

function testCodexMobileOwnerProfileGate() {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_http", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Ctx:
    def __init__(self):
        self.tools = []
    def register_tool(self, **kwargs):
        self.tools.append(kwargs.get("name"))
ctx = Ctx()
module.register(ctx)
blocked = json.loads(module._http_request_handler({"url": "hermes-mobile://codex-mux", "json": {"action": "list_tasks"}}))
print(json.dumps({
    "tools": sorted(ctx.tools),
    "blocked_status": blocked.get("status"),
    "blocked_error": blocked.get("error"),
}, ensure_ascii=False))
`;
  let result = JSON.parse(runPython(script, { HERMES_PROFILE: "lowgw1" }));
  assert.equal(result.tools.includes("codex_mobile"), true);
  assert.notEqual(result.blocked_status, 403);

  result = JSON.parse(runPython(script, { HERMES_PROFILE: "lowgw5" }));
  assert.equal(result.tools.includes("codex_mobile"), false);
  assert.equal(result.blocked_status, 403);
  assert.equal(result.blocked_error, "codex_mobile_owner_only");
}

testFileBodyLoadsAllowedImageBytes();
testMultipartLoadsAllowedImageBytes();
testRejectsOutOfScopeUploadPath();
testSaveBase64ImagePayload();
testSaveBinaryHttpResponsePayload();
testCodexMobileOwnerProfileGate();

console.log("hermes-mobile-http-plugin tests passed");
