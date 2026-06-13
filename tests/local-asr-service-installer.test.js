"use strict";

const assert = require("node:assert/strict");
const {
  ENGINES,
  paths,
  plistFor,
} = require("../scripts/install-macos-local-asr-service");

function testFunasrPlan() {
  const engine = ENGINES.funasr;
  const p = paths("/tmp/HomeAI", engine);
  assert.equal(engine.label, "com.hermesmobile.funasr-local");
  assert.equal(engine.port, "8002");
  assert.equal(p.sourceRoot, "/tmp/HomeAI/app/services/funasr-local");
  assert.equal(p.serviceRoot, "/tmp/HomeAI/services/funasr-local");
  assert.equal(p.healthUrl, "http://127.0.0.1:8002/health");
  const plist = plistFor("/tmp/HomeAI", engine);
  assert.match(plist, /<string>com\.hermesmobile\.funasr-local<\/string>/);
  assert.match(plist, /<key>FUNASR_MODEL<\/key>\n    <string>paraformer-zh<\/string>/);
  assert.match(plist, /<key>FUNASR_PUNC_MODEL<\/key>\n    <string>ct-punc<\/string>/);
  assert.match(plist, /<key>MODELSCOPE_CACHE<\/key>\n    <string>\/tmp\/HomeAI\/services\/funasr-local\/models\/modelscope<\/string>/);
  assert.match(plist, /<key>FUNASR_TMP_DIR<\/key>\n    <string>\/tmp\/HomeAI\/services\/funasr-local\/tmp<\/string>/);
}

function testSenseVoicePlan() {
  const engine = ENGINES.sensevoice;
  const p = paths("/tmp/HomeAI", engine);
  assert.equal(engine.label, "com.hermesmobile.sensevoice-local");
  assert.equal(engine.port, "8003");
  assert.equal(p.sourceRoot, "/tmp/HomeAI/app/services/sensevoice-local");
  assert.equal(p.serviceRoot, "/tmp/HomeAI/services/sensevoice-local");
  assert.equal(p.healthUrl, "http://127.0.0.1:8003/health");
  const plist = plistFor("/tmp/HomeAI", engine);
  assert.match(plist, /<string>com\.hermesmobile\.sensevoice-local<\/string>/);
  assert.match(plist, /<key>SENSEVOICE_MODEL<\/key>\n    <string>iic\/SenseVoiceSmall<\/string>/);
  assert.match(plist, /<key>SENSEVOICE_USE_ITN<\/key>\n    <string>1<\/string>/);
  assert.match(plist, /<key>MODELSCOPE_CACHE<\/key>\n    <string>\/tmp\/HomeAI\/services\/sensevoice-local\/models\/modelscope<\/string>/);
  assert.match(plist, /<key>SENSEVOICE_TMP_DIR<\/key>\n    <string>\/tmp\/HomeAI\/services\/sensevoice-local\/tmp<\/string>/);
}

testFunasrPlan();
testSenseVoicePlan();
console.log("local ASR service installer tests passed");
