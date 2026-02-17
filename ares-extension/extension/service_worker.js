// extension/sw_types.ts
var KEY_ENABLED = "ares_enabled";
var KEY_CUSTOM = "ares_custom_domains";
var KEY_YT_ADS = "ares_yt_ads";
var KEY_STATS = "ares_stats";
var YT_ADS_BASE_ID = 15e3;
var CUSTOM_BASE_ID = 2e4;
var CUSTOM_MAX = 2e3;
var KEY_RULE_REGISTRY = "ares_rule_registry";
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

// extension/sw_rule_registry.ts
function ruleKey(id) {
  return String(id);
}
async function getRuleRegistry() {
  const data = await chrome.storage.local.get(KEY_RULE_REGISTRY);
  return data[KEY_RULE_REGISTRY] ?? {};
}
async function setRuleRegistry(reg) {
  await chrome.storage.local.set({ [KEY_RULE_REGISTRY]: reg });
}
async function mergeRuleRegistry(partial, removeIds) {
  const existing = await getRuleRegistry();
  for (const id of removeIds) delete existing[ruleKey(id)];
  for (const k of Object.keys(partial)) existing[k] = partial[k];
  await setRuleRegistry(existing);
}
async function clearRuleRegistry() {
  await setRuleRegistry({});
}

// extension/sw_dnr_rules.ts
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
function presetStorageKey(presetKey) {
  return `preset_${presetKey}`;
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
  const registryPatch = {};
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
        domain: filter
      };
    });
  }
  await mergeRuleRegistry(registryPatch, removeRuleIds);
}
async function setPresetEnabled(presetKey, enabled) {
  const p = PRESETS.find((x) => x.key === presetKey);
  if (!p) return;
  const removeRuleIds = presetRuleIds(p);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: enabled ? presetRules(p) : []
  });
  await chrome.storage.local.set({ [presetStorageKey(p.key)]: enabled });
  const registryPatch = {};
  if (enabled) {
    p.domains.forEach((d, i) => {
      const rid = p.ruleId + i;
      registryPatch[String(rid)] = {
        ruleId: rid,
        source: "preset",
        label: `Preset(${p.key}): ${d}`,
        urlFilter: `||${d}^`,
        resourceTypes: p.key === "youtube" ? void 0 : ["main_frame"],
        priority: p.key === "youtube" ? 1e6 : 1,
        presetKey: p.key,
        domain: d
      };
    });
  }
  await mergeRuleRegistry(registryPatch, removeRuleIds);
}
async function rebuildCustomRules(list) {
  const removeRuleIds = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);
  const enabledEntries = list.filter((x) => x.enabled);
  const addRules = enabledEntries.slice(0, CUSTOM_MAX).map((x, i) => ({
    id: CUSTOM_BASE_ID + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${x.domain}^`,
      resourceTypes: ["main_frame"]
    }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
  const registryPatch = {};
  enabledEntries.slice(0, CUSTOM_MAX).forEach((x, i) => {
    const rid = CUSTOM_BASE_ID + i;
    registryPatch[String(rid)] = {
      ruleId: rid,
      source: "custom",
      label: `Custom: ${x.domain}`,
      urlFilter: `||${x.domain}^`,
      resourceTypes: ["main_frame"],
      priority: 1,
      domain: x.domain
    };
  });
  await mergeRuleRegistry(registryPatch, removeRuleIds);
}
async function clearAllDynamicRules() {
  const ytRemove = YT_AD_FILTERS.map((_, i) => YT_ADS_BASE_ID + i);
  const customRemove = Array.from({ length: CUSTOM_MAX }, (_, i) => CUSTOM_BASE_ID + i);
  const presetRemove = PRESETS.flatMap((p) => presetRuleIds(p));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...ytRemove, ...customRemove, ...presetRemove],
    addRules: []
  });
  await clearRuleRegistry();
}
async function hydrateFromStorage() {
  const keys = [KEY_CUSTOM, KEY_YT_ADS, ...PRESETS.map((p) => presetStorageKey(p.key))];
  const data = await chrome.storage.local.get(keys);
  for (const p of PRESETS) {
    const on = data[presetStorageKey(p.key)] !== false;
    await setPresetEnabled(p.key, on);
  }
  const ytAds = data[KEY_YT_ADS] === true;
  await setYouTubeAdsBlocked(ytAds);
  const custom = await getCustomList();
  await rebuildCustomRules(custom);
}
async function setEnabled(enabled) {
  await chrome.storage.local.set({ [KEY_ENABLED]: enabled });
  if (enabled) await hydrateFromStorage();
  else await clearAllDynamicRules();
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

// extension/sw_stats_badge.ts
async function getStats() {
  const data = await chrome.storage.local.get(KEY_STATS);
  return data[KEY_STATS] ?? { ytAdsBlocked: 0 };
}
async function setStats(next) {
  await chrome.storage.local.set({ [KEY_STATS]: next });
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
async function incYouTubeAdsBlocked() {
  const s = await getStats();
  await setStats({
    ytAdsBlocked: (s.ytAdsBlocked ?? 0) + 1,
    ytAdsLastAt: Date.now()
  });
  await updateBadgeFromStats();
}

// extension/sw_telemetry.ts
var KEY_LOG = "ares_log_events";
var LOG_MAX = 2e3;
var KEY_META = "ares_log_meta";
var KEY_CHUNK_PREFIX = "ares_log_chunk_";
var CAPACITY = 2e3;
var CHUNK_SIZE = 100;
var CHUNKS = Math.ceil(CAPACITY / CHUNK_SIZE);
var FLUSH_MS = 800;
var pending = [];
var flushTimer = null;
var flushing = false;
var KEY_TELEMETRY_WHITELIST = "ares_telemetry_whitelist";
var WHITELIST_TTL_MS = 2e3;
var wlCache = null;
var wlLoadedAt = 0;
function normalizeWhitelist(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
async function loadWhitelistFromStorage() {
  const d = await chrome.storage.local.get(KEY_TELEMETRY_WHITELIST);
  return normalizeWhitelist(d[KEY_TELEMETRY_WHITELIST]);
}
async function getWhitelistCached() {
  const now = Date.now();
  if (wlCache && now - wlLoadedAt < WHITELIST_TTL_MS) return wlCache;
  const wl = await loadWhitelistFromStorage();
  wlCache = wl;
  wlLoadedAt = now;
  return wl;
}
function hostMatches(host, wl) {
  return wl.some((x) => host === x || host.endsWith("." + x));
}
var KEY_SESSION_STATUS = "ares_session_status";
var SESSION_TTL_MS = 2e3;
var sessionCache = null;
var sessionLoadedAt = 0;
var listenersAttached = false;
function ensureListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[KEY_SESSION_STATUS]) {
      sessionCache = null;
      sessionLoadedAt = 0;
    }
    if (changes[KEY_TELEMETRY_WHITELIST]) {
      wlCache = null;
      wlLoadedAt = 0;
    }
  });
}
function defaultSession() {
  return { tabs: {} };
}
function normalizeSession(v) {
  if (!v || typeof v !== "object") return defaultSession();
  const rawTabs = v.tabs;
  if (!rawTabs || typeof rawTabs !== "object") return defaultSession();
  const out = {};
  for (const [k, val] of Object.entries(rawTabs)) {
    if (!val || typeof val !== "object") continue;
    const state = val.state === "FROZEN" ? "FROZEN" : "RUNNING";
    const fromTs = typeof val.fromTs === "number" ? val.fromTs : 0;
    const toTs = typeof val.toTs === "number" ? val.toTs : void 0;
    if (fromTs > 0) {
      out[k] = state === "FROZEN" ? { state, fromTs, toTs } : { state, fromTs };
    }
  }
  return { tabs: out };
}
async function loadSessionFromStorage() {
  const d = await chrome.storage.local.get(KEY_SESSION_STATUS);
  return normalizeSession(d[KEY_SESSION_STATUS]);
}
async function saveSession(s) {
  await chrome.storage.local.set({ [KEY_SESSION_STATUS]: s });
}
async function getSessionCached() {
  ensureListeners();
  const now = Date.now();
  if (sessionCache && now - sessionLoadedAt < SESSION_TTL_MS) return sessionCache;
  const s = await loadSessionFromStorage();
  sessionCache = s;
  sessionLoadedAt = now;
  return s;
}
async function getSessionStatus() {
  return await getSessionCached();
}
async function sessionResetTab(tabId) {
  ensureListeners();
  const s = await getSessionCached();
  const key = String(tabId);
  if (!s.tabs[key]) return;
  delete s.tabs[key];
  await saveSession(s);
}
async function sessionStartTab(tabId) {
  ensureListeners();
  const s = await getSessionCached();
  s.tabs[String(tabId)] = { state: "RUNNING", fromTs: Date.now() };
  await saveSession(s);
}
async function sessionStopTab(tabId) {
  ensureListeners();
  const s = await getSessionCached();
  const key = String(tabId);
  const cur = s.tabs[key];
  if (!cur) return;
  s.tabs[key] = { state: "FROZEN", fromTs: cur.fromTs, toTs: Date.now() };
  await saveSession(s);
}
async function sessionStopAll() {
  ensureListeners();
  await saveSession(defaultSession());
}
async function getSessionWindowForTab(tabId) {
  const s = await getSessionCached();
  const cur = s.tabs[String(tabId)];
  if (!cur) return {};
  return { fromTs: cur.fromTs, toTs: cur.toTs, state: cur.state };
}
function chunkKey(i) {
  return `${KEY_CHUNK_PREFIX}${i}`;
}
function defaultMeta() {
  return {
    capacity: CAPACITY,
    chunkSize: CHUNK_SIZE,
    chunks: CHUNKS,
    writePos: 0,
    length: 0,
    seq: 0,
    lastTs: 0,
    migrated: false
  };
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}
function validateAndNormalizeMeta(raw) {
  const fresh = defaultMeta();
  if (!raw || typeof raw !== "object") return fresh;
  const m = raw;
  if (m.capacity !== CAPACITY || m.chunkSize !== CHUNK_SIZE || m.chunks !== CHUNKS) return fresh;
  const writePos = isFiniteNumber(m.writePos) ? clamp(m.writePos, 0, CAPACITY - 1) : 0;
  const length = isFiniteNumber(m.length) ? clamp(m.length, 0, CAPACITY) : 0;
  const seq = isFiniteNumber(m.seq) ? Math.max(0, Math.floor(m.seq)) : 0;
  const lastTs = isFiniteNumber(m.lastTs) ? Math.max(0, Math.floor(m.lastTs)) : 0;
  const migrated = typeof m.migrated === "boolean" ? m.migrated : false;
  return {
    capacity: CAPACITY,
    chunkSize: CHUNK_SIZE,
    chunks: CHUNKS,
    writePos,
    length,
    seq,
    lastTs,
    migrated
  };
}
function sanitizeChunkArray(arr) {
  const out = Array(CHUNK_SIZE).fill(null);
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < Math.min(arr.length, CHUNK_SIZE); i++) {
    const v = arr[i];
    if (v === null) {
      out[i] = null;
      continue;
    }
    if (v && typeof v === "object" && isFiniteNumber(v.ts_ms) && typeof v.url === "string") {
      out[i] = v;
    } else {
      out[i] = null;
    }
  }
  return out;
}
async function loadMeta() {
  try {
    const d = await chrome.storage.local.get(KEY_META);
    const raw = d[KEY_META];
    const normalized = validateAndNormalizeMeta(raw);
    if (!raw || normalized !== raw) {
      try {
        await chrome.storage.local.set({ [KEY_META]: normalized });
      } catch {
      }
    }
    return normalized;
  } catch {
    return defaultMeta();
  }
}
async function saveMeta(m) {
  try {
    const safe = validateAndNormalizeMeta(m);
    await chrome.storage.local.set({ [KEY_META]: safe });
  } catch {
  }
}
async function readChunk(i) {
  const idx = clamp(i, 0, CHUNKS - 1);
  const key = chunkKey(idx);
  try {
    const d = await chrome.storage.local.get(key);
    return sanitizeChunkArray(d[key]);
  } catch {
    return Array(CHUNK_SIZE).fill(null);
  }
}
async function writeChunk(i, arr) {
  const idx = clamp(i, 0, CHUNKS - 1);
  const key = chunkKey(idx);
  try {
    await chrome.storage.local.set({ [key]: sanitizeChunkArray(arr) });
  } catch {
  }
}
function normalizeEventForOrdering(ev, meta) {
  meta.seq = (meta.seq ?? 0) + 1;
  const ts = typeof ev.ts_ms === "number" ? ev.ts_ms : Date.now();
  const fixedTs = ts <= (meta.lastTs ?? 0) ? (meta.lastTs ?? 0) + 1 : ts;
  meta.lastTs = fixedTs;
  return { ...ev, seq: meta.seq, ts_ms: fixedTs };
}
async function appendBatchToRing(events) {
  if (events.length === 0) return;
  const meta = await loadMeta();
  meta.writePos = clamp(meta.writePos, 0, meta.capacity - 1);
  meta.length = clamp(meta.length, 0, meta.capacity);
  const dirty = /* @__PURE__ */ new Map();
  for (const raw of events) {
    const ev = normalizeEventForOrdering(raw, meta);
    const pos = meta.writePos;
    const cIndex = Math.floor(pos / meta.chunkSize);
    const offset = pos % meta.chunkSize;
    let chunk = dirty.get(cIndex);
    if (!chunk) {
      chunk = await readChunk(cIndex);
      dirty.set(cIndex, chunk);
    }
    chunk[offset] = ev;
    meta.writePos = (meta.writePos + 1) % meta.capacity;
    if (meta.length < meta.capacity) meta.length++;
  }
  for (const [idx, chunk] of dirty) {
    await writeChunk(idx, chunk);
  }
  await saveMeta(meta);
}
async function readTailFromRing(limit) {
  const meta = await loadMeta();
  const k = clamp(limit, 0, meta.length);
  if (k === 0) return [];
  let startPos = meta.writePos - k;
  while (startPos < 0) startPos += meta.capacity;
  const neededChunks = /* @__PURE__ */ new Set();
  for (let i = 0; i < k; i++) {
    const pos = (startPos + i) % meta.capacity;
    neededChunks.add(Math.floor(pos / meta.chunkSize));
  }
  const chunkMap = /* @__PURE__ */ new Map();
  for (const idx of neededChunks) {
    chunkMap.set(idx, await readChunk(idx));
  }
  const out = [];
  for (let i = 0; i < k; i++) {
    const pos = (startPos + i) % meta.capacity;
    const cIndex = Math.floor(pos / meta.chunkSize);
    const offset = pos % meta.chunkSize;
    const chunk = chunkMap.get(cIndex);
    const ev = chunk ? chunk[offset] : null;
    if (ev && typeof ev.ts_ms === "number") out.push(ev);
  }
  return out;
}
async function migrateLegacyIfNeeded() {
  const meta = await loadMeta();
  if (meta.migrated) return;
  const d = await chrome.storage.local.get(KEY_LOG);
  const arr = d[KEY_LOG];
  if (Array.isArray(arr) && arr.length > 0) {
    const legacy = arr;
    const tail = legacy.length > LOG_MAX ? legacy.slice(legacy.length - LOG_MAX) : legacy;
    try {
      await appendBatchToRing(tail);
      await chrome.storage.local.remove(KEY_LOG);
    } catch {
    }
  }
  meta.migrated = true;
  await saveMeta(meta);
}
async function flushLog() {
  if (flushing) return;
  flushing = true;
  try {
    if (pending.length === 0) return;
    await migrateLegacyIfNeeded();
    const toWrite = pending;
    pending = [];
    try {
      await appendBatchToRing(toWrite);
    } catch {
    }
  } finally {
    flushing = false;
  }
}
function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLog();
  }, FLUSH_MS);
}
var DEDUP_MS = 300;
var lastSeen = /* @__PURE__ */ new Map();
function shouldLog(ev) {
  let host = "";
  try {
    host = new URL(ev.url).hostname;
  } catch {
  }
  const key = `${ev.matched_rule_id ?? "UNKNOWN"}|${host}|${ev.resource_type}`;
  const now = ev.ts_ms;
  const last = lastSeen.get(key) ?? 0;
  if (now - last < DEDUP_MS) return false;
  lastSeen.set(key, now);
  if (lastSeen.size > 2e3) {
    for (const [k, t] of lastSeen) {
      if (now - t > 6e4) lastSeen.delete(k);
    }
  }
  return true;
}
async function exportLogRange(limit = 2e3, tabId, fromTs, toTs) {
  await flushLog();
  await migrateLegacyIfNeeded();
  let out = await readTailFromRing(limit);
  if (typeof tabId === "number") out = out.filter((e) => e.tab_id === tabId);
  if (typeof fromTs === "number") out = out.filter((e) => e.ts_ms >= fromTs);
  if (typeof toTs === "number") out = out.filter((e) => e.ts_ms <= toTs);
  if (out.length > limit) out = out.slice(out.length - limit);
  return out;
}
async function appendLogEvent(ev) {
  ensureListeners();
  let host = "";
  try {
    host = new URL(ev.url).hostname;
  } catch {
  }
  const wl = await getWhitelistCached();
  if (wl.length > 0 && !hostMatches(host, wl)) return;
  if (!shouldLog(ev)) return;
  console.log("[ARES][log]", {
    tab: ev.tab_id,
    host: (() => {
      try {
        return new URL(ev.url).hostname;
      } catch {
        return "?";
      }
    })(),
    rule: ev.matched_rule_id,
    type: ev.resource_type
  });
  pending.push(ev);
  if (pending.length > 5e3) {
    pending = pending.slice(pending.length - 2e3);
  }
  scheduleFlush();
}
async function exportLogTail(limit = 200) {
  await flushLog();
  await migrateLegacyIfNeeded();
  return await readTailFromRing(limit);
}
function mapDnrTypeToResourceType(t) {
  if (!t) return "Other";
  const s = String(t);
  if (s === "xmlhttprequest") return "Xhr";
  if (s === "main_frame") return "MainFrame";
  if (s === "sub_frame") return "SubFrame";
  if (s === "stylesheet") return "Stylesheet";
  if (s === "script") return "Script";
  if (s === "image") return "Image";
  if (s === "font") return "Font";
  if (s === "media") return "Media";
  if (s === "websocket") return "WebSocket";
  return s;
}
async function computeMetrics(limit = 500, tabId, fromTs, toTs) {
  const raw = await exportLogTail(limit);
  let events = typeof tabId === "number" ? raw.filter((e) => e.tab_id === tabId) : raw;
  if (typeof fromTs === "number") events = events.filter((e) => e.ts_ms >= fromTs);
  if (typeof toTs === "number") events = events.filter((e) => e.ts_ms <= toTs);
  let ordered = events;
  for (let i2 = 1; i2 < ordered.length; i2++) {
    if (ordered[i2].ts_ms < ordered[i2 - 1].ts_ms) {
      ordered = [...ordered].sort((a, b) => a.ts_ms - b.ts_ms);
      break;
    }
  }
  const now = typeof toTs === "number" ? toTs : Date.now();
  const rateWinSec = 10;
  const winMs = rateWinSec * 1e3;
  const rateNow = ordered.filter((e) => now - e.ts_ms <= winMs).length;
  const ratePrev = ordered.filter((e) => {
    const dt = now - e.ts_ms;
    return dt > winMs && dt <= 2 * winMs;
  }).length;
  const TREND_EPS = 3;
  const dir = rateNow >= ratePrev + TREND_EPS ? "increasing" : rateNow + TREND_EPS <= ratePrev ? "decreasing" : "stable";
  const last60 = ordered.filter((e) => now - e.ts_ms <= 6e4).length;
  const byDomain = /* @__PURE__ */ new Map();
  const byRule = /* @__PURE__ */ new Map();
  const byResourceType = /* @__PURE__ */ new Map();
  const BURST_WINDOW_MS = 300;
  const BURST_THRESHOLD = 3;
  let maxInWindow = 0;
  let i = 0;
  for (let j = 0; j < ordered.length; j++) {
    const t = ordered[j].ts_ms;
    while (ordered[i] && t - ordered[i].ts_ms > BURST_WINDOW_MS) i++;
    const count = j - i + 1;
    if (count > maxInWindow) maxInWindow = count;
  }
  const alerts = [];
  if (maxInWindow >= BURST_THRESHOLD) {
    alerts.push({
      type: "burst",
      windowMs: BURST_WINDOW_MS,
      count: maxInWindow,
      threshold: BURST_THRESHOLD
    });
  }
  for (const e of ordered) {
    try {
      const host = new URL(e.url).hostname;
      byDomain.set(host, (byDomain.get(host) ?? 0) + 1);
    } catch {
    }
    const ruleKey2 = e.trace?.label ?? (e.matched_rule_id ?? "UNKNOWN");
    byRule.set(ruleKey2, (byRule.get(ruleKey2) ?? 0) + 1);
    const rtype = e.resource_type ?? "Other";
    byResourceType.set(rtype, (byResourceType.get(rtype) ?? 0) + 1);
  }
  const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
  const uniqueDomains = byDomain.size;
  const events60 = last60;
  const burstMax = maxInWindow;
  const base = Math.min(60, events60 * 4) + Math.min(25, uniqueDomains * 3) + Math.min(15, Math.max(0, burstMax - BURST_THRESHOLD) * 5);
  const aggressiveness = Math.max(0, Math.min(100, Math.round(base)));
  const level = aggressiveness >= 70 ? "High" : aggressiveness >= 35 ? "Medium" : "Low";
  const rate60 = last60;
  let severity = "CLEAN";
  const reasons = [];
  if (burstMax >= 10 || rate60 >= 25) {
    severity = "AD_STORM";
  } else if (burstMax >= 4 || rate60 >= 8 || uniqueDomains >= 5) {
    severity = "AD_HEAVY";
  }
  if (rate60 >= 8) reasons.push(`rate60=${rate60}`);
  if (uniqueDomains >= 5) reasons.push(`uniqueDomains=${uniqueDomains}`);
  if (burstMax >= 4) reasons.push(`burstMax=${burstMax}/${BURST_WINDOW_MS}ms`);
  return {
    ok: true,
    window: { seconds: 60, events: last60 },
    topDomains: top(byDomain),
    topRules: top(byRule),
    topResourceTypes: top(byResourceType),
    total: ordered.length,
    alerts,
    severity,
    severity_reasons: reasons,
    trend: { windowSeconds: 10, now: rateNow, prev: ratePrev, dir },
    score: {
      aggressiveness,
      level,
      eventsLast60s: events60,
      uniqueDomains,
      maxBurstInWindow: burstMax,
      burstWindowMs: BURST_WINDOW_MS,
      burstThreshold: BURST_THRESHOLD,
      tabId: typeof tabId === "number" ? tabId : void 0
    }
  };
}

// extension/sw_dnr_debug.ts
var registryCache = {};
var registryLoadedAt = 0;
var REGISTRY_TTL_MS = 1e4;
async function getRegistryCached() {
  const now = Date.now();
  if (now - registryLoadedAt < REGISTRY_TTL_MS) {
    console.log("[ARES] Registry cache hit");
    return registryCache;
  }
  console.log("[ARES] Registry refresh from storage @", now);
  const regData = await chrome.storage.local.get(KEY_RULE_REGISTRY);
  const reg = regData[KEY_RULE_REGISTRY];
  registryCache = reg && typeof reg === "object" ? reg : {};
  registryLoadedAt = now;
  return registryCache;
}
function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
function isAdsHost(host) {
  return host.includes("doubleclick.net") || host.includes("googlesyndication.com") || host.includes("googleadservices.com") || host.includes("googleads.g.doubleclick.net") || host.includes("static.doubleclick.net");
}
function attachDnrDebugHook() {
  if (!chrome.declarativeNetRequest.onRuleMatchedDebug) return;
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const enabled = await getEnabled();
    if (!enabled) return;
    const id = info?.rule?.ruleId;
    const url = info?.request?.url;
    const tabId = typeof info?.request?.tabId === "number" ? info.request.tabId : void 0;
    const registry = await getRegistryCached();
    const trace = typeof id === "number" ? registry[String(id)] : void 0;
    if (typeof url === "string") {
      const host = safeHostname(url);
      if (host && isAdsHost(host)) {
        const initiator = typeof info?.request?.initiator === "string" ? info.request.initiator : null;
        const reqType = typeof info?.request?.type === "string" ? info.request.type : void 0;
        await appendLogEvent({
          ts_ms: Date.now(),
          url,
          initiator,
          resource_type: mapDnrTypeToResourceType(reqType),
          matched_rule_id: typeof id === "number" ? String(id) : "UNKNOWN",
          trace,
          tab_id: tabId
        });
      }
    }
    if (typeof id === "number" && id >= YT_ADS_BASE_ID && id < YT_ADS_BASE_ID + YT_AD_FILTERS.length) {
      await incYouTubeAdsBlocked();
    }
  });
}

// extension/sw_bus.ts
function attachMessageBus() {
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
        const tabId = typeof msg.tabId === "number" ? msg.tabId : void 0;
        const fromTs = typeof msg.fromTs === "number" ? msg.fromTs : void 0;
        const toTs = typeof msg.toTs === "number" ? msg.toTs : void 0;
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
        const tabId = typeof msg.tabId === "number" ? msg.tabId : _sender?.tab?.id;
        const fromTs = typeof msg.fromTs === "number" ? msg.fromTs : void 0;
        const toTs = typeof msg.toTs === "number" ? msg.toTs : void 0;
        return await computeMetrics(limit, tabId, fromTs, toTs);
      }
      if (msg?.type === "ARES_EXPORT_LOG_RANGE") {
        const limit = typeof msg.limit === "number" ? msg.limit : 2e3;
        const tabId = typeof msg.tabId === "number" ? msg.tabId : void 0;
        const fromTs = typeof msg.fromTs === "number" ? msg.fromTs : void 0;
        const toTs = typeof msg.toTs === "number" ? msg.toTs : void 0;
        const events = await exportLogRange(limit, tabId, fromTs, toTs);
        return { ok: true, events, json: JSON.stringify(events, null, 2) };
      }
      if (msg?.type === "ARES_LOG_TEST") {
        await appendLogEvent({
          ts_ms: Date.now(),
          url: "https://example.com/test",
          initiator: null,
          resource_type: "Xhr",
          matched_rule_id: "TEST"
        });
        return { ok: true };
      }
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
        const tabId = typeof msg.tabId === "number" ? msg.tabId : _sender?.tab?.id;
        if (typeof tabId !== "number") return { ok: false, error: "NO_TAB_ID" };
        if (!chrome.sidePanel?.open) return { ok: false, error: "SIDE_PANEL_NOT_AVAILABLE" };
        await chrome.sidePanel.open({ tabId });
        return { ok: true };
      }
      return { ok: false, error: "UNKNOWN_MESSAGE" };
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
}

// extension/service_worker.ts
attachDnrDebugHook();
attachMessageBus();
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
