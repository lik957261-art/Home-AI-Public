"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadController() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-file-input-controller.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function fakeInput(files = []) {
  const listeners = new Map();
  return {
    value: "C:\\fakepath\\camera.jpg",
    files,
    addEventListener(type, handler, options) {
      listeners.set(type, { handler, options });
    },
    removeEventListener(type, handler, options) {
      const current = listeners.get(type);
      if (current?.handler === handler && current?.options?.capture === options?.capture) {
        listeners.delete(type);
      }
    },
    listener(type) {
      return listeners.get(type);
    },
  };
}

function fakeSelectionEvent(input) {
  const calls = [];
  return {
    target: input,
    calls,
    preventDefault() { calls.push("preventDefault"); },
    stopPropagation() { calls.push("stopPropagation"); },
    stopImmediatePropagation() { calls.push("stopImmediatePropagation"); },
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("file input controller stays browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/attachment-file-input-controller.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /FileReader/);
    assert.doesNotMatch(source, /location\./);
  });

  await test("change event is stopped, snapshotted, and clears input value", async () => {
    const module = await loadController();
    const events = [];
    const input = fakeInput([
      { name: "camera.jpg", type: "image/jpeg", size: 9 },
      { name: "note.md", type: "text/markdown", size: 12 },
    ]);
    const controller = module.createAttachmentFileInputController({
      input,
      events: { emit: (type, payload) => events.push({ type, payload }) },
    });
    const event = fakeSelectionEvent(input);
    const result = controller.handleChange(event);

    assert.deepEqual(event.calls, ["preventDefault", "stopPropagation", "stopImmediatePropagation"]);
    assert.equal(input.value, "");
    assert.equal(result.status, "selected");
    assert.equal(result.count, 2);
    assert.equal(result.inputCleared, true);
    assert.deepEqual(controller.getSelectedMetadata().map((file) => file.name), ["camera.jpg", "note.md"]);
    assert.deepEqual(controller.getSelectedFiles().map((file) => file.name), ["camera.jpg", "note.md"]);
    assert.equal(events[0].type, "chat-runtime-preview:attachment-file-input");
    assert.equal(events[0].payload.evidence[0], "selected_count=2");
  });

  await test("bind wires capture listener and dispose removes it", async () => {
    const module = await loadController();
    const input = fakeInput([{ name: "camera.jpg", type: "image/jpeg" }]);
    const controller = module.createAttachmentFileInputController();
    const dispose = controller.bind(input);
    assert.equal(input.listener("change").options.capture, true);
    input.listener("change").handler(fakeSelectionEvent(input));
    assert.equal(input.value, "");
    assert.equal(controller.getSelectedFiles().length, 1);
    dispose();
    assert.equal(input.listener("change"), undefined);
  });

  await test("clearing selection resets snapshot and input for repeated camera selections", async () => {
    const module = await loadController();
    const input = fakeInput([{ name: "same-photo.jpg", type: "image/jpeg", size: 10 }]);
    const controller = module.createAttachmentFileInputController({ input });
    controller.handleChange(fakeSelectionEvent(input));
    assert.equal(controller.getSelectedFiles().length, 1);
    input.value = "C:\\fakepath\\same-photo.jpg";
    const cleared = controller.clearSelection("uploaded");
    assert.equal(cleared.status, "cleared");
    assert.equal(cleared.reason, "uploaded");
    assert.equal(input.value, "");
    assert.equal(controller.getSelectedFiles().length, 0);

    input.files = [{ name: "same-photo.jpg", type: "image/jpeg", size: 10 }];
    input.value = "C:\\fakepath\\same-photo.jpg";
    controller.handleChange(fakeSelectionEvent(input));
    assert.equal(controller.getSelectedFiles().length, 1);
    assert.equal(input.value, "");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
