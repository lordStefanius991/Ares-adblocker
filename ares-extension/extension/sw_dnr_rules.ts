import {
  KEY_ENABLED,
  KEY_CUSTOM,
  KEY_YT_ADS,
  YT_ADS_BASE_ID,
  CUSTOM_BASE_ID,
  CUSTOM_MAX,
  PRESETS,
  Preset,
  YT_AD_FILTERS,
  RuleMeta,
} from "./sw_types";

import { mergeRuleRegistry, clearRuleRegistry } from "./sw_rule_registry";

type CustomEntry = string | { domain: string; enabled: boolean };

/* =========================
   PRESET HELPERS
========================= */

function presetRuleIds(p: Preset): number[] {
  return p.domains.map((_, i) => p.ruleId + i);
}

function presetRules(p: Preset): chrome.declarativeNetRequest.Rule[] {
  return p.domains.map((d, i) => {
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

function presetStorageKey(presetKey: string) {
  return `preset_${presetKey}`;
}

/* =========================
   STORAGE HELPERS
========================= */

export async function getEnabled(): Promise<boolean> {
  const data = await chrome.storage.local.get(KEY_ENABLED);
  return data[KEY_ENABLED] !== false;
}

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

export async function getCustomList(): Promise<{ domain: string; enabled: boolean }[]> {
  const data = await chrome.storage.local.get(KEY_CUSTOM);
  return normalizeCustomList(data[KEY_CUSTOM]);
}

async function saveCustomList(list: { domain: string; enabled: boolean }[]) {
  await chrome.storage.local.set({ [KEY_CUSTOM]: list });
}

/* =========================
   DNR RULE BUILDERS + REGISTRY
========================= */

export async function setYouTubeAdsBlocked(enabled: boolean) {
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

  // registry patch (only this range)
  const registryPatch: Record<string, RuleMeta> = {};
  if (enabled) {
    YT_AD_FILTERS.forEach((filter, i) => {
      const rid = YT_ADS_BASE_ID + i;
      registryPatch[String(rid)] = {
        ruleId: rid,
        source: "yt_ads",
        label: `YT Ads: ${filter}`,
        urlFilter: `||${filter}`,
        resourceTypes: ["xmlhttprequest", "script", "image", "media", "sub_frame"],
        priority: 1,
        domain: filter,
      };
    });
  }
  await mergeRuleRegistry(registryPatch, removeRuleIds);
}

export async function setPresetEnabled(presetKey: string, enabled: boolean) {
  const p = PRESETS.find((x) => x.key === presetKey);
  if (!p) return;

  const removeRuleIds = presetRuleIds(p);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: enabled ? presetRules(p) : [],
  });

  await chrome.storage.local.set({ [presetStorageKey(p.key)]: enabled });

  const registryPatch: Record<string, RuleMeta> = {};
  if (enabled) {
    p.domains.forEach((d, i) => {
      const rid = p.ruleId + i;
      registryPatch[String(rid)] = {
        ruleId: rid,
        source: "preset",
        label: `Preset(${p.key}): ${d}`,
        urlFilter: `||${d}^`,
        resourceTypes: p.key === "youtube" ? undefined : ["main_frame"],
        priority: p.key === "youtube" ? 1_000_000 : 1,
        presetKey: p.key,
        domain: d,
      };
    });
  }
  await mergeRuleRegistry(registryPatch, removeRuleIds);
}

export async function rebuildCustomRules(list: { domain: string; enabled: boolean }[]) {
  const removeRuleIds = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);

  const enabledEntries = list.filter((x) => x.enabled);

  const addRules: chrome.declarativeNetRequest.Rule[] = enabledEntries
    .slice(0, CUSTOM_MAX)
    .map((x, i) => ({
      id: CUSTOM_BASE_ID + i,
      priority: 1,
      action: { type: "block" as const },
      condition: {
        urlFilter: `||${x.domain}^`,
        resourceTypes: ["main_frame"] as chrome.declarativeNetRequest.ResourceType[],
      },
    }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });

  const registryPatch: Record<string, RuleMeta> = {};
  enabledEntries.slice(0, CUSTOM_MAX).forEach((x, i) => {
    const rid = CUSTOM_BASE_ID + i;
    registryPatch[String(rid)] = {
      ruleId: rid,
      source: "custom",
      label: `Custom: ${x.domain}`,
      urlFilter: `||${x.domain}^`,
      resourceTypes: ["main_frame"],
      priority: 1,
      domain: x.domain,
    };
  });

  await mergeRuleRegistry(registryPatch, removeRuleIds);
}

/* =========================
   CLEAR / HYDRATE
========================= */

export async function clearAllDynamicRules() {
  const ytRemove = YT_AD_FILTERS.map((_, i) => YT_ADS_BASE_ID + i);
  const customRemove = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);
  const presetRemove = PRESETS.flatMap((p) => presetRuleIds(p));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...ytRemove, ...customRemove, ...presetRemove],
    addRules: [],
  });

  // also clear registry to avoid stale traces
  await clearRuleRegistry();
}

export async function hydrateFromStorage() {
  const keys = [KEY_CUSTOM, KEY_YT_ADS, ...PRESETS.map((p) => presetStorageKey(p.key))];
  const data = await chrome.storage.local.get(keys);

  // presets (apply + registry)
  for (const p of PRESETS) {
    const on = data[presetStorageKey(p.key)] !== false;
    await setPresetEnabled(p.key, on);
  }

  // yt ads (apply + registry)
  const ytAds = data[KEY_YT_ADS] === true;
  await setYouTubeAdsBlocked(ytAds);

  // custom (apply + registry)
  const custom = await getCustomList();
  await rebuildCustomRules(custom);
}

/* =========================
   ENABLE/DISABLE (MASTER)
========================= */

export async function setEnabled(enabled: boolean) {
  await chrome.storage.local.set({ [KEY_ENABLED]: enabled });
  if (enabled) await hydrateFromStorage();
  else await clearAllDynamicRules();
}

/* =========================
   CUSTOM DOMAIN OPS
========================= */

export async function addCustomDomain(domain: string) {
  const list = await getCustomList();
  if (list.some((x) => x.domain === domain)) return;

  list.push({ domain, enabled: true });
  await saveCustomList(list);
  await rebuildCustomRules(list);
}

export async function removeCustomDomain(domain: string) {
  const list = await getCustomList();
  const next = list.filter((x) => x.domain !== domain);
  if (next.length === list.length) return;

  await saveCustomList(next);
  await rebuildCustomRules(next);
}

export async function setCustomDomainEnabled(domain: string, enabled: boolean) {
  const list = await getCustomList();
  const item = list.find((x) => x.domain === domain);
  if (!item) return;

  item.enabled = enabled;
  await saveCustomList(list);
  await rebuildCustomRules(list);
}
