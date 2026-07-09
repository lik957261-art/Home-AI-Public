import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{buildPluginHostViewModel as t,decidePluginIframeLifecycleAction as n}from"../plugin-host-model/plugin-host-model.js";var r=`:root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light dark;color:#15171a;background:#f6f7f9;font-family:Inter,PingFang SC,Microsoft YaHei,sans-serif}@media (prefers-color-scheme:dark){:root{--lightningcss-light: ;--lightningcss-dark:initial}}body{margin:0}.homeai-vite-plugin-host{box-sizing:border-box;min-height:100vh;padding:14px}.php-shell{gap:12px;max-width:960px;margin:0 auto;display:grid}.php-topbar,.php-toolbar,.php-tabs{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.php-topbar{justify-content:space-between}.php-eyebrow,.php-status,.php-frame small{color:#5d6673;margin:0;font-size:12px}.php-title{letter-spacing:0;margin:2px 0 0;font-size:22px}.php-badge,.php-tab,.php-toolbar button{color:inherit;font:inherit;background:#fff;border:1px solid #cfd5dd;border-radius:8px;padding:8px 10px}.php-badge{font-size:12px}.php-badge.ready{color:#17633c;border-color:#2f8f5b}.php-badge.blocked,.php-badge.permission_denied,.php-badge.unavailable{color:#842929;border-color:#b84d4d}.php-tab.active{background:#edf4ff;border-color:#2f5f9f}.php-frame{background:#fff;border:1px solid #d8dde5;border-radius:8px;min-height:320px;overflow:hidden}.php-frame.unavailable{text-align:center;place-content:center;padding:24px;display:grid}.php-frame iframe{background:#fff;border:0;width:100%;height:360px;display:block}.php-evidence{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:0;display:grid}.php-evidence div{background:#fff;border:1px solid #d8dde5;border-radius:8px;padding:10px}.php-evidence dt{color:#5d6673;font-size:12px}.php-evidence dd{overflow-wrap:anywhere;margin:4px 0 0}@media (prefers-color-scheme:dark){:root{color:#eef1f5;background:#111418}.php-badge,.php-tab,.php-toolbar button,.php-frame,.php-frame iframe,.php-evidence div{background:#171c22;border-color:#313945}.php-tab.active{background:#1d3048}}`,i=`20260703-vite-plugin-host-dev-v1`,a=typeof window<`u`?window:globalThis,o=Object.freeze([Object.freeze({id:`finance`,title:`记账`,manifestPath:`/api/hermes-plugins/finance/manifest`,residentFrame:!0}),Object.freeze({id:`codex-mobile`,title:`Codex Mobile`,manifestPath:`/api/hermes-plugins/codex-mobile/manifest`,residentFrame:!0}),Object.freeze({id:`movie`,title:`电影`,manifestPath:`/api/hermes-plugins/movie/manifest`,residentFrame:!0})]),s=Object.freeze({finance:Object.freeze({ok:!0,id:`finance`,title:`记账`,kind:`embedded_app`,available:!0,version:`vite-dev-plugin-host-fixture`,workspaceId:`owner`,entry:Object.freeze({url:`/plugins/finance/?workspaceId=owner&mode=vite-dev-preview`,origin:`same-origin`}),embed:Object.freeze({tokenStatus:`not_required`,refreshOnVersionChange:!0}),actions:Object.freeze([`record`,`transactions`])})}),c=a.HomeAiRuntimeFacade||e({root:a,mode:`vite-plugin-host-preview`,clientVersion:i,appState:{selectedWorkspaceId:`owner`,pluginHostPreview:!0,selectedPluginId:`finance`,pluginHostLastStatus:{level:`info`,text:`插件 Host 预览使用 bounded manifest，不读取真实 launch token。`}},attachClassicCompatibility:!0});function l(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function u(e){if(e.querySelector(`style[data-homeai-vite-plugin-host-style]`))return;let t=e.head||e,n=document.createElement(`style`);n.setAttribute(`data-homeai-vite-plugin-host-style`,`true`),n.textContent=r,t.prepend(n)}function d(){return c.state?.get?.()||{}}function f(){let e=d(),t=String(e.selectedPluginId||o[0].id);return o.some(e=>e.id===t)?t:o[0].id}function p(){let e=f();return o.find(t=>t.id===e)||o[0]}function m(e=p()){return d().pluginHostManifest||s[e.id]||{ok:!1,id:e.id,title:e.title,kind:`embedded_app`,available:!1,code:`vite_plugin_host_manifest_not_loaded`}}function h(e,t,n=``){c.state?.set?.({pluginHostLastStatus:{level:String(e||`info`),text:String(t||``),detail:String(n||``)}}),c.events?.emit?.(`plugin-host-preview:status`,{level:String(e||`info`),text:String(t||``),detail:String(n||``)})}function g(){let e=d().pluginHostLastStatus||{};return{level:String(e.level||`info`),text:String(e.text||`插件 Host 预览使用 bounded manifest，不读取真实 launch token。`),detail:String(e.detail||``)}}function _(){return d().pluginHostLifecycleScenario||{reason:`manifest_refresh`,loaded:!0,shellLoading:!1,currentUrl:`/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old-token`,nextUrl:`/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=new-token`,loadingStartedAt:0,now:15e3}}function v(e){return o.map(t=>`
    <button
      type="button"
      class="php-tab${t.id===e?` active`:``}"
      data-plugin-id="${l(t.id)}"
      aria-pressed="${t.id===e?`true`:`false`}"
    >${l(t.title)}</button>
  `).join(``)}function y(e){return[[`Plugin`,e.pluginId],[`状态`,e.statusLabel],[`Workspace`,e.workspaceId],[`Manifest`,e.manifest.path],[`版本`,e.manifest.version||`未返回`],[`入口`,e.iframe.boundedEntryLabel||`不可用`],[`Launch token`,e.refresh.usesLaunchToken?`存在 · 已隐藏`:`未返回`],[`刷新策略`,e.refresh.requiresFreshManifest?`短 TTL + version refresh`:`常规 TTL`]].map(([e,t])=>`
    <div>
      <dt>${l(e)}</dt>
      <dd>${l(t)}</dd>
    </div>
  `).join(``)}function b(e){if(!e.iframe.enabled)return`
      <section class="php-frame unavailable">
        <p>${l(e.statusLabel)}</p>
        <small>${l(e.evidence.join(` · `))}</small>
      </section>
    `;let t=`<!doctype html><html lang="zh-CN"><body style="margin:0;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#15171a;display:grid;place-content:center;min-height:100vh;text-align:center"><main><strong>${l(e.iframe.title)}</strong><br><span>Vite Plugin Host preview iframe</span></main></body></html>`;return`
    <section class="php-frame">
      <iframe
        title="${l(e.iframe.title)}"
        srcdoc="${l(t)}"
        data-intended-src="${l(e.iframe.src)}"
        data-plugin-id="${l(e.pluginId)}"
        loading="lazy"
      ></iframe>
    </section>
  `}function x(e){let t=n(Object.assign({pluginId:e.pluginId,manifest:{id:e.pluginId,entry:{url:e.iframe.src}}},_()));return`
    <section class="php-lifecycle" aria-label="Plugin iframe lifecycle evidence">
      <div>
        <strong>iframe lifecycle：${l(t.action)}</strong>
        <small>${l(t.explanation)}</small>
      </div>
      <div class="php-toolbar compact">
        <button type="button" data-lifecycle-scenario="token_refresh">token refresh</button>
        <button type="button" data-lifecycle-scenario="loaded_timeout">loaded timeout</button>
        <button type="button" data-lifecycle-scenario="loading_timeout">loading timeout</button>
        <button type="button" data-lifecycle-scenario="entry_change">entry change</button>
      </div>
      <p class="php-status info">${l(t.boundedEvidence.join(` · `))}</p>
    </section>
  `}function S(e){let n=p(),r=t(n,m(n),{workspaceId:d().selectedWorkspaceId||`owner`,isOwner:d().isOwner!==!1,currentProtocol:a.location?.protocol||`https:`}),i=g();e.innerHTML=`
    <div class="homeai-vite-plugin-host">
      <div class="php-shell">
        <header class="php-topbar">
          <div>
            <p class="php-eyebrow">Vite island 开发预览</p>
            <h1 class="php-title">Plugin Host</h1>
          </div>
          <span class="php-badge ${l(r.status)}">${l(r.statusLabel)}</span>
        </header>
        <nav class="php-tabs" aria-label="Plugin preview tabs">
          ${v(r.pluginId)}
        </nav>
        <div class="php-toolbar">
          <button type="button" data-refresh-manifest>刷新 manifest</button>
          <button type="button" data-owner-toggle>${d().isOwner===!1?`切到 Owner`:`模拟非 Owner`}</button>
        </div>
        <p class="php-status ${l(i.level)}">${l(i.text)}${i.detail?` · ${l(i.detail)}`:``}</p>
        ${b(r)}
        ${x(r)}
        <dl class="php-evidence">${y(r)}</dl>
      </div>
    </div>
  `}async function C(e){let t=p(),n=String(d().selectedWorkspaceId||`owner`),r=new URLSearchParams({workspaceId:n});h(`loading`,`正在读取 bounded manifest`);try{let e=await c.api(`${t.manifestPath}?${r.toString()}`);c.state?.set?.({pluginHostManifest:e}),h(`ok`,`Manifest 已读取`,e?.version||``)}catch(e){c.state?.set?.({pluginHostManifest:{ok:!1,id:t.id,title:t.title,kind:`embedded_app`,available:!1,code:e?.message||`manifest_read_failed`}}),h(`error`,`Manifest 读取失败`,e?.message||`unknown`)}S(e)}function w(e){e.addEventListener(`click`,t=>{let n=t.target?.closest?.(`[data-plugin-id]`);if(n){c.state?.set?.({selectedPluginId:n.getAttribute(`data-plugin-id`),pluginHostManifest:null}),h(`info`,`已切换 Plugin，等待读取 manifest`),S(e);return}let r=t.target?.closest?.(`[data-lifecycle-scenario]`);if(r){let t=r.getAttribute(`data-lifecycle-scenario`),n=`/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner`,i={token_refresh:{reason:`manifest_refresh`,loaded:!0,shellLoading:!1,currentUrl:`${n}&launch=old-token`,nextUrl:`${n}&launch=new-token`,loadingStartedAt:0,now:15e3},loaded_timeout:{reason:`navigation_health_timeout`,loaded:!0,shellLoading:!1,currentUrl:`${n}&launch=stable`,nextUrl:`${n}&launch=stable`,loadingStartedAt:0,now:3e4},loading_timeout:{reason:`navigation_health_timeout`,loaded:!1,shellLoading:!0,currentUrl:`${n}&launch=stable`,nextUrl:`${n}&launch=stable`,loadingStartedAt:0,now:3e4,healthTimeoutMs:12e3},entry_change:{reason:`manifest_refresh`,loaded:!0,shellLoading:!1,currentUrl:`${n}&pluginRoute=thread-list&launch=old-token`,nextUrl:`${n}&pluginRoute=quota&launch=new-token`,loadingStartedAt:0,now:3e4}};c.state?.set?.({pluginHostLifecycleScenario:i[t]||i.token_refresh}),h(`info`,`iframe lifecycle scenario 已更新`,t),S(e);return}if(t.target?.closest?.(`[data-refresh-manifest]`)){C(e);return}t.target?.closest?.(`[data-owner-toggle]`)&&(c.state?.set?.({isOwner:d().isOwner===!1}),h(`info`,`权限状态已切换`),S(e))})}function T(){let e=document.querySelector(`[data-vite-plugin-host-root]`);e&&(u(document),S(e),w(e),a.HomeAIVitePluginHostPreview=Object.freeze({version:i,render:()=>S(e),refreshManifest:()=>C(e),selectPlugin:t=>{c.state?.set?.({selectedPluginId:String(t||`finance`),pluginHostManifest:null}),S(e)},state:()=>c.state?.get?.()||{}}))}T();