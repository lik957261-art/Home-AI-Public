"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-image", "__init__.py");
const scratchRoot = path.join(repoRoot, "workspace", "test-image-plugin");

function runPython(script, env = {}) {
  return execFileSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function testCollectsImageFromRawResponseEvents() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const imagePath = path.join(tempDir, "source.png");
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const script = `
import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_image", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
captured = {}
class DummyStream:
    def __init__(self):
        self.closed = False
    def __iter__(self):
        yield {
            "type": "response.image_generation_call.partial_image",
            "partial_image_b64": "partial-image",
        }
        yield {
            "type": "response.output_item.done",
            "item": {
                "type": "image_generation_call",
                "result": "final-image",
                "revised_prompt": "revised",
                "action": "edit",
            },
        }
        yield {
            "type": "response.completed",
            "response": {"output": None},
        }
    def close(self):
        self.closed = True
class DummyResponses:
    def create(self, **kwargs):
        captured.update(kwargs)
        captured["stream_arg"] = kwargs.get("stream")
        stream = DummyStream()
        captured["stream_object"] = stream
        return stream
    def stream(self, **kwargs):
        raise AssertionError("responses.stream must not be used")
class DummyClient:
    responses = DummyResponses()
image_b64, meta = module._collect_image_b64(
    DummyClient(),
    prompt="make the square blue",
    input_image=Path(${JSON.stringify(imagePath)}),
    quality="medium",
    size="auto",
)
print(json.dumps({
    "image": image_b64,
    "meta": meta,
    "closed": captured.get("stream_object").closed,
    "store": captured.get("store"),
    "stream_arg": captured.get("stream_arg"),
    "tool_model": captured.get("tools", [{}])[0].get("model"),
    "size_present": "size" in captured.get("tools", [{}])[0],
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script));
  assert.equal(result.image, "final-image");
  assert.deepEqual(result.meta, { revised_prompt: "revised", action: "edit" });
  assert.equal(result.closed, true);
  assert.equal(result.store, false);
  assert.equal(result.stream_arg, true);
  assert.equal(result.tool_model, "gpt-image-2");
  assert.equal(result.size_present, false);
}

function testSourceDoesNotUseSdkStreamFinalizer() {
  const source = fs.readFileSync(pluginPath, "utf8");
  assert.equal(source.includes("responses.stream("), false);
  assert.equal(source.includes("get_final_response("), false);
  assert.match(source, /responses\.create\(/);
  assert.match(source, /stream=True/);
}

testCollectsImageFromRawResponseEvents();
testSourceDoesNotUseSdkStreamFinalizer();

console.log("hermes-mobile-image-plugin tests passed");
