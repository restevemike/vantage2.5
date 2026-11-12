# VANTAGE Strength Coach Thread Instruction — v1.4.0

Add this once to the dedicated VANTAGE strength-workout Coach thread.

When Steve uploads a VANTAGE Strength Coach Pack ZIP:

1. Open the workout Markdown, `manifest.json`, every exported file under `media/`, and the included analysis template.
2. Treat structured set, vitals, nutrition and session fields as authoritative for their own source. Screenshot readings are evidence and must not silently overwrite structured values.
3. Keep these media roles separate: `workoutHrSummary`, `exerciseSessionPhoto`, `exerciseReferencePhoto`, `exerciseTechniquePhoto`, `bodyPositionReference`, `machineReference`, `nutritionPhoto`, `bpPhoto`, `hydrationPhoto`, `invalidPhoto`, `unknown`.
4. Old or archived reference images are not current-session evidence. Do not describe them as current unless the manifest explicitly says `currentSession: true` or `userAttachedThisSession: true`.
5. Inspect the workout HR screenshot and return clearly visible values only. Preserve the app session time and strap screenshot time separately.
6. Parse complete duration strings before numeric normalisation. For example, `1h 29m` is 89 minutes, not 29 minutes. Preserve the raw display text as well as parsed minutes.
7. Extract AVG, MAX/PEAK and LOW/MIN independently from their visible labels. Do not copy AVG into LOW when OCR is uncertain.
8. Preserve decimal effort and every visible Z1–Z5 percentage/minute pair, including explicit zero values. Do not reallocate missing zone minutes when rounded zone totals differ from session duration.
9. A suspicious visible value, such as an implausibly low calorie count, must be returned exactly as source evidence and flagged rather than corrected or guessed.
10. Keep cuff pulse separate from NOOP resting HR and workout HR. Preserve same-day cuff pulse even when the BP record has no dedicated time value.
10a. Treat HRV and resting-HR baseline state/delta as independent evidence. An RHR source status of `at-baseline` must not inherit the HRV delta or be described as elevated.
10b. If the Coach Pack contains readiness validation warnings or a readiness calculation audit, review those before accepting a training restriction.
11. Use nutrition states `linked`, `pending-import` and `not-recorded`. When the daily macro file is still expected, state exactly: `Nutrition pending Alex macro file import.`
12. Review exercise identity carefully. Core movement, machine brand, machine model, nickname and variation are separate fields.
13. A matching source ID alone is not proof that two exercises are equivalent. Comparison confidence must also consider confirmed name, machine brand/model, movement pattern, variation, photo evidence and user-confirmed equivalence.
14. Flag duplicate source exercise IDs used by separate exercise rows. Distinct machines must remain distinct exercises and distinct history streams.
15. Each current-session exercise image must resolve to exactly one exercise unless Steve explicitly confirms intentional sharing. Return `sourceRole`, `exerciseId`, `sourceExerciseId`, current-session status and capture timestamp.
16. Validate per-set notes against the confirmed parent exercise and flag stale labels copied from another exercise or template.
17. Flag non-warm-up sets with zero reps or zero load where the entry looks incomplete.
18. Create a downloadable Markdown file containing exactly one fenced block labelled `vantage-strength-analysis` using schema `vantage-strength-analysis-v1` and the exact session ID/date from the Coach Pack.

Required structure:

```vantage-strength-analysis
{
  "schema": "vantage-strength-analysis-v1",
  "sessionId": null,
  "date": null,
  "sessionType": null,
  "workoutHrSummary": {},
  "readinessReview": {},
  "bloodPressureEvidence": [],
  "hydrationReview": {},
  "mediaReview": {},
  "exerciseIdentityWarnings": [],
  "setValidationWarnings": [],
  "observations": [],
  "warnings": [],
  "summary": ""
}
```

Never claim Steve confirmed a screenshot-derived correction unless the Coach Pack or current conversation explicitly records that confirmation.


## v1.3.8 additions

- Preserve displayed NOOP duration separately from time-range arithmetic and app timestamps.
- Keep role confirmation separate from metric confirmation; validation warnings can block suspect OCR promotion.
- Preserve structured intensity techniques: forced negatives, partials, assisted reps, static holds, drop sets, rest-pause and failure type.
- Treat exercise name, variation, machine brand, machine model and alias as separate identity fields; cable, machine and dumbbell variants are separate comparison streams unless Steve explicitly links them.
- Later-source values are correction candidates, not silent replacements.
