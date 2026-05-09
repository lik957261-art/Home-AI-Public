"use strict";

const assert = require("node:assert/strict");
const {
  createAutomationDeliveryRequirement,
  createDeliveryBoundaryInstructions,
} = require("../adapters/delivery-boundary-provider");

function testDefaultBoundary() {
  const text = createDeliveryBoundaryInstructions();
  assert.match(text, /Hermes Mobile delivery boundary/);
  assert.match(text, /default final document deliverable is Markdown \(\.md\)/);
  assert.match(text, /chat replies, task replies, group-chat replies, and automation runs/);
  assert.match(text, /include MEDIA:<absolute_path> for each final Markdown file/);
  assert.match(text, /preview it as rendered HTML/);
  assert.match(text, /Do not generate PDF, Word, Office, or image copies by default/);
  assert.match(text, /external forwarding, printing, editable Office output/);
  assert.match(text, /do not treat the raw \.md file as the default external payload/);
  assert.match(text, /print\/PDF/);
  assert.match(text, /88 mm x 190 mm/);
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
  assert.match(text, /Automation delivery requirement/);
  assert.match(text, /produce the user-facing final document as Markdown \(\.md\) by default/);
  assert.match(text, /Hermes Mobile can preview it in the Automation list/);
  assert.match(text, /Generate PDF, Word, or Office output only when/);
  assert.doesNotMatch(text, /Markdown files are source artifacts/);
  assert.doesNotMatch(text, /Final user-facing PDF\/Word\/Office\/media\/image deliverables/);
}

testDefaultBoundary();
testCustomDeliveryTarget();
testAutomationRequirement();

console.log("delivery-boundary-provider tests passed");
