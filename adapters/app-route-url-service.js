"use strict";

function appRouteUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    const text = String(value ?? "").trim();
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

function createAppRouteUrlService() {
  return {
    appRouteUrl,
  };
}

module.exports = {
  appRouteUrl,
  createAppRouteUrlService,
};
