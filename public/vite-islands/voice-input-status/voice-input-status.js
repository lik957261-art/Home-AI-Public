import{n as e}from"../home-ai-runtime-facade/chunks/home-ai-runtime-facade.js";import{VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION as t,voiceAudioCaptureReadiness as n}from"../voice-input-audio-capture-adapter/voice-input-audio-capture-adapter.js";import{d as r,f as i,m as a,o,s}from"../session-controller/chunks/session-controller.js";var c=`.homeai-vite-voice-status{color:#172330;background:#f7f9fb;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.vis-shell{box-sizing:border-box;max-width:820px;margin:0 auto;padding:18px 14px 30px}.vis-topbar{border-bottom:1px solid #dbe4ec;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:14px;display:flex}.vis-eyebrow{color:#617384;letter-spacing:0;margin:0 0 5px;font-size:12px;font-weight:800}.vis-title{margin:0;font-size:24px;line-height:1.2}.vis-subtitle{color:#526375;max-width:640px;margin:7px 0 0;font-size:13px;line-height:1.5}.vis-badges,.vis-state-row{flex-wrap:wrap;gap:8px;display:flex}.vis-badges{justify-content:flex-end}.vis-panel{box-sizing:border-box;background:#fbfcfa;border:1px solid #dbe4ec;border-radius:8px;gap:14px;margin-top:14px;padding:14px;display:grid}.vis-overlay{box-sizing:border-box;background:#eef4fb;border:1px solid #c6d7e6;border-radius:8px;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:58px;padding:10px;display:grid}.vis-overlay.busy{background:#edf7f2;border-color:#acd8bf}.vis-overlay.recording{background:#fff4ec;border-color:#e2c2aa}.vis-overlay.terminal{background:#f4f6f8;border-color:#d5dee6}.vis-mic{background:#173a54;border-radius:50%;width:26px;height:26px;display:block}.vis-overlay.recording .vis-mic{background:#ad4930}.vis-copy{gap:3px;min-width:0;display:grid}.vis-copy strong{font-size:14px;line-height:1.25}.vis-copy span,.vis-copy small{color:#526375;overflow-wrap:anywhere;font-size:12px;line-height:1.35}.vis-cancel,.vis-state,.vis-badge{border-radius:8px;min-height:36px;font-size:13px;font-weight:800}.vis-cancel,.vis-state{color:#273b4e;background:#fff;border:1px solid #ccd8e2;padding:0 11px}.vis-state.active{color:#fff;background:#173a54;border-color:#173a54}.vis-badge{color:#244762;background:#eef4fb;border:1px solid #bfd0df;align-items:center;min-height:0;padding:7px 9px;display:inline-flex}.vis-badge.ok{color:#176239;background:#e7f5ec;border-color:#a8d8b9}.vis-badge.muted{color:#677889;background:#f5f7f9}.vis-facts{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;display:grid}.vis-facts div{background:#f1f5f8;border:1px solid #dce5ed;border-radius:8px;padding:9px 10px}.vis-facts dt{color:#617384;font-size:12px;font-weight:800}.vis-facts dd{color:#172330;margin:3px 0 0;font-size:13px;line-height:1.45}@media (max-width:720px){.vis-topbar,.vis-overlay,.vis-facts{grid-template-columns:1fr}.vis-topbar{display:grid}.vis-badges{justify-content:flex-start}}`,l=`20260702-vite-voice-input-status-dev-v1`,u=typeof window<`u`?window:globalThis,d=u.HomeAiRuntimeFacade||e({root:u,mode:`vite-voice-input-status-preview`,clientVersion:l,appState:{selectedWorkspaceId:`owner`,voiceInputStatusPreview:!0},attachClassicCompatibility:!0}),f=null;function p(){}p.isTypeSupported=e=>e===`audio/webm;codecs=opus`;function m(){}function h(){return n({mediaDevices:{getUserMedia:()=>null},recorderCtor:p,audioContextCtor:m,serviceStatus:{provider:{streaming:{configured:!0,sampleRate:16e3}}}})}function g(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function _(e){if(e.querySelector(`style[data-homeai-vite-voice-status-style]`))return;let t=document.createElement(`style`);t.setAttribute(`data-homeai-vite-voice-status-style`,`true`),t.textContent=c,e.prepend(t)}function v(){let e=Date.now();return s({status:`pending`,statusDetail:`等待长按阈值`,panelOpenedAt:e,pressStartedAt:e,statusUpdatedAt:e,target:{kind:`native`}},e)}function y(){return(d.state?.get?.()||{}).voiceInputStatusPreviewState||v()}function b(e){d.state?.set?.({voiceInputStatusPreviewState:e}),d.events?.emit?.(`voice-input-status-preview:update`,{status:e.status})}function x(){return f||(f=o({initialState:y(),now:()=>Date.now(),setTimer:(e,t)=>u.setTimeout?.(e,t),clearTimer:e=>u.clearTimeout?.(e),onChange:(e,t={})=>{b(Object.assign({},e,{lastSessionEffect:t.action||``}))}}),f)}function S(e){let t=a(e),n=Date.now(),r=y(),i=Object.assign({},r,{status:t,statusUpdatedAt:n,statusDetail:``,error:``});t===`pending`&&(i.statusDetail=`等待长按阈值`,i.panelOpenedAt=n,i.pressStartedAt=n),t===`recording`&&(i.recordingStartedAt=n-2300,i.statusCache={provider:{backend:`local-asr`}}),t===`transcribing`&&(i.partialCount=Math.max(1,Number(i.partialCount||0)+1),i.voiceSessionId=`voice_preview_session_12345678`),t===`failed`&&(i.error=`语音输入失败`),x().applyStatus(i)}function C(){x().cancel(`语音手势已取消`)}function w(){x().beginPress({target:{kind:`native-preview`}})}function T(){x().releasePress()}function E(){x().triggerLongPress()}function D(){let e=x().snapshot(),t=Number(e.panelOpenedAt||e.pressStartedAt||Date.now())||Date.now();b(Object.assign({},e,{panelOpenedAt:t-2e3,pressStartedAt:t-2e3,statusUpdatedAt:t-2e3})),f=null,x().evaluateTimeouts()}function O(){let e=x().snapshot();b(Object.assign({},e,{terminalHideAt:Date.now()-1})),f=null,x().evaluateTimeouts()}function k(e){return[[`pending`,`等待长按`],[`recording`,`录音中`],[`transcribing`,`转写中`],[`inserted`,`已插入`],[`cancelled`,`已取消`],[`failed`,`失败`]].map(([t,n])=>`
    <button
      type="button"
      class="vis-state${t===e?` active`:``}"
      data-vis-status="${g(t)}"
      aria-pressed="${t===e?`true`:`false`}"
    >${g(n)}</button>
  `).join(``)}function A(e,n=y()){let r=i(n,{expanded:!0,debug:!0}),a=h(),o=n.lastSessionEffect||`idle`;e.innerHTML=`
    <div class="homeai-vite-voice-status">
      <div class="vis-shell">
        <header class="vis-topbar">
          <div>
            <p class="vis-eyebrow">Vite island 开发预览</p>
            <h1 class="vis-title">语音输入状态</h1>
            <p class="vis-subtitle">预览长按录音的状态面板、取消入口和 pending 超时规则。当前页面不调用麦克风，不替换生产根 shell。</p>
          </div>
          <div class="vis-badges">
            <span class="vis-badge">${g(d.mode||`vite-preview`)}</span>
            <span class="vis-badge ${r.canCancel?`ok`:`muted`}">${r.canCancel?`可取消`:`不可取消`}</span>
          </div>
        </header>

        <section class="vis-panel" aria-label="语音状态预览">
          <div class="vis-overlay ${r.busy?`busy`:``} ${r.recording?`recording`:``} ${r.terminal?`terminal`:``}" aria-label="${g(r.label)}">
            <span class="vis-mic" aria-hidden="true"></span>
            <span class="vis-copy">
              <strong>${g(r.label)}</strong>
              <span>${g(r.detail)}</span>
              <small>${g(r.meta||`metadata-only preview`)}</small>
            </span>
            <button type="button" class="vis-cancel" data-vis-cancel${r.canCancel?``:` hidden`}>取消</button>
          </div>

          <div class="vis-state-row" role="group" aria-label="状态切换">
            ${k(r.status)}
          </div>

          <div class="vis-state-row" role="group" aria-label="手势生命周期">
            <button type="button" class="vis-state" data-vis-action="begin">开始长按</button>
            <button type="button" class="vis-state" data-vis-action="longpress">达到阈值</button>
            <button type="button" class="vis-state" data-vis-action="release">松手</button>
            <button type="button" class="vis-state" data-vis-action="expire">pending 超时</button>
            <button type="button" class="vis-state" data-vis-action="autohide">自动隐藏</button>
          </div>

          <dl class="vis-facts">
            <div><dt>状态</dt><dd><code>${g(r.status)}</code></dd></div>
            <div><dt>pending 保护</dt><dd>${r.pendingGuardMs?`${r.pendingGuardMs}ms`:`无`}</dd></div>
            <div><dt>自动隐藏</dt><dd>${r.terminalHideMs?`${r.terminalHideMs}ms`:`无`}</dd></div>
            <div><dt>超时结果</dt><dd>${r.pendingGuard.shouldCancel?g(r.pendingGuard.reason):`未触发`}</dd></div>
            <div><dt>session</dt><dd><code>${g(o)}</code></dd></div>
            <div><dt>音频捕获 ESM</dt><dd>${a.ready?`fixture ready`:`fixture blocked`} · ${g(a.mimeType||`no mime`)}</dd></div>
            <div><dt>adapter</dt><dd><code>${g(t)}</code></dd></div>
          </dl>
        </section>
      </div>
    </div>
  `,_(e)}function j(e){e.querySelectorAll(`[data-vis-status]`).forEach(t=>{t.addEventListener(`click`,()=>{S(t.dataset.visStatus||`pending`),A(e),j(e)})}),e.querySelector(`[data-vis-cancel]`)?.addEventListener(`click`,()=>{C(),A(e),j(e)}),e.querySelectorAll(`[data-vis-action]`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.visAction||``;n===`begin`?w():n===`longpress`?E():n===`release`?T():n===`expire`?D():n===`autohide`&&O(),A(e),j(e)})})}function M(e=document.querySelector(`[data-homeai-vite-voice-status]`)){return e?(_(e),d.state?.get?.().voiceInputStatusPreviewState||b(v()),x(),A(e),j(e),{refresh(){A(e),j(e)},setStatus(t){S(t),A(e),j(e)},cancel(){C(),A(e),j(e)},beginPress(){w(),A(e),j(e)},releasePress(){T(),A(e),j(e)},triggerLongPress(){E(),A(e),j(e)},expirePendingGuard(){D(),A(e),j(e)},autoHide(){O(),A(e),j(e)}}):null}u.HomeAIViteVoiceInputStatusPreview=Object.freeze({mount:M,cancellableStatuses:r,modelPreview:(e=y(),t={})=>i(e,t),sessionSnapshot:()=>x().snapshot(),audioCaptureReadiness:h,beginPress:w,releasePress:T,triggerLongPress:E,expirePendingGuard:D,autoHide:O,runtimeSnapshot:()=>d.snapshot()}),typeof document<`u`&&(document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>M(),{once:!0}):M());export{M as mount};