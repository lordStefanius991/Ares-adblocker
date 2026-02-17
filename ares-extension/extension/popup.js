// extension/popup.ts
var KEY_ENABLED = "ares_enabled";
var KEY_CUSTOM = "ares_custom_domains";
var KEY_YT_ADS = "ares_yt_ads";
var devStatusLine = document.getElementById("devStatusLine");
var devPanel = document.getElementById("devPanel");
var devRefreshBtn = document.getElementById("devRefreshBtn");
var devCopyBtn = document.getElementById("devCopyBtn");
var devClearBtn = document.getElementById("devClearBtn");
var devOut = document.getElementById("devOut");
var footer = document.querySelector(".footer");
var ruleInspectorOut = document.getElementById("ruleInspectorOut");
var devMetrics = document.getElementById("devMetrics");
var devSessionStartBtn = document.getElementById("devSessionStartBtn");
var devSessionStopBtn = document.getElementById("devSessionStopBtn");
var devSessionStopAllBtn = document.getElementById("devSessionStopAllBtn");
var KEY_DEV = "ares_dev_mode";
var ytAdsStats = document.getElementById("ytAdsStats");
var resetYtAdsStatsBtn = document.getElementById("resetYtAdsStatsBtn");
var PRESETS = [
  { key: "youtube", label: "YouTube", icon: "Y" },
  { key: "linkedin", label: "LinkedIn", icon: "in" },
  { key: "facebook", label: "Facebook", icon: "f" }
];
var masterToggle = document.getElementById("masterToggle");
var statusEl = document.getElementById("status");
var presetList = document.getElementById("presetList");
var customList = document.getElementById("customList");
var customDomainInput = document.getElementById("customDomainInput");
var addBtn = document.getElementById("addBtn");
var ytAdsToggle = document.getElementById("ytAdsToggle");
var openPanelTopBtn = document.getElementById("openPanelTopBtn");
async function openSidePanelForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (typeof tabId !== "number") return;
  await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
  await chrome.sidePanel.open({ tabId });
}
openPanelTopBtn.addEventListener("click", openSidePanelForActiveTab);
function setStatus(enabled) {
  statusEl.textContent = enabled ? "ARES enabled" : "ARES disabled (rules paused)";
}
async function isDevMode() {
  const d = await chrome.storage.local.get(KEY_DEV);
  return d[KEY_DEV] === true;
}
async function setDevMode(on) {
  await chrome.storage.local.set({ [KEY_DEV]: on });
  devPanel.style.display = on ? "block" : "none";
}
function normalizeDomain(input) {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  if (!s.includes(".")) return null;
  return s;
}
function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}
async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  let host = "unknown";
  try {
    if (tab?.url) host = new URL(tab.url).hostname;
  } catch {
  }
  return { tabId: typeof tabId === "number" ? tabId : void 0, host };
}
function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
}
function fmtWindow(state, fromTs, toTs) {
  if (!fromTs) return "LIVE";
  if (state === "FROZEN" && toTs) return `FROZEN (${fmtTime(fromTs)} \u2192 ${fmtTime(toTs)})`;
  return `RUNNING (since ${fmtTime(fromTs)})`;
}
async function refreshDevLog() {
  const { tabId, host } = await getActiveTabInfo();
  let fromTs;
  let toTs;
  let state;
  if (typeof tabId === "number") {
    const w = await send({ type: "ARES_SESSION_TAB_WINDOW", tabId });
    if (w?.ok && w.window) {
      fromTs = typeof w.window.fromTs === "number" ? w.window.fromTs : void 0;
      toTs = typeof w.window.toTs === "number" ? w.window.toTs : void 0;
      state = typeof w.window.state === "string" ? w.window.state : void 0;
    }
  }
  const logResp = await send({
    type: "ARES_EXPORT_LOG_RANGE",
    limit: 800,
    tabId,
    fromTs,
    toTs
  });
  devOut.value = logResp?.ok ? logResp.json ?? "" : JSON.stringify(logResp);
  const m = await send({ type: "ARES_GET_METRICS", limit: 500, tabId, fromTs, toTs });
  if (m?.ok) {
    const modeLabel = fmtWindow(state, fromTs, toTs);
    let sevColor = "#4caf50";
    if (m.severity === "AD_HEAVY") sevColor = "#ff9800";
    if (m.severity === "AD_STORM") sevColor = "#f44336";
    devStatusLine.innerHTML = `
    Mode: <span style="color:#2196f3">${modeLabel}</span> |
    Severity: <span style="color:${sevColor}">${m.severity}</span>
  `;
    const lines = [
      `Context: ${host}`,
      `TabId: ${tabId ?? "?"}`,
      ``,
      `Mode: ${fmtWindow(state, fromTs, toTs)}`,
      ``,
      `Total (tail/window): ${m.total}`,
      `Events (last ${m.window.seconds}s): ${m.window.events} events`,
      ``,
      ...m.score ? [
        `Aggressiveness score: ${m.score.aggressiveness}/100 (${m.score.level})`,
        `Unique ad domains (tail/window): ${m.score.uniqueDomains}`,
        `Max burst: ${m.score.maxBurstInWindow} in ${m.score.burstWindowMs}ms (threshold ${m.score.burstThreshold})`,
        ``
      ] : [``],
      ...m.severity ? [
        `Severity: ${m.severity}${m.severity_reasons?.length ? ` (${m.severity_reasons.join(", ")})` : ""}`,
        ``
      ] : [],
      ...m.trend ? [
        `Trend (last ${m.trend.windowSeconds}s): ${m.trend.dir} (now=${m.trend.now}, prev=${m.trend.prev})`,
        ``
      ] : [],
      `Top domains:`,
      ...(m.topDomains ?? []).map((x) => `- ${x.key}: ${x.count}`),
      ``,
      `Top rules:`,
      ...(m.topRules ?? []).map((x) => `- ${x.key}: ${x.count}`),
      ``,
      `Top resource types:`,
      ...(m.topResourceTypes ?? []).map((x) => `- ${x.key}: ${x.count}`),
      ``,
      ...m.alerts?.length ? [
        `Alerts:`,
        ...m.alerts.map(
          (a) => a.type === "burst" ? `- Burst detected: ${a.count} events in ${a.windowMs}ms (threshold ${a.threshold})` : `- ${a.type}`
        )
      ] : []
    ];
    devMetrics.textContent = lines.join("\n");
  } else {
    devMetrics.textContent = "";
  }
}
async function loadState() {
  const data = await chrome.storage.local.get([
    KEY_ENABLED,
    KEY_CUSTOM,
    KEY_YT_ADS,
    ...PRESETS.map((p) => `preset_${p.key}`)
  ]);
  const enabled = data[KEY_ENABLED] !== false;
  ytAdsToggle.checked = data[KEY_YT_ADS] === true;
  ytAdsToggle.disabled = !enabled;
  masterToggle.checked = enabled;
  setStatus(enabled);
  const statsResp = await send({ type: "ARES_GET_STATS" });
  if (statsResp?.ok && statsResp.stats) {
    const n = statsResp.stats.ytAdsBlocked ?? 0;
    ytAdsStats.textContent = `YouTube ad requests blocked: ${n}`;
  } else {
    ytAdsStats.textContent = "YouTube ad requests blocked: ?";
  }
  renderPresets(data, enabled);
  renderCustomDomains(Array.isArray(data[KEY_CUSTOM]) ? data[KEY_CUSTOM] : [], enabled);
}
if (footer) {
  let footerClicks = 0;
  let footerTimer = null;
  footer.addEventListener("click", async () => {
    footerClicks++;
    if (footerTimer != null) clearTimeout(footerTimer);
    footerTimer = window.setTimeout(() => footerClicks = 0, 900);
    if (footerClicks >= 5) {
      footerClicks = 0;
      const on = !await isDevMode();
      await setDevMode(on);
      if (on) await refreshDevLog();
    }
  });
}
devRefreshBtn.addEventListener("click", refreshDevLog);
devCopyBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  let fromTs;
  let toTs;
  if (typeof tabId === "number") {
    const w = await send({ type: "ARES_SESSION_TAB_WINDOW", tabId });
    if (w?.ok && w.window) {
      fromTs = typeof w.window.fromTs === "number" ? w.window.fromTs : void 0;
      toTs = typeof w.window.toTs === "number" ? w.window.toTs : void 0;
    }
  }
  const r = await send({ type: "ARES_EXPORT_METRICS", limit: 500, tabId, fromTs, toTs });
  const json = r?.ok ? r.json ?? "" : JSON.stringify(r);
  await navigator.clipboard.writeText(json);
});
devClearBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  if (typeof tabId !== "number") return;
  await send({ type: "ARES_SESSION_RESET_TAB", tabId });
  await refreshDevLog();
});
devSessionStartBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  if (typeof tabId !== "number") return;
  await send({ type: "ARES_SESSION_START", tabId });
  await refreshDevLog();
});
devSessionStopBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  if (typeof tabId !== "number") return;
  await send({ type: "ARES_SESSION_STOP", tabId });
  await refreshDevLog();
});
devSessionStopAllBtn.addEventListener("click", async () => {
  await send({ type: "ARES_SESSION_STOP_ALL" });
  await refreshDevLog();
});
isDevMode().then((on) => setDevMode(on));
function renderPresets(data, enabled) {
  presetList.innerHTML = "";
  for (const p of PRESETS) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.className = "left";
    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = p.icon;
    const label = document.createElement("div");
    label.textContent = p.label;
    left.appendChild(icon);
    left.appendChild(label);
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = data[`preset_${p.key}`] !== false;
    toggle.disabled = !enabled;
    toggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ [`preset_${p.key}`]: toggle.checked });
      await send({ type: "ARES_SET_PRESET", presetKey: p.key, enabled: toggle.checked });
      await loadState();
    });
    row.appendChild(left);
    row.appendChild(toggle);
    presetList.appendChild(row);
  }
}
function renderCustomDomains(domains, enabled) {
  customList.innerHTML = "";
  const entries = (domains || []).map(
    (x) => typeof x === "string" ? { domain: x, enabled: true } : x
  );
  for (const e of entries) {
    const d = e.domain;
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.className = "left";
    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = "*";
    const label = document.createElement("div");
    label.textContent = d;
    left.appendChild(icon);
    left.appendChild(label);
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = e.enabled !== false;
    toggle.disabled = !enabled;
    toggle.addEventListener("change", async () => {
      await send({ type: "ARES_SET_CUSTOM_ENABLED", domain: d, enabled: toggle.checked });
      await loadState();
    });
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.disabled = !enabled;
    btn.addEventListener("click", async () => {
      await send({ type: "ARES_REMOVE_CUSTOM", domain: d });
      await loadState();
    });
    row.appendChild(left);
    row.appendChild(toggle);
    row.appendChild(btn);
    customList.appendChild(row);
  }
}
masterToggle.addEventListener("change", async () => {
  await send({ type: "ARES_SET_ENABLED", enabled: masterToggle.checked });
  await loadState();
});
ytAdsToggle.addEventListener("change", async () => {
  await send({ type: "ARES_SET_YT_ADS", enabled: ytAdsToggle.checked });
  await loadState();
});
resetYtAdsStatsBtn.addEventListener("click", async () => {
  await send({ type: "ARES_RESET_STATS" });
  await loadState();
});
addBtn.addEventListener("click", async () => {
  const dom = normalizeDomain(customDomainInput.value);
  if (!dom) return;
  customDomainInput.value = "";
  await send({ type: "ARES_ADD_CUSTOM", domain: dom });
  await loadState();
});
loadState();
