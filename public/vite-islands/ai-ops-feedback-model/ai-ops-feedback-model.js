var e=`plugin_issue`,t=260,n=Object.freeze([{id:`plugin_issue`,label:`插件内问题`},{id:`visual_mismatch`,label:`画面不对`},{id:`action_unresponsive`,label:`按钮没反应`},{id:`save_failed`,label:`保存失败`},{id:`content_missing`,label:`内容缺失`},{id:`stuck_loading`,label:`卡住/加载不出`},{id:`other`,label:`其他`}]),r=new Set([`view`,`workspaceId`,`pluginId`,`pluginRoute`,`taskId`,`threadId`]);function i(e,t=4e3){return String(e??``).trim().slice(0,Math.max(1,Number(t)||4e3))}function a(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function o(){return new Set(n.map(e=>e.id))}function s(t){let n=i(t,80);return o().has(n)?n:e}function c(e){return i(e,260)}function l(e={}){let t=i(e.pathname||`/`,200)||`/`,n=i(e.search||``,1e3);if(!n)return t;let a;try{a=new URLSearchParams(n.startsWith(`?`)?n.slice(1):n)}catch{return t}let o=new URLSearchParams;for(let[e,t]of a.entries())r.has(e)&&o.set(e,i(t,120));let s=o.toString();return s?`${t}?${s}`:t}function u(e={},t={}){return!!(e.auth?.isOwner&&t.ownerSystemConsole===!0)}function d(e={},t={}){return u(e,t)?`系统控制台`:e.auth?.isOwner?`系统控制台未就绪`:`仅 Owner 可用`}function f(e={}){let t=e.state||{},n=l(e.route||{}),r=s(e.category),a=c(e.note);return{source_surface:`vite-ai-ops-feedback-preview`,plugin_id:i(e.pluginId||t.pluginContextNavPluginId||`home-ai`,80)||`home-ai`,category:r,diagnostic_type:`user_report_${r}`,severity_hint:i(e.severityHint||`H3`,12)||`H3`,evidence_confidence:.62,route:n,workspaceId:i(e.workspaceId||t.selectedWorkspaceId||`owner`,120)||`owner`,summary:a||`Vite feedback preview: ${r}`,context:{surface:`ai_ops_feedback_menu`,preview:!0,owner_console_available:u(t,e.capabilities||{}),native_shell:!!e.native?.isNativeShell,ios_shell:!!e.native?.isIosShell},frontend_state:{viewMode:i(t.viewMode||``,80),singleWindowMode:i(t.singleWindowMode||``,80),pluginContextNavPluginId:i(t.pluginContextNavPluginId||``,80),viteIsland:`ai-ops-feedback`}}}function p(e={}){let t=i(e.case_id||e.caseId||``,120),n=i(e.status||``,80);return t?`已记录：${t}`:n?`已记录：${n}`:`已记录`}function m(e={}){let t=i(e.plugin_id||e.pluginId||``,80);if(t&&t!==`home-ai`){let n=i(e.source_surface||e.sourceSurface||``,80);return`当前插件：${t}${n?` · ${n}`:``}`}return`当前页面：Home AI`}function h(e={},t={}){let n=u(e,t);return Object.freeze({available:n,hidden:!n,enabled:n,label:d(e,t),trigger:`diagnostic_feedback_menu`})}function g(t=e){let r=s(t);return n.map(e=>`
              <option value="${a(e.id)}"${e.id===r?` selected`:``}>${a(e.label)}</option>`).join(``)}function _(e={}){let t=s(e.category||`plugin_issue`),n=h(e.state||{},e.capabilities||{}),r=m(e.context||{}),o=i(e.statusMessage||`将只提交最近的状态、计数和错误码。`,180),c=i(e.statusTone||``,40);return`
        <div class="ai-ops-diagnostic-panel" data-ai-ops-esm-model="1">
          <div class="ai-ops-diagnostic-head">
            <strong>反馈当前问题</strong>
            <button type="button" data-ai-ops-close aria-label="关闭">×</button>
          </div>
          <div class="ai-ops-diagnostic-context" data-ai-ops-context>${a(r)}</div>
          <label>
            <span>类型</span>
            <select data-ai-ops-category>${g(t)}
            </select>
          </label>
          <label>
            <span>补充一句</span>
            <textarea data-ai-ops-note maxlength="260" rows="3" placeholder="可以不填；不要输入密码、密钥或隐私正文"></textarea>
          </label>
          <p data-ai-ops-status${c?` data-tone="${a(c)}"`:``}>${a(o)}</p>
          <div class="ai-ops-diagnostic-actions">
            <button type="button" data-ai-ops-open-system-console${n.hidden?` hidden`:``}>${a(n.label)}</button>
            <button type="button" data-ai-ops-close>取消</button>
            <button type="button" data-ai-ops-submit>提交</button>
          </div>
        </div>
      `}export{e as DEFAULT_CATEGORY,n as FEEDBACK_CATEGORIES,t as MAX_NOTE_LENGTH,f as buildFeedbackPayload,m as classicFeedbackContextLabel,h as classicOwnerConsoleActionPlan,s as normalizeCategory,u as ownerConsoleAvailable,d as ownerConsoleLabel,_ as renderClassicAiOpsFeedbackSheet,l as safeRoute,c as sanitizeNote,p as summarizeSubmissionResult};