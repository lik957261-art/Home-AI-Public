import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{closeDialogState as t,createDialogState as n,dialogButtonPlan as r,dialogCanCancel as i,dialogNeedsInput as a,normalizeDialogOptions as o}from"../dialog-sheet-model/dialog-sheet-model.js";var s=`:root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light;color:#15171a;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}body{background:#f6f7f9;min-height:100vh;margin:0}button,input,textarea{font:inherit}.homeai-vite-dialog-sheet{box-sizing:border-box;min-height:100vh;padding:18px}.vds-shell{max-width:920px;margin:0 auto}.vds-topbar{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;display:flex}.vds-eyebrow{color:#64748b;margin:0 0 6px;font-size:12px}.vds-title{letter-spacing:0;margin:0;font-size:24px}.vds-subtitle{color:#475569;max-width:620px;margin:8px 0 0;line-height:1.5}.vds-controls,.vds-evidence{flex-wrap:wrap;gap:8px;margin-bottom:16px;display:flex}.vds-button{color:#15171a;cursor:pointer;background:#fff;border:1px solid #cbd5e1;border-radius:8px;min-height:38px;padding:0 12px}.vds-button.active{color:#0f766e;background:#ecfdf5;border-color:#0f766e}.vds-button.danger,.vds-dialog-confirm.danger{color:#fff;background:#dc2626;border-color:#dc2626}.vds-stage{background:#fff;border:1px solid #dbe3ee;border-radius:10px;min-height:420px;position:relative;overflow:hidden}.vds-preview-page{padding:22px}.vds-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 12px;padding:14px}.vds-overlay{background:#0f172a47;place-items:end center;padding:18px;display:grid;position:absolute;inset:0}.vds-sheet{background:#fff;border:1px solid #e2e8f0;border-radius:12px;width:min(100%,440px);padding:16px;box-shadow:0 18px 42px #0f172a2e}.vds-sheet-head{justify-content:space-between;align-items:start;gap:12px;margin-bottom:12px;display:flex}.vds-sheet-title{margin:0;font-size:18px}.vds-close{background:#fff;border:1px solid #cbd5e1;border-radius:8px;width:34px;height:34px}.vds-message,.vds-detail{margin:0 0 10px;line-height:1.5}.vds-detail{color:#64748b;font-size:13px}.vds-field{gap:6px;margin:10px 0 14px;display:grid}.vds-field input,.vds-field textarea{box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;width:100%;padding:10px}.vds-actions{justify-content:flex-end;gap:8px;display:flex}.vds-dialog-cancel,.vds-dialog-confirm{background:#fff;border:1px solid #cbd5e1;border-radius:8px;min-height:38px;padding:0 14px}.vds-dialog-confirm{color:#fff;background:#0f766e;border-color:#0f766e}.vds-result{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:14px;display:grid}.vds-result div{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px}.vds-result dt{color:#64748b;font-size:12px}.vds-result dd{margin:3px 0 0;font-weight:650}`,c=`20260704-vite-dialog-sheet-preview-v1`,l=typeof window<`u`?window:globalThis,u=l.HomeAiRuntimeFacade||e({root:l,mode:`vite-dialog-sheet-preview`,clientVersion:c,appState:{dialogSheetPreview:!0},attachClassicCompatibility:!0});function d(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function f(e){if(e.querySelector(`style[data-homeai-vite-dialog-sheet-style]`))return;let t=document.createElement(`style`);t.setAttribute(`data-homeai-vite-dialog-sheet-style`,`true`),t.textContent=s,e.prepend(t)}function p(){return u.state?.get?.().dialogSheetPreviewState||n(`confirm`,{title:`删除话题`,message:`此操作只在 Vite dev preview 中模拟，不会修改真实数据。`,detail:`确认/取消结果会写入 runtime state，用于替代 classic 全局 dialog 的 ESM 状态模型。`,confirmLabel:`删除`,danger:!0})}function m(e,t={}){u.state?.set?.({dialogSheetPreviewState:e}),u.events?.emit?.(`dialog-sheet-preview:update`,{kind:e.kind,open:e.open,settled:e.result?.settled===!0,reason:e.result?.reason||``,...t})}function h(e,t={}){let r=n(e,t);return m(r,{action:`open`}),r}function g(e,n=``){let r=t(p(),e,n);return m(r,{action:`settle`}),r}function _(e){if(!a(e))return``;let t=o(e.options||{}),n=`viteDialogSheetInput`;return t.multiline?`
      <label class="vds-field" for="${n}">
        <span>${d(t.inputLabel)}</span>
        <textarea id="${n}" rows="4" data-vds-input placeholder="${d(t.placeholder)}">${d(t.defaultValue)}</textarea>
      </label>
    `:`
    <label class="vds-field" for="${n}">
      <span>${d(t.inputLabel)}</span>
      <input id="${n}" data-vds-input type="text" value="${d(t.defaultValue)}" placeholder="${d(t.placeholder)}">
    </label>
  `}function v(e){return r(e).map(e=>{let t=e.id===`cancel`?`data-vds-cancel`:`data-vds-confirm`;return`<button type="button" class="${(e.id===`cancel`?`vds-dialog-cancel`:`vds-dialog-confirm ${e.tone===`danger`?`danger`:``}`).trim()}" ${t}>${d(e.label)}</button>`}).join(``)}function y(e){if(!e.open)return``;let t=o(e.options||{});return`
    <div class="vds-overlay" data-vds-overlay>
      <section class="vds-sheet" role="dialog" aria-modal="true" aria-labelledby="viteDialogSheetTitle">
        <header class="vds-sheet-head">
          <h2 class="vds-sheet-title" id="viteDialogSheetTitle">${d(t.title)}</h2>
          ${i(e)?`<button type="button" class="vds-close" data-vds-cancel aria-label="关闭">×</button>`:``}
        </header>
        ${t.message?`<p class="vds-message">${d(t.message)}</p>`:``}
        ${t.detail?`<p class="vds-detail">${d(t.detail)}</p>`:``}
        ${_(e)}
        <div class="vds-actions">${v(e)}</div>
      </section>
    </div>
  `}function b(e){return[[`kind`,e.kind],[`open`,String(!!e.open)],[`settled`,String(!!e.result?.settled)],[`reason`,e.result?.reason||`pending`],[`value`,e.result?.value==null?`null`:String(e.result.value)],[`canCancel`,String(i(e))]].map(([e,t])=>`
    <div>
      <dt>${d(e)}</dt>
      <dd>${d(t)}</dd>
    </div>
  `).join(``)}function x(e){let t=p();e.innerHTML=`
    <div class="homeai-vite-dialog-sheet">
      <div class="vds-shell">
        <header class="vds-topbar">
          <div>
            <p class="vds-eyebrow">Vite island 开发预览</p>
            <h1 class="vds-title">Dialog Sheet</h1>
            <p class="vds-subtitle">预览 confirm / prompt / message 的 ESM 状态模型、按钮计划、输入框和关闭结果。此页不替换 classic 全局 dialog。</p>
          </div>
        </header>
        <section class="vds-controls" aria-label="Dialog variants">
          <button type="button" class="vds-button ${t.kind===`confirm`?`active`:``}" data-vds-open="confirm">Confirm</button>
          <button type="button" class="vds-button ${t.kind===`prompt`?`active`:``}" data-vds-open="prompt">Prompt</button>
          <button type="button" class="vds-button ${t.kind===`message`?`active`:``}" data-vds-open="message">Message</button>
        </section>
        <section class="vds-stage">
          <div class="vds-preview-page">
            <article class="vds-card">
              <strong>开发态页面内容</strong>
              <p>Sheet 应保持 viewport 内可读、可取消，并通过 runtime state 记录结果。</p>
            </article>
            <dl class="vds-result">${b(t)}</dl>
          </div>
          ${y(t)}
        </section>
      </div>
    </div>
  `,f(e)}function S(e){e.querySelectorAll(`[data-vds-open]`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.vdsOpen||`message`;h(n,{title:n===`prompt`?`重命名话题`:n===`message`?`已完成`:`删除话题`,message:n===`message`?`操作已完成。`:`此操作只在 Vite dev preview 中模拟。`,detail:`结果只写入 runtime state，不修改生产数据。`,confirmLabel:n===`confirm`?`删除`:`确认`,cancelLabel:`取消`,inputLabel:`名称`,defaultValue:n===`prompt`?`Vite 迁移`:``,placeholder:`输入名称`,danger:n===`confirm`}),x(e),S(e)})}),e.querySelectorAll(`[data-vds-cancel]`).forEach(t=>{t.addEventListener(`click`,()=>{g(`cancel`),x(e),S(e)})}),e.querySelector(`[data-vds-confirm]`)?.addEventListener(`click`,()=>{g(`confirm`,e.querySelector(`[data-vds-input]`)?.value||``),x(e),S(e)}),e.querySelector(`[data-vds-overlay]`)?.addEventListener(`click`,t=>{t.target===t.currentTarget&&i(p())&&(g(`backdrop`),x(e),S(e))})}function C(e=document.querySelector(`[data-homeai-vite-dialog-sheet]`)){return e?(f(e),u.state?.get?.().dialogSheetPreviewState||m(p(),{action:`init`}),x(e),S(e),{refresh(){x(e),S(e)},openDialog(t,n){h(t,n),x(e),S(e)},settle(t,n){g(t,n),x(e),S(e)}}):null}l.HomeAIViteDialogSheetPreview=Object.freeze({version:c,mount:C,openDialog:h,settleDialog:g,state:p}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>C(),{once:!0}):C();export{C as mount};