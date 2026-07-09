"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const dispatcher = fs.readFileSync(path.join(repoRoot, "scripts", "hermes-mobile-cron-dispatcher.py"), "utf8");
const mobileDispatcher = fs.readFileSync(path.join(repoRoot, "server-routes", "mobile-api-dispatcher.js"), "utf8");
const composition = fs.readFileSync(path.join(repoRoot, "server-routes", "mobile-api-composition.js"), "utf8");
const dataContextComposition = fs.readFileSync(path.join(repoRoot, "server-routes", "mobile-api-data-context-composition.js"), "utf8");

assert.match(dispatcher, /def _prepare_job_data_context/);
assert.match(dispatcher, /automation-data-context-cli\.js/);
assert.match(dispatcher, /data_context_prepare_failed/);
assert.match(dispatcher, /\[HOME AI DATA CONTEXT\]/);
assert.match(dispatcher, /Use this data context as the primary evidence source/);
assert.match(dispatcher, /prepared_job = _job_with_profile_model_defaults\(job\)/);
assert.match(dispatcher, /prepared_job = _job_with_prepared_data_context\(prepared_job\)/);
assert.match(dispatcher, /run_job\(prepared_job\)/);

assert.match(mobileDispatcher, /dataContextApiRoutes/);
assert.match(composition, /createMobileApiDataContextComposition/);
assert.match(dataContextComposition, /createDataContextService/);
assert.match(dataContextComposition, /createDataContextApiRoutes/);

console.log("cron dispatcher data context harness passed");
