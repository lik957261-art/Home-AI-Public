import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{FEEDBACK_CATEGORIES as t,buildFeedbackPayload as n,normalizeCategory as r,ownerConsoleAvailable as i,ownerConsoleLabel as a,summarizeSubmissionResult as o}from"../ai-ops-feedback-model/ai-ops-feedback-model.js";var s=`.homeai-vite-aiops-feedback{color:#172330;background:#f6f8fa;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.aof-shell{box-sizing:border-box;max-width:860px;margin:0 auto;padding:18px 14px 30px}.aof-topbar{border-bottom:1px solid #dbe4ec;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:14px;display:flex}.aof-eyebrow{color:#617384;letter-spacing:0;margin:0 0 5px;font-size:12px;font-weight:800}.aof-title{margin:0;font-size:24px;line-height:1.2}.aof-subtitle{color:#526375;max-width:620px;margin:7px 0 0;font-size:13px;line-height:1.5}.aof-state,.aof-actions,.aof-categories{flex-wrap:wrap;gap:8px;display:flex}.aof-state{justify-content:flex-end}.aof-panel{box-sizing:border-box;background:#fbfcfa;border:1px solid #dbe4ec;border-radius:8px;gap:12px;margin-top:14px;padding:14px;display:grid}.aof-context{color:#43566a;background:#f1f5f8;border:1px solid #dce5ed;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:9px 10px;font-size:13px;display:flex}.aof-category,.aof-button,.aof-badge{border-radius:8px;min-height:36px;font-size:13px;font-weight:800}.aof-category{color:#273b4e;background:#fff;border:1px solid #ccd8e2;padding:0 11px}.aof-category.active{color:#fff;background:#173a54;border-color:#173a54}.aof-note-label{gap:6px;display:grid}.aof-note-label span{color:#526375;font-size:12px;font-weight:800}.aof-note-label textarea{box-sizing:border-box;color:#172330;font:inherit;resize:vertical;background:#fff;border:1px solid #ccd8e2;border-radius:8px;width:100%;max-width:100%;min-height:86px;padding:10px;line-height:1.5}.aof-status{color:#526375;margin:0;font-size:13px;line-height:1.5}.aof-status[data-tone=ok]{color:#176239}.aof-status[data-tone=error]{color:#9b2323}.aof-status[data-tone=warning]{color:#755600}.aof-actions{justify-content:flex-end}.aof-button{color:#fff;background:#173a54;border:1px solid #173a54;padding:0 13px}.aof-button.secondary{color:#273b4e;background:#fff;border-color:#ccd8e2}.aof-button:disabled{color:#7a8793;cursor:default;opacity:.72}.aof-badge{color:#244762;background:#eef4fb;border:1px solid #bfd0df;align-items:center;min-height:0;padding:7px 9px;display:inline-flex}.aof-badge.ok{color:#176239;background:#e7f5ec;border-color:#a8d8b9}.aof-badge.muted{color:#677889;background:#f5f7f9}@media (max-width:720px){.aof-topbar,.aof-context{grid-template-columns:1fr;display:grid}.aof-state,.aof-actions{justify-content:flex-start}}`,c=`/api/v1/home-ai/diagnostics/events`,l=`20260702-vite-aiops-feedback-dev-v1`,u=typeof window<`u`?window:globalThis,d=(()=>{try{return new URLSearchParams(u.location?.search||``).get(`ownerPreview`)===`1`}catch{return!1}})(),f=u.HomeAiRuntimeFacade||e({root:u,mode:`vite-ai-ops-feedback-preview`,clientVersion:l,appState:{aiOpsFeedbackPreview:!0,auth:{isOwner:d},selectedWorkspaceId:`owner`},attachClassicCompatibility:!0});function p(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function m(e){if(e.querySelector(`style[data-homeai-vite-aiops-feedback-style]`))return;let t=document.createElement(`style`);t.setAttribute(`data-homeai-vite-aiops-feedback-style`,`true`),t.textContent=s,e.prepend(t)}function h(){return f.state?.get?.()||{}}function g(){return{ownerSystemConsole:typeof u.openOwnerSystemConsoleSurface==`function`}}function _(e){return t.map(t=>`
    <button
      class="aof-category${t.id===e?` active`:``}"
      type="button"
      data-aof-category="${p(t.id)}"
      aria-pressed="${t.id===e?`true`:`false`}"
    >${p(t.label)}</button>
  `).join(``)}function v(e,t=h()){let n=r(t.aiOpsFeedbackCategory||`plugin_issue`),o=g(),s=i(t,o);e.innerHTML=`
    <div class="homeai-vite-aiops-feedback">
      <div class="aof-shell">
        <header class="aof-topbar">
          <div>
            <p class="aof-eyebrow">Vite island 开发预览</p>
            <h1 class="aof-title">AI Ops 反馈菜单</h1>
            <p class="aof-subtitle">复刻三指长按反馈菜单的可迁移 UI。当前页面只用于开发验证，不替换生产根 shell。</p>
          </div>
          <div class="aof-state">
            <span class="aof-badge">${p(f.mode||`vite-preview`)}</span>
            <span class="aof-badge ${s?`ok`:`muted`}">${p(a(t,o))}</span>
          </div>
        </header>

        <section class="aof-panel" role="dialog" aria-label="AI Ops 反馈菜单">
          <div class="aof-context">
            <strong>当前页面</strong>
            <span>${p(f.route?.current?.().pathname||`/vite-ai-ops-feedback-preview/`)}</span>
          </div>
          <div class="aof-categories" role="group" aria-label="反馈类型">
            ${_(n)}
          </div>
          <label class="aof-note-label">
            <span>补充一句</span>
            <textarea data-aof-note maxlength="260" rows="3" placeholder="可以不填；不要输入密码、密钥或隐私正文">${p(t.aiOpsFeedbackNote||``)}</textarea>
          </label>
          <p class="aof-status" data-aof-status>将只提交最近的状态、计数和错误码。</p>
          <div class="aof-actions">
            <button class="aof-button secondary" type="button" data-aof-owner-console${s?``:` disabled`}>${p(a(t,o))}</button>
            <button class="aof-button" type="button" data-aof-submit>提交</button>
          </div>
        </section>
      </div>
    </div>
  `,m(e)}function y(e,t,n=``){let r=e.querySelector(`[data-aof-status]`);r&&(r.textContent=t,r.dataset.tone=n),f.feedback?.status?.(t,{tone:n,source:`vite-ai-ops-feedback`})}async function b(e){let t=h(),i=e.querySelector(`[data-aof-note]`)?.value||``,a=n({category:r(t.aiOpsFeedbackCategory||`plugin_issue`),note:i,route:f.route?.current?.()||{},state:t,native:f.native||{},capabilities:g()});f.state?.set?.({aiOpsFeedbackNote:i,aiOpsFeedbackSubmissionStatus:`submitting`}),f.events?.emit?.(`ai-ops-feedback:submit:start`,{category:a.category,route:a.route}),y(e,`正在提交...`,`pending`);try{let t=await f.api(c,{method:`POST`,body:JSON.stringify(a)}),n=o(t||{});return f.state?.set?.({aiOpsFeedbackSubmissionStatus:`submitted`,aiOpsFeedbackCaseId:t?.case_id||t?.caseId||``}),f.events?.emit?.(`ai-ops-feedback:submit:success`,{category:a.category,caseId:t?.case_id||t?.caseId||``}),y(e,n,`ok`),t}catch(t){return f.state?.set?.({aiOpsFeedbackSubmissionStatus:`error`,aiOpsFeedbackError:t?.code||t?.message||`submit_failed`}),f.events?.emit?.(`ai-ops-feedback:submit:error`,{category:a.category,error:t?.code||t?.message||`submit_failed`}),y(e,`提交失败。`,`error`),null}}function x(e){let t=h();if(!i(t,g())){y(e,a(t,g()),`warning`);return}Promise.resolve(u.openOwnerSystemConsoleSurface({trigger:`vite_ai_ops_feedback_preview`})).then(()=>{f.events?.emit?.(`ai-ops-feedback:owner-console-opened`,{}),f.feedback?.toast?.(`已打开系统控制台`,{tone:`success`})}).catch(t=>{f.events?.emit?.(`ai-ops-feedback:owner-console-error`,{error:t?.code||t?.message||`open_failed`}),y(e,`系统控制台打开失败。`,`error`)})}function S(e){e.querySelectorAll(`[data-aof-category]`).forEach(t=>{t.addEventListener(`click`,()=>{f.state?.set?.({aiOpsFeedbackCategory:t.dataset.aofCategory||`plugin_issue`}),v(e),S(e)})}),e.querySelector(`[data-aof-note]`)?.addEventListener(`input`,e=>{f.state?.set?.({aiOpsFeedbackNote:e.target.value||``})}),e.querySelector(`[data-aof-submit]`)?.addEventListener(`click`,()=>b(e)),e.querySelector(`[data-aof-owner-console]`)?.addEventListener(`click`,()=>x(e))}function C(e=document.querySelector(`[data-homeai-vite-aiops-feedback]`)){return e?(v(e),S(e),{refresh(){v(e),S(e)},submit:()=>b(e)}):null}u.HomeAIViteAiOpsFeedbackPreview=Object.freeze({mount:C,payloadPreview:(e={})=>n(Object.assign({route:f.route?.current?.()||{},state:h(),native:f.native||{},capabilities:g()},e)),runtimeSnapshot:()=>f.snapshot()}),typeof document<`u`&&(document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>C(),{once:!0}):C());export{C as mount};