# VANTAGE Training Console v1.3.8 — Evidence Pipeline Stabilisation

**Built:** 2026-08-13  
**Baseline:** v1.3.7  
**Primary correction specification:** `VANTAGE_2026-08-10_11_App_Improvements-2.md`

## Purpose

v1.3.8 consolidates the outstanding LISS and strength evidence problems observed on 7, 10 and 11 August. The main change is architectural: media persistence, source roles, OCR validation, metric confirmation, same-day vitals linkage and physiological classification are kept as separate stages rather than allowing one stage to silently overwrite another.

## 1. OCR validation and promotion

- AVG, PEAK/MAX and LOW/MIN remain independent fields.
- If a separate LOW/MIN label exists and OCR produces LOW = AVG, automatic structured promotion is blocked.
- A minimum HR above average HR is also blocked.
- Decimal effort tokens are preserved (`22.6`, `16.9`, `16.0`).
- Z1–Z5 percentages and visible minutes are label-paired.
- Explicit visible `0m` remains zero.
- A zone percentage with no visible minute value remains `null`; v1.3.8 does not invent `0m`.
- Visible zone totals are not normalised to 100% or to full session duration.
- Suspicious calorie readings such as `4 kcal` or `0 kcal` remain source evidence and are excluded from automatic energy interpretation.
- OCR now returns raw metrics plus a separate `promotionMetrics` result and validation state.

## 2. Duration evidence remains source-separated

NOOP screenshots can now retain:

- displayed duration,
- raw displayed duration text,
- duration calculated from the visible time range,
- visible time range,
- app start/completion timestamps,
- user-entered duration,
- machine duration where present.

For the 10 August example, `57m` remains the displayed duration while `07:27-08:25` separately yields 58 minutes.

## 3. NOOP saved/current-stream semantics

- `noopSessionStreamSaved` is a separate source role.
- Average HR on the saved/current-stream screen remains separate from the activity-summary average HR.
- Configured Max HR and Top Zone threshold have dedicated fields.
- A displayed configured Max HR such as `173 bpm` is no longer promoted into `sessionMaxHr`.
- The activity-summary peak remains the session peak when that is the source that actually reports the session maximum.

## 4. Later historical correction candidates

Added support for `noopHistoricalWorkoutCard` and a correction-candidate model.

A later historical value such as:

- current-session screenshot calories = `4`,
- later historical card calories = `424`,

is stored as a correction candidate instead of silently overwriting history.

## 5. Coach Pack media integrity

- Every LISS image is hashed with SHA-256.
- Duplicate binary images are detected before export.
- The same binary cannot be exported under incompatible source roles.
- Exact duplicates with the same role are reduced to one packaged binary.
- Expected media IDs remain in session state even if their local record disappears, so a missing file is detectable.
- Coach Pack export is blocked if a current-session image expected by the session is missing.
- Manifest audit now records:
  - `appMediaStateCount`
  - `storedMediaCount`
  - `manifestMediaCount`
  - `zipMediaFileCount`
  - `uniqueMediaHashCount`
  - duplicate hash groups
- Role/content sanity checks run where OCR text is available.
- A NOOP walking/HR screen cannot pass export as a BP image once the mismatch is detectable.

## 6. Confirmation semantics

The following states are independent:

- `roleConfirmed`
- `dateConfirmed`
- `metricsConfirmed`
- `ocrReviewed`

Confirming what an image **is** no longer confirms every OCR number on it.

`user-confirmed-ocr` is only used after the user explicitly applies/reviews OCR metrics. Keeping OCR as evidence leaves the numerical values unconfirmed.

## 7. Full same-day vitals linkage

The vitals importer now accepts and preserves additional `vantage-vitals-v1` aliases used by current files, including:

- `rest`
- `status`
- `guidance`
- HRV baseline delta
- resting-HR baseline delta
- respiratory rate
- stress band
- sleep duration strings such as `7h13m` and `8h18`
- sleep performance
- sleep efficiency
- sleep debt today
- blood-pressure pulse / cuff pulse

LISS and strength reports surface the fuller same-day snapshot rather than reporting existing values as not recorded.

## 8. Physiology separated from readiness compliance

LISS now reports two different concepts:

- `physiologicalClassification`
- `readinessCompliance`

A session that is almost entirely Z1/Z2 can remain `true-liss` even when it was too long or too Z2-heavy for a depleted/red-recovery day.

For the 11 August example:

- physiological classification: `true-liss`
- readiness compliance: `above-target-for-red-recovery-day`

Red/depleted recovery-day guidance now uses a 20–30 minute cap. A brief isolated maximum-HR spike cannot by itself turn a predominantly Z1/Z2 session into conditioning.

## 9. Hydration semantics and deduplication

Hydration has one explicit state:

- `recorded-intake`
- `explicitly-none`
- `not-recorded`

Repeated variants such as `Eaas and electrolytes + EAAs and electrolytes` are normalised into one logical content set (`EAAs`, `electrolytes`).

## 10. Exercise identity and history repair

The canonical model remains separate:

- exercise name
- variation
- machine brand
- machine model
- aliases

A one-time v1.3.8 migration repairs the earlier Dumbbell Lateral Raise migration case where an unbranded dumbbell exercise could have been converted into a generic Machine Lateral Raise.

Cable, machine and dumbbell variants continue as separate comparison streams unless explicitly linked.

## 11. Structured intensity techniques

Each strength set now has optional structured controls for:

- forced negative reps
- partial reps
- assisted reps
- static hold seconds
- drop set
- rest-pause
- failure type
- per-set note

The completed strength report includes these techniques in the set table and retains them in the machine-readable session object.

## 12. Strength correction candidates

The strength-analysis template now supports:

- `correctionCandidates`
- `intensityTechniqueCorrections`

This allows later evidence or Coach analysis to propose a correction without silently rewriting source history.

## 13. 11 August Z4/Z5 rule

The correction specification states Z4/Z5 percentages of `0%`, but does not explicitly establish visible `0m` values for those two zones. v1.3.8 therefore preserves:

- Z4 = `0%`, minutes = `null`
- Z5 = `0%`, minutes = `null`

unless `0m` is actually visible/extracted. This follows the source-preservation rule rather than inventing missing data.

## Verification

- Full automated regression suite: **135 / 135 passed**.
- JavaScript syntax checks passed for the modified modules.
- OCR regression examples passed for the 10 August strength and 11 August walking cases.
- Same-day vitals alias regression passed.
- Duplicate-hash / incompatible-role regression passed.
- LISS physiology/readiness separation regression passed.
- Structured intensity-technique export regression passed.
- PWA cache advanced to `vantage-training-console-v13-8`.
- Existing manifest identity and `localhost` IndexedDB origin were preserved.
