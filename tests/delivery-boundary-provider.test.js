"use strict";

const assert = require("node:assert/strict");
const {
  createAutomationDeliveryRequirement,
  createDeliveryBoundaryInstructions,
} = require("../adapters/delivery-boundary-provider");

function testDefaultBoundary() {
  const text = createDeliveryBoundaryInstructions();
  assert.match(text, /Hermes Mobile delivery boundary/);
  assert.match(text, /PDF\/Word\/Office\/media\/image deliverables/);
  assert.match(text, /selected workspace's `交付` directory/);
  assert.match(text, /Markdown files are source artifacts/);
  assert.match(text, /do not write Markdown into any `交付` directory/);
  assert.match(text, /Do not leave generated PDF\/Word delivery copies in project directories/);
  assert.match(text, /chat replies, task replies, group-chat replies, and automation runs/);
}

function testCustomDeliveryTarget() {
  const text = createDeliveryBoundaryInstructions({
    deliveryTarget: "the group delivery directory: C:\\ProgramData\\HermesMobile\\data\\group",
    sourceTarget: "the attached project directory",
  });
  assert.match(text, /group delivery directory/);
  assert.match(text, /attached project directory/);
}

function testAutomationRequirement() {
  const text = createAutomationDeliveryRequirement();
  assert.match(text, /PDF、Word 或其他正式交付文件/);
  assert.match(text, /Markdown files are source artifacts/);
  assert.doesNotMatch(text, /PDF\/Word\/Markdown/);
}

testDefaultBoundary();
testCustomDeliveryTarget();
testAutomationRequirement();

console.log("delivery-boundary-provider tests passed");
