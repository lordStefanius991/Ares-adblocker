const KEY_ENABLED = "ares_enabled";
const KEY_CUSTOM = "ares_custom_domains";
const KEY_YT_ADS = "ares_yt_ads";
export {};


const devStatusLine = document.getElementById("devStatusLine") as HTMLDivElement;

const devPanel = document.getElementById("devPanel") as HTMLDivElement;
const devRefreshBtn = document.getElementById("devRefreshBtn") as HTMLButtonElement;
const devCopyBtn = document.getElementById("devCopyBtn") as HTMLButtonElement;
const devClearBtn = document.getElementById("devClearBtn") as HTMLButtonElement;
const devOut = document.getElementById("devOut") as HTMLTextAreaElement;
const devMetrics = document.getElementById("devMetrics") as HTMLPreElement;

const devSessionStartBtn = document.getElementById("devSessionStartBtn") as HTMLButtonElement;
const devSessionStopBtn = document.getElementById("devSessionStopBtn") as HTMLButtonElement;
const devSessionStopAllBtn = document.getElementById("devSessionStopAllBtn") as HTMLButtonElement;

const ytAdsStats = document.getElementById("ytAdsStats") as HTMLDivElement;
const resetYtAdsStatsBtn = document.getElementById("resetYtAdsStatsBtn") as HTMLButtonElement;

const PRESETS = [
  { key: "youtube", label: "YouTube", icon: "Y" },
  { key: "linkedin", label: "LinkedIn", icon: "in" },
  { key: "facebook", label: "Facebook", icon: "f" },
];

const masterToggle = document.getElementById("masterToggle") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const presetList = document.getElementById("presetList") as HTMLDivElement;
const customList = document.getElementById("customList") as HTMLDivElement;
const customDomainInput = document.getElementById("customDomainInput") as HTMLInputElement;
const addBtn = document.getElementById("addBtn") as HTMLButtonElement;
const ytAdsToggle = document.getElementById("ytAdsToggle") as HTMLInputElement;

function setStatus(enabled: boolean) {
  statusEl.textContent = enabled ? "ARES enabled" : "ARES disabled (rules paused)";
}

function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  if (!s.includes(".")) return null;
  return s;
}

function send(msg: any): Promise<any> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function getActiveTabInfo(): Promise<{ tabId?: number; host: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;

  let host = "unknown";
  try {
    if (tab?.url) host = new URL(tab.url).hostname;
  } catch {}

  return { tabId: typeof tabId === "number" ? tabId : undefined, host };
}

function fmtTime(ts: number): string {
  try { return new Date(ts).toLocaleTimeString(); } catch { return String(ts); }
}

function fmtWindow(state?: string, fromTs?: number, toTs?: number): string {
  if (!fromTs) return "LIVE";
  if (state === "FROZEN" && toTs) return `FROZEN (${fmtTime(fromTs)} → ${fmtTime(toTs)})`;
  return `RUNNING (since ${fmtTime(fromTs)})`;
}

async function refreshDevLog() {
  const { tabId, host } = await getActiveTabInfo();

  let fromTs: number | undefined;
  let toTs: number | undefined;
  let state: string | undefined;

  if (typeof tabId === "number") {
    const w = await send({ type: "ARES_SESSION_TAB_WINDOW", tabId });
    if (w?.ok && w.window) {
      fromTs = typeof w.window.fromTs === "number" ? w.window.fromTs : undefined;
      toTs = typeof w.window.toTs === "number" ? w.window.toTs : undefined;
      state = typeof w.window.state === "string" ? w.window.state : undefined;
    }
  }

  const logResp = await send({
    type: "ARES_EXPORT_LOG_RANGE",
    limit: 800,
    tabId,
    fromTs,
    toTs,
  });
  devOut.value = logResp?.ok ? (logResp.json ?? "") : JSON.stringify(logResp);

  const m = await send({ type: "ARES_GET_METRICS", limit: 500, tabId, fromTs, toTs });

  if (m?.ok) {

      // --- STATUS BADGE ---
  const modeLabel = fmtWindow(state, fromTs, toTs);

  let sevColor = "#4caf50"; // green
  if (m.severity === "AD_HEAVY") sevColor = "#ff9800";
  if (m.severity === "AD_STORM") sevColor = "#f44336";

  devStatusLine.innerHTML = `
    Mode: <span style="color:#2196f3">${modeLabel}</span> |
    Severity: <span style="color:${sevColor}">${m.severity}</span>
  `;



    const lines: string[] = [
      `Context: ${host}`,
      `TabId: ${tabId ?? "?"}`,
      ``,
      `Mode: ${fmtWindow(state, fromTs, toTs)}`,
      ``,
      `Total (tail/window): ${m.total}`,
      `Events (last ${m.window.seconds}s): ${m.window.events} events`,
      ``,
      ...(m.score
        ? [
            `Aggressiveness score: ${m.score.aggressiveness}/100 (${m.score.level})`,
            `Unique ad domains (tail/window): ${m.score.uniqueDomains}`,
            `Max burst: ${m.score.maxBurstInWindow} in ${m.score.burstWindowMs}ms (threshold ${m.score.burstThreshold})`,
            ``,
          ]
        : [``,]),
      ...(m.severity
        ? [
            `Severity: ${m.severity}${(m.severity_reasons?.length ? ` (${m.severity_reasons.join(", ")})` : "")}`,
            ``,
          ]
        : []),
      ...(m.trend
        ? [
            `Trend (last ${m.trend.windowSeconds}s): ${m.trend.dir} (now=${m.trend.now}, prev=${m.trend.prev})`,
            ``,
          ]
        : []),

      `Top domains:`,
      ...(m.topDomains ?? []).map((x: any) => `- ${x.key}: ${x.count}`),
      ``,
      `Top rules:`,
      ...(m.topRules ?? []).map((x: any) => `- ${x.key}: ${x.count}`),
      ``,
      `Top resource types:`,
      ...(m.topResourceTypes ?? []).map((x: any) => `- ${x.key}: ${x.count}`),
      ``,
      ...(m.alerts?.length
        ? [
            `Alerts:`,
            ...m.alerts.map((a: any) =>
              a.type === "burst"
                ? `- Burst detected: ${a.count} events in ${a.windowMs}ms (threshold ${a.threshold})`
                : `- ${a.type}`
            ),
          ]
        : []),
    ];

    devMetrics.textContent = lines.join("\n");
  } else {
    devMetrics.textContent = "";
  }
}

async function loadState() {
  const data = await chrome.storage.local.get([
    KEY_ENABLED,
    KEY_CUSTOM,
    KEY_YT_ADS,
    ...PRESETS.map((p) => `preset_${p.key}`),
  ]);

  const enabled = data[KEY_ENABLED] !== false;

  ytAdsToggle.checked = data[KEY_YT_ADS] === true;
  ytAdsToggle.disabled = !enabled;

  masterToggle.checked = enabled;
  setStatus(enabled);

  const statsResp = await send({ type: "ARES_GET_STATS" });
  if (statsResp?.ok && statsResp.stats) {
    const n = statsResp.stats.ytAdsBlocked ?? 0;
    ytAdsStats.textContent = `YouTube ad requests blocked: ${n}`;
  } else {
    ytAdsStats.textContent = "YouTube ad requests blocked: ?";
  }

  renderPresets(data, enabled);
  renderCustomDomains(Array.isArray(data[KEY_CUSTOM]) ? data[KEY_CUSTOM] : [], enabled);
}

function renderPresets(data: any, enabled: boolean) {
  presetList.innerHTML = "";

  for (const p of PRESETS) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.className = "left";

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = p.icon;

    const label = document.createElement("div");
    label.textContent = p.label;

    left.appendChild(icon);
    left.appendChild(label);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = data[`preset_${p.key}`] !== false;
    toggle.disabled = !enabled;

    toggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ [`preset_${p.key}`]: toggle.checked });
      await send({ type: "ARES_SET_PRESET", presetKey: p.key, enabled: toggle.checked });
      await loadState();
    });

    row.appendChild(left);
    row.appendChild(toggle);
    presetList.appendChild(row);
  }
}

function renderCustomDomains(domains: any[], enabled: boolean) {
  customList.innerHTML = "";

  const entries = (domains || []).map((x) =>
    typeof x === "string" ? { domain: x, enabled: true } : x
  );

  for (const e of entries) {
    const d = e.domain;

    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.className = "left";

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = "*";

    const label = document.createElement("div");
    label.textContent = d;

    left.appendChild(icon);
    left.appendChild(label);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = e.enabled !== false;
    toggle.disabled = !enabled;

    toggle.addEventListener("change", async () => {
      await send({ type: "ARES_SET_CUSTOM_ENABLED", domain: d, enabled: toggle.checked });
      await loadState();
    });

    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.disabled = !enabled;
    btn.addEventListener("click", async () => {
      await send({ type: "ARES_REMOVE_CUSTOM", domain: d });
      await loadState();
    });

    row.appendChild(left);
    row.appendChild(toggle);
    row.appendChild(btn);
    customList.appendChild(row);
  }
}

// --- UI handlers ---
devRefreshBtn.addEventListener("click", refreshDevLog);

devCopyBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();

  let fromTs: number | undefined;
  let toTs: number | undefined;

  if (typeof tabId === "number") {
    const w = await send({ type: "ARES_SESSION_TAB_WINDOW", tabId });
    if (w?.ok && w.window) {
      fromTs = typeof w.window.fromTs === "number" ? w.window.fromTs : undefined;
      toTs = typeof w.window.toTs === "number" ? w.window.toTs : undefined;
    }
  }

  const r = await send({ type: "ARES_EXPORT_METRICS", limit: 500, tabId, fromTs, toTs });
  const json = r?.ok ? (r.json ?? "") : JSON.stringify(r);
  await navigator.clipboard.writeText(json);
});

// Reset tab -> LIVE
devClearBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  if (typeof tabId !== "number") return;
  await send({ type: "ARES_SESSION_RESET_TAB", tabId });
  await refreshDevLog();
});

devSessionStartBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  if (typeof tabId !== "number") return;
  await send({ type: "ARES_SESSION_START", tabId });
  await refreshDevLog();
});

devSessionStopBtn.addEventListener("click", async () => {
  const { tabId } = await getActiveTabInfo();
  if (typeof tabId !== "number") return;
  await send({ type: "ARES_SESSION_STOP", tabId });
  await refreshDevLog();
});

devSessionStopAllBtn.addEventListener("click", async () => {
  await send({ type: "ARES_SESSION_STOP_ALL" });
  await refreshDevLog();
});

masterToggle.addEventListener("change", async () => {
  await send({ type: "ARES_SET_ENABLED", enabled: masterToggle.checked });
  await loadState();
});

ytAdsToggle.addEventListener("change", async () => {
  await send({ type: "ARES_SET_YT_ADS", enabled: ytAdsToggle.checked });
  await loadState();
});

resetYtAdsStatsBtn.addEventListener("click", async () => {
  await send({ type: "ARES_RESET_STATS" });
  await loadState();
});

addBtn.addEventListener("click", async () => {
  const dom = normalizeDomain(customDomainInput.value);
  if (!dom) return;
  customDomainInput.value = "";
  await send({ type: "ARES_ADD_CUSTOM", domain: dom });
  await loadState();
});

// side panel always shows dev panel
devPanel.style.display = "block";

loadState();
refreshDevLog();
