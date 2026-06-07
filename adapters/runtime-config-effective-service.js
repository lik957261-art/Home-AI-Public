"use strict";

const path = require("node:path");

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function readOption(value) {
  return typeof value === "function" ? value() : value;
}

function createRuntimeConfigEffectiveService(options = {}) {
  const load = typeof options.load === "function" ? options.load : () => ({});
  const pathResolve = typeof options.pathResolve === "function"
    ? options.pathResolve
    : (targetPath) => path.resolve(String(targetPath));

  function defaultHermesApiBase() {
    return stripTrailingSlash(readOption(options.defaultHermesApiBase));
  }

  function defaultWebPushSubject() {
    return String(readOption(options.defaultWebPushSubject));
  }

  function defaultWebPushVapidPath() {
    return pathResolve(String(readOption(options.defaultWebPushVapidPath)));
  }

  function effectiveHermesApiBase(config = load()) {
    return stripTrailingSlash(config?.hermesApiBase || defaultHermesApiBase());
  }

  function effectiveWebPushSubject(config = load()) {
    return config?.webPushSubject || defaultWebPushSubject();
  }

  function effectiveWebPushVapidPath(config = load()) {
    return pathResolve(config?.webPushVapidPath || defaultWebPushVapidPath());
  }

  return Object.freeze({
    defaultHermesApiBase,
    defaultWebPushSubject,
    defaultWebPushVapidPath,
    effectiveHermesApiBase,
    effectiveWebPushSubject,
    effectiveWebPushVapidPath,
  });
}

module.exports = {
  createRuntimeConfigEffectiveService,
  stripTrailingSlash,
};
