// extension/service_worker.ts
export {};

const KEY_ENABLED = "ares_enabled";
const KEY_CUSTOM = "ares_custom_domains";
const KEY_YT_ADS = "ares_yt_ads";

const KEY_STATS = "ares_stats";

const YT_ADS_BASE_ID = 15000;
const CUSTOM_BASE_ID = 20000;
const CUSTOM_MAX = 2000;

type AresStats = {
  ytAdsBlocked: number;
  ytAdsLastAt?: number;
};

const YT_AD_FILTERS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "pagead2.googlesyndication.com",
  "googleads.g.doubleclick.net",
  "adservice.google.com",
  "s.youtube.com",
];

// Preset “site blocker”
type Preset = { key: string; ruleId: number; domains: string[] };

const PRESETS: Preset[] = [
  { key: "youtube", ruleId: 1001, domains: ["www.youtube.com", "youtu.be", "youtube.com", "m.youtube.com"] },
  { key: "linkedin", ruleId: 1011, domains: ["linkedin.com", "www.linkedin.com"] },
  { key: "facebook", ruleId: 1013, domains: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com", "m.facebook.com"] },
];

function presetRuleIds(p: Preset): number[] {
  return p.domains.map((_, i) => p.ruleId + i);
}

function presetRules(p: Preset): chrome.declarativeNetRequest.Rule[] {
  return p.domains.map((d, i) => {
    // YouTube preset: blocca “tutto” (non solo main_frame) perché spesso è quello che vuoi quando dici “blocca YouTube”
    const isYouTube = p.key === "youtube";

    return {
      id: p.ruleId + i,
      priority: isYouTube ? 1_000_000 : 1,
      action: { type: "block" as const },
      condition: {
        urlFilter: `||${d}^`,
        ...(isYouTube ? {} : { resourceTypes: ["main_frame"] as const }),
      },
    };
  });
}

/* =========================
   STORAGE HELPERS
========================= */

async function getEnabled(): Promise<boolean> {
  const data = await chrome.storage.local.get(KEY_ENABLED);
  return data[KEY_ENABLED] !== false;
}

type CustomEntry = string | { domain: string; enabled: boolean };

function normalizeCustomList(raw: any): { domain: string; enabled: boolean }[] {
  const arr: CustomEntry[] = Array.isArray(raw) ? raw : [];
  const out: { domain: string; enabled: boolean }[] = [];

  for (const item of arr) {
    if (typeof item === "string") out.push({ domain: item, enabled: true });
    else if (item && typeof item.domain === "string")
      out.push({ domain: item.domain, enabled: item.enabled !== false });
  }
  return out;
}

async function getCustomList(): Promise<{ domain: string; enabled: boolean }[]> {
  const data = await chrome.storage.local.get(KEY_CUSTOM);
  return normalizeCustomList(data[KEY_CUSTOM]);
}

async function saveCustomList(list: { domain: string; enabled: boolean }[]) {
  await chrome.storage.local.set({ [KEY_CUSTOM]: list });
}

/* =========================
   DNR RULE BUILDERS
========================= */

async function setYouTubeAdsBlocked(enabled: boolean) {
  const removeRuleIds = YT_AD_FILTERS.map((_, i) => YT_ADS_BASE_ID + i);

  const addRules: chrome.declarativeNetRequest.Rule[] = YT_AD_FILTERS.map((filter, i) => ({
    id: YT_ADS_BASE_ID + i,
    priority: 1,
    action: { type: "block" as const },
    condition: {
      urlFilter: `||${filter}`,
      resourceTypes: [
        "xmlhttprequest",
        "script",
        "image",
        "media",
        "sub_frame",
      ] as chrome.declarativeNetRequest.ResourceType[],
    },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: enabled ? addRules : [],
  });

  await chrome.storage.local.set({ [KEY_YT_ADS]: enabled });
}

async function setPresetEnabled(presetKey: string, enabled: boolean) {
  const p = PRESETS.find((x) => x.key === presetKey);
  if (!p) return;

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: presetRuleIds(p),
    addRules: enabled ? presetRules(p) : [],
  });
}

async function rebuildCustomRules(list: { domain: string; enabled: boolean }[]) {
  const removeIds = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);

  const enabledEntries = list.filter(x => x.enabled);
  const addRules: chrome.declarativeNetRequest.Rule[] = enabledEntries.slice(0, CUSTOM_MAX).map((x, i) => ({
    id: CUSTOM_BASE_ID + i,
    priority: 1,
    action: { type: "block" as const },
    condition: {
      // caret ^ rende il match più “pulito” (evita alcune false positive)
      urlFilter: `||${x.domain}^`,
      resourceTypes: ["main_frame"] as chrome.declarativeNetRequest.ResourceType[],
    },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

async function clearAllDynamicRules() {
  const ytRemove = YT_AD_FILTERS.map((_, i) => YT_ADS_BASE_ID + i);
  const customRemove = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);
  const presetRemove = PRESETS.flatMap(p => presetRuleIds(p));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...ytRemove, ...customRemove, ...presetRemove],
    addRules: [],
  });
}

async function hydrateFromStorage() {
  const keys = [
    KEY_CUSTOM,
    KEY_YT_ADS,
    ...PRESETS.map((p) => `preset_${p.key}`),
  ];

  const data = await chrome.storage.local.get(keys);

  // Presets
  for (const p of PRESETS) {
    const on = data[`preset_${p.key}`] !== false;
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: presetRuleIds(p),
      addRules: on ? presetRules(p) : [],
    });
  }

  // YouTube DNR “ad domains”
  const ytAds = data[KEY_YT_ADS] === true;
  await setYouTubeAdsBlocked(ytAds);

  // Custom domains
  const custom = await getCustomList();
  await rebuildCustomRules(custom);
}

/* =========================
   ENABLE/DISABLE (MASTER)
========================= */

async function setEnabled(enabled: boolean) {
  await chrome.storage.local.set({ [KEY_ENABLED]: enabled });

  if (enabled) {
    await hydrateFromStorage();
  } else {
    await clearAllDynamicRules();
  }
}

/* =========================
   CUSTOM DOMAIN OPS
========================= */

async function addCustomDomain(domain: string) {
  const list = await getCustomList();
  if (list.some(x => x.domain === domain)) return;

  list.push({ domain, enabled: true });
  await saveCustomList(list);
  await rebuildCustomRules(list);
}

async function removeCustomDomain(domain: string) {
  const list = await getCustomList();
  const next = list.filter(x => x.domain !== domain);
  if (next.length === list.length) return;

  await saveCustomList(next);
  await rebuildCustomRules(next);
}

async function setCustomDomainEnabled(domain: string, enabled: boolean) {
  const list = await getCustomList();
  const item = list.find(x => x.domain === domain);
  if (!item) return;

  item.enabled = enabled;
  await saveCustomList(list);
  await rebuildCustomRules(list);
}

/* =========================
   STATS + BADGE
========================= */

async function getStats(): Promise<AresStats> {
  const data = await chrome.storage.local.get(KEY_STATS);
  return (data[KEY_STATS] as AresStats) ?? { ytAdsBlocked: 0 };
}

async function setStats(next: AresStats): Promise<void> {
  await chrome.storage.local.set({ [KEY_STATS]: next });
}

async function incYouTubeAdsBlocked(): Promise<void> {
  const s = await getStats();
  await setStats({
    ytAdsBlocked: (s.ytAdsBlocked ?? 0) + 1,
    ytAdsLastAt: Date.now(),
  });
  await updateBadgeFromStats();
}

async function updateBadgeFromStats(): Promise<void> {
  const enabled = await getEnabled();
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const s = await getStats();
  const n = s.ytAdsBlocked ?? 0;
  const text = n <= 0 ? "" : (n > 999 ? "999+" : String(n));

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#E53935" });
}

/* =========================
   DNR DEBUG HOOK (COUNTS)
========================= */

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const enabled = await getEnabled();
    if (!enabled) return;

    const id = info?.rule?.ruleId;
    if (
      typeof id === "number" &&
      id >= YT_ADS_BASE_ID &&
      id < YT_ADS_BASE_ID + YT_AD_FILTERS.length
    ) {
      await incYouTubeAdsBlocked();
    }
  });
}

/* =========================
   LIFECYCLE
========================= */

chrome.runtime.onInstalled.addListener(async () => {
  // default ON
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




/* =========================
   MESSAGE BUS (popup)
========================= */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "ARES_SET_ENABLED") {
      await setEnabled(!!msg.enabled);
      await updateBadgeFromStats();
      return { ok: true };
    }

    if (msg?.type === "ARES_SET_PRESET") {
      // popup salva già preset_<key> in storage, qui applichiamo le regole
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
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));

  return true;
});
