var e=Object.freeze({ok:`正常`,warning:`注意`,degraded:`降级`,blocked:`阻断`,stale:`过期`,unknown:`未知`,not_collected:`未采集`}),t=Object.freeze({host_cpu:`CPU`,host_memory:`内存`,host_disk:`磁盘`,process:`进程`,service:`服务`,gateway:`Gateway`,plugin:`Plugin`,deploy:`部署`,diagnostic:`诊断`,availability:`可用性`,accuracy:`准确性`,autonomy:`自主性`});function n(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function r(t){let n=String(t||`unknown`).toLowerCase();return n===`healthy`||n===`ready`||n===`passed`?`ok`:Object.hasOwn(e,n)?n:`unknown`}function i(t){return e[r(t)]||e.unknown}function a(e){return t[String(e||``)]||String(e||`信号`)}function o(e){let t=Number(e);return Number.isFinite(t)?`${Math.round(t)}%`:`未采集`}function s(e){let t=Number(e);return!Number.isFinite(t)||t<=0?`未采集`:`${Math.round(t/1024**3*10)/10} GB`}function c(e){if(!e)return`未采集`;let t=new Date(e);return Number.isNaN(t.getTime())?String(e).slice(0,40):t.toLocaleString(`zh-CN`,{month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function l(e={}){return e?.status===401||e?.status===403?{message:`需要 Owner 权限或重新登录。`,status:e.status,code:e.code||`owner_permission_required`}:{message:e?.status?`系统控制台读取失败：HTTP ${e.status}`:e?.message||`系统控制台读取失败。`,status:e?.status||0,code:e?.code||`owner_system_console_read_failed`}}function u(e={}){let t=l(e),n=Error(t.message);return n.status=t.status,n.code=t.code,n}function d(e){let t=r(e);return`<span class="osc-badge ${n(t)}">${n(i(t))}</span>`}function f(e,t,r,i=`unknown`){return`
    <article class="osc-card">
      <p class="osc-card-label">${n(e)}</p>
      <div class="osc-card-value">${n(t)}</div>
      <p class="osc-card-meta">${d(i)} ${n(r||``)}</p>
    </article>
  `}function p(e={}){return`
    <article class="osc-card osc-signal">
      <div class="osc-signal-head">
        <h3 class="osc-signal-title">${n(e.label||a(e.category))}</h3>
        ${d(e.status)}
      </div>
      <p class="osc-signal-summary">${n(e.summary||`没有摘要。`)}</p>
      <p class="osc-card-meta">${n(a(e.category))} · ${n(e.severity||`H3`)} · ${n(c(e.lastCheckedAt))}</p>
    </article>
  `}function m(e={}){return`
    <div class="osc-list-item">
      <div class="osc-signal-head">
        <strong>${n(e.label||a(e.category))}</strong>
        ${d(e.status)}
      </div>
      <span>${n(e.summary||`需要查看详情。`)}</span>
      <span class="osc-card-meta">建议：${n(e.recommendedAction||`观察`)}</span>
    </div>
  `}function h(e=[]){let t=e.filter(e=>[`process`,`service`,`gateway`,`plugin`].includes(e.category)).slice(0,8);return t.length?t.map(e=>`
    <tr>
      <td>${n(e.label||a(e.category))}</td>
      <td>${d(e.status)}</td>
      <td>${n(e.summary||``)}</td>
      <td>${n(c(e.lastCheckedAt))}</td>
    </tr>
  `).join(``):`<tr><td colspan="4">当前没有可展示的关键服务信号。</td></tr>`}function g(e={}){let t=e.cpu||{},n=e.memory||{},r=(Array.isArray(e.disks)?e.disks:[])[0]||{},i=e.host||{};return{cpu:f(`CPU`,o(t.overallPercent),`${t.coreCount||`?`} 核 · load/core ${t.loadPerCore?.oneMinute??`未采集`}`,t.status),memory:f(`内存`,o(n.percentUsed),`${s(n.usedBytes)} / ${s(n.totalBytes)}`,n.status),disk:f(`磁盘`,o(r.percentUsed),`${s(r.freeBytes)} 可用`,r.status),uptime:f(`Uptime`,i.uptimeText||i.uptimeSeconds?`${Math.floor(Number(i.uptimeSeconds||0)/3600)} 小时`:`未采集`,`最近刷新 ${c(e.collectedAt)}`,e.overallStatus)}}function _(e={},t={}){let n=e.console||{},o=t.systemStatus||n.systemStatus||{},s=g(o),l=Array.isArray(n.dimensions)?n.dimensions:[],u=Array.isArray(n.criticalSignals)?n.criticalSignals:[],_=Array.isArray(o.signals)?o.signals:[],v=u.length?u:_.filter(e=>r(e.status)!==`ok`).slice(0,8);return`
    <div class="homeai-vite-owner-console">
      <div class="osc-shell">
        <header class="osc-topbar">
          <div class="osc-title-group">
            <p class="osc-eyebrow">Vite island 开发预览</p>
            <h1 class="osc-title">Home AI 系统控制台</h1>
            <p class="osc-subtitle">只读 Owner 视图。当前页面不替换主 PWA shell，也不接入 Service Worker 预缓存。</p>
          </div>
          <div class="osc-actions">
            ${d(n.overallStatus)}
            <button class="osc-button secondary" type="button" data-osc-refresh>刷新</button>
          </div>
        </header>

        <section class="osc-status-row" aria-label="3A 状态">
          ${l.slice(0,3).map(e=>f(e.label||a(e.category),i(e.status),e.summary,e.status)).join(``)}
          ${f(`只读策略`,n.policy?.readOnlyMvp?`启用`:`未知`,`操作执行未启用`,`ok`)}
        </section>

        <section class="osc-metric-grid" aria-label="系统资源">
          ${s.cpu}
          ${s.memory}
          ${s.disk}
        </section>

        <section class="osc-signal-grid" aria-label="关键信号">
          ${(u.length?u:l).slice(0,4).map(p).join(``)||`<div class="osc-empty">当前没有关键告警。</div>`}
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
              <tbody>${h(_)}</tbody>
            </table>
          </article>

          <article class="osc-panel">
            <h2 class="osc-panel-title">近期需要关注</h2>
            <div class="osc-list">
              ${v.length?v.slice(0,8).map(m).join(``):`<div class="osc-list-item">没有当前告警。</div>`}
            </div>
          </article>
        </section>

        <section class="osc-metric-grid" aria-label="采集状态">
          ${s.uptime}
          ${f(`Console 版本`,n.consoleVersion||`未知`,`生成 ${c(n.generatedAt)}`,n.ok?`ok`:n.overallStatus)}
          ${f(`页面状态`,`${Array.isArray(n.pages)?n.pages.length:0} 项`,`Gateway / Plugin / Deploy 等后续页仍按 MVP 分阶段接入`,`unknown`)}
        </section>
      </div>
    </div>
  `}function v(){return`<div class="homeai-vite-owner-console"><div class="osc-shell"><div class="osc-loading">正在读取 Owner 系统控制台...</div></div></div>`}function y(e){return`
    <div class="homeai-vite-owner-console">
      <div class="osc-shell">
        <div class="osc-error">
          <strong>Home AI 系统控制台</strong><br>
          ${n(l(e).message)}
        </div>
      </div>
    </div>
  `}var b=Object.freeze([`overview`,`system-status`]),x=Object.freeze({availability:`可用性`,accuracy:`准确性`,autonomy:`自主性`,overview:`概览`,"system-status":`系统状态`,"gateway-runtime":`Gateway 运行态`,"plugin-matrix":`Plugin 矩阵`,"ai-ops-diagnostics":`AI Ops 诊断`,deployments:`部署`,"file-media-tools":`文件与媒体工具`,"security-boundary":`安全与边界`,system_cpu_load:`CPU 负载`,system_memory_usage:`内存使用`,system_disk_usage:`磁盘使用`,system_launchd_services:`关键服务`,owner_console_availability:`可用性`,owner_console_accuracy:`准确性`,owner_console_autonomy:`自主性`,owner_console_autonomous_delivery_dispatch:`Autonomous Delivery 调度`,owner_console_autonomous_delivery_loop:`Autonomous Delivery 闭环`,owner_console_loop_engineering_runtime:`Loop Engineering runtime`,codex_at_loop_status_unreachable:`Codex Mobile Loop 状态不可达`,codex_at_loop_status_timeout:`Codex Mobile Loop 状态超时`,codex_at_loop_status_http_failed:`Codex Mobile Loop 状态请求失败`,codex_at_loop_status_disabled:`Codex Mobile Loop 状态采集已关闭`,codex_at_loop_status_collector_not_configured:`Codex Mobile Loop 状态未接入`,runtime_slo_diagnostic_closure:`Runtime SLO 与诊断闭环`,fresh_install_upgrade_canary:`全新安装与升级 Canary`,gateway_message_action_contract:`Gateway 输出到消息动作契约`,self_improving_loop_closure:`自改进循环闭环`,architecture_governance_hardening:`架构治理加固`,install_upgrade_canary_observed:`安装/升级 Canary 观测`,clean_target_live_canary:`clean-target Canary`,deterministic_action_generalization:`确定性动作泛化`,wardrobe_reference_action_contract:`衣橱参考动作契约`,"Runtime SLO and Diagnostic Closure":`Runtime SLO 与诊断闭环`,"Fresh Install and Upgrade Canary":`全新安装与升级 Canary`,"Gateway Output to Message Action Contract":`Gateway 输出到消息动作契约`,"Self-Improving Loop Closure":`自改进循环闭环`,"Architecture Governance Hardening":`架构治理加固`,"Run or wire a clean-target canary readback when a target is available.":`目标可用后运行或接入 clean-target Canary 回读。`,target_thread_not_visible:`目标线程不可见`,return_card_watchdog_stale:`回卡 Watchdog 已标记超时`,task_card_dispatch_duplicate_active:`重复发卡已抑制`,reference_path_covered:`参考路径已覆盖`});function S(e,t=120){let n=String(e??``).replace(/[\u0000-\u001f\u007f]/g,` `).replace(/\s+/g,` `).trim();return n?/([A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/private\/|\/var\/|\/opt\/|https?:\/\/|wss?:\/\/)/i.test(n)||/(password|secret|token|access.?key|cookie|authorization|bearer)/i.test(n)?`已隐藏`:n.slice(0,t):``}function C(e,t=120){let n=S(e,t);return n?x[n]||n:``}function w(e){return Array.isArray(e)?e.filter(Boolean):!e||typeof e!=`object`?[]:Object.entries(e).map(([e,t])=>t&&typeof t==`object`?Object.assign({key:e},t):{key:e,value:t})}function T(e,t,n=``){if(!e||typeof e!=`object`)return n;for(let n of t){let t=S(e[n]);if(t)return t}return n}function E(e,t){if(typeof e==`number`)return Number.isFinite(e)?e:NaN;if(!e||typeof e!=`object`)return NaN;for(let n of t){let t=Number(e[n]);if(Number.isFinite(t))return t}return NaN}function D(e){let t=String(e||``).toLowerCase();return t===`h1`?`critical`:t===`h2`?`warning`:t===`h3`?`neutral`:/(ok|ready|healthy|normal|pass|green|up|running|active)/.test(t)?`ok`:/(warn|degrad|limited|slow|attention|yellow|pending|partial)/.test(t)?`warning`:/(critical|fail|error|down|red|blocked|offline|expired)/.test(t)?`critical`:`neutral`}function O(e){let t=String(e||``).toLowerCase().trim();if(t===`ok`||t===`ready`||t===`running`||t===`healthy`||t===`passed`)return`正常`;if(t===`warning`||t===`partial`||t===`pending`)return t===`partial`?`部分`:`注意`;if(t===`degraded`)return`降级`;if(t===`blocked`)return`阻塞`;if(t===`stale`)return`过期`;if(t===`unknown`||t===`not_collected`)return`未知`;let n=D(e);return n===`ok`?`正常`:n===`warning`?`注意`:n===`critical`?`异常`:S(e,24)||`未知`}function k(e={}){let t=D(e.severity||e.status||e.state||e.level);return t===`critical`?3:t===`warning`?2:t===`ok`?0:1}function A(e){let t=Number(e);if(!Number.isFinite(t))return``;let n=t>0&&t<=1?t*100:t;return`${Math.round(n*10)/10}%`}function j(e){let t=Number(e);if(!Number.isFinite(t)||t<0)return``;let n=[`B`,`KB`,`MB`,`GB`,`TB`],r=t,i=0;for(;r>=1024&&i<n.length-1;)r/=1024,i+=1;return`${r>=10||i===0?Math.round(r):Math.round(r*10)/10}${n[i]}`}function M(e,t=``){if(e==null||e===``)return`未上报`;if(typeof e==`number`)return A(e)||String(e);if(typeof e!=`object`)return S(e,40)||`未上报`;let n=E(e,[`percent`,`percentUsed`,`overallPercent`,`sustainedPercent`,`usagePercent`,`usedPercent`,`maxPercentUsed`,`loadPercent`,`valuePercent`,`value`]);if(Number.isFinite(n))return A(n)||`未上报`;let r=E(e,[`usedBytes`,`used`,`activeBytes`]),i=E(e,[`totalBytes`,`total`,`capacityBytes`]);if(Number.isFinite(r)&&Number.isFinite(i)&&i>0)return`${j(r)} / ${j(i)}`;if(t===`uptime`){let t=E(e,[`seconds`,`uptimeSeconds`,`valueSeconds`]);if(Number.isFinite(t))return P(t)}return T(e,[`label`,`summary`,`status`],`未上报`)}function N(e){if(!e||typeof e!=`object`)return``;let t=E(e,[`thresholdPercent`,`warningPercent`,`criticalPercent`]);if(Number.isFinite(t))return`阈值 ${A(t)}`;let n=E(e,[`freeBytes`,`availableBytes`]);return Number.isFinite(n)?`可用 ${j(n)}`:T(e,[`detail`,`summary`,`state`],``)}function P(e){if(typeof e==`string`&&e.trim())return S(e,40);let t=Number(e);if(!Number.isFinite(t)||t<0)return`未上报`;let n=Math.floor(t/86400),r=Math.floor(t%86400/3600),i=Math.floor(t%3600/60);return n?`${n}天 ${r}小时`:r?`${r}小时 ${i}分`:`${Math.max(1,i)}分`}function F(e){if(!e)return`未生成`;let t=new Date(e);return Number.isNaN(t.getTime())?S(e,40)||`未生成`:t.toLocaleString([],{month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function I(e,t,r,i={}){let a=e===`uptime`?P(r?.listenerSeconds??r?.processSeconds??r?.hostSeconds??r?.seconds??r?.uptimeSeconds??r):M(r,e),o=i.detail||N(r);return`<article class="owner-system-console-metric tone-${n(D(r?.status||r?.state||i.status||``))}" data-owner-system-console-metric="${n(e)}">
    <span>${n(t)}</span>
    <strong>${n(a)}</strong>
    ${o?`<small>${n(o)}</small>`:``}
  </article>`}function L(e){return`<span class="owner-system-console-status tone-${n(D(e))}" data-owner-system-console-overall-status="${n(e||`unknown`)}">${n(O(e))}</span>`}function R(e={},t=0){let r=C(T(e,[`label`,`name`,`title`,`id`,`key`],`维度 ${t+1}`)),i=T(e,[`status`,`state`,`level`],`unknown`),a=E(e,[`score`,`value`,`percent`]),o=C(T(e,[`summary`,`detail`,`reason`],``),180),s=Number.isFinite(a)?A(a):O(i);return`<article class="owner-system-console-dimension tone-${n(D(i))}">
    <div>
      <span>${n(r)}</span>
      <strong>${n(s)}</strong>
    </div>
    ${o?`<small>${n(o)}</small>`:``}
  </article>`}function z(e={},t={}){let r=C(T(e,[`label`,`title`,`name`,`id`,`key`,`signalId`],t.emptyLabel||`信号`)),i=T(e,[`status`,`severity`,`level`,`state`],``),a=C(T(e,[`summary`,`detail`,`message`,`reason`],``),180);return`<li class="owner-system-console-signal tone-${n(D(i))}">
    <span>${n(r)}</span>
    <strong>${n(O(i))}</strong>
    ${a?`<small>${n(a)}</small>`:``}
  </li>`}function B(e={}){return w(e.criticalSignals).sort((e,t)=>k(t)-k(e)).slice(0,8)}function V(e={}){let t=e.autonomousDeliveryControl&&typeof e.autonomousDeliveryControl==`object`?e.autonomousDeliveryControl:{},r=t.counts&&typeof t.counts==`object`?t.counts:{},i=w(t.items).slice(0,5),a=T(t,[`status`],`unknown`),o=[`失败 ${Number(r.failed||0)||0}`,`冲突 ${Number(r.deferredConflict||0)||0}`,`进行中 ${(Number(r.dispatching||0)||0)+(Number(r.sent||0)||0)}`].join(` / `),s=i.map(e=>{let t=T(e,[`sliceKey`,`sliceId`,`caseId`],`调度切片`),r=T(e,[`dispatchStatus`,`status`],`unknown`),i=C(T(e,[`failureCode`,`conflictCode`,`blockedReason`,`recommendedAction`],``),160);return`<li class="owner-system-console-signal tone-${n(D(r))}">
      <span>${n(t)}</span>
      <strong>${n(O(r))}</strong>
      ${i?`<small>${n(i)}</small>`:``}
    </li>`}).join(``);return`<section class="owner-system-console-panel" data-owner-system-console-status-section="delivery-dispatch">
    <div class="owner-system-console-section-head">
      <strong>交付调度</strong>
      <span>${n(o)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${n(D(a))}">
      <span>${n(O(a))}</span>
      <small>${n(a===`ok`?`无待处理调度异常`:`通过行动收件箱处理重试或确认`)}</small>
    </div>
    ${s?`<ul class="owner-system-console-signal-list">${s}</ul>`:``}
  </section>`}function H(e={}){let t=e.autonomousDeliveryLoop&&typeof e.autonomousDeliveryLoop==`object`?e.autonomousDeliveryLoop:{},r=t.counts&&typeof t.counts==`object`?t.counts:{},i=w(t.items).slice(0,5),a=T(t,[`status`],`unknown`),o=[`打开 ${Number(r.open||0)||0}`,`等回卡 ${Number(r.waitingReturn||0)||0}`,`阻塞 ${Number(r.blocked||0)||0}`,`重复抑制 ${Number(r.duplicateSuppressed||0)||0}`,`已闭环 ${Number(r.verifiedClosed||0)||0}`].join(` / `),s=i.map(e=>{let t=T(e,[`caseId`],`delivery case`),r=T(e,[`status`,`dispatchStatus`],`unknown`),i=C(T(e,[`blockedReason`,`dispatchStatus`,`attentionSliceKey`],``),160);return`<li class="owner-system-console-signal tone-${n(D(r))}">
      <span>${n(t)}</span>
      <strong>${n(O(r))}</strong>
      ${i?`<small>${n(i)}</small>`:``}
    </li>`}).join(``);return`<section class="owner-system-console-panel" data-owner-system-console-status-section="delivery-loop">
    <div class="owner-system-console-section-head">
      <strong>交付闭环</strong>
      <span>${n(o)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${n(D(a))}">
      <span>${n(O(a))}</span>
      <small>${n(a===`ok`?`闭环 ledger 无阻塞`:`查看卡住的 case、回卡和重复抑制`)}</small>
    </div>
    ${s?`<ul class="owner-system-console-signal-list">${s}</ul>`:``}
  </section>`}function U(e={}){let t=e.loopEngineeringStatus&&typeof e.loopEngineeringStatus==`object`?e.loopEngineeringStatus:{},r=t.counts&&typeof t.counts==`object`?t.counts:{},i=w(t.items).slice(0,5),a=T(t,[`status`],`unknown`),o=[`打开 ${Number(r.open||0)||0}`,`等回卡 ${Number(r.waitingReturn||0)||0}`,`阻塞 ${Number(r.blocked||0)||0}`,`已闭环 ${Number(r.verifiedClosed||0)||0}`].join(` / `),s=i.map(e=>{let t=T(e,[`loopId`,`target`,`caseId`],`Loop`),r=T(e,[`status`,`runtimeStatus`],`unknown`),i=C(T(e,[`nextRoute`,`blockedReason`,`currentRole`],``),160);return`<li class="owner-system-console-signal tone-${n(D(r))}">
      <span>${n(t)}</span>
      <strong>${n(O(r))}</strong>
      ${i?`<small>${n(i)}</small>`:``}
    </li>`}).join(``);return`<section class="owner-system-console-panel" data-owner-system-console-status-section="loop-engineering">
    <div class="owner-system-console-section-head">
      <strong>Loop Engineering</strong>
      <span>${n(o)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${n(D(a))}">
      <span>${n(O(a))}</span>
      <small>${n(a===`ok`?`Codex Mobile runtime 已接通`:`检查 Codex Mobile @loop runtime`)}</small>
    </div>
    ${s?`<ul class="owner-system-console-signal-list">${s}</ul>`:``}
  </section>`}function W(e={}){let t=e.qualityProgram&&typeof e.qualityProgram==`object`?e.qualityProgram:null;if(!t)return``;let r=w(t.workstreams).slice(0,5),i=w(t.gaps).slice(0,4),a=T(t,[`status`],`unknown`),o=A(E(t,[`progressPercent`])),s=r.map(e=>{let t=C(T(e,[`title`,`id`],`3A 工作流`)),r=T(e,[`status`],`unknown`),i=A(E(e,[`progressPercent`]));return`<li class="owner-system-console-signal tone-${n(D(r))}">
      <span>${n(t)}</span>
      <strong>${n(i||O(r))}</strong>
      <small>${n(O(r))}</small>
    </li>`}).join(``),c=i.map(e=>{let t=C(T(e,[`requirementId`,`workstreamId`],`缺口`)),r=C(T(e,[`gap`],``),220),i=T(e,[`status`],`unknown`);return`<li class="owner-system-console-signal tone-${n(D(i))}">
      <span>${n(t)}</span>
      <strong>${n(O(i))}</strong>
      ${r?`<small>${n(r)}</small>`:``}
    </li>`}).join(``);return`<section class="owner-system-console-panel" data-owner-system-console-status-section="quality-program">
    <div class="owner-system-console-section-head">
      <strong>3A 目标</strong>
      <span>${n(o||`未计算`)}</span>
    </div>
    <div class="owner-system-console-quality-summary tone-${n(D(a))}">
      <span>${n(O(a))}</span>
      <small>${n(i.length?`${i.length} 个主要缺口`:`当前证据无缺口`)}</small>
    </div>
    ${s?`<ul class="owner-system-console-signal-list">${s}</ul>`:``}
    ${c?`<ul class="owner-system-console-signal-list" data-owner-system-console-quality-gaps>${c}</ul>`:``}
  </section>`}function G(e={}){let t=w(e.signals).filter(e=>k(e)>=2),n=w(e.thresholds).filter(e=>k(e)>=2||T(e,[`status`,`state`],``));return[...t,...n].sort((e,t)=>k(t)-k(e)).slice(0,8)}function K(e={}){let t=w(e.services),n=t.filter(e=>e.critical===!0||e.required===!0||k(e)>=2);return(n.length?n:t.slice(0,6)).slice(0,8)}function q(e={}){let t=e.codexMobile&&typeof e.codexMobile==`object`?e.codexMobile:null;if(!t||t.available===!1)return``;let r=T(t,[`status`],`unknown`),i=w(t.processes).slice(0,6),a=t.logs&&typeof t.logs==`object`?t.logs:{},o=E(t,[`totalCpuPercent`]),s=E(t,[`totalRssBytes`]),c=E(a,[`totalSizeBytes`,`maxSizeBytes`]),l=E(a,[`growthBytesPerSecond`]),u=[Number.isFinite(o)?`CPU ${A(o)}`:`CPU 未采集`,Number.isFinite(s)?`RSS ${j(s)}`:`RSS 未采集`,Number.isFinite(c)?`日志 ${j(c)}`:`日志未采集`].join(` / `),d=a.growthAvailable&&Number.isFinite(l)?`增长 ${j(l)}/s`:`增长待第二次采样`,f=i.map(e=>{let t=C(T(e,[`label`,`role`],`Codex Mobile process`),80),r=T(e,[`status`],`unknown`),i=E(e,[`cpuPercent`]),a=E(e,[`rssBytes`]),o=[Number.isFinite(i)?`CPU ${A(i)}`:``,Number.isFinite(a)?`RSS ${j(a)}`:``,T(e,[`elapsed`],``)].filter(Boolean).join(` / `);return`<li class="owner-system-console-signal tone-${n(D(r))}">
      <span>${n(t)}</span>
      <strong>${n(O(r))}</strong>
      ${o?`<small>${n(o)}</small>`:``}
    </li>`}).join(``);return`<section class="owner-system-console-panel" data-owner-system-console-status-section="codex-mobile-runtime">
    <div class="owner-system-console-section-head">
      <strong>Codex Mobile Runtime</strong>
      <span>${n(O(r))}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${n(D(r))}">
      <span>${n(u)}</span>
      <small>${n(d)}</small>
    </div>
    ${f?`<ul class="owner-system-console-signal-list">${f}</ul>`:`<div class="owner-system-console-empty">未发现 Codex Mobile 运行时进程。</div>`}
  </section>`}function J(){return`<section class="owner-system-console owner-system-console-unavailable" data-owner-system-console>
    <div class="owner-system-console-empty" data-owner-system-console-unavailable>
      <strong>仅 Owner 可见</strong>
      <span>当前账号不能查看系统控制台。</span>
    </div>
  </section>`}function Y(e={}){let t=e.console||{},r=t.systemStatus||e.systemStatus||{},i=w(t.dimensions).slice(0,3),a=B(t);return`<section class="owner-system-console-overview" data-owner-system-console-overview>
    <div class="owner-system-console-summary">
      <div>
        <span class="owner-system-console-kicker">总体状态</span>
        ${L(t.overallStatus)}
      </div>
      <span class="owner-system-console-time">生成 ${n(F(t.generatedAt))}</span>
    </div>
    <div class="owner-system-console-dimensions" data-owner-system-console-status-section="dimensions">
      ${i.length?i.map(R).join(``):`<div class="owner-system-console-empty">暂无 3A 维度。</div>`}
    </div>
    <div class="owner-system-console-metric-grid" data-owner-system-console-status-section="overview-resources">
      ${I(`cpu`,`CPU`,r.cpu)}
      ${I(`memory`,`内存`,r.memory)}
      ${I(`disk`,`磁盘`,r.disk)}
    </div>
    ${W(t)}
    ${V(t)}
    ${H(t)}
    ${U(t)}
    <section class="owner-system-console-panel" data-owner-system-console-status-section="critical-signals">
      <div class="owner-system-console-section-head">
        <strong>关键信号</strong>
        <span>${n(a.length)} 项</span>
      </div>
      ${a.length?`<ul class="owner-system-console-signal-list">${a.map(e=>z(e)).join(``)}</ul>`:`<div class="owner-system-console-empty">暂无关键告警。</div>`}
    </section>
  </section>`}function X(e={}){let t=K(e);return t.length?`<div class="owner-system-console-table-wrap">
    <table class="owner-system-console-service-table">
      <thead>
        <tr><th>服务</th><th>状态</th><th>信号</th></tr>
      </thead>
      <tbody>${t.map(e=>{let t=C(T(e,[`label`,`name`,`id`,`key`],`服务`)),r=T(e,[`status`,`state`,`level`],`unknown`),i=C(T(e,[`summary`,`detail`,`reason`,`role`],``),160);return`<tr class="tone-${n(D(r))}">
      <td>${n(t)}</td>
      <td>${n(O(r))}</td>
      <td>${n(i||`已上报`)}</td>
    </tr>`}).join(``)}</tbody>
    </table>
  </div>`:`<div class="owner-system-console-empty">暂无关键服务数据。</div>`}function Z(e={}){let t=e.console||{},r=e.systemStatus||t.systemStatus||{},i=G(r),a=r.collectedAt||t.generatedAt||``;return`<section class="owner-system-console-system-status" data-owner-system-console-system-status>
    <div class="owner-system-console-metric-grid" data-owner-system-console-status-section="system-resources">
      ${I(`cpu`,`CPU`,r.cpu)}
      ${I(`memory`,`内存`,r.memory)}
      ${I(`disk`,`磁盘`,r.disk)}
      ${I(`uptime`,`运行时间`,r.uptime)}
    </div>
    ${q(r)}
    <section class="owner-system-console-panel" data-owner-system-console-status-section="services">
      <div class="owner-system-console-section-head">
        <strong>关键服务</strong>
        <span>采集 ${n(F(a))}</span>
      </div>
      ${e.systemStatusLoading?`<div class="owner-system-console-empty">正在读取系统状态...</div>`:X(r)}
    </section>
    <section class="owner-system-console-panel" data-owner-system-console-status-section="resource-warnings">
      <div class="owner-system-console-section-head">
        <strong>资源告警</strong>
        <span>${n(i.length)} 项</span>
      </div>
      ${i.length?`<ul class="owner-system-console-signal-list" data-owner-system-console-resource-warnings>${i.map(e=>z(e,{emptyLabel:`资源`})).join(``)}</ul>`:`<div class="owner-system-console-empty" data-owner-system-console-resource-warnings>暂无资源告警。</div>`}
    </section>
  </section>`}function Q(e={}){if(!e.isOwner)return J();let t=e.model&&typeof e.model==`object`?e.model:{};b.includes(e.tab)&&(t.activeTab=e.tab);let r=b.includes(t.activeTab)?t.activeTab:`overview`,i=t.error||t.systemStatusError||``,a=r===`system-status`?Z(t):Y(t);return`<section class="owner-system-console" data-owner-system-console>
    <header class="owner-system-console-head">
      <div>
        <span class="owner-system-console-kicker">Owner 中心</span>
        <h2>系统控制台</h2>
      </div>
      <button type="button" data-owner-system-console-refresh${t.loading||t.systemStatusLoading?` disabled`:``}>${t.loading||t.systemStatusLoading?`刷新中`:`刷新`}</button>
    </header>
    <nav class="owner-system-console-tabs" role="tablist" aria-label="系统控制台">
      <button type="button" role="tab" data-owner-system-console-tab="overview" aria-selected="${r===`overview`?`true`:`false`}" class="${r===`overview`?`active`:``}">概览</button>
      <button type="button" role="tab" data-owner-system-console-tab="system-status" aria-selected="${r===`system-status`?`true`:`false`}" class="${r===`system-status`?`active`:``}">系统状态</button>
    </nav>
    ${i?`<div class="owner-system-console-error" role="status">${n(S(i,160))}</div>`:``}
    ${t.loading&&!t.console?`<div class="owner-system-console-empty">正在读取控制台...</div>`:a}
  </section>`}export{t as CATEGORY_LABELS,b as CLASSIC_OWNER_SYSTEM_CONSOLE_TABS,e as STATUS_LABELS,d as badge,a as categoryLabel,O as classicStatusLabel,D as classicTone,n as escapeHtml,l as normalizeOwnerConsoleError,r as normalizeStatus,u as ownerConsoleError,Y as renderClassicOwnerSystemConsoleOverview,Z as renderClassicOwnerSystemConsoleSystemStatus,J as renderClassicOwnerSystemConsoleUnavailable,Q as renderClassicOwnerSystemConsoleView,y as renderErrorHtml,v as renderLoadingHtml,_ as renderOwnerConsoleHtml,c as shortTime,i as statusLabel};