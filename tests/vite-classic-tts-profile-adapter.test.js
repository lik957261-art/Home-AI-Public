"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-tts-profile-ui.js"), "utf8");

function createOverlay(fields = {}) {
  const listeners = [];
  const defaultFields = {
    "#ttsProfileLabel": { value: "Documentary Host", setAttribute(name, value) { this[name] = value; } },
    "#ttsProfileId": { value: "voice_1", setAttribute(name, value) { this[name] = value; } },
    "#ttsProfilePromptText": { value: "Prompt text", setAttribute(name, value) { this[name] = value; } },
    "#ttsProfileSetDefault": { checked: true, setAttribute(name, value) { this[name] = value; } },
  };
  const elements = { ...defaultFields, ...fields };
  const inert = {
    addEventListener(...args) {
      listeners.push(args);
    },
  };
  return {
    innerHTML: "",
    classList: {
      toggle() {},
    },
    querySelector(selector) {
      if (elements[selector]) return elements[selector];
      if (selector === "[data-close-tts-profiles]"
        || selector === "[data-reload-tts-profiles]"
        || selector === "[data-start-tts-profile-recording]"
        || selector === "[data-stop-tts-profile-recording]"
        || selector === "[data-clear-tts-profile-audio]"
        || selector === "[data-tts-profile-file]"
        || selector === "[data-save-tts-profile]") {
        return inert;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    __fields: elements,
    __listeners: listeners,
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const renderOverlay = createOverlay();
  class FakeFileReader {
    readAsDataURL() {
      this.result = "data:audio/wav;base64,ZmFrZQ==";
      if (typeof this.onload === "function") this.onload();
    }
  }
  const context = {
    console,
    Promise,
    Date,
    FileReader: FakeFileReader,
    URL: {
      createObjectURL() {
        return "blob:fake";
      },
      revokeObjectURL(url) {
        calls.push(["revoke", url]);
      },
    },
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportTtsProfileModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    } : undefined,
    state: {
      selectedWorkspaceId: "owner",
      auth: { workspaceId: "auth" },
      ttsProfileManagerOpen: true,
      ttsProfiles: [{
        profile_id: "voice_1",
        label: "Documentary",
        mode: "zero_shot",
        prompt_audio_bytes: 2048,
        prompt_text: "Prompt<|endofprompt|>",
        updated_at: "now",
        is_default: false,
      }],
      ttsProfilesLoading: false,
      ttsProfilesError: "",
      ttsProfileRecorder: null,
      ttsProfileDraftAudio: {
        blob: { size: 128 },
        name: "prompt.wav",
        size: 2048,
        durationMs: 65000,
        url: "blob:prompt",
      },
      ttsProfileDraftLabel: "Documentary Host",
      ttsProfileDraftId: "voice_1",
      ttsProfileDraftPromptText: "Prompt text",
      ttsProfileDraftSetDefault: true,
      ttsProfileSaving: false,
      ttsProfileStatus: "",
    },
    $(id) {
      return id === "ttsProfileOverlay" ? renderOverlay : null;
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    formatTime(value) {
      return `time:${value}`;
    },
    showError(error) {
      calls.push(["showError", error?.message || String(error)]);
    },
    api: async (targetPath, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push(["api", targetPath, { ...options, body }]);
      if (targetPath.includes("/profiles?")) {
        return { profiles: [{ profile_id: "loaded", label: "Loaded" }] };
      }
      return { ok: true };
    },
    __calls: calls,
    __renderOverlay: renderOverlay,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__ttsProfileHarness = {
  TTS_PROFILE_MODEL_ESM_PATH,
  importTtsProfileModel,
  currentTtsProfileModel,
  ttsProfileWorkspaceId,
  ttsProfileFormatBytes,
  ttsProfileFormatDuration,
  ttsProfilePromptPreview,
  renderTtsProfileRows,
  renderTtsProfileManager,
  loadTtsProfiles,
  saveTtsProfileFromOverlay,
  setDefaultTtsProfile,
  deleteTtsProfile,
  ttsProfileFileSelectionPlan,
};`, context, { filename: "app-tts-profile-ui.js" });
  return context;
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
  await test("classic tts profile adapter declares bounded ESM import path", () => {
    assert.match(source, /TTS_PROFILE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/tts-profile-model\/tts-profile-model\.js/);
    assert.match(source, /__homeAiImportTtsProfileModel/);
    assert.match(source, /importTtsProfileModel/);
    assert.match(source, /currentTtsProfileModel/);
    assert.match(source, /ttsProfileSaveValidationPlan/);
    assert.match(source, /ttsProfileRowsViewPlan/);
  });

  await test("classic adapter consumes ESM format and row plans while escaping locally", async () => {
    const fakeModel = {
      ttsProfileWorkspaceIdPlan() {
        return "model-workspace";
      },
      formatTtsProfileBytes() {
        return "model-bytes";
      },
      formatTtsProfileDuration() {
        return "model-duration";
      },
      previewTtsProfilePrompt() {
        return "model-preview";
      },
      ttsProfileRowsViewPlan() {
        return {
          state: "ready",
          rows: [{
            profileId: `voice-"1"`,
            title: `Voice <One>`,
            metaPrimary: `meta <primary>`,
            metaSecondary: `meta <secondary>`,
            preview: `preview <text>`,
            isDefault: false,
            setDefaultLabel: "设为默认",
            deleteLabel: "删除",
          }],
        };
      },
      ttsProfileManagerViewPlan() {
        return {
          recording: true,
          audioMeta: { text: `bad <audio>`, hasAudio: true },
          startRecordingDisabled: true,
          startRecordingLabel: "录制中",
          stopRecordingDisabled: false,
          clearAudioDisabled: false,
          saveDisabled: true,
          saveLabel: "保存中",
          setDefaultChecked: false,
          statusText: `bad <status>`,
        };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__ttsProfileHarness.importTtsProfileModel(harness.window);
    assert.equal(harness.__ttsProfileHarness.currentTtsProfileModel(), fakeModel);
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/tts-profile-model/tts-profile-model.js"]);
    assert.equal(harness.__ttsProfileHarness.ttsProfileWorkspaceId(), "model-workspace");
    assert.equal(harness.__ttsProfileHarness.ttsProfileFormatBytes(1), "model-bytes");
    assert.equal(harness.__ttsProfileHarness.ttsProfileFormatDuration(1), "model-duration");
    assert.equal(harness.__ttsProfileHarness.ttsProfilePromptPreview("x"), "model-preview");
    const rows = harness.__ttsProfileHarness.renderTtsProfileRows();
    assert.match(rows, /Voice &lt;One&gt;/);
    assert.match(rows, /data-set-default-tts-profile="voice-&quot;1&quot;"/);
    harness.__ttsProfileHarness.renderTtsProfileManager();
    assert.match(harness.__renderOverlay.innerHTML, /bad &lt;audio&gt;/);
    assert.match(harness.__renderOverlay.innerHTML, /bad &lt;status&gt;/);
  });

  await test("classic adapter keeps fallback behavior without ESM", () => {
    const harness = createHarness();
    assert.equal(harness.__ttsProfileHarness.ttsProfileWorkspaceId(), "owner");
    assert.equal(harness.__ttsProfileHarness.ttsProfileFormatBytes(2048), "2 KB");
    assert.equal(harness.__ttsProfileHarness.ttsProfileFormatDuration(65000), "1:05");
    assert.equal(harness.__ttsProfileHarness.ttsProfilePromptPreview("Prompt<|endofprompt|>"), "Prompt");
    const rows = harness.__ttsProfileHarness.renderTtsProfileRows();
    assert.match(rows, /Documentary/);
    assert.match(rows, /zero_shot · 2 KB/);
  });

  await test("classic adapter consumes ESM request plans while retaining API and FileReader execution", async () => {
    const fakeModel = {
      ttsProfileWorkspaceIdPlan() {
        return "model-workspace";
      },
      ttsProfileListRequestPlan() {
        return { path: "/api/v1/home-ai/tts/profiles?workspaceId=model-workspace" };
      },
      ttsProfileSaveValidationPlan() {
        return { ok: true, progressText: "model saving", successText: "model saved" };
      },
      ttsProfileSaveRequestPlan(input) {
        return {
          path: "/api/v1/home-ai/tts/profiles",
          options: {
            method: "POST",
            timeoutMs: 60000,
            body: {
              workspaceId: input.workspaceId,
              label: input.label,
              profile_id: input.profileId,
              prompt_text: input.promptText,
              audio_base64: input.audioBase64,
              set_default: input.setDefault,
              planned: true,
            },
          },
        };
      },
      ttsProfileDefaultRequestPlan() {
        return { ok: true, path: "/default-model", options: { method: "POST", body: { workspaceId: "model-workspace" } }, successText: "defaulted" };
      },
      ttsProfileDeleteRequestPlan() {
        return { ok: true, path: "/delete-model", options: { method: "POST", body: { workspaceId: "model-workspace" } }, successText: "deleted" };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__ttsProfileHarness.importTtsProfileModel(harness.window);
    await harness.__ttsProfileHarness.loadTtsProfiles();
    await harness.__ttsProfileHarness.saveTtsProfileFromOverlay(createOverlay());
    await harness.__ttsProfileHarness.setDefaultTtsProfile("voice_1");
    await harness.__ttsProfileHarness.deleteTtsProfile("voice_1");
    const apiCalls = harness.__calls.filter((call) => call[0] === "api");
    assert.equal(apiCalls[0][1], "/api/v1/home-ai/tts/profiles?workspaceId=model-workspace");
    const saveCall = apiCalls.find((call) => call[1] === "/api/v1/home-ai/tts/profiles");
    assert.equal(saveCall[2].method, "POST");
    assert.equal(saveCall[2].timeoutMs, 60000);
    assert.equal(saveCall[2].body.audio_base64, "data:audio/wav;base64,ZmFrZQ==");
    assert.equal(saveCall[2].body.planned, true);
    assert.ok(apiCalls.some((call) => call[1] === "/default-model"));
    assert.ok(apiCalls.some((call) => call[1] === "/delete-model"));
  });

  await test("classic adapter validates wav file selection through a pure plan", async () => {
    const fakeModel = {
      ttsProfileFileSelectionPlan() {
        return { ok: false, statusText: "model rejects", name: "bad.mp3", durationMs: 0 };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__ttsProfileHarness.importTtsProfileModel(harness.window);
    assert.deepEqual(harness.__ttsProfileHarness.ttsProfileFileSelectionPlan({ name: "bad.mp3", type: "audio/mpeg" }), {
      ok: false,
      statusText: "model rejects",
      name: "bad.mp3",
      durationMs: 0,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
