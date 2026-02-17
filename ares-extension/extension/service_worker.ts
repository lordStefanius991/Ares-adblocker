// extension/service_worker.ts
export {};

import { getEnabled, hydrateFromStorage, clearAllDynamicRules } from "./sw_dnr_rules";
import { updateBadgeFromStats } from "./sw_stats_badge";
import { attachDnrDebugHook } from "./sw_dnr_debug";
import { attachMessageBus } from "./sw_bus";

attachDnrDebugHook();
attachMessageBus();

/* =========================
   LIFECYCLE
========================= */

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ ares_enabled: true });
  await hydrateFromStorage();
  await updateBadgeFromStats();
});

chrome.runtime.onStartup.addListener(async () => {
  const enabled = await getEnabled();
  if (enabled) await hydrateFromStorage();
  else await clearAllDynamicRules();
  await updateBadgeFromStats();
});
