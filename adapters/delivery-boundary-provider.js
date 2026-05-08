"use strict";

const DEFAULT_DELIVERY_TARGET = "the selected workspace's `交付` directory or an explicitly supplied delivery directory";
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
    `- Final user-facing PDF/Word/Office/media/image deliverables must be written to ${deliveryTarget}; include MEDIA:<absolute_path> for each final file.`,
    `- Markdown files are source artifacts. Keep Markdown in ${sourceTarget}; do not write Markdown into any \`交付\` directory and do not attach Markdown as the user-facing deliverable.`,
    "- Project directories are for Markdown/source/context files. Do not leave generated PDF/Word delivery copies in project directories unless the user explicitly asks for an archival copy there.",
    "- If a user-facing PDF is generated from Markdown or text for mobile reading, default to a phone-readable portrait PDF: about 88 mm x 190 mm, large CJK-wrapped body text, Microsoft YaHei or another clear CJK font when available, and vertical/key-value rendering for wide tables. Do not create A4/Letter small-font PDFs unless the user explicitly asks for print layout.",
    "- This boundary applies equally to chat replies, task replies, group-chat replies, and automation runs.",
  ].join("\n");
}

function createAutomationDeliveryRequirement(options = {}) {
  return [
    "交付要求：任务完成时给出面向用户的最终结果；如果生成 PDF、Word 或其他正式交付文件，必须写入该工作区自己的 `交付` 目录或明确传入的交付目录，并在最终回复中包含 `MEDIA:<本地文件绝对路径>`，便于 Hermes Mobile 在自动化列表中预览最后交付文件。不要再为了 Hermes Mobile 预览把文件复制到旧的 `Hermes同步文件夹`。",
    createDeliveryBoundaryInstructions(Object.assign({
      deliveryTarget: "the workspace's `交付` directory or the explicitly supplied delivery directory",
      sourceTarget: "the corresponding project directory or run working directory",
    }, options)),
  ].join("\n");
}

module.exports = {
  createAutomationDeliveryRequirement,
  createDeliveryBoundaryInstructions,
};
