var e=`20260711-vite-workspace-console-model-v1`;function t(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`)}function n(e,t=160){return String(e??``).replace(/[\u0000-\u001f\u007f]/g,` `).replace(/\s+/g,` `).trim().slice(0,Math.max(1,Number(t)||160))}function r(e){return Array.isArray(e)?e.filter(Boolean):[]}function i(e){let t=String(e||``).toLowerCase();return/^(ok|online|ready|normal|healthy)$/.test(t)?`ok`:/^(blocked|critical|failed|error)$/.test(t)?`critical`:/^(offline|stale|pending|warning|unknown)$/.test(t)?`warning`:`neutral`}function a(e={}){let t=n(e.statusLabel||``);if(t)return t;let r=String(e.status||``).toLowerCase();return r===`online`?`在线`:r===`ok`?`正常`:r===`offline`?`离线`:r===`stale`?`过期`:r===`pending`?`待配置`:r===`blocked`?`阻塞`:`未知`}function o(e){let t=n(e||``,80);if(!t)return`未记录`;let r=Date.parse(t);if(!Number.isFinite(r))return t;try{return new Date(r).toLocaleString(`zh-CN`,{month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`,hour12:!1})}catch{return t}}function s(e,n){return`
    <span class="workspace-console-metric">
      <span class="workspace-console-metric-value">${t(n)}</span>
      <span class="workspace-console-metric-label">${t(e)}</span>
    </span>`}function c(e={}){return`<span class="workspace-console-status tone-${t(i(e.status))}">${t(a(e))}</span>`}function l(e=[]){let i=r(e).slice(0,4);return i.length?i.map(e=>`<span class="workspace-console-chip">${t(n(e,80))}</span>`).join(``):`<span class="workspace-console-muted">无 issue code</span>`}function u(e={}){return e.kind===`remote_codex`?[e.cwdLabel?`远程项目 ${e.cwdLabel}`:``,e.nodeId?`节点 ${e.nodeId}`:``,e.sessionState?`会话 ${e.sessionState}`:``,`心跳 ${o(e.lastHeartbeatAt||e.lastSeenAt)}`].filter(Boolean).join(` · `):e.kind===`local_codex`?[e.cwdLabel?`cwd ${e.cwdLabel}`:``,e.mainThread?.label?`主线程 ${e.mainThread.label}`:`主线程 未解析`,e.workerLane?.label?`Worker ${e.workerLane.label}`:``,e.deployLane?.label?`部署 ${e.deployLane.label}`:``].filter(Boolean).join(` · `):[e.cwdLabel?`cwd ${e.cwdLabel}`:``,e.identityLabel?`身份 ${e.identityLabel}`:``].filter(Boolean).join(` · `)}function d(e={},n=!1){if(!n)return``;let i=e.latestDailySummary?.summary||``,a=e.latestTaskCard?.title||e.latestTaskCard?.summary||``,o=e.latestTerminalReturn?.title||e.latestTerminalReturn?.summary||e.latestTerminalReturn?.status||``,s=e.latestEscalation?.summary||r(e.blockerCodes).join(`, `),c=e.mainThread?.label||e.nodeId||`未解析`,u=e.workerLane?.label||`未配置`,d=e.deployLane?.label||`未配置`;return`
    <div class="workspace-console-row-detail">
      <div><strong>Issue</strong><span>${l(e.issueCodes)}</span></div>
      <div><strong>线程</strong><span>${t(c)}</span></div>
      <div><strong>Worker</strong><span>${t(u)}</span></div>
      <div><strong>部署</strong><span>${t(d)}</span></div>
      <div><strong>任务卡</strong><span>${t(a||`${Number(e.activeTaskCardCount||0)} 个活跃`)}</span></div>
      <div><strong>回卡</strong><span>${t(o||`未记录`)}</span></div>
      <div><strong>日报</strong><span>${t(i||e.latestDailySummaryStatus||`未采集`)}</span></div>
      <div><strong>升级</strong><span>${t(s||`${Number(e.escalationCount||0)} 条`)}</span></div>
    </div>`}function f(e={},r=``){let a=n(e.id||``,128),o=!!(a&&r===a);return`
    <article class="workspace-console-row tone-${t(i(e.status))}" data-workspace-console-row data-workspace-kind="${t(e.kind||``)}" data-workspace-id="${t(a)}">
      <div class="workspace-console-row-main">
        <div class="workspace-console-row-title-line">
          <span class="workspace-console-row-title">${t(e.name||a||`Workspace`)}</span>
          <span class="workspace-console-kind">${t(e.kindLabel||e.kind||`工作区`)}</span>
          ${c(e)}
        </div>
        <div class="workspace-console-row-meta">${t(u(e))}</div>
        <div class="workspace-console-row-counts">
          ${s(`活跃卡`,Number(e.activeTaskCardCount||0))}
          ${s(`待决策`,Number(e.pendingApprovalCount||0))}
          ${s(`升级`,Number(e.escalationCount||0))}
        </div>
      </div>
      <button class="workspace-console-detail-button" type="button" data-workspace-console-detail="${t(a)}" aria-expanded="${o?`true`:`false`}">详情</button>
      ${d(e,o)}
    </article>`}function p(e={},n=``){let i=r(e.items),a=e.id===`remoteCodex`?`暂无远程 Codex 工作区接入。`:`暂无本机 Codex 工作区记录。`;return`
    <section class="workspace-console-panel" data-workspace-console-section="${t(e.id||``)}">
      <div class="workspace-console-panel-head">
        <div>
          <h3>${t(e.title||`工作区`)}</h3>
          <p>${t(`${Number(e.count||i.length||0)} 条记录`)}</p>
        </div>
        ${c(e)}
      </div>
      <div class="workspace-console-list">
        ${i.length?i.map(e=>f(e,n)).join(``):`<div class="workspace-console-empty">${t(a)}</div>`}
      </div>
    </section>`}function m(e={}){if(e.status===`loading`&&!e.data)return`<div class="workspace-console-state">正在载入工作区状态...</div>`;if(e.status===`error`&&!e.data)return`<div class="workspace-console-state error">工作区控制台载入失败。${t(e.error||``)}</div>`;let n=e.data||{},r=n.counts||{},i=n.sections||{},a=i.localCodex||{id:`localCodex`,title:`本机 Codex 工作区`,items:[]},o=i.remoteCodex||{id:`remoteCodex`,title:`远程 Codex 工作区`,items:[]};return`
    <div class="workspace-console-summary">
      ${s(`总数`,Number(r.total||0))}
      ${s(`本机`,Number(r.localCodex??r.local??0))}
      ${s(`远程`,Number(r.remoteCodex??r.remote??0))}
      ${s(`活跃卡`,Number(r.activeTaskCards||0))}
      ${s(`异常`,Number(r.blocked||0)+Number(r.offline||0)+Number(r.stale||0))}
    </div>
    ${e.status===`error`?`<div class="workspace-console-inline-error">${t(e.error||`刷新失败`)}</div>`:``}
    <div class="workspace-console-grid">
      ${p(a,e.expandedId)}
      ${p(o,e.expandedId)}
    </div>`}function h({isOwner:e=!1,model:t={}}={}){return e?`
    <section class="workspace-console" data-workspace-console>
      <div class="workspace-console-head">
        <div>
          <div class="workspace-console-kicker">Owner Console</div>
          <h2>Codex 工作区</h2>
          <p>本机与远程 Codex 工作区治理状态。</p>
        </div>
        <div class="workspace-console-head-actions">
          ${c({status:t.data?.overallStatus||(t.status===`loading`?`pending`:`unknown`),statusLabel:t.data?.overallStatusLabel||``})}
          <button class="workspace-console-refresh" type="button" data-workspace-console-refresh ${t.status===`loading`?`disabled`:``}>刷新</button>
        </div>
      </div>
      ${m(t)}
    </section>`:`
      <section class="workspace-console" data-workspace-console>
        <div class="workspace-console-head">
          <div>
            <div class="workspace-console-kicker">Owner Console</div>
            <h2>Codex 工作区</h2>
          </div>
        </div>
        <div class="workspace-console-state">当前账号没有 Owner 权限。</div>
      </section>`}export{e as WORKSPACE_CONSOLE_MODEL_VERSION,n as cleanWorkspaceConsoleText,m as renderClassicWorkspaceConsoleContent,f as renderClassicWorkspaceConsoleRow,p as renderClassicWorkspaceConsoleSection,h as renderClassicWorkspaceConsoleView,a as workspaceConsoleStatusLabelPlan,i as workspaceConsoleStatusTonePlan};