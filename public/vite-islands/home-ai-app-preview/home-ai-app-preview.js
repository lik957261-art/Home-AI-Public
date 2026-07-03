import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";var t=`.homeai-vite-app-preview{color:#182533;background:#f5f7fa;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.vap-shell{box-sizing:border-box;max-width:1120px;margin:0 auto;padding:18px 14px 32px}.vap-topbar{border-bottom:1px solid #dbe3eb;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:14px;display:flex}.vap-eyebrow{color:#5f7081;letter-spacing:0;margin:0 0 5px;font-size:12px;font-weight:800}.vap-title{margin:0;font-size:25px;line-height:1.2}.vap-subtitle{color:#526274;max-width:720px;margin:7px 0 0;font-size:13px;line-height:1.5}.vap-actions{flex-wrap:wrap;justify-content:flex-end;gap:8px;display:flex}.vap-button{color:#fff;background:#13364f;border:1px solid #13364f;border-radius:8px;align-items:center;min-height:36px;padding:0 12px;font-size:13px;font-weight:800;text-decoration:none;display:inline-flex}.vap-button.secondary{color:#1f3547;background:#fff;border-color:#cbd6df}.vap-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px;display:grid}.vap-panel-grid{grid-template-columns:minmax(0,1.05fr) minmax(280px,.95fr);gap:10px;margin-top:14px;display:grid}.vap-card,.vap-panel,.vap-error{box-sizing:border-box;background:#fffffff0;border:1px solid #dbe3eb;border-radius:8px}.vap-card,.vap-panel{padding:13px}.vap-card-label,.vap-panel-title{color:#566778;letter-spacing:0;margin:0;font-size:12px;font-weight:800}.vap-card-value{margin:8px 0 4px;font-size:23px;font-weight:850;line-height:1.15}.vap-meta,.vap-list{color:#526274;font-size:13px;line-height:1.5}.vap-list{gap:8px;margin:10px 0 0;padding:0;display:grid}.vap-list li{border-top:1px solid #e3e9ef;padding-top:8px;list-style:none}.vap-list li:first-child{border-top:0;padding-top:0}.vap-badge{border:1px solid #cbd6df;border-radius:999px;padding:7px 9px;font-size:12px;font-weight:800;line-height:1;display:inline-flex}.vap-badge.ok{color:#176139;background:#e7f5ec;border-color:#a8d8b9}.vap-badge.preview{color:#214562;background:#eef4fb;border-color:#b8cbe1}.vap-badge.blocked{color:#755600;background:#fff4df;border-color:#e6c36a}.vap-error{color:#982525;border-color:#efb1b1;margin-top:14px;padding:18px;line-height:1.6}@media (max-width:760px){.vap-topbar,.vap-panel-grid{grid-template-columns:1fr;display:grid}.vap-grid{grid-template-columns:1fr}.vap-actions{justify-content:flex-start}}`,n=`20260702-vite-app-runtime-facade-v1`,r=`phase-2-runtime-facade`,i=`/vite-islands/.vite/manifest.json`,a=`/vite-preview/home-ai-app.html`,o=`/`,s=`/vite-preview/owner-system-console.html`,c=`/vite-preview/ai-ops-feedback.html`,l=`/vite-preview/voice-input-status.html`,u=`/vite-preview/navigation-shell.html`,d=`/vite-preview/document-preview.html`,f=`/vite-preview/plugin-host.html`,p=e({root:window,mode:`vite-app-preview`,clientVersion:n,appState:{previewVersion:n,phase:r},attachClassicCompatibility:!0});function m(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function h(e){if(e.querySelector(`style[data-homeai-vite-app-preview-style]`))return;let n=document.createElement(`style`);n.setAttribute(`data-homeai-vite-app-preview-style`,`true`),n.textContent=t,e.prepend(n)}function g(e=null,t=p){let s=e?.[`src/vite-app/main.mjs`]||e?.[`home-ai-app-preview`],c=t?.snapshot?.()||{};return{previewVersion:n,phase:r,productionDefaultShell:`classic`,classicFallbackPath:o,builtPreviewPath:a,manifestPath:i,manifestAvailable:!!e,builtEntryFile:s?.file||``,ownerConsoleIslandAvailable:!!e?.[`src/vite-islands/owner-system-console/main.mjs`],aiOpsFeedbackIslandAvailable:!!e?.[`src/vite-islands/ai-ops-feedback/main.mjs`],voiceInputStatusIslandAvailable:!!e?.[`src/vite-islands/voice-input-status/main.mjs`],navigationShellIslandAvailable:!!e?.[`src/vite-islands/navigation-shell/main.mjs`],documentPreviewIslandAvailable:!!e?.[`src/vite-islands/document-preview/main.mjs`],pluginHostIslandAvailable:!!e?.[`src/vite-islands/plugin-host/main.mjs`],runtimeFacadeVersion:c.version||``,runtimeRoutePath:c.route?.pathname||``,runtimeNativeMode:c.native?.isNativeShell?`native-shell`:`browser`,runtimeHasAccessKey:!!c.hasAccessKey}}async function _(){try{let e=await fetch(i,{cache:`no-store`});return e.ok?await e.json():null}catch{return null}}function v(e,t,n,r=`preview`){return`
    <article class="vap-card">
      <p class="vap-card-label">${m(e)}</p>
      <div class="vap-card-value">${m(t)}</div>
      <p class="vap-meta"><span class="vap-badge ${m(r)}">${m(r===`ok`?`可用`:r===`blocked`?`未切换`:`预览`)}</span> ${m(n)}</p>
    </article>
  `}function y(e,t){e.innerHTML=`
    <div class="homeai-vite-app-preview">
      <div class="vap-shell">
        <header class="vap-topbar">
          <div>
            <p class="vap-eyebrow">Vite app preview host</p>
            <h1 class="vap-title">Home AI Vite 应用预览</h1>
            <p class="vap-subtitle">这是开发环境的完整应用预览入口。当前阶段只建立 Vite host、构建产物和回退边界，不替换生产默认 shell。</p>
          </div>
          <nav class="vap-actions" aria-label="预览入口">
            <a class="vap-button" href="${m(o)}">打开 classic shell</a>
            <a class="vap-button secondary" href="${m(s)}">系统控制台预览</a>
            <a class="vap-button secondary" href="${m(c)}">反馈菜单预览</a>
            <a class="vap-button secondary" href="${m(l)}">语音状态预览</a>
            <a class="vap-button secondary" href="${m(u)}">导航 Shell 预览</a>
            <a class="vap-button secondary" href="${m(d)}">文件预览策略</a>
            <a class="vap-button secondary" href="${m(f)}">Plugin Host 预览</a>
          </nav>
        </header>

        <section class="vap-grid" aria-label="预览状态">
          ${v(`运行阶段`,`Phase 2`,`Runtime facade 已接入，业务 surface 后续迁移。`,`preview`)}
          ${v(`生产默认入口`,`Classic`,`本目标不允许切换生产 /。`,`blocked`)}
          ${v(`Runtime facade`,t.runtimeFacadeVersion?`已启用`:`未就绪`,t.runtimeFacadeVersion||`not_collected`,t.runtimeFacadeVersion?`ok`:`blocked`)}
        </section>

        <section class="vap-panel-grid">
          <article class="vap-panel">
            <h2 class="vap-panel-title">迁移边界</h2>
            <ul class="vap-list">
              <li>不加载 <code>public/index.html</code> 的 101 个 classic script tags。</li>
              <li>不读取 classic 全局 state 或 boot-order globals。</li>
              <li>后续 surface 必须通过明确 import 或 runtime facade 接入。</li>
              <li><code>window.HomeAiRuntimeFacade</code> 仅作为 classic 过渡兼容点。</li>
              <li>Owner 决定前，不执行生产部署，不切默认 shell。</li>
            </ul>
          </article>

          <article class="vap-panel">
            <h2 class="vap-panel-title">Build metadata</h2>
            <ul class="vap-list">
              <li>Preview version: <code>${m(t.previewVersion)}</code></li>
              <li>Phase: <code>${m(t.phase)}</code></li>
              <li>Runtime facade: <code>${m(t.runtimeFacadeVersion||`not_collected`)}</code></li>
              <li>Runtime route: <code>${m(t.runtimeRoutePath||`not_collected`)}</code></li>
              <li>Runtime mode: <code>${m(t.runtimeNativeMode||`not_collected`)}</code></li>
              <li>Built entry: <code>${m(t.builtEntryFile||`not_collected`)}</code></li>
              <li>Classic fallback: <code>${m(t.classicFallbackPath)}</code></li>
              <li>Built preview: <code>${m(t.builtPreviewPath)}</code></li>
              <li>AI Ops feedback island: <code>${t.aiOpsFeedbackIslandAvailable?`available`:`not_collected`}</code></li>
              <li>Voice status island: <code>${t.voiceInputStatusIslandAvailable?`available`:`not_collected`}</code></li>
              <li>Navigation shell island: <code>${t.navigationShellIslandAvailable?`available`:`not_collected`}</code></li>
              <li>Document preview island: <code>${t.documentPreviewIslandAvailable?`available`:`not_collected`}</code></li>
              <li>Plugin host island: <code>${t.pluginHostIslandAvailable?`available`:`not_collected`}</code></li>
            </ul>
          </article>
        </section>
      </div>
    </div>
  `,h(e)}function b(e,t){e.innerHTML=`
    <div class="homeai-vite-app-preview">
      <div class="vap-shell">
        <div class="vap-error">
          Vite 应用预览启动失败：${m(t?.message||`unknown_error`)}。请回到 classic shell，或查看开发控制台。
        </div>
      </div>
    </div>
  `,h(e)}async function x(e){try{if(new URLSearchParams(window.location.search).has(`simulateError`))throw Error(`simulated_preview_error`);y(e,g(await _()))}catch(t){b(e,t)}}function S(e=document.querySelector(`[data-homeai-vite-app-preview]`)){return e?(h(e),x(e),{refresh:()=>x(e)}):null}window.HomeAIViteAppPreview=Object.freeze({mount:S,buildMetadata:g,runtimeSnapshot:()=>p.snapshot()}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>S(),{once:!0}):S();