"use strict";

function normalizeClientVersion(value) {
  return String(value || "").trim();
}

function compactClientVersion(value) {
  const version = normalizeClientVersion(value);
  const match = version.match(/^\d{8}-(\d{4})$/);
  if (match) return match[1];
  if (version.length > 8) return version.slice(-8);
  return version;
}

function renderClientVersion() {
  const badge = $("clientVersion");
  if (!badge) return;
  const version = normalizeClientVersion(state.clientVersion);
  const update = state.appUpdate || {};
  const updateAvailable = Boolean(update.updateAvailable);
  badge.textContent = updateAvailable ? "更新" : (version ? `v${compactClientVersion(version)}` : "");
  badge.title = updateAvailable
    ? `Update available: ${update.latestVersion || update.latestCommit || "latest"}`
    : (version ? `Client version ${version}` : "");
  badge.classList.toggle("update-available", updateAvailable);
  badge.toggleAttribute("data-update-available", updateAvailable);
}

async function checkAppUpdate(reason = "login") {
  if (!state.auth?.isOwner || state.appUpdateChecking) return null;
  state.appUpdateChecking = true;
  try {
    const query = new URLSearchParams({ reason });
    const result = await api(`/api/app-update/status?${query.toString()}`);
    state.appUpdate = result;
    renderClientVersion();
    return result;
  } catch (err) {
    state.appUpdate = { ok: false, updateAvailable: false, warning: err.message || String(err) };
    renderClientVersion();
    return null;
  } finally {
    state.appUpdateChecking = false;
  }
}

function isSelfUpdateUnsupported(result) {
  const message = String(result?.warning || result?.error || "");
  return result?.repository?.available === false || /not a git checkout/i.test(message);
}

function appUpdateToastKind(result) {
  if (!result) return "";
  if (result.ok && (result.updated || result.upToDate)) return "success";
  if (isSelfUpdateUnsupported(result)) return "";
  if (result.error || result.warning || result.repository?.clean === false) return "error";
  return "";
}

function appUpdateMessage(result) {
  if (!result) return "Update status is unavailable.";
  if (isSelfUpdateUnsupported(result)) return "当前安装方式不支持应用内更新。";
  if (result.error) return result.error;
  if (result.warning) return result.warning;
  if (result.updated) return result.message || "Updated.";
  if (result.upToDate) return "Already up to date.";
  if (!result.updateAvailable) return "No update is available.";
  if (result.repository && result.repository.clean === false) return "Working tree is not clean; update was not applied.";
  return "Update is not available for this installation.";
}

async function applyAppUpdateFromBadge() {
  if (!state.auth?.isOwner || state.appUpdateApplying) return;
  if (!state.appUpdate?.updateAvailable) {
    await checkAppUpdate("manual");
    if (!state.appUpdate?.updateAvailable) {
      showPushToast(appUpdateMessage(state.appUpdate), appUpdateToastKind(state.appUpdate));
      return;
    }
  }
  state.appUpdateApplying = true;
  renderClientVersion();
  try {
    const result = await api("/api/app-update/apply", { method: "POST", body: JSON.stringify({}) });
    state.appUpdate = result;
    renderClientVersion();
    showPushToast(appUpdateMessage(result), appUpdateToastKind(result));
    if (result.updated) {
      await checkClientVersion("update-applied").catch(() => {});
    }
  } catch (err) {
    showPushToast(err.message || "Update failed.", "error");
  } finally {
    state.appUpdateApplying = false;
    renderClientVersion();
  }
}

function gatewayPoolSummary(pool = state.gatewayPool) {
  if (!pool || typeof pool !== "object") return { label: "Gateway Pool: unknown", detail: "" };
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const healthy = workers.filter((worker) => worker.healthy === true).length;
  const workerCount = Number(pool.workerCount ?? workers.length) || workers.length;
  if (!pool.enabled) {
    return {
      label: "Gateway Pool: fallback",
      detail: pool.error || pool.reason || pool.fallbackApiBase || "",
      healthy,
      workerCount,
    };
  }
  return {
    label: `Gateway Pool: ${healthy}/${workerCount} healthy`,
    detail: pool.mode ? `mode ${pool.mode}` : "",
    healthy,
    workerCount,
  };
}

function gatewayProviderTierLabel(tier = {}) {
  const configured = Number(tier.configured || 0);
  const healthy = Number(tier.healthy || 0);
  if (!configured) return "not configured";
  return `${healthy}/${configured} healthy`;
}

function renderGatewayProviderMatrix(pool = state.gatewayPool) {
  const matrix = Array.isArray(pool?.providerMatrix) ? pool.providerMatrix : [];
  if (!matrix.length) return "";
  return `<div class="workspace-gateway-provider-matrix" aria-label="Gateway provider availability">
    ${matrix.map((row) => `<div class="workspace-gateway-provider-row">
      <span class="workspace-gateway-provider-name">${escapeHtml(row.label || row.provider || "Provider")}</span>
      <span class="workspace-gateway-provider-tier">Low ${escapeHtml(gatewayProviderTierLabel(row.user))}</span>
      <span class="workspace-gateway-provider-tier">High ${escapeHtml(gatewayProviderTierLabel(row.ownerMaintenance))}</span>
    </div>`).join("")}
  </div>`;
}

function concurrencySummary(concurrency = state.concurrency) {
  if (!concurrency || typeof concurrency !== "object") return "";
  const active = Number(concurrency.activeGlobal || 0);
  const maxGlobal = Number(concurrency.maxGlobal || 0);
  const maxPerWorkspace = Number(concurrency.maxPerWorkspace || 0);
  const parts = [`active ${active}`];
  if (maxGlobal) parts.push(`global ${maxGlobal}`);
  if (maxPerWorkspace) parts.push(`workspace ${maxPerWorkspace}`);
  return parts.join(" / ");
}

function renderGatewayPoolMiniStatus(pool = state.gatewayPool, concurrency = state.concurrency) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const summary = gatewayPoolSummary(pool);
  const concurrencyText = concurrencySummary(concurrency);
  return `<section class="workspace-gateway-status">
    <div class="workspace-gateway-title">${escapeHtml(summary.label)}</div>
    ${summary.detail ? `<div class="workspace-gateway-meta">${escapeHtml(summary.detail)}</div>` : ""}
    ${concurrencyText ? `<div class="workspace-gateway-meta">Run limit: ${escapeHtml(concurrencyText)}</div>` : ""}
    ${renderGatewayProviderMatrix(pool)}
  </section>`;
}

function ownerElevationDurationOptions() {
  const options = Array.isArray(state.ownerElevation?.durationOptionsMinutes)
    ? state.ownerElevation.durationOptionsMinutes.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
  return options.length ? options : [5, 15, 30, 60];
}

function ownerElevationActive() {
  const elevation = state.ownerElevation || {};
  const expiresAt = Date.parse(elevation.expiresAt || "");
  return Boolean(
    state.auth?.isOwner
    && state.selectedWorkspaceId === "owner"
    && elevation.active
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
  );
}

function ownerElevationRemainingLabel() {
  if (!ownerElevationActive()) return "";
  const expiresAt = Date.parse(state.ownerElevation?.expiresAt || "");
  const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
  return `${minutes} 分钟后到期`;
}

function ownerElevationSelectedDuration() {
  const options = ownerElevationDurationOptions();
  const raw = Number($("ownerElevationDuration")?.value || state.ownerElevationDurationMinutes || state.ownerElevation?.defaultDurationMinutes || options[0]);
  return options.includes(raw) ? raw : (state.ownerElevation?.defaultDurationMinutes || options[0]);
}

function renderOwnerElevationPanel() {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const elevation = state.ownerElevation || {};
  const available = elevation.available !== false;
  const active = ownerElevationActive();
  const durationOptions = ownerElevationDurationOptions();
  if (!durationOptions.includes(state.ownerElevationDurationMinutes)) {
    state.ownerElevationDurationMinutes = elevation.defaultDurationMinutes || durationOptions[0];
  }
  const selectedDuration = state.ownerElevationDurationMinutes;
  const label = active ? "高权限运行" : "普通权限";
  const meta = active
    ? `后续 Owner 请求会路由到 maintenance Gateway，${ownerElevationRemainingLabel()}。`
    : "后续 Owner 请求默认走普通低权限 Gateway。";
  const options = durationOptions.map((minutes) => (
    `<option value="${escapeHtml(minutes)}"${minutes === selectedDuration ? " selected" : ""}>${escapeHtml(minutes)} 分钟</option>`
  )).join("");
  const disabled = available ? "" : " disabled";
  const reason = !available && elevation.reason ? `<div class="workspace-permission-warning">${escapeHtml(elevation.reason)}</div>` : "";
  return `<section class="workspace-permission-panel ${active ? "active" : ""}">
    <div class="workspace-permission-head">
      <div>
        <div class="workspace-permission-title">当前权限</div>
        <div class="workspace-permission-state">${escapeHtml(label)}</div>
      </div>
      <span class="workspace-permission-badge">${active ? "HIGH" : "LOW"}</span>
    </div>
    <div class="workspace-permission-meta">${escapeHtml(meta)}</div>
    <div class="workspace-permission-actions">
      <select id="ownerElevationDuration" class="workspace-permission-select"${disabled}>${options}</select>
      <button class="workspace-permission-primary" type="button" data-owner-elevation-grant${disabled}>高权限运行</button>
      ${active ? `<button class="workspace-permission-secondary" type="button" data-owner-elevation-revoke>结束</button>` : ""}
    </div>
    <div class="workspace-permission-hint">只在授权时间内生效；到期后自动恢复普通权限。</div>
    ${reason}
  </section>`;
}

function wireOwnerElevationPanel(root) {
  root.querySelector("#ownerElevationDuration")?.addEventListener("change", (event) => {
    const minutes = Number(event.target.value || 0);
    if (Number.isFinite(minutes) && minutes > 0) {
      state.ownerElevationDurationMinutes = minutes;
      localStorage.setItem("hermesOwnerElevationMinutes", String(minutes));
    }
  });
  root.querySelector("[data-owner-elevation-grant]")?.addEventListener("click", () => activateOwnerElevation().catch(showError));
  root.querySelector("[data-owner-elevation-revoke]")?.addEventListener("click", () => revokeOwnerElevation().catch(showError));
}

function openOwnerElevationApprovalDialog(options = {}) {
  const overlay = $("ownerElevationApprovalOverlay");
  if (!overlay) return Promise.resolve(false);
  const title = String(options.title || "Owner Approval");
  const message = String(options.message || "This request needs Owner approval.");
  const detail = String(options.detail || "").trim();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      resolve(Boolean(value));
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    overlay.innerHTML = `<section class="access-key-sheet owner-elevation-approval-sheet">
      <header class="access-key-header">
        <div>
          <div id="ownerElevationApprovalTitle" class="access-key-title">${escapeHtml(title)}</div>
          <div class="access-key-subtitle">High-privilege Gateway approval</div>
        </div>
      </header>
      <div class="owner-elevation-approval-body">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
      ${detail ? `<div class="owner-elevation-approval-detail">${escapeHtml(detail)}</div>` : ""}
      <div class="owner-elevation-approval-actions">
        <button class="owner-elevation-cancel" type="button" data-owner-elevation-approval-cancel>Cancel</button>
        <button class="owner-elevation-approve" type="button" data-owner-elevation-approval-approve>Approve</button>
      </div>
    </section>`;
    overlay.classList.remove("hidden");
    overlay.querySelector("[data-owner-elevation-approval-approve]")?.addEventListener("click", () => finish(true));
    overlay.querySelector("[data-owner-elevation-approval-cancel]")?.addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKeydown);
  });
}

async function activateOwnerElevation(durationMinutes = ownerElevationSelectedDuration(), options = {}) {
  if (!state.auth?.isOwner) throw new Error("Owner access is required");
  const minutes = Number(durationMinutes) || ownerElevationSelectedDuration();
  if (options.confirm !== false) {
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: `Approve high-privilege Gateway routing for ${minutes} minutes? Owner requests during this window will use the maintenance Gateway.`,
    });
    if (!ok) return false;
  }
  const result = await api("/api/owner-elevation", {
    method: "POST",
    body: JSON.stringify({ durationMinutes: minutes }),
  });
  state.ownerElevation = result.ownerElevation || state.ownerElevation;
  renderWorkspaceAccessPanel();
  showPushToast("高权限运行已授权", "success");
  return true;
}

async function revokeOwnerElevation() {
  const result = await api("/api/owner-elevation", { method: "DELETE" });
  state.ownerElevation = result.ownerElevation || state.ownerElevation;
  renderWorkspaceAccessPanel();
  showPushToast("已恢复普通权限", "success");
}

function clearOwnerElevationOnce() {
  state.ownerElevationOnceToken = "";
  state.ownerElevationOnceExpiresAt = "";
}

function ownerElevationOnceActive() {
  const expiresAt = Date.parse(state.ownerElevationOnceExpiresAt || "");
  return Boolean(
    state.ownerElevationOnceToken
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
  );
}

async function activateOwnerElevationOnce(options = {}) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") {
    throw new Error("Owner access is required");
  }
  if (options.confirm !== false) {
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: options.message || "Approve high-privilege Gateway routing for this message only? The approval is consumed after this send.",
    });
    if (!ok) return false;
  }
  const result = await api("/api/owner-elevation/once", { method: "POST", body: JSON.stringify({}) });
  const grant = result.ownerElevationOnce || {};
  state.ownerElevationOnceToken = String(grant.token || "");
  state.ownerElevationOnceExpiresAt = String(grant.expiresAt || "");
  if (!state.ownerElevationOnceToken) throw new Error("Owner high-privilege authorization token was not returned");
  return true;
}
