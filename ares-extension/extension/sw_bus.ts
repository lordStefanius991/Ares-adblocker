import {
  setEnabled,
  setPresetEnabled,
  setYouTubeAdsBlocked,
  addCustomDomain,
  removeCustomDomain,
  setCustomDomainEnabled,
} from "./sw_dnr_rules";

import { getStats, setStats, updateBadgeFromStats } from "./sw_stats_badge";

import {
  exportLogTail,
  exportLogRange,
  appendLogEvent,
  computeMetrics,
  sessionStartTab,
  sessionStopTab,
  sessionStopAll,
  sessionResetTab,
  getSessionStatus,
  getSessionWindowForTab,
} from "./sw_telemetry";

export function attachMessageBus() {
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

      if (msg?.type === "ARES_EXPORT_METRICS") {
        const limit = typeof msg.limit === "number" ? msg.limit : 500;
        const tabId = typeof msg.tabId === "number" ? msg.tabId : undefined;
        const fromTs = typeof msg.fromTs === "number" ? msg.fromTs : undefined;
        const toTs = typeof msg.toTs === "number" ? msg.toTs : undefined;
        const m = await computeMetrics(limit, tabId, fromTs, toTs);
        return { ok: true, metrics: m, json: JSON.stringify(m, null, 2) };
      }

      if (msg?.type === "ARES_RESET_STATS") {
        await setStats({ ytAdsBlocked: 0 });
        await updateBadgeFromStats();
        return { ok: true };
      }

      if (msg?.type === "ARES_EXPORT_LOG") {
        const limit = typeof msg.limit === "number" ? msg.limit : 200;
        const events = await exportLogTail(limit);
        return { ok: true, events, json: JSON.stringify(events, null, 2) };
      }

      if (msg?.type === "ARES_GET_METRICS") {
        const limit = typeof msg.limit === "number" ? msg.limit : 500;
        const tabId =
          typeof msg.tabId === "number"
            ? msg.tabId
            : _sender?.tab?.id;

        const fromTs = typeof msg.fromTs === "number" ? msg.fromTs : undefined;
        const toTs = typeof msg.toTs === "number" ? msg.toTs : undefined;

        return await computeMetrics(limit, tabId, fromTs, toTs);
      }

      if (msg?.type === "ARES_EXPORT_LOG_RANGE") {
        const limit = typeof msg.limit === "number" ? msg.limit : 2000;
        const tabId = typeof msg.tabId === "number" ? msg.tabId : undefined;
        const fromTs = typeof msg.fromTs === "number" ? msg.fromTs : undefined;
        const toTs = typeof msg.toTs === "number" ? msg.toTs : undefined;

        const events = await exportLogRange(limit, tabId, fromTs, toTs);
        return { ok: true, events, json: JSON.stringify(events, null, 2) };
      }

      if (msg?.type === "ARES_LOG_TEST") {
        await appendLogEvent({
          ts_ms: Date.now(),
          url: "https://example.com/test",
          initiator: null,
          resource_type: "Xhr",
          matched_rule_id: "TEST",
        });
        return { ok: true };
      }

      // -------- Session API --------

      if (msg?.type === "ARES_SESSION_START") {
        const tabId = Number(msg.tabId);
        if (!Number.isFinite(tabId)) return { ok: false, error: "BAD_TAB_ID" };
        await sessionStartTab(tabId);
        return { ok: true };
      }

      if (msg?.type === "ARES_SESSION_STOP") {
        const tabId = Number(msg.tabId);
        if (!Number.isFinite(tabId)) return { ok: false, error: "BAD_TAB_ID" };
        await sessionStopTab(tabId);
        return { ok: true };
      }

      if (msg?.type === "ARES_SESSION_RESET_TAB") {
        const tabId = Number(msg.tabId);
        if (!Number.isFinite(tabId)) return { ok: false, error: "BAD_TAB_ID" };
        await sessionResetTab(tabId);
        return { ok: true };
      }

      if (msg?.type === "ARES_SESSION_STOP_ALL") {
        await sessionStopAll();
        return { ok: true };
      }

      if (msg?.type === "ARES_SESSION_STATUS") {
        const s = await getSessionStatus();
        return { ok: true, session: s };
      }

      if (msg?.type === "ARES_SESSION_TAB_WINDOW") {
        const tabId = Number(msg.tabId);
        if (!Number.isFinite(tabId)) return { ok: false, error: "BAD_TAB_ID" };
        const w = await getSessionWindowForTab(tabId);
        return { ok: true, window: w };
      }

     if (msg?.type === "ARES_OPEN_PANEL") {
        const tabId =
          typeof msg.tabId === "number"
            ? msg.tabId
            : _sender?.tab?.id;

        if (typeof tabId !== "number") return { ok: false, error: "NO_TAB_ID" };

        // Safety: API disponibile solo su Chrome che supporta sidePanel
        if (!chrome.sidePanel?.open) return { ok: false, error: "SIDE_PANEL_NOT_AVAILABLE" };

        // Apri il pannello sul tab corrente
        await chrome.sidePanel.open({ tabId });

        return { ok: true };
      }

      return { ok: false, error: "UNKNOWN_MESSAGE" };
    })()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));

    return true;
  });
}
