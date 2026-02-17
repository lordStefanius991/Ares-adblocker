# ARES – Chrome Extension (MVP)

ARES is a Manifest V3 Chrome extension built around DeclarativeNetRequest (DNR) with an internal telemetry engine designed for visibility, control, and explainability.

It started as a simple ad-related request blocker.  
It evolved into a controlled environment to observe browser-level request behavior per tab.

This project is part of my personal “Pantheon” of applications: independent tools focused on system design, performance and architecture.

---

## What ARES Does

ARES allows you to:

- Block specific domains (presets + custom domains)
- Intercept ad-related network requests
- Monitor request activity per tab
- Freeze / resume telemetry sessions
- Inspect which rule matched and why

It is not “just another ad blocker”.  
The focus is on request-level control and structured telemetry, not cosmetic filtering.

---

## Core Features

### 1. Domain Blocking

- Preset domain blocking (YouTube, LinkedIn, Facebook)
- Custom domain list
- Dynamic rule rebuild via DNR

All rules are generated and updated dynamically using:

chrome.declarativeNetRequest.updateDynamicRules

---

### 2. YouTube Ad Request Interception

ARES intercepts common ad delivery domains such as:

- doubleclick.net  
- googlesyndication.com  
- googleadservices.com  

Important note:

Some YouTube ad formats are deeply integrated into the delivery pipeline.  
Modern MV3 constraints make complete removal increasingly complex.

ARES focuses on request inspection and rule control rather than guaranteeing total ad removal.

---

### 3. Telemetry Engine

ARES includes a local-first telemetry system that records matched rule events.

Each event contains structured metadata:

```json
{
  "ts_ms": 1771261716919,
  "seq": 1,
  "url": "...",
  "initiator": "...",
  "resource_type": "Script",
  "matched_rule_id": "15000",
  "tab_id": 538304679,
  "trace": { ... }
}
```

---

## Internal Architecture

The extension is structured into independent modules:

- sw_dnr_rules.ts → rule building and hydration  
- sw_rule_registry.ts → rule metadata registry  
- sw_dnr_debug.ts → DNR debug hook  
- sw_telemetry.ts → telemetry engine  
- sw_bus.ts → message bus (popup ↔ service worker)  
- sw_stats_badge.ts → badge + counters  
- sidepanel.ts → persistent telemetry UI  

This separation makes the engine modular and extensible.

---

## Technical Highlights

### Manifest V3 + DNR

ARES uses a clean MV3 architecture:

- No blocking webRequest API
- Fully DNR-based rule system
- Dynamic rule management
- Debug explainability via onRuleMatchedDebug

---

### Ring Buffer (Chunked Storage)

Logs are stored in a fixed-capacity ring buffer:

- Capacity: 2000 events
- Chunk size: 100
- Stored in chrome.storage.local as chunked segments
- Meta + chunk indexing

This prevents unbounded growth and keeps storage predictable.

---

### Monotonic Ordering

Each event receives a sequential number (`seq`).

This guarantees:

- Stable ordering
- Deterministic telemetry export
- Correct time-window slicing

---

### Per-Tab Isolation

All telemetry and session state are filtered per `tabId`.

Metrics are computed:

- Per tab
- Within a selected time window
- Without mixing global noise

---

### Session Mode (Live / Running / Frozen)

Each tab can operate in:

- LIVE → full history visible  
- RUNNING → logs from start timestamp  
- FROZEN → logs between start and freeze timestamps  

This allows reproducible analysis sessions.

---

### Metrics Engine

Computed in real time:

- Total events (tail/window)
- Events in last N seconds
- Aggressiveness score (0–100)
- Burst detection
- Top domains
- Top rules
- Top resource types

---

### Aggressiveness Score

Calculated based on:

- Number of events in recent window
- Unique ad domains
- Burst intensity

Mapped into qualitative levels (LOW / MEDIUM / HIGH).

---

### Burst Detection

Detects clusters of events in short time windows.

Example:

- 15 events in 300ms
- Threshold-based alerting

---

### Rule Explainability (Trace)

Each log event may include trace metadata:

```json
"trace": {
  "ruleId": 15000,
  "label": "YT Ads: doubleclick.net",
  "source": "yt_ads",
  "urlFilter": "||doubleclick.net",
  "priority": 1
}
```

This allows:

- Understanding which rule triggered
- Debugging rule conflicts
- Future rule inspector expansion

---

## Side Panel (Persistent UI)

ARES supports Chrome Side Panel.

Unlike the popup:

- It stays open
- It does not disappear on tab switch
- It provides continuous telemetry visibility

---

## Project Structure

```
ares-extension/
 ├─ extension/
 │   ├─ service_worker.ts
 │   ├─ popup.ts
 │   ├─ sidepanel.ts
 │   ├─ sw_dnr_rules.ts
 │   ├─ sw_telemetry.ts
 │   ├─ sw_bus.ts
 │   └─ ...
 ├─ package.json
 └─ tsconfig.json
```

---

## Build Instructions

Requirements:

- Node 18+
- Chrome (MV3 compatible)

Install dependencies:

```
npm install
```

Build:

```
npm run build
```

Load unpacked extension:

1. Open chrome://extensions  
2. Enable Developer Mode  
3. Click “Load unpacked”  
4. Select the `extension/` folder  

---

## GitHub Release

https://github.com/lordStefanius991/Ares-adblocker

---

## Chrome Web Store

(Currently awaiting latest version approval)

https://chromewebstore.google.com/detail/ares-adblocker-mvp/hdbfoddgjpnplhaaipjmmbphgjboncdh?authuser=0&hl=it

---

## Roadmap

- Version 3 stabilization  
- Rust core integration  
- Rule simulation engine  
- Enhanced rule inspector  
- Performance profiling layer  

---

## Why This Project Exists

ARES is not meant to compete with mature ad blockers.

It is an architectural exercise in:

- Controlled DNR usage
- Storage hardening
- Telemetry modeling
- Modular MV3 design

It demonstrates how to build:

- A structured Chrome extension
- With deterministic logging
- And explainable rule behavior

---

## Author

Stefano Paolucci  
Software Engineer – Full Stack / Systems-oriented  

Building independent tools focused on architecture, control and performance.
