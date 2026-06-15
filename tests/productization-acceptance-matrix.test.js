"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  MATRIX_DIMENSIONS,
  buildMatrix,
  renderMarkdown,
  verifyDocs,
} = require("../scripts/productization-acceptance-matrix");

const REPO_ROOT = path.resolve(__dirname, "..");

function testMatrixDimensions() {
  const matrix = buildMatrix();
  assert.equal(matrix.ok, true);
  assert.equal(matrix.dimensionCount, 9);
  assert.equal(new Set(matrix.dimensions.map((dimension) => dimension.id)).size, MATRIX_DIMENSIONS.length);
  assert.ok(matrix.dimensions.every((dimension) => dimension.evidence));
}

function testMarkdownTemplate() {
  const markdown = renderMarkdown();
  assert.match(markdown, /Productization Acceptance Matrix/);
  assert.match(markdown, /Owner workspace behavior/);
  assert.match(markdown, /Production self-diagnostic coverage/);
  assert.match(markdown, /\| Dimension \| Evidence \| Status \| Notes \|/);
}

function testDocsVerificationAndCli() {
  const docResult = verifyDocs();
  assert.equal(docResult.ok, true, JSON.stringify(docResult.issues, null, 2));

  const output = execFileSync("node", ["scripts/productization-acceptance-matrix.js", "--verify-docs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
}

testMatrixDimensions();
testMarkdownTemplate();
testDocsVerificationAndCli();

console.log("productization acceptance matrix tests passed");
