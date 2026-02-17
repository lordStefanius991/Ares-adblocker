import { AresStats, KEY_STATS } from "./sw_types";
import { getEnabled } from "./sw_dnr_rules";

export async function getStats(): Promise<AresStats> {
  const data = await chrome.storage.local.get(KEY_STATS);
  return (data[KEY_STATS] as AresStats) ?? { ytAdsBlocked: 0 };
}

export async function setStats(next: AresStats): Promise<void> {
  await chrome.storage.local.set({ [KEY_STATS]: next });
}

export async function updateBadgeFromStats(): Promise<void> {
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

export async function incYouTubeAdsBlocked(): Promise<void> {
  const s = await getStats();
  await setStats({
    ytAdsBlocked: (s.ytAdsBlocked ?? 0) + 1,
    ytAdsLastAt: Date.now(),
  });
  await updateBadgeFromStats();
}
