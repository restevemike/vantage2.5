# VANTAGE v1.3.10.4 — Vitals & Readiness Integrity

**Baseline:** v1.3.10.3 Tall-Screen UI  
**Primary corrective specification:** `VANTAGE_2026-08-26_Vitals_Readiness_Corrections-1.md`

## Purpose

Fix the 26 August vitals-import defect that copied the HRV delta into resting-HR readiness context and incorrectly generated **Red — recovery only** from otherwise productive morning vitals.

## P0 fixes

### HRV and resting-HR baseline evidence are independent
- `hrvDeltaFromBaseline` and `rhrDeltaFromBaseline` are parsed independently.
- Added explicit `hrvBaselineStatus` and `rhrBaselineStatus` states:
  - `known`
  - `at-baseline`
  - `above-baseline`
  - `below-baseline`
  - `unknown`
- An explicit RHR status of `at-baseline` is neutral and blocks any conflicting non-zero RHR delta from readiness.
- HRV +11 can no longer silently become RHR +11.
- Same non-zero HRV/RHR deltas generate an import-integrity warning unless independently sourced.

### False Red readiness fixed
The exact 26 August dataset now resolves without the erroneous RHR rule:
- Recovery 90
- Rest 90
- HRV 70 / +11
- RHR 43 / at baseline
- Stress 0.9 Low
- Status Solid
- Synthesis Peak
- Guidance Maintain
- BP 139/72
- Symptoms false

Expected current result: **Green — productive session allowed**.

### Readiness contradiction checks
Readiness now records validation warnings when a Red result conflicts with favourable imported context unless an independent hard limiter exists.

### Readiness calculation audit
Coach Packs now retain:
- recovery and rest
- HRV / delta / baseline status
- RHR / effective delta / raw delta / baseline status
- stress / stress band
- synthesis
- sleep hours
- BP
- symptoms
- exact rules triggered
- readiness validation warnings

## P1 fixes

### Synthesis Peak preserved
`Peak` is now a supported synthesis state in import, form review, saved vitals and Coach Packs.

### Current sleep summary preserved
- Current sleep duration/performance/efficiency/debt can be imported from flat or nested current-summary structures.
- `sleepStageDetailStatus` can carry values such as `date-conflict` without deleting valid current sleep totals.
- Added support for hours-vs-needed %, restorative sleep %, and sleep-ledger context.

### Unsupported fields are no longer silent
Unknown structured vitals fields now create visible import warnings and are retained in the saved import-warning metadata.

### Import metadata survives Save vitals
The app preserves:
- import warnings
- unsupported fields
- field-source mapping
- source format
- source filename
- sleep display text and integrity metadata

An empty form field no longer silently erases a valid previously saved status/synthesis/guidance value on the same date.

## P2 robustness

### Large day-to-day weight change context
An absolute daily change of **2.0 kg or more** is preserved but flagged for context review instead of being treated as body-tissue change.

### Missing workout telemetry remains missing
No changes were made that convert missing NOOP workout data into zero load/calories/HR.

## Coach Pack changes
- HRV and RHR baseline status are displayed explicitly when no numeric baseline exists.
- `at-baseline` RHR displays as such rather than as an invented delta.
- Vitals-linkage warnings include import-integrity/readiness/weight-context warnings.
- Machine-readable `readinessSnapshot` now contains `readinessCalculationAudit`.

## Vitals UI / file prompt
- Added HRV baseline-status and RHR baseline-status selectors.
- Added `Peak` to synthesis options.
- Updated the downloadable/copyable VANTAGE vitals prompt so HRV/RHR deltas cannot be cross-filled and Recovery actions remain outside Vitals.

## Regression result

The exact 26 August source test passes with:

```json
{
  "hrv": 70,
  "hrvDeltaFromBaseline": 11,
  "hrvBaselineStatus": "above-baseline",
  "restingHr": 43,
  "rhrDeltaFromBaseline": null,
  "rhrBaselineStatus": "at-baseline",
  "stress": 0.9,
  "stressBand": "Low",
  "status": "Solid",
  "synthesis": "Peak",
  "guidance": "Maintain"
}
```

and does **not** produce `Red — recovery only / Resting HR is well above baseline`.
