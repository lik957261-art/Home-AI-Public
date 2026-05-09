"use strict";

const DEFAULT_DELIVERY_TARGET = "the selected workspace delivery directory, project directory, run directory, or an explicitly supplied delivery directory";
const DEFAULT_SOURCE_TARGET = "the relevant project directory, attached task directory, or run working directory";

function normalizeTarget(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function createDeliveryBoundaryInstructions(options = {}) {
  const deliveryTarget = normalizeTarget(options.deliveryTarget || options.delivery_target, DEFAULT_DELIVERY_TARGET);
  const sourceTarget = normalizeTarget(options.sourceTarget || options.source_target, DEFAULT_SOURCE_TARGET);
  return [
    "Hermes Mobile delivery boundary:",
    "- The default final document deliverable is Markdown (.md), including chat replies, task replies, group-chat replies, and automation runs.",
    `- Write final Markdown deliverables to ${deliveryTarget}; include MEDIA:<absolute_path> for each final Markdown file so Hermes Mobile can preview it as rendered HTML.`,
    `- Keep supporting source/context Markdown in ${sourceTarget}. If the task also needs intermediate notes, do not expose those notes as final deliverables unless they are explicitly named as final output.`,
    "- Do not generate PDF, Word, Office, or image copies by default. Generate them only when the user explicitly asks for external forwarding, printing, editable Office output, a required non-Markdown format, or a non-document media artifact.",
    "- Hermes Mobile previews Markdown as dynamic HTML internally. Do not force phone-only PDF pagination just for internal preview.",
    "- When forwarding or sharing a Markdown deliverable through the system share flow, do not treat the raw .md file as the default external payload. Use the Hermes Mobile export/share flow to choose a generated format such as HTML, Word-compatible document, print/PDF, or explicitly requested raw Markdown.",
    "- If a user-facing PDF is explicitly requested from Markdown or text for mobile reading, default to a phone-readable portrait PDF: about 88 mm x 190 mm, large CJK-wrapped body text, Microsoft YaHei or another clear CJK font when available, and vertical/key-value rendering for wide tables. Do not create A4/Letter small-font PDFs unless the user explicitly asks for print layout.",
    "- This boundary applies equally to chat replies, task replies, group-chat replies, and automation runs.",
  ].join("\n");
}

function createAutomationDeliveryRequirement(options = {}) {
  return [
    "Automation delivery requirement: when the run completes, produce the user-facing final document as Markdown (.md) by default. Include `MEDIA:<absolute_path>` for the final Markdown file so Hermes Mobile can preview it in the Automation list. Generate PDF, Word, or Office output only when the automation request or user explicitly asks for that external/export format.",
    createDeliveryBoundaryInstructions(Object.assign({
      deliveryTarget: "the workspace delivery directory, project directory, run directory, or the explicitly supplied delivery directory",
      sourceTarget: "the corresponding project directory or run working directory",
    }, options)),
  ].join("\n");
}

module.exports = {
  createAutomationDeliveryRequirement,
  createDeliveryBoundaryInstructions,
};
