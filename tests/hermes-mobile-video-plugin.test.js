"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-video", "__init__.py");
const scratchRoot = path.join(repoRoot, "workspace", "test-video-plugin");

function runPython(script, env = {}) {
  return execFileSync("python", ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

function testBuildsDataUriForAllowedLocalImage() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const imagePath = path.join(tempDir, "source.jpg");
  const relativeTempDir = path.relative(repoRoot, tempDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  fs.writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
path = module._validate_input_image(${JSON.stringify(relativeImagePath)})
uri = module._image_data_uri(path)
print(json.dumps({
    "starts": uri.startswith("data:image/jpeg;base64,"),
    "has_payload": len(uri.split(",", 1)[1]) > 0,
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: relativeTempDir,
  }));
  assert.equal(result.starts, true);
  assert.equal(result.has_payload, true);
}

function testRejectsOutOfScopeImagePath() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const allowedDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const otherDir = fs.mkdtempSync(path.join(scratchRoot, "other-"));
  const imagePath = path.join(otherDir, "source.png");
  const relativeAllowedDir = path.relative(repoRoot, allowedDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module._validate_input_image(${JSON.stringify(relativeImagePath)})
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: relativeAllowedDir,
  }));
  assert.equal(result.error, "input_image_path_outside_allowed_roots");
}

function testHandlerSubmitsLocalImageDataUriAndWritesOutput() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-"));
  const imagePath = path.join(tempDir, "source.webp");
  const outputPath = path.join(tempDir, "out.mp4");
  const relativeTempDir = path.relative(repoRoot, tempDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  const relativeOutputPath = path.relative(repoRoot, outputPath);
  fs.writeFileSync(imagePath, Buffer.from([0x52, 0x49, 0x46, 0x46]));

  const script = `
import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
captured = {}
class DummyClient:
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
module._make_http_client = lambda timeout_seconds: DummyClient()
module._resolve_xai_credentials = lambda: {
    "api_key": "test-token",
    "base_url": "https://api.x.ai/v1",
    "provider": "xai-oauth",
}
def submit(client, payload, *, api_key, base_url):
    captured["payload"] = payload
    captured["api_key"] = api_key
    captured["base_url"] = base_url
    return "req_test"
module._submit_generation = submit
module._poll_generation = lambda *args, **kwargs: {
    "status": "done",
    "body": {"video": {"url": "https://example.test/video.mp4"}},
}
def download(client, video_url, output_path):
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(b"mp4")
    return {"mime": "video/mp4", "bytes": 3}
module._download_video = download
result = json.loads(module._handle_video_generate({
    "input_image_path": ${JSON.stringify(relativeImagePath)},
    "output_path": ${JSON.stringify(relativeOutputPath)},
    "prompt": "animate the still image",
    "duration": 99,
    "resolution": "1080p",
}))
print(json.dumps({
    "ok": result.get("ok"),
    "media": result.get("media_line", "").startswith("MEDIA:"),
    "output_exists": Path(result.get("output_path", "")).exists(),
    "provider": result.get("provider"),
    "duration": captured["payload"].get("duration"),
    "resolution": captured["payload"].get("resolution"),
    "image_data_uri": captured["payload"].get("image", {}).get("url", "").startswith("data:image/webp;base64,"),
    "api_key": captured["api_key"],
    "base_url": captured["base_url"],
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: relativeTempDir,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.media, true);
  assert.equal(result.output_exists, true);
  assert.equal(result.provider, "xai-oauth");
  assert.equal(result.duration, 15);
  assert.equal(result.resolution, "720p");
  assert.equal(result.image_data_uri, true);
  assert.equal(result.api_key, "test-token");
  assert.equal(result.base_url, "https://api.x.ai/v1");
}

function testHandlerTreatsLocalImageUrlAsInputImagePath() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-url-"));
  const imagePath = path.join(tempDir, "source.png");
  const outputPath = path.join(tempDir, "out.mp4");
  const relativeTempDir = path.relative(repoRoot, tempDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  const relativeOutputPath = path.relative(repoRoot, outputPath);
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const script = `
import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
captured = {}
class DummyClient:
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
module._make_http_client = lambda timeout_seconds: DummyClient()
module._resolve_xai_credentials = lambda: {
    "api_key": "test-token",
    "base_url": "https://api.x.ai/v1",
    "provider": "xai-oauth",
}
def submit(client, payload, *, api_key, base_url):
    captured["payload"] = payload
    return "req_test"
module._submit_generation = submit
module._poll_generation = lambda *args, **kwargs: {
    "status": "done",
    "body": {"video": {"url": "https://example.test/video.mp4"}},
}
def download(client, video_url, output_path):
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(b"mp4")
    return {"mime": "video/mp4", "bytes": 3}
module._download_video = download
result = json.loads(module._handle_video_generate({
    "image_url": ${JSON.stringify(relativeImagePath)},
    "output_path": ${JSON.stringify(relativeOutputPath)},
    "prompt": "animate the uploaded image",
}))
print(json.dumps({
    "ok": result.get("ok"),
    "modality": result.get("modality"),
    "image_data_uri": captured["payload"].get("image", {}).get("url", "").startswith("data:image/png;base64,"),
    "output_exists": Path(result.get("output_path", "")).exists(),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: relativeTempDir,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.modality, "image");
  assert.equal(result.image_data_uri, true);
  assert.equal(result.output_exists, true);
}

function testHandlerTreatsFileUrlAsInputImagePath() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-file-url-"));
  const imagePath = path.join(tempDir, "source.jpg");
  const outputPath = path.join(tempDir, "out.mp4");
  const fileUrl = `file:///${imagePath.replace(/\\/g, "/")}`;
  const relativeOutputPath = path.relative(repoRoot, outputPath);
  fs.writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const script = `
import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
captured = {}
class DummyClient:
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
module._make_http_client = lambda timeout_seconds: DummyClient()
module._resolve_xai_credentials = lambda: {
    "api_key": "test-token",
    "base_url": "https://api.x.ai/v1",
    "provider": "xai-oauth",
}
module._submit_generation = lambda client, payload, **kwargs: captured.setdefault("payload", payload) and "req_test"
module._poll_generation = lambda *args, **kwargs: {
    "status": "done",
    "body": {"video": {"url": "https://example.test/video.mp4"}},
}
def download(client, video_url, output_path):
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(b"mp4")
    return {"mime": "video/mp4", "bytes": 3}
module._download_video = download
result = json.loads(module._handle_video_generate({
    "image_url": ${JSON.stringify(fileUrl)},
    "output_path": ${JSON.stringify(relativeOutputPath)},
    "prompt": "animate the uploaded image",
}))
print(json.dumps({
    "ok": result.get("ok"),
    "image_data_uri": captured["payload"].get("image", {}).get("url", "").startswith("data:image/jpeg;base64,"),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: tempDir,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.image_data_uri, true);
}

function testRejectsOutOfScopeImageUrlPath() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const allowedDir = fs.mkdtempSync(path.join(scratchRoot, "allowed-url-scope-"));
  const otherDir = fs.mkdtempSync(path.join(scratchRoot, "other-url-scope-"));
  const imagePath = path.join(otherDir, "source.png");
  const relativeAllowedDir = path.relative(repoRoot, allowedDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result = json.loads(module._handle_video_generate({
    "image_url": ${JSON.stringify(relativeImagePath)},
    "prompt": "animate this image",
}))
print(json.dumps({
    "ok": result.get("ok"),
    "error": result.get("error"),
    "error_type": result.get("error_type"),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: relativeAllowedDir,
  }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "input_image_path_outside_allowed_roots");
  assert.equal(result.error_type, "PermissionError");
}

function testRegistersProviderAndGeneratesFromLocalImageUrl() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, "provider-"));
  const imagePath = path.join(tempDir, "source.png");
  const outputPath = path.join(tempDir, "out.mp4");
  const relativeTempDir = path.relative(repoRoot, tempDir);
  const relativeImagePath = path.relative(repoRoot, imagePath);
  const relativeOutputPath = path.relative(repoRoot, outputPath);
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const script = `
import importlib.util, json, sys, types
from pathlib import Path

agent_mod = types.ModuleType("agent")
video_mod = types.ModuleType("agent.video_gen_provider")
class VideoGenProvider:
    pass
def success_response(**kwargs):
    payload = {"success": True}
    payload.update(kwargs)
    extra = payload.pop("extra", None)
    if extra:
        payload.update(extra)
    return payload
def error_response(**kwargs):
    payload = {"success": False}
    payload.update(kwargs)
    return payload
video_mod.VideoGenProvider = VideoGenProvider
video_mod.success_response = success_response
video_mod.error_response = error_response
sys.modules["agent"] = agent_mod
sys.modules["agent.video_gen_provider"] = video_mod

spec = importlib.util.spec_from_file_location("hermes_mobile_video", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

captured = {}
class DummyClient:
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
module._make_http_client = lambda timeout_seconds: DummyClient()
module._resolve_xai_credentials = lambda: {
    "api_key": "test-token",
    "base_url": "https://api.x.ai/v1",
    "provider": "xai-oauth",
}
def submit(client, payload, *, api_key, base_url):
    captured["payload"] = payload
    return "req_test"
module._submit_generation = submit
module._poll_generation = lambda *args, **kwargs: {
    "status": "done",
    "body": {"video": {"url": "https://example.test/video.mp4"}},
}
def download(client, video_url, output_path):
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(b"mp4")
    return {"mime": "video/mp4", "bytes": 3}
module._download_video = download

providers = []
class Ctx:
    def register_video_gen_provider(self, provider):
        providers.append(provider)
module.register(Ctx())
provider = providers[0]
result = provider.generate(
    prompt="animate the uploaded image",
    image_url=${JSON.stringify(relativeImagePath)},
    model="grok-imagine-video",
    duration=8,
    aspect_ratio="16:9",
    resolution="720p",
)
print(json.dumps({
    "provider_count": len(providers),
    "provider_name": provider.name,
    "display": provider.display_name,
    "success": result.get("success"),
    "video_exists": Path(result.get("video", "")).exists(),
    "media": str(result.get("media_line", "")).startswith("MEDIA:"),
    "image_data_uri": captured["payload"].get("image", {}).get("url", "").startswith("data:image/png;base64,"),
}, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script, {
    HERMES_MOBILE_VIDEO_ALLOWED_ROOTS: relativeTempDir,
    HERMES_MOBILE_VIDEO_OUTPUT_ROOT: relativeTempDir,
  }));
  assert.equal(result.provider_count, 1);
  assert.equal(result.provider_name, "hermes-mobile-xai");
  assert.match(result.display, /local image_url paths supported/);
  assert.equal(result.success, true);
  assert.equal(result.video_exists, true);
  assert.equal(result.media, true);
  assert.equal(result.image_data_uri, true);
}

testBuildsDataUriForAllowedLocalImage();
testRejectsOutOfScopeImagePath();
testHandlerSubmitsLocalImageDataUriAndWritesOutput();
testHandlerTreatsLocalImageUrlAsInputImagePath();
testHandlerTreatsFileUrlAsInputImagePath();
testRejectsOutOfScopeImageUrlPath();
testRegistersProviderAndGeneratesFromLocalImageUrl();

console.log("hermes-mobile-video-plugin tests passed");
