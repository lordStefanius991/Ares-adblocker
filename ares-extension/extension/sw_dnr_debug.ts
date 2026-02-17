import { YT_ADS_BASE_ID, YT_AD_FILTERS, KEY_RULE_REGISTRY, RuleMeta } from "./sw_types";
import { getEnabled } from "./sw_dnr_rules";
import { incYouTubeAdsBlocked } from "./sw_stats_badge";
import { appendLogEvent, mapDnrTypeToResourceType } from "./sw_telemetry";

let registryCache: Record<string, RuleMeta> = {};
let registryLoadedAt = 0;

// TTL (puoi lasciarlo a 10s: con invalidazione è quasi irrilevante)
const REGISTRY_TTL_MS = 10_000;

// invalidazione su update registry
let registryListenerAttached = false;
function ensureRegistryListener() {
  if (registryListenerAttached) return;
  registryListenerAttached = true;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[KEY_RULE_REGISTRY]) {
      registryCache = {};
      registryLoadedAt = 0;
    }
  });
}

async function getRegistryCached(): Promise<Record<string, RuleMeta>> {
  const now = Date.now();

  if (now - registryLoadedAt < REGISTRY_TTL_MS) {
    console.log("[ARES] Registry cache hit");
    return registryCache;
  }

  console.log("[ARES] Registry refresh from storage @", now);

  const regData = await chrome.storage.local.get(KEY_RULE_REGISTRY);
  const reg = regData[KEY_RULE_REGISTRY];

  registryCache =
    reg && typeof reg === "object"
      ? (reg as Record<string, RuleMeta>)
      : {};

  registryLoadedAt = now;
  return registryCache;
}


function safeHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

function isAdsHost(host: string): boolean {
  return (
    host.includes("doubleclick.net") ||
    host.includes("googlesyndication.com") ||
    host.includes("googleadservices.com") ||
    host.includes("googleads.g.doubleclick.net") ||
    host.includes("static.doubleclick.net")
  );
}

export function attachDnrDebugHook() {
  if (!chrome.declarativeNetRequest.onRuleMatchedDebug) return;

  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const enabled = await getEnabled();
    if (!enabled) return;

    const id = info?.rule?.ruleId;
    const url = info?.request?.url;

    const tabId =
      typeof (info as any)?.request?.tabId === "number"
        ? ((info as any).request.tabId as number)
        : undefined;

    const registry = await getRegistryCached();
    const trace = typeof id === "number" ? registry[String(id)] : undefined;

    if (typeof url === "string") {
      const host = safeHostname(url);
      if (host && isAdsHost(host)) {
        const initiator =
          typeof info?.request?.initiator === "string" ? info.request.initiator : null;

        const reqType =
          typeof (info as any)?.request?.type === "string"
            ? ((info as any).request.type as string)
            : undefined;

        await appendLogEvent({
          ts_ms: Date.now(),
          url,
          initiator,
          resource_type: mapDnrTypeToResourceType(reqType),
          matched_rule_id: typeof id === "number" ? String(id) : "UNKNOWN",
          trace,
          tab_id: tabId,
        });
      }
    }

    if (
      typeof id === "number" &&
      id >= YT_ADS_BASE_ID &&
      id < YT_ADS_BASE_ID + YT_AD_FILTERS.length
    ) {
      await incYouTubeAdsBlocked();
    }
  });
}
