import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{n as t}from"../model/chunks/model.js";var n=`:root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light;color:#17202a;background:#f6f8fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}body{background:#f6f8fb;min-height:100vh;margin:0}button{font:inherit}.homeai-vite-message-action-panel{box-sizing:border-box;min-height:100vh;padding:18px}.map-shell{max-width:880px;margin:0 auto}.map-topbar{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px;display:flex}.map-eyebrow,.map-subtitle{color:#66717f;margin:0;font-size:13px;line-height:1.45}.map-title{letter-spacing:0;margin:3px 0 5px;font-size:24px;line-height:1.15}.map-badges{flex-wrap:wrap;justify-content:flex-end;gap:6px;display:flex}.map-badge{color:#4b5563;background:#fff;border:1px solid #d7dde6;border-radius:999px;padding:4px 8px;font-size:12px}.map-badge.ok{color:#176343;background:#edf8f2;border-color:#b8ddcc}.map-tabs{gap:8px;margin:0 0 12px;padding-bottom:2px;display:flex;overflow-x:auto}.map-tab{color:#344054;white-space:nowrap;background:#fff;border:1px solid #d7dde6;border-radius:8px;min-height:34px;padding:0 12px}.map-tab.active{color:#1d4ed8;background:#eff6ff;border-color:#2563eb}.map-message{grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:12px;display:grid}.map-card{background:#fff;border:1px solid #dfe5ee;border-radius:8px;padding:14px}.map-card h2{margin:0 0 10px;font-size:15px;line-height:1.25}.map-preview{color:#1f2937;margin:0 0 12px;font-size:15px;line-height:1.55}.map-footer{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.map-usage{color:#475467;background:#f2f4f7;border-radius:8px;align-items:center;min-height:30px;padding:0 10px;font-size:13px;display:inline-flex}.map-actions{flex-wrap:wrap;align-items:center;gap:8px;margin:0;padding:0;list-style:none;display:flex}.map-action{color:#253044;background:#fff;border:1px solid #cbd5e1;border-radius:8px;place-items:center;width:34px;min-width:34px;height:34px;padding:0;display:inline-grid}.map-action-icon{fill:none;stroke:currentColor;stroke-width:1.8px;stroke-linecap:round;stroke-linejoin:round;width:17px;height:17px;display:block}.map-action.ready{color:#145c3d;background:#f0fbf5;border-color:#a7d8bf}.map-action.stored{color:#1d4ed8;background:#eff6ff;border-color:#b8d7ff}.map-action.warning{color:#7c5800;background:#fffbeb;border-color:#e2c36b}.map-action.blocked{color:#9f1d1d;background:#fff5f5;border-color:#e5bdba}.map-action:disabled{opacity:.78}.map-status{color:#445164;background:#f8fafc;border:1px solid #d7dde6;border-radius:8px;margin:10px 0 0;padding:8px 10px;font-size:12px;line-height:1.35}.map-status.ok{color:#176343;background:#effaf4;border-color:#acd9bf}.map-status.warning,.map-status.working{color:#74530b;background:#fffbeb;border-color:#e5cd85}.map-status.error{color:#9f1d1d;background:#fff5f5;border-color:#e5b7b7}.map-empty{color:#66717f;font-size:13px}.map-facts{grid-template-columns:1fr;gap:7px;margin:0;display:grid}.map-facts div{grid-template-columns:88px minmax(0,1fr);gap:10px;display:grid}.map-facts dt{color:#66717f;font-size:12px}.map-facts dd{color:#253044;word-break:break-word;margin:0;font-size:12px}@media (max-width:720px){.homeai-vite-message-action-panel{padding:14px}.map-topbar{display:block}.map-badges{justify-content:flex-start;margin-top:10px}.map-message{grid-template-columns:1fr}}`,r=`20260702-vite-message-action-panel-dev-v1`,i=typeof window<`u`?window:globalThis,a=!1,o=Object.freeze([{id:`assistant_ready`,role:`assistant`,content:`今天建议穿 OUT-001 和 SHOE-001。`,usage:{total_tokens:1240,model:`gpt-5`,provider:`openai`},pluginActions:{wardrobeOutfitWearIntent:{kind:`outfit_wear_intent`,status:`ready`,executable:!0,intent:{wear_date:`2026-07-02`,items:[{role:`Outer`,code:`OUT-001`},{role:`Footwear`,code:`SHOE-001`}]}}}},{id:`assistant_stored`,role:`assistant`,content:`这套已经写入衣橱穿着记录。`,usage:{total_tokens:880,model:`gpt-5`},pluginActions:{wardrobeOutfitWearIntent:{kind:`outfit_wear_intent`,status:`stored`,executable:!1,outfitId:`777`,readbackVerified:!0,intent:{wear_date:`2026-07-02`,items:[{role:`Outer`,code:`OUT-001`}]}}}},{id:`assistant_missing`,role:`assistant`,content:`这条建议没有可执行 intent。`,pluginActionDiagnostics:{wardrobeOutfitWearIntent:{code:`intent_metadata_missing`,reason:`prepare_tool_output_not_attached`}}}]),s=new Map(o.map(e=>[e.id,JSON.parse(JSON.stringify(e))])),c=Object.freeze(o.map(e=>Object.freeze(Object.assign({},e)))),l=i.HomeAiRuntimeFacade||e({root:i,mode:`vite-message-action-panel-preview`,clientVersion:r,appState:{selectedWorkspaceId:`owner`,messageActionPanelPreview:!0,messageActionPanelPreviewMessageId:c[0].id,messageActionPanelLastStatus:{level:`info`,text:`构建预览保持只读，避免误触真实 Wardrobe 写入。`}},attachClassicCompatibility:!0});function u(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function d(e){if(e.querySelector(`style[data-homeai-vite-message-action-panel-style]`))return;let t=document.createElement(`style`);t.setAttribute(`data-homeai-vite-message-action-panel-style`,`true`),t.textContent=n,e.prepend(t)}function f(){let e=l.state?.get?.()||{},t=String(e.messageActionPanelPreviewMessageId||c[0].id);return s.get(t)||s.get(c[0].id)||c[0]}function p(e){l.state?.set?.({messageActionPanelPreviewMessageId:String(e||c[0].id)}),l.events?.emit?.(`message-action-panel-preview:message-selected`,{messageId:String(e||``)})}function m(e=``){return e===`ready`?`ready`:e===`stored`?`stored`:e===`needs_confirmation`?`warning`:e===`blocked`||e===`error`?`blocked`:`muted`}function h(){let e=(l.state?.get?.()||{}).messageActionPanelLastStatus||{};return{level:String(e.level||`info`),text:String(e.text||`构建预览保持只读，避免误触真实 Wardrobe 写入。`),detail:String(e.detail||``)}}function g(e,t,n=``){l.state?.set?.({messageActionPanelLastStatus:{level:String(e||`info`),text:String(t||``),detail:String(n||``)}}),l.events?.emit?.(`message-action-panel-preview:status`,{level:String(e||`info`),text:String(t||``),detail:String(n||``)})}function _(e=[],t={}){let n=!!t.readOnly;return e.length?e.map(e=>`
    <li>
      <button
        type="button"
        class="map-action ${u(m(e.status))}"
        data-map-action-kind="${u(e.kind)}"
        data-map-action-status="${u(e.status)}"
        data-map-action-label="${u(e.label)}"
        title="${u(e.detail||e.label)}"
        aria-label="${u(e.detail||e.label)}"
        ${e.enabled&&!n?`data-map-action-execute="wardrobe-outfit-wear"`:``}
        ${e.enabled&&!n?``:`disabled`}
      >
        <svg class="map-action-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 7.5 12 4l4 3.5"></path>
          <path d="M6.5 8.5 9 7l3 2 3-2 2.5 1.5L16 20H8L6.5 8.5Z"></path>
          <path d="M10 20v-7"></path>
          <path d="M14 20v-7"></path>
        </svg>
      </button>
    </li>
  `).join(``):`<li class="map-empty">没有可渲染动作</li>`}function v(e){let t=[[`消息`,e.messageId],[`角色`,e.role],[`执行模式`,e.actionExecutionEnabled?`dev mock`:`只读`],[`Usage`,e.usage.visible?e.usage.label:`未收集`]];return e.wardrobe.visible&&(t.push([`衣橱状态`,e.wardrobe.status]),t.push([`件数`,String(e.wardrobe.itemCount||0)]),t.push([`确认`,e.wardrobe.actionRequiresConfirmation?`需要`:`不需要`]),e.wardrobe.itemCodes.length&&t.push([`Item codes`,e.wardrobe.itemCodes.join(`, `)])),t.map(([e,t])=>`
    <div>
      <dt>${u(e)}</dt>
      <dd>${u(t)}</dd>
    </div>
  `).join(``)}function y(e){return c.map(t=>`
    <button
      type="button"
      class="map-tab${t.id===e?` active`:``}"
      data-map-message-id="${u(t.id)}"
      aria-pressed="${t.id===e?`true`:`false`}"
    >${u(t.id.replace(/^assistant_/,``))}</button>
  `).join(``)}function b(e,n=f()){let r=t(n,{actionExecutionEnabled:a}),i=h();e.innerHTML=`
    <div class="homeai-vite-message-action-panel">
      <div class="map-shell">
        <header class="map-topbar">
          <div>
            <p class="map-eyebrow">Vite island 开发预览</p>
            <h1 class="map-title">消息动作面板</h1>
            <p class="map-subtitle">预览 Usage 附近的消息动作执行状态。dev server 只调用 Vite mock；构建预览只读，不执行真实 MCP，不替换生产根 shell。</p>
          </div>
          <div class="map-badges">
            <span class="map-badge">${u(l.mode||`vite-preview`)}</span>
            <span class="map-badge ok">built read-only</span>
          </div>
        </header>

        <nav class="map-tabs" aria-label="消息样例">
          ${y(r.messageId)}
        </nav>

        <section class="map-message" aria-label="消息动作预览">
          <article class="map-card">
            <p class="map-preview">${u(r.textPreview||`(无文本预览)`)}</p>
            <div class="map-footer">
              ${r.usage.visible?`<span class="map-usage">${u(r.usage.label)}</span>`:``}
              <ul class="map-actions">${_(r.actions,r)}</ul>
            </div>
            <p class="map-status ${u(i.level)}" data-map-action-status-text>${u(i.text)}${i.detail?` · ${u(i.detail)}`:``}</p>
          </article>
          <article class="map-card">
            <h2>边界证据</h2>
            <dl class="map-facts">${v(r)}</dl>
          </article>
        </section>
      </div>
    </div>
  `,d(e)}async function x(e,t){return g(`warning`,`构建预览保持只读，请使用 npm run dev:vite 验证 action mock。`),b(e),S(e),null}function S(e){e.querySelectorAll(`[data-map-message-id]`).forEach(t=>{t.addEventListener(`click`,()=>{p(t.dataset.mapMessageId||``),b(e),S(e)})}),e.querySelectorAll(`[data-map-action-execute="wardrobe-outfit-wear"]`).forEach(t=>{t.addEventListener(`click`,async()=>{t.disabled||(t.disabled=!0,await x(e,f().id))})})}function C(e=document.querySelector(`[data-homeai-vite-message-action-panel]`)){return e?(d(e),b(e),S(e),{refresh(){b(e),S(e)},selectMessage(t){p(t),b(e),S(e)}}):null}i.HomeAIViteMessageActionPanelPreview=Object.freeze({mount:C,modelPreview:(e=f(),n={})=>t(e,n),previewMessages:c,executeWardrobeAction:(e=f().id)=>x(document.querySelector(`[data-homeai-vite-message-action-panel]`),e),runtimeSnapshot:()=>l.snapshot()}),typeof document<`u`&&(document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>C(),{once:!0}):C());export{C as mount};