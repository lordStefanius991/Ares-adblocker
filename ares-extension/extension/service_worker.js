// extension/service_worker.ts
var KEY_ENABLED = "ares_enabled";
var KEY_CUSTOM = "ares_custom_domains";
var KEY_YT_ADS = "ares_yt_ads";
var KEY_STATS = "ares_stats";
var YT_ADS_BASE_ID = 15e3;
var CUSTOM_BASE_ID = 2e4;
var CUSTOM_MAX = 2e3;
var YT_AD_FILTERS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "pagead2.googlesyndication.com",
  "googleads.g.doubleclick.net",
  "adservice.google.com",
  "s.youtube.com"
];
var PRESETS = [
  { key: "youtube", ruleId: 1001, domains: ["www.youtube.com", "youtu.be", "youtube.com", "m.youtube.com"] },
  { key: "linkedin", ruleId: 1011, domains: ["linkedin.com", "www.linkedin.com"] },
  { key: "facebook", ruleId: 1013, domains: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com", "m.facebook.com"] }
];
function presetRuleIds(p) {
  return p.domains.map((_, i) => p.ruleId + i);
}
function presetRules(p) {
  return p.domains.map((d, i) => {
    const isYouTube = p.key === "youtube";
    return {
      id: p.ruleId + i,
      priority: isYouTube ? 1e6 : 1,
      action: { type: "block" },
      condition: {
        urlFilter: `||${d}^`,
        ...isYouTube ? {} : { resourceTypes: ["main_frame"] }
      }
    };
  });
}
async function getEnabled() {
  const data = await chrome.storage.local.get(KEY_ENABLED);
  return data[KEY_ENABLED] !== false;
}
function normalizeCustomList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of arr) {
    if (typeof item === "string") out.push({ domain: item, enabled: true });
    else if (item && typeof item.domain === "string")
      out.push({ domain: item.domain, enabled: item.enabled !== false });
  }
  return out;
}
async function getCustomList() {
  const data = await chrome.storage.local.get(KEY_CUSTOM);
  return normalizeCustomList(data[KEY_CUSTOM]);
}
async function saveCustomList(list) {
  await chrome.storage.local.set({ [KEY_CUSTOM]: list });
}
async function setYouTubeAdsBlocked(enabled) {
  const removeRuleIds = YT_AD_FILTERS.map((_, i) => YT_ADS_BASE_ID + i);
  const addRules = YT_AD_FILTERS.map((filter, i) => ({
    id: YT_ADS_BASE_ID + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${filter}`,
      resourceTypes: [
        "xmlhttprequest",
        "script",
        "image",
        "media",
        "sub_frame"
      ]
    }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: enabled ? addRules : []
  });
  await chrome.storage.local.set({ [KEY_YT_ADS]: enabled });
}
async function setPresetEnabled(presetKey, enabled) {
  const p = PRESETS.find((x) => x.key === presetKey);
  if (!p) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: presetRuleIds(p),
    addRules: enabled ? presetRules(p) : []
  });
}
async function rebuildCustomRules(list) {
  const removeIds = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);
  const enabledEntries = list.filter((x) => x.enabled);
  const addRules = enabledEntries.slice(0, CUSTOM_MAX).map((x, i) => ({
    id: CUSTOM_BASE_ID + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      // caret ^ rende il match più “pulito” (evita alcune false positive)
      urlFilter: `||${x.domain}^`,
      resourceTypes: ["main_frame"]
    }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules
  });
}
async function clearAllDynamicRules() {
  const ytRemove = YT_AD_FILTERS.map((_, i) => YT_ADS_BASE_ID + i);
  const customRemove = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);
  const presetRemove = PRESETS.flatMap((p) => presetRuleIds(p));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...ytRemove, ...customRemove, ...presetRemove],
    addRules: []
  });
}
async function hydrateFromStorage() {
  const keys = [
    KEY_CUSTOM,
    KEY_YT_ADS,
    ...PRESETS.map((p) => `preset_${p.key}`)
  ];
  const data = await chrome.storage.local.get(keys);
  for (const p of PRESETS) {
    const on = data[`preset_${p.key}`] !== false;
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: presetRuleIds(p),
      addRules: on ? presetRules(p) : []
    });
  }
  const ytAds = data[KEY_YT_ADS] === true;
  await setYouTubeAdsBlocked(ytAds);
  const custom = await getCustomList();
  await rebuildCustomRules(custom);
}
async function setEnabled(enabled) {
  await chrome.storage.local.set({ [KEY_ENABLED]: enabled });
  if (enabled) {
    await hydrateFromStorage();
  } else {
    await clearAllDynamicRules();
  }
}
async function addCustomDomain(domain) {
  const list = await getCustomList();
  if (list.some((x) => x.domain === domain)) return;
  list.push({ domain, enabled: true });
  await saveCustomList(list);
  await rebuildCustomRules(list);
}
async function removeCustomDomain(domain) {
  const list = await getCustomList();
  const next = list.filter((x) => x.domain !== domain);
  if (next.length === list.length) return;
  await saveCustomList(next);
  await rebuildCustomRules(next);
}
async function setCustomDomainEnabled(domain, enabled) {
  const list = await getCustomList();
  const item = list.find((x) => x.domain === domain);
  if (!item) return;
  item.enabled = enabled;
  await saveCustomList(list);
  await rebuildCustomRules(list);
}
async function getStats() {
  const data = await chrome.storage.local.get(KEY_STATS);
  return data[KEY_STATS] ?? { ytAdsBlocked: 0 };
}
async function setStats(next) {
  await chrome.storage.local.set({ [KEY_STATS]: next });
}
async function incYouTubeAdsBlocked() {
  const s = await getStats();
  await setStats({
    ytAdsBlocked: (s.ytAdsBlocked ?? 0) + 1,
    ytAdsLastAt: Date.now()
  });
  await updateBadgeFromStats();
}
async function updateBadgeFromStats() {
  const enabled = await getEnabled();
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const s = await getStats();
  const n = s.ytAdsBlocked ?? 0;
  const text = n <= 0 ? "" : n > 999 ? "999+" : String(n);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#E53935" });
}
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const enabled = await getEnabled();
    if (!enabled) return;
    const id = info?.rule?.ruleId;
    if (typeof id === "number" && id >= YT_ADS_BASE_ID && id < YT_ADS_BASE_ID + YT_AD_FILTERS.length) {
      await incYouTubeAdsBlocked();
    }
  });
}
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [KEY_ENABLED]: true });
  await hydrateFromStorage();
  await updateBadgeFromStats();
});
chrome.runtime.onStartup.addListener(async () => {
  const enabled = await getEnabled();
  if (enabled) await hydrateFromStorage();
  else await clearAllDynamicRules();
  await updateBadgeFromStats();
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "ARES_SET_ENABLED") {
      await setEnabled(!!msg.enabled);
      await updateBadgeFromStats();
      return { ok: true };
    }
    if (msg?.type === "ARES_SET_PRESET") {
      await setPresetEnabled(String(msg.presetKey), !!msg.enabled);
      return { ok: true };
    }
    if (msg?.type === "ARES_SET_YT_ADS") {
      await setYouTubeAdsBlocked(!!msg.enabled);
      await updateBadgeFromStats();
      return { ok: true };
    }
    if (msg?.type === "ARES_ADD_CUSTOM") {
      await addCustomDomain(String(msg.domain));
      return { ok: true };
    }
    if (msg?.type === "ARES_REMOVE_CUSTOM") {
      await removeCustomDomain(String(msg.domain));
      return { ok: true };
    }
    if (msg?.type === "ARES_SET_CUSTOM_ENABLED") {
      await setCustomDomainEnabled(String(msg.domain), !!msg.enabled);
      return { ok: true };
    }
    if (msg?.type === "ARES_GET_STATS") {
      const s = await getStats();
      return { ok: true, stats: s };
    }
    if (msg?.type === "ARES_RESET_STATS") {
      await setStats({ ytAdsBlocked: 0 });
      await updateBadgeFromStats();
      return { ok: true };
    }
    return { ok: false, error: "Unknown message" };
  })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
