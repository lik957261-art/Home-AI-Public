"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/document-preview/rich-text-directory-model.mjs");
const source = fs.readFileSync(modelPath, "utf8");

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await import(`file://${modelPath}`);

  await test("rich text directory model stays browser-boundary free", () => {
    assert.equal(model.RICH_TEXT_DIRECTORY_MODEL_VERSION, "20260705-vite-rich-text-directory-model-v1");
    assert.doesNotMatch(source, /(?:^|[^\w-])window(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /(?:^|[^\w-])document(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bsessionStorage\b/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bFileReader\b|\bBlob\b|createObjectURL|revokeObjectURL/);
  });

  await test("text cleanup, streaming preview, and receipt labels match classic rules", () => {
    const cleaned = model.cleanDisplayTextPlan([
      "Intro",
      "<!-- homeai-note debug -->",
      "MEDIA: `/tmp/private/file.png`",
      "",
      "",
      "验证：通过",
    ].join("\n"));
    assert.equal(cleaned, "Intro\n\n验证：通过");

    const preview = model.streamingReceiptPreviewTextPlan("line 1\nline 2\nline 3\nline 4", { maxLines: 2 });
    assert.equal(preview, "line 3\nline 4");

    assert.deepEqual(model.assistantReceiptLabelForTextPlan("风险：需要复查\n详情"), {
      label: "风险",
      body: "需要复查\n详情",
      tone: "warn",
    });
  });

  await test("inline image plans normalize same-origin and plugin URLs without fetching", () => {
    const sameOrigin = model.inlineMarkdownImagePlan({
      src: "/api/files/preview?mime=image%2Fjpeg&name=cover.jpg&path=%2Fcover.jpg",
      alt: "cover",
      title: "Album",
      baseOrigin: "http://127.0.0.1:8797",
      currentOrigin: "http://127.0.0.1:8797",
      workspaceId: "owner",
      placeholderSrc: "placeholder",
    });
    assert.deepEqual(sameOrigin, {
      visible: true,
      src: "/api/files?mime=image%2Fjpeg&name=cover.jpg&path=%2Fcover.jpg",
      displaySrc: "placeholder",
      authenticatedFetch: true,
      alt: "cover",
      title: "Album",
      state: "pending",
    });

    const music = model.normalizeInlineMarkdownImageSrcPlan("/api/v1/music/local/covers/album.jpg", {
      baseOrigin: "http://127.0.0.1:8797",
      currentOrigin: "http://127.0.0.1:8797",
      workspaceId: "owner",
    });
    assert.equal(music, "/api/hermes-plugins/music/proxy/api/v1/music/local/covers/album.jpg?workspaceId=owner");
    assert.equal(model.inlineImageUrlLooksRenderablePlan("https://cdn.example.com/front.jpg"), true);
    assert.equal(model.inlineMarkdownImagePlan({ src: "javascript:alert(1)" }).visible, false);
  });

  await test("directory alias parsing and route resolution stay data-only", () => {
    const aliases = model.extractDirectoryAliasesPlan("目录别名：Health=/data/Health；技能库=/tmp/.hermes/skills。后续正文");
    assert.equal(aliases.text, "后续正文");
    assert.deepEqual(aliases.aliases, [{ label: "Health", path: "/data/Health" }]);

    const candidates = model.directoryProjectCandidatesPlan({
      projects: [
        { id: "health", label: "Health", root: "/data/owner/Health" },
        { id: "health", label: "Health", root: "/data/family/Health" },
      ],
    });
    const route = model.resolveDirectoryProjectRoutePlan({
      alias: { projectId: "health", label: "Health", path: "/data/family/Health" },
      candidates,
    });
    assert.equal(route.root, "/data/family/Health");
  });

  await test("directory alias chip plans return render-safe view models only", () => {
    const chips = model.directoryAliasChipPlans({
      projects: [{ id: "health", label: "Health", root: "/data/Health" }],
      items: [
        {
          displayAlias: { label: "Labs", path: "/data/Health/Labs" },
          route: { projectId: "health", subprojectId: "", label: "Health", root: "/data/Health" },
        },
        {
          displayAlias: { label: "交付目录", path: "/tmp/out", source: "reference" },
          route: null,
        },
      ],
    });
    assert.deepEqual(chips, [
      {
        kind: "route",
        reference: false,
        label: "Labs",
        title: "Labs",
        directoryPath: "/data/Health/Labs",
        projectId: "health",
        subprojectId: "",
      },
      {
        kind: "path",
        reference: true,
        label: "交付 · 交付目录",
        title: "交付 · 交付目录",
        directoryPath: "/tmp/out",
        directoryLabel: "交付目录",
      },
    ]);
  });
})();
