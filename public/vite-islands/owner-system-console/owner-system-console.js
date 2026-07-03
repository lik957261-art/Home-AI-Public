import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";var t=`.homeai-vite-owner-console{color:#17202a;background:linear-gradient(#eff4f8f5,#f7f9fbfa),#f7f9fb;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.osc-shell{box-sizing:border-box;width:min(1120px,100%);margin:0 auto;padding:18px 14px 28px}.osc-topbar{border-bottom:1px solid #d9e1e8;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:12px;display:flex}.osc-title-group{min-width:0}.osc-eyebrow{color:#607080;letter-spacing:0;margin:0 0 4px;font-size:12px;font-weight:700}.osc-title{margin:0;font-size:24px;line-height:1.2}.osc-subtitle{color:#516070;margin:6px 0 0;font-size:13px;line-height:1.5}.osc-actions{flex-wrap:wrap;justify-content:flex-end;gap:8px;display:flex}.osc-button{color:#fff;cursor:pointer;background:#12324a;border:1px solid #12324a;border-radius:8px;align-items:center;min-height:36px;padding:0 12px;font-size:13px;font-weight:700;display:inline-flex}.osc-button.secondary{color:#1f3547;background:#fff;border-color:#cbd6df}.osc-status-row,.osc-metric-grid,.osc-signal-grid,.osc-section-grid{gap:10px;display:grid}.osc-status-row{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px}.osc-metric-grid{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px}.osc-signal-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}.osc-section-grid{grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);margin-top:14px}.osc-panel,.osc-card{box-sizing:border-box;background:#ffffffeb;border:1px solid #d9e1e8;border-radius:8px}.osc-panel{padding:14px}.osc-card{min-width:0;padding:12px}.osc-card-label,.osc-panel-title{color:#526273;letter-spacing:0;margin:0;font-size:12px;font-weight:800}.osc-card-value{margin:8px 0 4px;font-size:26px;font-weight:800;line-height:1.1}.osc-card-meta{color:#526273;margin:0;font-size:12px;line-height:1.45}.osc-badge{text-transform:none;border:1px solid #cbd6df;border-radius:999px;padding:7px 9px;font-size:12px;font-weight:800;line-height:1;display:inline-flex}.osc-badge.ok{color:#176339;background:#e6f5eb;border-color:#a8d7b8}.osc-badge.warning,.osc-badge.stale,.osc-badge.unknown{color:#7b5a00;background:#fff7df;border-color:#e7c86f}.osc-badge.degraded,.osc-badge.blocked{color:#9b1f1f;background:#fdeaea;border-color:#efb1b1}.osc-signal{gap:8px;display:grid}.osc-signal-head{justify-content:space-between;align-items:center;gap:8px;display:flex}.osc-signal-title{min-width:0;margin:0;font-size:15px;font-weight:800}.osc-signal-summary{color:#32465a;margin:0;font-size:13px;line-height:1.5}.osc-list{gap:8px;margin:10px 0 0;display:grid}.osc-list-item{border-top:1px solid #e1e8ef;gap:5px;padding-top:9px;display:grid}.osc-list-item:first-child{border-top:0;padding-top:0}.osc-table{border-collapse:collapse;width:100%;margin-top:10px;font-size:13px}.osc-table th,.osc-table td{text-align:left;vertical-align:top;border-bottom:1px solid #e1e8ef;padding:9px 6px}.osc-table th{color:#526273;font-size:12px;font-weight:800}.osc-empty,.osc-error,.osc-loading{color:#32465a;background:#fff;border:1px solid #d9e1e8;border-radius:8px;margin-top:14px;padding:18px;line-height:1.6}.osc-error{color:#9b1f1f;border-color:#efb1b1}@media (max-width:760px){.osc-topbar{display:grid}.osc-actions{justify-content:flex-start}.osc-status-row,.osc-metric-grid,.osc-signal-grid,.osc-section-grid{grid-template-columns:1fr}.osc-title{font-size:22px}}`,n=Object.freeze({ok:`正常`,warning:`注意`,degraded:`降级`,blocked:`阻断`,stale:`过期`,unknown:`未知`,not_collected:`未采集`}),r=Object.freeze({host_cpu:`CPU`,host_memory:`内存`,host_disk:`磁盘`,process:`进程`,service:`服务`,gateway:`Gateway`,plugin:`Plugin`,deploy:`部署`,diagnostic:`诊断`,availability:`可用性`,accuracy:`准确性`,autonomy:`自主性`});function i(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function a(e){let t=String(e||`unknown`).toLowerCase();return t===`healthy`||t===`ready`||t===`passed`?`ok`:Object.hasOwn(n,t)?t:`unknown`}function o(e){return n[a(e)]||n.unknown}function s(e){return r[String(e||``)]||String(e||`信号`)}function c(e){let t=Number(e);return Number.isFinite(t)?`${Math.round(t)}%`:`未采集`}function l(e){let t=Number(e);return!Number.isFinite(t)||t<=0?`未采集`:`${Math.round(t/1024**3*10)/10} GB`}function u(e){if(!e)return`未采集`;let t=new Date(e);return Number.isNaN(t.getTime())?String(e).slice(0,40):t.toLocaleString(`zh-CN`,{month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function d(e={}){return e?.status===401||e?.status===403?{message:`需要 Owner 权限或重新登录。`,status:e.status,code:e.code||`owner_permission_required`}:{message:e?.status?`系统控制台读取失败：HTTP ${e.status}`:e?.message||`系统控制台读取失败。`,status:e?.status||0,code:e?.code||`owner_system_console_read_failed`}}function f(e={}){let t=d(e),n=Error(t.message);return n.status=t.status,n.code=t.code,n}function p(e){let t=a(e);return`<span class="osc-badge ${i(t)}">${i(o(t))}</span>`}function m(e,t,n,r=`unknown`){return`
    <article class="osc-card">
      <p class="osc-card-label">${i(e)}</p>
      <div class="osc-card-value">${i(t)}</div>
      <p class="osc-card-meta">${p(r)} ${i(n||``)}</p>
    </article>
  `}function h(e={}){return`
    <article class="osc-card osc-signal">
      <div class="osc-signal-head">
        <h3 class="osc-signal-title">${i(e.label||s(e.category))}</h3>
        ${p(e.status)}
      </div>
      <p class="osc-signal-summary">${i(e.summary||`没有摘要。`)}</p>
      <p class="osc-card-meta">${i(s(e.category))} · ${i(e.severity||`H3`)} · ${i(u(e.lastCheckedAt))}</p>
    </article>
  `}function g(e={}){return`
    <div class="osc-list-item">
      <div class="osc-signal-head">
        <strong>${i(e.label||s(e.category))}</strong>
        ${p(e.status)}
      </div>
      <span>${i(e.summary||`需要查看详情。`)}</span>
      <span class="osc-card-meta">建议：${i(e.recommendedAction||`观察`)}</span>
    </div>
  `}function _(e=[]){let t=e.filter(e=>[`process`,`service`,`gateway`,`plugin`].includes(e.category)).slice(0,8);return t.length?t.map(e=>`
    <tr>
      <td>${i(e.label||s(e.category))}</td>
      <td>${p(e.status)}</td>
      <td>${i(e.summary||``)}</td>
      <td>${i(u(e.lastCheckedAt))}</td>
    </tr>
  `).join(``):`<tr><td colspan="4">当前没有可展示的关键服务信号。</td></tr>`}function v(e={}){let t=e.cpu||{},n=e.memory||{},r=(Array.isArray(e.disks)?e.disks:[])[0]||{},i=e.host||{};return{cpu:m(`CPU`,c(t.overallPercent),`${t.coreCount||`?`} 核 · load/core ${t.loadPerCore?.oneMinute??`未采集`}`,t.status),memory:m(`内存`,c(n.percentUsed),`${l(n.usedBytes)} / ${l(n.totalBytes)}`,n.status),disk:m(`磁盘`,c(r.percentUsed),`${l(r.freeBytes)} 可用`,r.status),uptime:m(`Uptime`,i.uptimeText||i.uptimeSeconds?`${Math.floor(Number(i.uptimeSeconds||0)/3600)} 小时`:`未采集`,`最近刷新 ${u(e.collectedAt)}`,e.overallStatus)}}function y(e={},t={}){let n=e.console||{},r=t.systemStatus||n.systemStatus||{},i=v(r),c=Array.isArray(n.dimensions)?n.dimensions:[],l=Array.isArray(n.criticalSignals)?n.criticalSignals:[],d=Array.isArray(r.signals)?r.signals:[],f=l.length?l:d.filter(e=>a(e.status)!==`ok`).slice(0,8);return`
    <div class="homeai-vite-owner-console">
      <div class="osc-shell">
        <header class="osc-topbar">
          <div class="osc-title-group">
            <p class="osc-eyebrow">Vite island 开发预览</p>
            <h1 class="osc-title">Home AI 系统控制台</h1>
            <p class="osc-subtitle">只读 Owner 视图。当前页面不替换主 PWA shell，也不接入 Service Worker 预缓存。</p>
          </div>
          <div class="osc-actions">
            ${p(n.overallStatus)}
            <button class="osc-button secondary" type="button" data-osc-refresh>刷新</button>
          </div>
        </header>

        <section class="osc-status-row" aria-label="3A 状态">
          ${c.slice(0,3).map(e=>m(e.label||s(e.category),o(e.status),e.summary,e.status)).join(``)}
          ${m(`只读策略`,n.policy?.readOnlyMvp?`启用`:`未知`,`操作执行未启用`,`ok`)}
        </section>

        <section class="osc-metric-grid" aria-label="系统资源">
          ${i.cpu}
          ${i.memory}
          ${i.disk}
        </section>

        <section class="osc-signal-grid" aria-label="关键信号">
          ${(l.length?l:c).slice(0,4).map(h).join(``)||`<div class="osc-empty">当前没有关键告警。</div>`}
        </section>

        <section class="osc-section-grid">
          <article class="osc-panel">
            <h2 class="osc-panel-title">关键服务与 Runtime</h2>
            <table class="osc-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>状态</th>
                  <th>摘要</th>
                  <th>检查时间</th>
                </tr>
              </thead>
              <tbody>${_(d)}</tbody>
            </table>
          </article>

          <article class="osc-panel">
            <h2 class="osc-panel-title">近期需要关注</h2>
            <div class="osc-list">
              ${f.length?f.slice(0,8).map(g).join(``):`<div class="osc-list-item">没有当前告警。</div>`}
            </div>
          </article>
        </section>

        <section class="osc-metric-grid" aria-label="采集状态">
          ${i.uptime}
          ${m(`Console 版本`,n.consoleVersion||`未知`,`生成 ${u(n.generatedAt)}`,n.ok?`ok`:n.overallStatus)}
          ${m(`页面状态`,`${Array.isArray(n.pages)?n.pages.length:0} 项`,`Gateway / Plugin / Deploy 等后续页仍按 MVP 分阶段接入`,`unknown`)}
        </section>
      </div>
    </div>
  `}function b(){return`<div class="homeai-vite-owner-console"><div class="osc-shell"><div class="osc-loading">正在读取 Owner 系统控制台...</div></div></div>`}function x(e){return`
    <div class="homeai-vite-owner-console">
      <div class="osc-shell">
        <div class="osc-error">
          <strong>Home AI 系统控制台</strong><br>
          ${i(d(e).message)}
        </div>
      </div>
    </div>
  `}var S=`/api/owner/system-console`,C=`/api/owner/system-console/system-status`,w=`20260702-vite-owner-console-dev-v1`,T=typeof window<`u`?window:globalThis,E=T.HomeAiRuntimeFacade||e({root:T,mode:`vite-owner-system-console-preview`,clientVersion:w,appState:{ownerSystemConsolePreview:!0},attachClassicCompatibility:!0});async function D(e){try{return await E.api(e,{headers:{Accept:`application/json`}})||{}}catch(e){throw f(e)}}function O(e){if(e.querySelector(`style[data-homeai-vite-owner-console-style]`))return;let n=document.createElement(`style`);n.setAttribute(`data-homeai-vite-owner-console-style`,`true`),n.textContent=t,e.prepend(n)}function k(e,t){e.innerHTML=t,O(e)}function A(e,t,n){k(e,y(t,n)),e.querySelector(`[data-osc-refresh]`)?.addEventListener(`click`,()=>N(e))}function j(e){k(e,b())}function M(e,t){k(e,x(t))}async function N(e){j(e),E.events?.emit?.(`owner-system-console:load:start`,{source:`vite-island`});try{let[t,n]=await Promise.all([D(S),D(C)]);E.state?.set?.({ownerSystemConsoleLoadedAt:new Date().toISOString(),ownerSystemConsoleStatus:`ready`}),E.events?.emit?.(`owner-system-console:load:success`,{source:`vite-island`}),A(e,t,n)}catch(t){E.state?.set?.({ownerSystemConsoleStatus:`error`,ownerSystemConsoleError:t?.code||t?.message||`unknown_error`}),E.events?.emit?.(`owner-system-console:load:error`,{source:`vite-island`,code:t?.code||``,status:t?.status||0}),M(e,t)}}function P(e=document.querySelector(`[data-homeai-vite-owner-console]`)){return e?(O(e),N(e),{refresh:()=>N(e)}):null}window.HomeAIViteOwnerSystemConsolePreview=Object.freeze({mount:P,runtimeSnapshot:()=>E.snapshot?.()||{}}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>P(),{once:!0}):P();