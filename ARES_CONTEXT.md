\*\*PROJECT CONTEXT — ARES PLATFORM\*\*



You are assisting in the design and development of a software project called \*\*ARES\*\*.



ARES is currently a Chrome extension that uses Manifest V3 APIs (declarativeNetRequest + content scripts + service worker) to block requests, modify page behavior, and monitor browser network activity.



However, ARES is NOT meant to remain a simple ad blocker.



The strategic goal is to evolve ARES into a \*\*Browser Policy Platform\*\* — a modular system that gives users full control over how their browser behaves, not just what it blocks.



---



\### CURRENT STATE



ARES v0:



\* Chrome extension

\* Uses DNR rules + dynamic rules

\* Has popup UI

\* Tracks blocked requests counter

\* Blocks some domains

\* Basic YouTube handling



This is only a proof of concept.



---



\### TARGET VISION



ARES must evolve into a \*\*multi-layer architecture\*\* composed of:



\*\*1. Enforcement Layer (extension)\*\*

Handles:



\* request blocking

\* DOM manipulation

\* behavioral control

\* runtime monitoring



\*\*2. Control Layer (desktop app)\*\*

Handles:



\* rule editor

\* profiles

\* logs

\* analytics

\* debugging

\* simulation



\*\*3. Policy Engine (core logic)\*\*

A modular engine that:



\* evaluates rules

\* applies conditions

\* supports plugins

\* compiles rules for multiple execution targets



---



\### WHAT MAKES ARES UNIQUE



ARES is NOT an adblocker.



ARES is a \*\*browser governance system\*\*.



It must offer capabilities other blockers don’t:



\* behavioral browser profiles (Work / Focus / Privacy / Streaming)

\* explainable blocking (why something was blocked)

\* real-time monitoring dashboard

\* rule simulation sandbox

\* installable policy packs

\* modular architecture



---



\### POSITIONING



ARES should be perceived as:



> a browser runtime control system



NOT:



> another ad blocker



---



\### DEVELOPMENT PRINCIPLES



When suggesting features or architecture:



\* prioritize modularity

\* prefer extensibility over shortcuts

\* think like a system architect

\* design for scale

\* avoid gimmicks

\* avoid feature clutter

\* every feature must increase control or observability



---



\### CONSTRAINTS



\* Must work within browser extension security model

\* Must remain local-first by default

\* Must not depend on remote servers unless explicitly designed

\* Must be testable

\* Must be debuggable

\* Must be explainable



---



\### ROADMAP PRIORITY ORDER



1\. Behavioral profiles system

2\. Explainable logging engine

3\. Policy pack installer

4\. Desktop control panel

5\. Rule simulation engine



---



\### EXPECTED AI RESPONSE STYLE



When helping with this project:



\* think like a senior architect

\* propose structured solutions

\* justify decisions technically

\* avoid generic advice

\* prioritize robustness over simplicity

\* assume long-term evolution



---



END OF CONTEXT





ARES — Moduli di lavoro
1) Extension (Data Plane) — TypeScript / MV3

1.1 MV3 Core

manifest, permissions, host_permissions

service worker lifecycle

storage (settings, profiles, stats)

1.2 DNR Layer

static rulesets (rules.json)

dynamic rules (updateDynamicRules)

enable/disable rulesets per profilo

safe defaults + fallback

1.3 Content Scripts

DOM observers (overlay/annoyance removal)

YouTube helpers (skip/mute/cleanup) separati per feature flag

site adapters (hook per siti specifici)

1.4 UI

Popup UI (toggle master, profili, quick actions, counter)

Options / Dashboard page (editor regole base, log viewer, metrics)

“Explain” view: cosa è stato bloccato e perché

1.5 Telemetry locale

eventi “rule matched”

contatori per sito/profilo

export/import locale (json)

2) Desktop Control Plane (Exe) — Tauri + Rust

2.1 Shell Desktop

UI (React/Svelte) + layout base

settings storage locale (sqlite o file)

auto-update (più avanti)

2.2 IPC / Bridge

comunicazione desktop ↔ extension

(preferito) Native Messaging

alternativa: WebSocket locale

handshake + auth locale (token file)

2.3 Rule & Profile Manager

editor avanzato (UI)

gestione profili (Work/Focus/Privacy/Streaming)

installazione/rimozione “policy packs”

export/import profili + regole

2.4 Monitoring Console

live feed eventi (blocked/allowed/modified)

search + filter + timeline

“why blocked” dettagliato

2.5 Simulator UI

replay di richieste (da log)

“what if” (simula una regola nuova)

confronto tra profili

3) Core Engine (Riutilizzabile) — Rust crate ares-core

3.1 Domain Model

Request model (url, domain, type, initiator, tab/site, timestamp)

Rule model (match + action + priority)

Profile model (set di policy + overrides)

3.2 DSL (Rules Language)

sintassi semplice (text o yaml-like)

parser + validator

versioning e migrazioni

3.3 Compiler

DSL/Rule model → DNR static rules (rules.json)

DSL/Rule model → DNR dynamic rules

optimizer (dedup, priority, resourceTypes mapping)

3.4 Explainability Engine

dato un match: “perché”

trace: quale regola, quale condizione, quale profilo

output strutturato per UI

3.5 Simulator

input: log eventi o request synthetic

output: decisione (block/allow/modify) + explain trace

replay batch + report (impact)

3.6 Pack System (Core)

formato “policy pack” (manifest pack + rules + metadata)

firma/verification (più avanti)

compatibilità pack-version

4) Cloud (Opzionale) — GCP

4.1 Sync (opzionale)

Firebase Auth (login)

Sync profili/packs tra dispositivi

4.2 API (opzionale)

Cloud Run: endpoint leggero per catalogo packs / update

rate limiting + minimal telemetry

4.3 Pipeline (solo se serve)

Pub/Sub per eventi (solo se fai analytics veri)

BigQuery per report aggregati (più avanti)

Principio: cloud è “nice to have”, Ares resta local-first.

Ordine di lavoro (priorità)

Extension: profili + DNR + content scripts + UI base

ares-core: model + compiler + explainability minimale

Desktop Tauri: profile manager + log viewer + bridge

Simulator + packs

Cloud sync/catalog (se serve)

