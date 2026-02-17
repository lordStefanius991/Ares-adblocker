export const KEY_ENABLED = "ares_enabled";
export const KEY_CUSTOM = "ares_custom_domains";
export const KEY_YT_ADS = "ares_yt_ads";
export const KEY_STATS = "ares_stats";

export type AresTrend = "increasing" | "decreasing" | "stable";

export const YT_ADS_BASE_ID = 15000;
export const CUSTOM_BASE_ID = 20000;
export const CUSTOM_MAX = 2000;

export const KEY_RULE_REGISTRY = "ares_rule_registry";
export type RuleSource = "yt_ads" | "preset" | "custom" | "unknown";

export type RuleMeta = {
  ruleId: number;
  source: RuleSource;
  label: string;
  urlFilter?: string;
  resourceTypes?: string[];
  priority?: number;
  presetKey?: string;
  domain?: string;
};

export type RequestLogEvent = {
  ts_ms: number;
  url: string;
  initiator: string | null;
  resource_type: string;
  matched_rule_id: string | null;
  trace?: RuleMeta;
  tab_id?: number;
  seq?: number;
};

export type AresStats = {
  ytAdsBlocked: number;
  ytAdsLastAt?: number;
};

// Preset “site blocker”
export type Preset = { key: string; ruleId: number; domains: string[] };

export const YT_AD_FILTERS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "pagead2.googlesyndication.com",
  "googleads.g.doubleclick.net",
  "adservice.google.com",
  "s.youtube.com",
] as const;

export const PRESETS: Preset[] = [
  { key: "youtube", ruleId: 1001, domains: ["www.youtube.com", "youtu.be", "youtube.com", "m.youtube.com"] },
  { key: "linkedin", ruleId: 1011, domains: ["linkedin.com", "www.linkedin.com"] },
  { key: "facebook", ruleId: 1013, domains: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com", "m.facebook.com"] },
];

// ---------------- Telemetry types ----------------

export type AresTopItem = { key: string; count: number };

export type AresAlert =
  | { type: "burst"; windowMs: number; count: number; threshold: number }
  | { type: string; [k: string]: unknown };

export type AresSeverity = "CLEAN" | "AD_HEAVY" | "AD_STORM";

export type AresMetrics = {
  ok: true;
  window: { seconds: number; events: number };
  topDomains: AresTopItem[];
  topRules: AresTopItem[];
  topResourceTypes: AresTopItem[];
  total: number;
  alerts: AresAlert[];
  severity: AresSeverity;
  severity_reasons: string[];
   trend: { windowSeconds: 10; now: number; prev: number; dir: AresTrend };
  score: {
    aggressiveness: number;
    level: "Low" | "Medium" | "High";
    eventsLast60s: number;
    uniqueDomains: number;
    maxBurstInWindow: number;
    burstWindowMs: number;
    burstThreshold: number;
    tabId?: number;
  };
};



// ---------------- Session types ----------------

export type AresSessionTabState = "RUNNING" | "FROZEN";

export type AresSessionTab = {
  state: AresSessionTabState;
  fromTs: number;
  toTs?: number; // present only when FROZEN
};

export type AresSessionStatus = {
  // map tabId -> session
  tabs: Record<string, AresSessionTab>;
};
