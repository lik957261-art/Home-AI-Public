"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-editor-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const timers = [];
  function createClassList(initial = []) {
    const values = new Set(initial);
    return {
      add(value) {
        values.add(value);
      },
      remove(value) {
        values.delete(value);
      },
      contains(value) {
        return values.has(value);
      },
    };
  }
  const input = {
    value: "hello",
    innerText: "",
    scrollHeight: 72,
    selectionStart: 1,
    selectionEnd: 4,
    style: {},
    dispatched: [],
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    setRangeText(text, start, end) {
      this.value = `${this.value.slice(0, start)}${text}${this.value.slice(end)}`;
      this.selectionStart = start + text.length;
      this.selectionEnd = this.selectionStart;
    },
    dispatchEvent(event) {
      this.dispatched.push(event.type);
    },
  };
  const app = { classList: createClassList() };
  const scrollingElement = { scrollTop: 0, scrollLeft: 0 };
  const calls = [];
  const context = {
    console,
    TextEncoder,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    NodeFilter: { SHOW_TEXT: 4 },
    COMPOSER_MAX_TEXT_CHARS: 10,
    COMPOSER_MAX_BODY_BYTES: 20,
    state: {
      composerComposing: true,
      composerSendAfterComposition: true,
      composerSendAfterCompositionTimer: null,
      groupMentionOpen: false,
    },
    window: {
      innerHeight: 640,
      innerWidth: 390,
      scrollX: 0,
      scrollY: 0,
      __homeAiImportComposerEditorModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
      getSelection: () => null,
      scrollTo(x, y) {
        calls.push(["scrollTo", x, y]);
        this.scrollX = x;
        this.scrollY = y;
      },
    },
    document: {
      activeElement: null,
      scrollingElement,
      createRange() {
        return {
          selectNodeContents() {},
          setEnd() {},
          toString: () => input.value,
          setStart() {},
          collapse() {},
        };
      },
      createTreeWalker() {
        return { nextNode: () => null };
      },
      execCommand(command, _ui, text) {
        calls.push(["execCommand", command, text]);
      },
    },
    $: (id) => {
      if (id === "messageInput") return input;
      if (id === "app") return app;
      return null;
    },
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      calls.push(["clearTimeout", timer?.delay || 0]);
    },
    updateComposerAction() {
      calls.push(["updateComposerAction"]);
    },
    updateGroupMentionMenu() {
      calls.push(["updateGroupMentionMenu"]);
    },
    sendMessage() {
      calls.push(["sendMessage"]);
      return Promise.resolve();
    },
    composerMentionAvailable() {
      return context.mentionAvailable === true;
    },
    moveGroupMentionSelection(delta) {
      calls.push(["mentionMove", delta]);
    },
    closeGroupMentionMenu() {
      calls.push(["mentionClose"]);
    },
    chooseGroupMention() {
      calls.push(["mentionChoose"]);
      return Promise.resolve();
    },
    isChatSearchMode() {
      return context.chatSearchMode === true;
    },
    performChatSearch() {
      calls.push(["chatSearch"]);
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-editor-ui.js" });
  return { context, input, app, calls, timers, scrollingElement };
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
  await test("classic composer editor adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_EDITOR_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-editor-model\/chat-composer-editor-model\.js/);
    assert.match(source, /__homeAiImportComposerEditorModel/);
    assert.match(source, /currentChatComposerEditorModel/);
    assert.match(source, /composerKeydownActionPlan/);
    assert.match(source, /composerEditorHeightPlan/);
  });

  await test("classic adapter consumes loaded editor model for text, size, paste and clear planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      normalizeComposerText(value) {
        modelCalls.push(["normalize", value]);
        return "normalized text";
      },
      utf8ByteLengthForText(value) {
        modelCalls.push(["bytes", value]);
        return 7;
      },
      composerRequestSizeErrorPlan(input) {
        modelCalls.push(["size", input.maxTextChars, input.maxBodyBytes]);
        return { error: "planned size error" };
      },
      composerSuccessfulSendClearPlan(input) {
        modelCalls.push(["clear", input.currentText, input.sentText]);
        return { shouldClear: true };
      },
      composerEditorHeightPlan(input) {
        modelCalls.push(["height", input.scrollHeight, input.maxHeightPx]);
        return { resetHeight: "auto", height: "88px" };
      },
      composerPlainTextPastePlan(input) {
        modelCalls.push(["paste", input.text]);
        return { text: input.text.toUpperCase(), selectionStart: 0, selectionEnd: 5 };
      },
    };
    const { context, input } = createHarness(fakeModel);
    await context.importChatComposerEditorModel(context.window);

    assert.equal(context.getComposerText(), "normalized text");
    assert.equal(context.utf8ByteLength("payload"), 7);
    assert.equal(context.composerRequestSizeError("text", "{}"), "planned size error");
    context.autoSizeComposerEditor(input);
    assert.equal(input.style.height, "88px");
    assert.equal(modelCalls.find((entry) => entry[0] === "height")[2], 153);
    assert.equal(context.clearComposerAfterSuccessfulSend("sent"), true);
    assert.equal(input.value, "");

    input.value = "hello";
    context.pastePlainText({
      preventDefault() {},
      clipboardData: { getData: () => "ai" },
    });
    assert.equal(input.value, "AI");
    assert.deepEqual(modelCalls.map((entry) => entry[0]), [
      "normalize",
      "bytes",
      "size",
      "height",
      "normalize",
      "clear",
      "height",
      "paste",
    ]);
  });

  await test("classic fallback bounds mobile composer editor height", () => {
    const { context, input } = createHarness(null);
    context.chatComposerEditorModel = null;
    input.scrollHeight = 320;
    context.window.innerWidth = 390;
    context.window.innerHeight = 420;
    context.autoSizeComposerEditor(input);
    assert.equal(input.style.height, "100px");
    assert.equal(input.style.overflowY, "auto");
  });

  await test("classic fallback keeps directory topic composer compact and stable while focused", () => {
    const { context, input, app, scrollingElement, calls } = createHarness(null);
    context.chatComposerEditorModel = null;
    app.classList.add("plugin-context-nav-mode");
    app.classList.add("plugin-topic-detail-mode");
    context.document.activeElement = input;
    input.scrollHeight = 320;
    context.window.innerWidth = 390;
    context.window.innerHeight = 640;
    context.window.scrollY = 24;
    scrollingElement.scrollTop = 24;

    context.autoSizeComposerEditor(input);

    assert.equal(input.style.height, "115px");
    assert.equal(input.style.overflowY, "auto");
    assert.equal(scrollingElement.scrollTop, 24);
    assert.deepEqual(calls.at(-1), undefined);
  });

  await test("classic fallback shrinks directory topic composer after long input is reduced", () => {
    const { context, input, app } = createHarness(null);
    context.chatComposerEditorModel = null;
    app.classList.add("plugin-context-nav-mode");
    app.classList.add("plugin-topic-detail-mode");
    context.document.activeElement = input;
    context.window.innerWidth = 390;
    context.window.innerHeight = 640;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      get() {
        if (input.style.height && input.style.height !== "auto") return 320;
        return input.value.length > 80 ? 320 : 44;
      },
    });

    input.value = "long ".repeat(40);
    context.autoSizeComposerEditor(input);
    assert.equal(input.style.height, "115px");
    assert.equal(input.style.overflowY, "auto");

    input.value = "short";
    context.autoSizeComposerEditor(input);
    assert.equal(input.style.height, "44px");
    assert.equal(input.style.overflowY, "");
  });

  await test("classic adapter uses model keydown and composition fallback plans", async () => {
    const fakeModel = {
      composerSendAfterCompositionFallbackPlan() {
        return { delayMs: 25, shouldSendWhenTimerFires: true };
      },
      composerKeydownActionPlan(input) {
        if (input.key === "ArrowDown") return { action: "mention_move", delta: 1, preventDefault: true };
        if (input.key === "Enter" && input.chatSearchMode) return { action: "chat_search", preventDefault: true };
        return { action: "send_message", preventDefault: true };
      },
    };
    const { context, calls, timers } = createHarness(fakeModel);
    await context.importChatComposerEditorModel(context.window);

    context.scheduleComposerSendAfterCompositionFallback();
    assert.equal(timers.at(-1).delay, 25);
    timers.at(-1).callback();
    assert.deepEqual(calls.slice(-3).map((entry) => entry[0]), [
      "updateComposerAction",
      "updateGroupMentionMenu",
      "sendMessage",
    ]);

    const event = {
      key: "ArrowDown",
      preventDefaultCalled: false,
      preventDefault() {
        this.preventDefaultCalled = true;
      },
    };
    context.handleComposerKeydown(event);
    assert.equal(event.preventDefaultCalled, true);
    assert.deepEqual(calls.at(-1), ["mentionMove", 1]);

    context.chatSearchMode = true;
    const searchEvent = {
      key: "Enter",
      preventDefault() {
        this.preventDefaultCalled = true;
      },
    };
    context.handleComposerKeydown(searchEvent);
    assert.deepEqual(calls.at(-1), ["chatSearch"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
