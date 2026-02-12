// extension/popup.ts
var KEY_ENABLED = "ares_enabled";
var KEY_CUSTOM = "ares_custom_domains";
var KEY_YT_ADS = "ares_yt_ads";
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
function setStatus(enabled) {
  statusEl.textContent = enabled ? "ARES enabled" : "ARES disabled (rules paused)";
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
