import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{buildPreviewLinkViewModel as t}from"../document-preview-model/document-preview-model.js";var n=`:root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light;color:#17202a;background:#f6f8fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}body{background:#f6f8fb;min-height:100vh;margin:0}button{font:inherit}.homeai-vite-document-preview{box-sizing:border-box;min-height:100vh;padding:18px}.vdp-shell{max-width:980px;margin:0 auto}.vdp-topbar{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px;display:flex}.vdp-eyebrow,.vdp-subtitle{color:#66717f;margin:0;font-size:13px;line-height:1.45}.vdp-title{letter-spacing:0;margin:3px 0 5px;font-size:24px;line-height:1.15}.vdp-badges,.vdp-tabs,.vdp-controls,.vdp-actions{flex-wrap:wrap;gap:8px;display:flex}.vdp-badges{justify-content:flex-end}.vdp-badge,.vdp-tab,.vdp-control{color:#344054;background:#fff;border:1px solid #d7dde6;border-radius:8px}.vdp-badge{padding:6px 9px;font-size:12px;font-weight:750}.vdp-badge.ok{color:#176343;background:#edf8f2;border-color:#b8ddcc}.vdp-badge.blocked{color:#755600;background:#fff8e6;border-color:#e7c56d}.vdp-tab,.vdp-control{min-height:36px;padding:0 12px}.vdp-tab.active,.vdp-control.active{color:#1d4ed8;background:#eff6ff;border-color:#2563eb}.vdp-tabs{margin:0 0 10px}.vdp-controls{margin:0 0 12px}.vdp-grid{grid-template-columns:minmax(0,1fr) minmax(300px,.9fr);gap:12px;display:grid}.vdp-card{box-sizing:border-box;background:#fff;border:1px solid #dfe5ee;border-radius:8px;padding:14px}.vdp-card h2{margin:0 0 10px;font-size:16px;line-height:1.25}.vdp-summary{color:#263445;margin:0 0 12px;font-size:15px;line-height:1.55}.vdp-actions{margin:0;padding:0;list-style:none}.vdp-action{color:#253044;text-align:left;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;flex-direction:column;justify-content:center;gap:2px;max-width:230px;min-height:40px;padding:7px 10px;display:inline-flex}.vdp-action span{font-size:14px;font-weight:700}.vdp-action small{color:#66717f;font-size:12px;line-height:1.25}.vdp-action:disabled{opacity:.84}.vdp-empty{color:#66717f;font-size:13px}.vdp-evidence{gap:8px;margin:0;display:grid}.vdp-evidence div{border-top:1px solid #edf1f6;grid-template-columns:96px minmax(0,1fr);gap:10px;padding-top:8px;display:grid}.vdp-evidence div:first-child{border-top:0;padding-top:0}.vdp-evidence dt,.vdp-evidence dd{margin:0;font-size:12px;line-height:1.35}.vdp-evidence dt{color:#66717f;font-weight:750}.vdp-evidence dd{color:#253044;overflow-wrap:anywhere}@media (max-width:760px){.homeai-vite-document-preview{padding:14px}.vdp-topbar,.vdp-grid{grid-template-columns:1fr;display:grid}.vdp-badges{justify-content:flex-start}}`,r=`20260702-vite-document-preview-island-v1`,i=typeof window<`u`?window:globalThis,a=Object.freeze([{id:`markdown`,label:`Markdown`,href:`/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_md&name=summary.md&mime=text%2Fmarkdown`,dataset:{artifactName:`summary.md`,artifactMime:`text/markdown`,artifactSize:`2048`},textContent:`summary.md`},{id:`presentation`,label:`PPTX`,href:`/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pptx&name=deck.pptx&mime=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation`,dataset:{artifactName:`deck.pptx`,artifactMime:`application/vnd.openxmlformats-officedocument.presentationml.presentation`,artifactSize:`4096`},textContent:`deck.pptx`},{id:`word`,label:`DOCX`,href:`/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_docx&name=report.docx&mime=application%2Fvnd.openxmlformats-officedocument.wordprocessingml.document`,dataset:{artifactName:`report.docx`,artifactMime:`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,artifactSize:`8192`},textContent:`report.docx`},{id:`pdf`,label:`PDF`,href:`/pdf-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pdf&name=brief.pdf&mime=application%2Fpdf`,dataset:{artifactName:`brief.pdf`,artifactMime:`application/pdf`,artifactSize:`12288`},textContent:`brief.pdf`},{id:`image`,label:`Image`,href:`/api/files?artifactId=artifact_image&name=photo.jpg`,dataset:{artifactName:`photo.jpg`,artifactMime:`image/jpeg`,artifactSize:`65536`},textContent:`photo.jpg`},{id:`unsupported`,label:`External`,href:`https://example.invalid/private.bin`,dataset:{artifactName:`private.bin`,artifactMime:`application/octet-stream`,artifactSize:`512`},textContent:`private.bin`}]),o=i.HomeAiRuntimeFacade||e({root:i,mode:`vite-document-preview`,clientVersion:r,appState:{documentPreviewIslandVersion:r,documentPreviewSelectedFixture:a[0].id,documentPreviewNativeShell:``,documentPreviewOpenInAvailable:!1},attachClassicCompatibility:!0});function s(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function c(e){if(e.querySelector(`style[data-homeai-vite-document-preview-style]`))return;let t=document.createElement(`style`);t.setAttribute(`data-homeai-vite-document-preview-style`,`true`),t.textContent=n,e.prepend(t)}function l(){let e=o.state?.get?.()||{},t=String(e.documentPreviewSelectedFixture||a[0].id);return a.find(e=>e.id===t)||a[0]}function u(){let e=o.state?.get?.()||{},t=String(e.documentPreviewNativeShell||``);return{origin:i.location?.origin||`http://127.0.0.1`,currentPath:i.location?.pathname||`/vite-document-preview/`,currentSearch:i.location?.search||``,nativeShell:t,nativeDocumentBridgeAvailable:t===`ios`||t===`android`,nativeDocumentOpenInAvailable:!!e.documentPreviewOpenInAvailable,sourceSurface:`vite-document-preview`,requestId:`vite_document_preview_fixture`,viewport:{width:390,height:844,coarsePointer:!0}}}function d(e){o.state?.set?.({documentPreviewSelectedFixture:String(e||a[0].id)}),o.events?.emit?.(`document-preview:fixture-selected`,{fixtureId:String(e||``)})}function f(e){let t=e===`ios`||e===`android`?e:``;o.state?.set?.({documentPreviewNativeShell:t}),o.events?.emit?.(`document-preview:native-shell-changed`,{nativeShell:t})}function p(){let e=!!o.state?.get?.(`documentPreviewOpenInAvailable`);o.state?.set?.({documentPreviewOpenInAvailable:!e}),o.events?.emit?.(`document-preview:open-in-changed`,{available:!e})}function m(e=``){return e===`ready`?`ok`:e===`blocked`?`blocked`:`muted`}function h(e){return a.map(t=>`
    <button
      type="button"
      class="vdp-tab${t.id===e?` active`:``}"
      data-vdp-fixture="${s(t.id)}"
      aria-pressed="${t.id===e?`true`:`false`}"
    >${s(t.label)}</button>
  `).join(``)}function g(e){return e.actions.length?e.actions.map(e=>`
    <li>
      <button class="vdp-action" type="button" disabled>
        <span>${s(e.label)}</span>
        <small>${s(e.detail)}</small>
      </button>
    </li>
  `).join(``):`<li class="vdp-empty">没有可用操作</li>`}function _(e){return[[`类型`,e.previewType],[`状态`,e.status],[`文档类型`,e.documentKind||`-`],[`打开策略`,e.openStrategy],[`原生类型`,e.nativeKind||`-`],[`Source`,e.sourceUrl||`-`],[`Viewer`,e.viewerUrl||`-`],[`Native URL`,e.nativeUrl||`-`],[`Markdown API`,e.previewFetchUrl||`-`]].map(([e,t])=>`
    <div>
      <dt>${s(e)}</dt>
      <dd>${s(t)}</dd>
    </div>
  `).join(``)}function v(e){let t=e.nativeShell||``;return`
    <div class="vdp-controls" aria-label="原生壳模拟">
      <button type="button" class="vdp-control${t?``:` active`}" data-vdp-native-shell="">浏览器</button>
      <button type="button" class="vdp-control${t===`ios`?` active`:``}" data-vdp-native-shell="ios">iOS</button>
      <button type="button" class="vdp-control${t===`android`?` active`:``}" data-vdp-native-shell="android">Android</button>
      <button type="button" class="vdp-control${e.nativeDocumentOpenInAvailable?` active`:``}" data-vdp-toggle-open-in>
        Open In ${e.nativeDocumentOpenInAvailable?`on`:`off`}
      </button>
    </div>
  `}function y(e,n=l()){let r=u(),i=t(n,r);return e.innerHTML=`
    <div class="homeai-vite-document-preview">
      <section class="vdp-shell">
        <header class="vdp-topbar">
          <div>
            <p class="vdp-eyebrow">Vite island 开发预览</p>
            <h1 class="vdp-title">文件预览策略</h1>
            <p class="vdp-subtitle">验证 Markdown、PPTX、PDF、图片和原生壳打开策略；此页不下载、不分享、不写入生产数据。</p>
          </div>
          <div class="vdp-badges">
            <span class="vdp-badge ${s(m(i.status))}">${s(i.status)}</span>
            <span class="vdp-badge">只读预览</span>
          </div>
        </header>

        <nav class="vdp-tabs" aria-label="文件类型">${h(n.id)}</nav>
        ${v(r)}

        <div class="vdp-grid">
          <article class="vdp-card">
            <h2>${s(i.title)}</h2>
            <p class="vdp-summary">${s(i.summary)}</p>
            <ul class="vdp-actions">${g(i)}</ul>
          </article>

          <article class="vdp-card">
            <h2>有界证据</h2>
            <dl class="vdp-evidence">${_(i)}</dl>
          </article>
        </div>
      </section>
    </div>
  `,e.querySelectorAll(`[data-vdp-fixture]`).forEach(t=>{t.addEventListener(`click`,()=>{d(t.dataset.vdpFixture||``),y(e)})}),e.querySelectorAll(`[data-vdp-native-shell]`).forEach(t=>{t.addEventListener(`click`,()=>{f(t.dataset.vdpNativeShell||``),y(e)})}),e.querySelector(`[data-vdp-toggle-open-in]`)?.addEventListener(`click`,()=>{p(),y(e)}),i}function b(e=document.querySelector(`[data-homeai-vite-document-preview]`)){return e?(c(e),y(e),{refresh:()=>y(e)}):null}i.HomeAIViteDocumentPreviewPreview=Object.freeze({mount:b,fixtures:()=>a.map(e=>Object.assign({},e)),currentModel:()=>t(l(),u()),selectFixture:e=>d(e),setNativeShell:f,toggleOpenIn:p,version:r}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>b(),{once:!0}):b();export{b as mount};