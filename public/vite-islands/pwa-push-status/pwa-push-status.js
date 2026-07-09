import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{createPwaPushStatusState as t,transitionPwaPushScenario as n}from"../pwa-push-status-model/pwa-push-status-model.js";var r=`.homeai-vite-pwa-push-status{color:#152033;background:#f6f8fb;min-height:100vh;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.vps-shell{width:min(960px,100vw - 32px);margin:0 auto;padding:28px 0 40px}.vps-eyebrow{color:#607086;text-transform:uppercase;margin:0 0 6px;font-size:12px;font-weight:700}.vps-title{letter-spacing:0;margin:0;font-size:30px;line-height:1.15}.vps-subtitle{color:#536276;max-width:700px;margin:8px 0 20px;font-size:15px;line-height:1.55}.vps-grid{grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:16px;display:grid}.vps-panel,.vps-phone{background:#fff;border:1px solid #d9e0ea;border-radius:8px;box-shadow:0 1px 2px #0f172a0d}.vps-panel{padding:16px}.vps-panel-title{margin:0 0 12px;font-size:16px}.vps-controls{flex-wrap:wrap;gap:8px;display:flex}.vps-button{color:#1f2a3b;min-height:38px;font:inherit;cursor:pointer;background:#fff;border:1px solid #c7d2e2;border-radius:7px;padding:0 12px;font-weight:650}.vps-button.active{color:#fff;background:#2f6fed;border-color:#2f6fed}.vps-list{gap:8px;margin:14px 0 0;padding:0;list-style:none;display:grid}.vps-list li{color:#526173;border-top:1px solid #edf1f6;grid-template-columns:145px minmax(0,1fr);gap:10px;padding:8px 0;font-size:13px;display:grid}.vps-code{color:#1f2a3b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.vps-phone{background:#eef2f7;min-height:420px;padding:16px}.vps-topbar{background:#fff;border-radius:8px;justify-content:space-between;align-items:center;min-height:48px;padding:10px 12px;display:flex}.vps-push-control{background:#fff;border:1px solid #c7d2e2;border-radius:50%;width:36px;height:36px;font-size:17px}.vps-push-control.enabled{background:#dcfce7;border-color:#15803d}.vps-push-control.warning{color:#92400e;background:#fffbeb;border-color:#b45309}.vps-status-card{background:#fff;border-radius:8px;margin-top:14px;padding:12px}.vps-status-card h2{margin:0 0 8px;font-size:15px}.vps-status-card p{color:#536276;margin:5px 0;font-size:13px;line-height:1.5}.vps-reason{color:#92400e}@media (max-width:760px){.vps-shell{width:min(100vw - 24px,560px);padding-top:18px}.vps-grid{grid-template-columns:1fr}}`,i=`20260704-vite-pwa-push-status-preview-v1`,a=typeof window<`u`?window:globalThis,o=a.HomeAiRuntimeFacade||e({root:a,mode:`vite-pwa-push-status-preview`,clientVersion:i,appState:{pwaPushStatusPreview:!0},attachClassicCompatibility:!0});function s(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function c(e){if(e.querySelector(`style[data-homeai-vite-pwa-push-status-style]`))return;let t=document.createElement(`style`);t.setAttribute(`data-homeai-vite-pwa-push-status-style`,`true`),t.textContent=r,e.prepend(t)}function l(){return o.state?.get?.().pwaPushStatusPreviewState||t({secureContext:!0,serviceWorker:!0,pushManager:!0,notification:!0,serverEnabled:!0,permission:`default`,hasSubscription:!1,displayMode:`browser`})}function u(e,t={}){return o.state?.set?.({pwaPushStatusPreviewState:e}),o.events?.emit?.(`pwa-push-status-preview:update`,{action:e.button?.action||``,tone:e.button?.tone||``,permission:e.capabilities?.permission||``,displayMode:e.capabilities?.displayMode||``,...t}),o.feedback?.status?.(e.unavailableReason||e.button?.title||`PWA Push 状态已更新`,{tone:e.button?.tone===`warning`?`warning`:`info`,detail:`pwa_push_status_preview`}),e}function d(e){let t=n(l(),e);return u(t,{scenario:e}),t}function f(e){let t=e.capabilities||{};return[[`permission`,t.permission],[`displayMode`,t.displayMode],[`secureContext`,String(t.secureContext)],[`serviceWorker`,String(t.serviceWorker)],[`pushManager`,String(t.pushManager)],[`notification`,String(t.notification)],[`serverEnabled`,String(t.serverEnabled)],[`hasSubscription`,String(t.hasSubscription)],[`buttonAction`,e.button?.action||``],[`delivery`,e.delivery?.text||``]].map(([e,t])=>`
    <li>
      <span class="vps-code">${s(e)}</span>
      <span>${s(t)}</span>
    </li>
  `).join(``)}function p(e){let t=l(),n=t.button?.tone===`enabled`?`enabled`:t.button?.tone===`warning`?`warning`:``;e.innerHTML=`
    <div class="homeai-vite-pwa-push-status">
      <div class="vps-shell">
        <header>
          <p class="vps-eyebrow">Vite island 开发预览</p>
          <h1 class="vps-title">PWA / Web Push 状态</h1>
          <p class="vps-subtitle">预览 Web Push 支持、通知权限、PWA 显示模式和顶部通知按钮计划。此页只使用显式 fixture，不请求通知权限、不注册 Service Worker、不创建真实订阅。</p>
        </header>
        <section class="vps-grid">
          <article class="vps-panel">
            <h2 class="vps-panel-title">场景</h2>
            <div class="vps-controls" aria-label="PWA push scenarios">
              <button type="button" class="vps-button ${t.button?.action===`enable`?`active`:``}" data-vps-scenario="available">可启用</button>
              <button type="button" class="vps-button ${t.button?.action===`renew`?`active`:``}" data-vps-scenario="subscribed">已订阅</button>
              <button type="button" class="vps-button" data-vps-scenario="ios_browser">iOS 未添加主屏幕</button>
              <button type="button" class="vps-button" data-vps-scenario="denied">权限已拒绝</button>
              <button type="button" class="vps-button" data-vps-scenario="server_missing">服务端未配置</button>
            </div>
            <ul class="vps-list" aria-label="PWA push state">${f(t)}</ul>
          </article>
          <section class="vps-phone" aria-label="PWA mobile preview">
            <div class="vps-topbar">
              <strong>Home AI</strong>
              <button type="button" class="vps-push-control ${n}" title="${s(t.button?.title||``)}" aria-label="${s(t.button?.ariaLabel||``)}" data-vps-push-button>${s(t.button?.text||`🔔`)}</button>
            </div>
            <article class="vps-status-card">
              <h2>状态读回</h2>
              <p>按钮动作：<span class="vps-code">${s(t.button?.action||``)}</span></p>
              <p>按钮标签：${s(t.button?.title||``)}</p>
              <p>投递读回：${s(t.delivery?.text||``)}</p>
              ${t.unavailableReason?`<p class="vps-reason">${s(t.unavailableReason)}</p>`:``}
            </article>
          </section>
        </section>
      </div>
    </div>
  `,c(e)}function m(e){e.querySelectorAll(`[data-vps-scenario]`).forEach(t=>{t.addEventListener(`click`,()=>{d(t.dataset.vpsScenario||`available`),p(e),m(e)})}),e.querySelector(`[data-vps-push-button]`)?.addEventListener(`click`,()=>{let e=l();o.feedback?.toast?.(e.button?.title||`PWA Push`,{tone:e.button?.tone===`warning`?`warning`:`info`,action:e.button?.action||``})})}function h(e=document.querySelector(`[data-homeai-vite-pwa-push-status]`)){return e?(c(e),o.state?.get?.().pwaPushStatusPreviewState||u(l(),{scenario:`init`}),p(e),m(e),{refresh(){p(e),m(e)},setScenario(t){d(t),p(e),m(e)}}):null}a.HomeAIVitePwaPushStatusPreview=Object.freeze({version:i,mount:h,setScenario:d,state:l}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>h(),{once:!0}):h();export{h as mount};