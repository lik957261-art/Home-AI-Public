"use strict";

const assert = require("node:assert/strict");

const {
  appRouteUrl,
  createAppRouteUrlService,
} = require("../adapters/app-route-url-service");

assert.equal(appRouteUrl(), "/");
assert.equal(appRouteUrl({}), "/");
assert.equal(appRouteUrl({ view: "inbox", workspaceId: "owner" }), "/?view=inbox&workspaceId=owner");
assert.equal(appRouteUrl({ view: " tasks ", empty: "", missing: null }), "/?view=tasks");
assert.equal(appRouteUrl({ q: "a b", tag: "x/y" }), "/?q=a+b&tag=x%2Fy");

{
  const service = createAppRouteUrlService();
  assert.equal(typeof service.appRouteUrl, "function");
  assert.equal(service.appRouteUrl({ threadId: "thread-1" }), "/?threadId=thread-1");
}

console.log("app-route-url-service tests passed");
