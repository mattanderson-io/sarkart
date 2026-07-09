# Dashboard Redesign Plan: Diagnostic Differential

*Drafted 2026-07-09. Product decisions reached through design interview; implementation plan grounded in the current codebase.*

## Problem

The dashboard page is a greeting, not a tool. It shows three all-time peaks (CPU, load, memory) and a prose summary that restates them. A peak without context doesn't support a decision — "Peak Load 44" looks alarming until you know the box has 65 cores — and everything actionable lives one click deeper.

## Who it's for

An IT engineer using SAR where real-time monitoring isn't possible. The driving case: a **technical support engineer** receives a customer log dump containing a SAR file and needs a fast answer to one question — *could a resource bottleneck explain the customer's issue?*

Key properties of this persona:

- Has **zero prior context** on the system; no baseline for what's normal.
- Usually has a customer-reported incident timestamp, but not always, and it may be wrong (timezone confusion is common).
- **"Probably not hardware" is a first-class outcome** — exonerating the system so the TSE can move to app logs is as valuable as finding a spike.
- Their endgame is a ticket/customer update, often with a PDF attached.

## Design decisions (settled)

1. **Differential diagnosis, not verdicts.** The dashboard presents a ranked list of plausible bottlenecks — "it could be, in order of likelihood" — never a definitive yes/no. Each finding is inspectable: the rule that fired, the time range, and a link to the chart that proves it.
2. **Optional incident-time input, re-ranks the differential.** Findings are ranked by overlap/proximity to the incident window first, severity second. Out-of-window findings are **demoted, never hidden** (this is also the safety net for wrong timestamps).
3. **Timezone handling:** two selectors — capture timezone and customer-report timezone — both defaulting to UTC (captures are reliably UTC in practice). The customer-tz selector converts the incident-time *input* only, with a visible echo ("14:30 EST → 19:30 UTC"). **Capture time is the single display truth** everywhere: chart axes, finding ranges, prose.
4. **Generic engine, no workload profiles.** Ranking is driven by OS-level severity science (sustained breach, duration, magnitude), not a workload-type selector.
5. **Fully deterministic.** Findings, ranking, and prose come from documented heuristics + templates. Same file, same output, every browser. The Gemini Nano / AI-generated summary is **removed**.
6. **Confidence as qualitative tiers:** Strong / Moderate / Weak, rule-defined, never numeric scores (false precision). Tier boundaries start conservative — ambiguity rounds down.
7. **Honest empty state.** When nothing clears the Weak bar: "No resource bottleneck signals found — checked CPU, memory, swap, disk, network, load across N samples," plus an explicit list of subsystems the file contained **no data** for (missing data ≠ healthy).
8. **Page composition** (replacing the three KPI cards + AI summary):
   - File context header (unchanged)
   - Incident window input (with tz selectors)
   - Ranked differential (the centerpiece)
   - All-subsystems timeline strip — one row per subsystem on a shared time axis; **brushing a range sets the incident window**
   - Ticket-ready prose, templated from the findings, with a copy button
9. **Deep dive from findings.** Every finding links to the *most specific* chart page that proves it (a device finding lands on that device's page, not generic I/O), **zoomed to the finding's window** ± context padding.
10. **Calibration:** v1 ships on literature-value thresholds, kept in one documented constants module. Deferred: calibration against a corpus of SAR files from resolved tickets with known outcomes — the gate before tiers should be fully trusted.
11. **PDF export** gets the differential + prose as page one, sourced from the same findings objects. **Heatmaps page** is untouched in v1.

## Implementation plan

### Phase 1 — Findings engine (pure logic, no UI)

New directory `src/client/lib/findings/`:

- **`thresholds.ts`** — every heuristic constant in one documented file (the single tuning surface). Literature starting values: sustained iowait >20%, load-per-core >1.5, sustained swap-in/out >0, %steal >5, %commit >100 with swap corroboration, device %util >90 with rising await, sustained interface errors/drops >0, %vmeff <30, elevated major faults. Each constant carries a rationale comment.
- **`detectors.ts`** — one detector per subsystem, reading via existing `sarStore`/`sarStats`/`sarData` getters. Shared mechanic: walk samples, find rule-breach intervals, merge adjacent breaches, drop intervals below a minimum duration (kills one-sample spikes). Emits `Finding` objects: subsystem, optional device/interface id, human-readable rule text, interval start/end, peak value, `chartTarget` descriptor for deep-linking. Folded-in fix: `cpuCount()` currently counts sidebar DOM nodes (`sarStats.ts:151`) — the load detector derives core count from parsed data instead.
- **`rank.ts`** — scoring and tiers: incident-window overlap first, severity (breach magnitude × duration) second; conservative Strong/Moderate/Weak boundaries; out-of-window findings demoted below in-window ones.
- **`coverage.ts`** — reports which subsystems the file did/didn't contain, powering the empty state.
- **Tests** in `test/`: synthetic rows per detector, plus the bundled sample SAR file as a fixture (expected: zero or Weak-only findings — a regression test against false alarms).

Findings recompute whenever the active index changes, so the existing date-range filter composes for free.

### Phase 2 — Dashboard UI

In `Content.tsx`, replace `#peakBlock` KPI cards and `<AiSummary />` with:

- **`IncidentWindow.tsx`** — optional date/time range + two timezone selects (capture / customer report, default UTC), conversion echo. Window state in a small shared signal/store.
- **`Differential.tsx`** — ranked findings: tier badge, rule text, time range (capture time), deep-link. Empty state per decision 7.
- **`TimelineStrip.tsx`** — one compact row per subsystem, shared time axis (single Plotly figure with stacked subplots; selection events provide brushing). Brushing sets the incident window; finding intervals highlighted on their rows.
- **`TicketSummary.tsx`** — deterministic prose templated from findings, copy button. `AiSummary.tsx` and the Gemini Nano path are deleted.

Peak values keep being computed (they're evidence inside findings) but the cards go; consumers of the peak DOM ids (`waitForPeakData`, PDF export) are repointed at the data layer.

### Phase 3 — Deep links with zoom

New `src/client/lib/findingNav.ts`: maps a `chartTarget` to navigation (click the sidebar button or select the device/interface submenu index — the technique the PDF exporter already uses), then applies `Plotly.relayout({'xaxis.range': [start−30min, end+30min]})` to the rendered containers. Rendering is imperative and async, so this is a pending-zoom handoff: record the desired range, trigger navigation, apply when the render completes.

### Phase 4 — PDF export

`PdfExportBridge.tsx`: the cover's "Peak Summary" block becomes the differential — tiered findings + ticket prose as page one, sourced from the same findings objects (no DOM scraping), so the PDF can never disagree with the dashboard.

### Phase 5 — Docs and cleanup

README (drop the "AI-powered summary" bullet, describe the differential), CHANGELOG, and `docs/heuristics.md` explaining every rule and threshold — the document a TSE cites when a customer asks "why does it say disk saturation?", and where future corpus calibration is recorded.

### Order, verification, risk

Phases land in order; Phase 1 is pure logic and fully unit-testable before any UI changes. Phases 2–3 are verified against the bundled sample file plus a synthetic SAR file with a known injected anomaly (e.g., an iowait storm at a known time) confirming it ranks #1 and the deep link zooms to it. Main risk: the timeline strip's brushing interaction fighting the legacy chart plumbing — fallback is highlight-only rows with the window set via the input field, which loses nothing functionally.

## Deferred (explicitly out of v1)

- Corpus-based threshold calibration from resolved-ticket SAR files (anonymized fixtures).
- Linking findings into the Heatmaps page.
- Workload-specific ranking adjustments.
