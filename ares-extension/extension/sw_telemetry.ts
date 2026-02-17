import { RequestLogEvent, AresAlert, AresMetrics, AresTopItem, AresSessionStatus, AresSessionTab } from "./sw_types";

// === Telemetry v2 (local-first, batched, ring-buffer CHUNKED) ===

// Legacy (per migrazione)
const KEY_LOG = "ares_log_events";
const LOG_MAX = 2000;

// New ring buffer (chunked)
const KEY_META = "ares_log_meta";
const KEY_CHUNK_PREFIX = "ares_log_chunk_";

const CAPACITY = 2000;
const CHUNK_SIZE = 100;
const CHUNKS = Math.ceil(CAPACITY / CHUNK_SIZE);

const FLUSH_MS = 800;

let pending: RequestLogEvent[] = [];
let flushTimer: number | null = null;
let flushing = false;

// ---------------- Whitelist ----------------

const KEY_TELEMETRY_WHITELIST = "ares_telemetry_whitelist";

const WHITELIST_TTL_MS = 2000;
let wlCache: string[] | null = null;
let wlLoadedAt = 0;

function normalizeWhitelist(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
}

async function loadWhitelistFromStorage(): Promise<string[]> {
  const d = await chrome.storage.local.get(KEY_TELEMETRY_WHITELIST);
  return normalizeWhitelist(d[KEY_TELEMETRY_WHITELIST]);
}

async function getWhitelistCached(): Promise<string[]> {
  const now = Date.now();
  if (wlCache && (now - wlLoadedAt) < WHITELIST_TTL_MS) return wlCache;

  const wl = await loadWhitelistFromStorage();
  wlCache = wl;
  wlLoadedAt = now;
  return wl;
}

function hostMatches(host: string, wl: string[]): boolean {
  return wl.some(x => host === x || host.endsWith("." + x));
}

// ---------------- Session (freeze-able) ----------------

const KEY_SESSION_STATUS = "ares_session_status";

const SESSION_TTL_MS = 2000;
let sessionCache: AresSessionStatus | null = null;
let sessionLoadedAt = 0;

let listenersAttached = false;
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

function defaultSession(): AresSessionStatus {
  return { tabs: {} };
}

function normalizeSession(v: unknown): AresSessionStatus {
  if (!v || typeof v !== "object") return defaultSession();
  const rawTabs = (v as any).tabs;
  if (!rawTabs || typeof rawTabs !== "object") return defaultSession();

  const out: Record<string, AresSessionTab> = {};
  for (const [k, val] of Object.entries(rawTabs as Record<string, any>)) {
    if (!val || typeof val !== "object") continue;
    const state = val.state === "FROZEN" ? "FROZEN" : "RUNNING";
    const fromTs = typeof val.fromTs === "number" ? val.fromTs : 0;
    const toTs = typeof val.toTs === "number" ? val.toTs : undefined;
    if (fromTs > 0) {
      out[k] = state === "FROZEN" ? { state, fromTs, toTs } : { state, fromTs };
    }
  }
  return { tabs: out };
}

async function loadSessionFromStorage(): Promise<AresSessionStatus> {
  const d = await chrome.storage.local.get(KEY_SESSION_STATUS);
  return normalizeSession(d[KEY_SESSION_STATUS]);
}

async function saveSession(s: AresSessionStatus): Promise<void> {
  await chrome.storage.local.set({ [KEY_SESSION_STATUS]: s });
}

async function getSessionCached(): Promise<AresSessionStatus> {
  ensureListeners();
  const now = Date.now();
  if (sessionCache && (now - sessionLoadedAt) < SESSION_TTL_MS) return sessionCache;

  const s = await loadSessionFromStorage();
  sessionCache = s;
  sessionLoadedAt = now;
  return s;
}

export async function getSessionStatus(): Promise<AresSessionStatus> {
  return await getSessionCached();
}

export async function sessionResetTab(tabId: number): Promise<void> {
  ensureListeners();
  const s = await getSessionCached();
  const key = String(tabId);
  if (!s.tabs[key]) return;
  delete s.tabs[key];
  await saveSession(s);
}


export async function sessionStartTab(tabId: number): Promise<void> {
  ensureListeners();
  const s = await getSessionCached();
  s.tabs[String(tabId)] = { state: "RUNNING", fromTs: Date.now() };
  await saveSession(s);
}

export async function sessionStopTab(tabId: number): Promise<void> {
  ensureListeners();
  const s = await getSessionCached();
  const key = String(tabId);
  const cur = s.tabs[key];
  if (!cur) return;

  // freeze: keep fromTs, set toTs once
  s.tabs[key] = { state: "FROZEN", fromTs: cur.fromTs, toTs: Date.now() };
  await saveSession(s);
}

export async function sessionStopAll(): Promise<void> {
  ensureListeners();
  await saveSession(defaultSession());
}

export async function getSessionWindowForTab(tabId: number): Promise<{ fromTs?: number; toTs?: number; state?: string }> {
  const s = await getSessionCached();
  const cur = s.tabs[String(tabId)];
  if (!cur) return {};
  return { fromTs: cur.fromTs, toTs: cur.toTs, state: cur.state };
}

// ---------------- Ring buffer primitives ----------------

type LogMeta = {
  capacity: number;
  chunkSize: number;
  chunks: number;
  writePos: number;
  length: number;
  seq: number;
  lastTs: number;
  migrated?: boolean;
};

type Chunk = Array<RequestLogEvent | null>;

function chunkKey(i: number) {
  return `${KEY_CHUNK_PREFIX}${i}`;
}

function defaultMeta(): LogMeta {
  return {
    capacity: CAPACITY,
    chunkSize: CHUNK_SIZE,
    chunks: CHUNKS,
    writePos: 0,
    length: 0,
    seq: 0,
    lastTs: 0,
    migrated: false,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}



function isFiniteNumber(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function validateAndNormalizeMeta(raw: any): LogMeta {
  const fresh = defaultMeta();

  if (!raw || typeof raw !== "object") return fresh;

  const m = raw as Partial<LogMeta>;

  // se la struttura base non matcha, reset totale (sicuro)
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
    migrated,
  };
}

function sanitizeChunkArray(arr: any): Chunk {
  // chunk deve essere array di lunghezza CHUNK_SIZE con RequestLogEvent|null
  const out: Chunk = Array(CHUNK_SIZE).fill(null);

  if (!Array.isArray(arr)) return out;

  for (let i = 0; i < Math.min(arr.length, CHUNK_SIZE); i++) {
    const v = arr[i];

    if (v === null) {
      out[i] = null;
      continue;
    }

    // validazione super-leggera: evita oggetti rotti che poi spaccano URL()/ts logic
    if (v && typeof v === "object" && isFiniteNumber((v as any).ts_ms) && typeof (v as any).url === "string") {
      out[i] = v as RequestLogEvent;
    } else {
      out[i] = null;
    }
  }

  return out;
}



async function loadMeta(): Promise<LogMeta> {
  try {
    const d = await chrome.storage.local.get(KEY_META);
    const raw = d[KEY_META];

    const normalized = validateAndNormalizeMeta(raw);

    // se era assente o invalido, persistiamo subito una versione sana
    if (!raw || normalized !== raw) {
      try {
        await chrome.storage.local.set({ [KEY_META]: normalized });
      } catch {
        // ignore: se storage fallisce, continuiamo comunque in RAM
      }
    }

    return normalized;
  } catch {
    // se storage.get fallisce, non bloccare tutto: usa meta fresco in RAM
    return defaultMeta();
  }
}


async function saveMeta(m: LogMeta): Promise<void> {
  try {
    // normalizza prima di salvare (clamp)
    const safe = validateAndNormalizeMeta(m);
    await chrome.storage.local.set({ [KEY_META]: safe });
  } catch {
    // ignore
  }
}


async function readChunk(i: number): Promise<Chunk> {
  const idx = clamp(i, 0, CHUNKS - 1);
  const key = chunkKey(idx);

  try {
    const d = await chrome.storage.local.get(key);
    return sanitizeChunkArray(d[key]);
  } catch {
    return Array(CHUNK_SIZE).fill(null);
  }
}


async function writeChunk(i: number, arr: Chunk): Promise<void> {
  const idx = clamp(i, 0, CHUNKS - 1);
  const key = chunkKey(idx);

  try {
    // salva sempre un chunk “pulito” (se arriva qualcosa di strano, lo normalizziamo)
    await chrome.storage.local.set({ [key]: sanitizeChunkArray(arr) });
  } catch {
    // ignore
  }
}


function normalizeEventForOrdering(ev: RequestLogEvent, meta: LogMeta): RequestLogEvent {
  meta.seq = (meta.seq ?? 0) + 1;

  const ts = typeof ev.ts_ms === "number" ? ev.ts_ms : Date.now();
  const fixedTs = ts <= (meta.lastTs ?? 0) ? (meta.lastTs ?? 0) + 1 : ts;
  meta.lastTs = fixedTs;

  return { ...ev, seq: meta.seq, ts_ms: fixedTs };
}

async function appendBatchToRing(events: RequestLogEvent[]): Promise<void> {
  if (events.length === 0) return;

  const meta = await loadMeta();

 // paranoia: se meta era “storta”, clamp qui evita calcoli strani
  meta.writePos = clamp(meta.writePos, 0, meta.capacity - 1);
  meta.length = clamp(meta.length, 0, meta.capacity);


  const dirty = new Map<number, Chunk>();

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

async function readTailFromRing(limit: number): Promise<RequestLogEvent[]> {
  const meta = await loadMeta();
  const k = clamp(limit, 0, meta.length);
  if (k === 0) return [];

  let startPos = meta.writePos - k;
  while (startPos < 0) startPos += meta.capacity;

  const neededChunks = new Set<number>();
  for (let i = 0; i < k; i++) {
    const pos = (startPos + i) % meta.capacity;
    neededChunks.add(Math.floor(pos / meta.chunkSize));
  }

  const chunkMap = new Map<number, Chunk>();
  for (const idx of neededChunks) {
    chunkMap.set(idx, await readChunk(idx));
  }

  const out: RequestLogEvent[] = [];
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

// ---------------- Migrazione legacy -> ring ----------------

async function migrateLegacyIfNeeded(): Promise<void> {
  const meta = await loadMeta();
  if (meta.migrated) return;

  const d = await chrome.storage.local.get(KEY_LOG);
  const arr = d[KEY_LOG];

  if (Array.isArray(arr) && arr.length > 0) {
    const legacy = (arr as RequestLogEvent[]);
    const tail = legacy.length > LOG_MAX ? legacy.slice(legacy.length - LOG_MAX) : legacy;

    try {
      await appendBatchToRing(tail);
      await chrome.storage.local.remove(KEY_LOG);
    } catch {}
  }

  meta.migrated = true;
  await saveMeta(meta);
}

// ---------------- Flush / scheduling ----------------

async function flushLog(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    if (pending.length === 0) return;

    await migrateLegacyIfNeeded();

    const toWrite = pending;
    pending = [];

    try {
      await appendBatchToRing(toWrite);
    } catch {}
  } finally {
    flushing = false;
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLog();
  }, FLUSH_MS) as unknown as number;
}

// ---------------- Dedup ----------------

const DEDUP_MS = 300;
const lastSeen = new Map<string, number>();

function shouldLog(ev: RequestLogEvent): boolean {
  let host = "";
  try { host = new URL(ev.url).hostname; } catch {}

  const key = `${ev.matched_rule_id ?? "UNKNOWN"}|${host}|${ev.resource_type}`;

  const now = ev.ts_ms;
  const last = lastSeen.get(key) ?? 0;
  if (now - last < DEDUP_MS) return false;

  lastSeen.set(key, now);

  if (lastSeen.size > 2000) {
    for (const [k, t] of lastSeen) {
      if (now - t > 60_000) lastSeen.delete(k);
    }
  }
  return true;
}

// ---------------- Public API ----------------

export async function exportLogRange(
  limit = 2000,
  tabId?: number,
  fromTs?: number,
  toTs?: number
): Promise<RequestLogEvent[]> {
  await flushLog();
  await migrateLegacyIfNeeded();

  let out = await readTailFromRing(limit);

  if (typeof tabId === "number") out = out.filter(e => e.tab_id === tabId);
  if (typeof fromTs === "number") out = out.filter(e => e.ts_ms >= fromTs);
  if (typeof toTs === "number") out = out.filter(e => e.ts_ms <= toTs);

  if (out.length > limit) out = out.slice(out.length - limit);
  return out;
}

export async function appendLogEvent(ev: RequestLogEvent): Promise<void> {
  ensureListeners();

  let host = "";
  try { host = new URL(ev.url).hostname; } catch {}

  const wl = await getWhitelistCached();
  if (wl.length > 0 && !hostMatches(host, wl)) return;

  if (!shouldLog(ev)) return;

  console.log("[ARES][log]", {
  tab: ev.tab_id,
  host: (() => { try { return new URL(ev.url).hostname } catch { return "?" } })(),
  rule: ev.matched_rule_id,
  type: ev.resource_type,
});


  pending.push(ev);

  if (pending.length > 5000) {
    pending = pending.slice(pending.length - 2000);
  }

  scheduleFlush();
}

export async function clearLogEvents(): Promise<void> {
  pending = [];
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const keys: string[] = [KEY_META, KEY_LOG];
  for (let i = 0; i < CHUNKS; i++) keys.push(chunkKey(i));

  try {
    await chrome.storage.local.remove(keys);
  } catch {
    // ignore
  }

  // ricrea meta sano
  try {
    await chrome.storage.local.set({ [KEY_META]: defaultMeta() });
  } catch {
    // ignore
  }
}


export async function exportLogTail(limit = 200): Promise<RequestLogEvent[]> {
  await flushLog();
  await migrateLegacyIfNeeded();
  return await readTailFromRing(limit);
}

export function mapDnrTypeToResourceType(t: unknown): string {
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

export async function computeMetrics(limit = 500, tabId?: number, fromTs?: number, toTs?: number): Promise<AresMetrics> {
  const raw = await exportLogTail(limit);

  let events = typeof tabId === "number"
    ? raw.filter(e => e.tab_id === tabId)
    : raw;

  if (typeof fromTs === "number") events = events.filter(e => e.ts_ms >= fromTs);
  if (typeof toTs === "number") events = events.filter(e => e.ts_ms <= toTs);

  // safety: se per qualsiasi motivo arrivasse roba non monotona, sort leggero
  let ordered = events;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].ts_ms < ordered[i - 1].ts_ms) {
      ordered = [...ordered].sort((a, b) => a.ts_ms - b.ts_ms);
      break;
    }
  }

  // in FROZEN vogliamo che "last 60s" sia stabile => consideriamo "now" = toTs
  const now = typeof toTs === "number" ? toTs : Date.now();


  const rateWinSec = 10;
  const winMs = rateWinSec * 1000;

  const rateNow = ordered.filter(e => (now - e.ts_ms) <= winMs).length;
  const ratePrev = ordered.filter(e => {
    const dt = now - e.ts_ms;
    return dt > winMs && dt <= 2 * winMs;
  }).length;

  const TREND_EPS = 3;
  const dir =
    rateNow >= ratePrev + TREND_EPS ? "increasing" :
    rateNow + TREND_EPS <= ratePrev ? "decreasing" :
    "stable";




  const last60 = ordered.filter(e => (now - e.ts_ms) <= 60_000).length;

  const byDomain = new Map<string, number>();
  const byRule = new Map<string, number>();
  const byResourceType = new Map<string, number>();

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

  const alerts: AresAlert[] = [];
  if (maxInWindow >= BURST_THRESHOLD) {
    alerts.push({
      type: "burst",
      windowMs: BURST_WINDOW_MS,
      count: maxInWindow,
      threshold: BURST_THRESHOLD,
    });
  }

  for (const e of ordered) {
    try {
      const host = new URL(e.url).hostname;
      byDomain.set(host, (byDomain.get(host) ?? 0) + 1);
    } catch {}

    const ruleKey = e.trace?.label ?? (e.matched_rule_id ?? "UNKNOWN");
    byRule.set(ruleKey, (byRule.get(ruleKey) ?? 0) + 1);

    const rtype = e.resource_type ?? "Other";
    byResourceType.set(rtype, (byResourceType.get(rtype) ?? 0) + 1);
  }

  const top = (m: Map<string, number>, n = 8): AresTopItem[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ key: k, count: v }));

  const uniqueDomains = byDomain.size;
  const events60 = last60;
  const burstMax = maxInWindow;

  const base =
    Math.min(60, events60 * 4) +
    Math.min(25, uniqueDomains * 3) +
    Math.min(15, Math.max(0, burstMax - BURST_THRESHOLD) * 5);

  const aggressiveness = Math.max(0, Math.min(100, Math.round(base)));
  const level =
    aggressiveness >= 70 ? "High" :
    aggressiveness >= 35 ? "Medium" :
    "Low";

  const rate60 = last60;

  let severity: "CLEAN" | "AD_HEAVY" | "AD_STORM" = "CLEAN";
  const reasons: string[] = [];

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
    trend: { windowSeconds: 10 as const, now: rateNow, prev: ratePrev, dir },
    score: {
      aggressiveness,
      level,
      eventsLast60s: events60,
      uniqueDomains,
      maxBurstInWindow: burstMax,
      burstWindowMs: BURST_WINDOW_MS,
      burstThreshold: BURST_THRESHOLD,
      tabId: typeof tabId === "number" ? tabId : undefined,
    },
  };
}
