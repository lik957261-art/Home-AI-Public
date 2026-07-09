"use strict";

const SHELL_START_MODEL_ESM_PATH = "/vite-islands/shell-start-model/shell-start-model.js";

let shellStartModel = null;
let shellStartModelPromise = null;

function importShellStartModel(rootRef = window) {
  if (shellStartModel) return Promise.resolve(shellStartModel);
  if (!shellStartModelPromise) {
    const importer = typeof rootRef.__homeAiImportShellStartModel === "function"
      ? rootRef.__homeAiImportShellStartModel
      : (path) => import(path);
    shellStartModelPromise = Promise.resolve()
      .then(() => importer(SHELL_START_MODEL_ESM_PATH))
      .then((model) => {
        shellStartModel = model || null;
        return shellStartModel;
      })
      .catch((error) => {
        shellStartModelPromise = null;
        throw error;
      });
  }
  return shellStartModelPromise;
}

function currentShellStartModel() {
  return shellStartModel;
}

function withShellStartModelTimeout(promise, timeoutMs = 1200) {
  let timer = 0;
  return Promise.race([
    promise.finally(() => {
      if (timer) window.clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error("shell_start_model_timeout"));
      }, timeoutMs);
    }),
  ]);
}

function startFromShellStartPlan() {
  const model = currentShellStartModel();
  const plan = typeof model?.classicStartInvocationPlan === "function"
    ? model.classicStartInvocationPlan({ startAvailable: typeof start === "function" })
    : { shouldStart: typeof start === "function" };
  window.__homeAiShellStartPlan = plan;
  if (plan.shouldStart) start();
}

withShellStartModelTimeout(importShellStartModel())
  .then(startFromShellStartPlan)
  .catch(() => {
    if (typeof start === "function") start();
  });
