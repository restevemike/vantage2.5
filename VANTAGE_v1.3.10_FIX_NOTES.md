# VANTAGE Training Console v1.3.10 — Validation & LISS Reliability

## Release intent

v1.3.10 is a stabilisation release built from the 20 August 2026 Shoulders & Triceps correction pack and the real-world v1.3.9 LISS/Bluetooth test feedback.

The release keeps the improved v1.3.9 media/date/confirmation model, but makes validation field-level, separates session completion from Coach Pack export, removes FTMS Bluetooth from the normal training workflow, completes vitals linkage, and moves recovery actions fully into the dedicated Recovery module.

## P0 — evidence and LISS reliability

- Fixed the shared NOOP activity-summary parser so AVG, PEAK/MAX and LOW/MIN are independently label anchored.
- Regression example now parses `AVG 96 / PEAK 145 / LOW 64` correctly.
- Fixed NOOP HR-zone minute mapping. Inline zone rows keep their own minute values; Z1 minutes cannot leak into Z5.
- 20 August regression now preserves exactly:
  - Z1 67% / 46m
  - Z2 28% / 19m
  - Z3 4% / 2m
  - Z4 1% / 0m
  - Z5 0% / null when no minutes are displayed.
- Preserves decimal Effort values and explicit `0.0` source values.
- Suspicious-but-visible NOOP calories/Effort remain raw evidence and are excluded from energy/load analytics rather than replaced with invented values.
- OCR promotion is now field-level. A blocked LOW HR or zone-minute field no longer blanks valid AVG/MAX/zones for the whole record.
- Validation tracks validated fields and blocked-review-required fields separately.
- Readable reports now surface unresolved warnings by category instead of claiming there are no warnings.

## LISS completion/export regression

- **Finish LISS now saves and closes the session before Coach Pack validation/export.**
- Evidence problems can no longer trap the user inside an active LISS session.
- Missing/unassigned/unconfirmed evidence now produces a post-save message such as `Session saved — Coach Pack requires evidence review`.
- Missing treadmill/StairMaster console evidence leaves export available from History rather than blocking session completion.
- Normal LISS no longer persists FTMS Bluetooth data into the completed session.

## Bluetooth / machine connectivity

- Removed the FTMS Bluetooth connect controls from the normal treadmill/StairMaster workflow after real gym testing showed the available consoles expose Bluetooth mainly for audio/HR-device pairing rather than a usable standard workout-data stream.
- Console screenshots/manual machine fields remain the supported machine-data route.
- `ftms-bluetooth.js` remains in the codebase/cache as an experimental diagnostic foundation for future genuinely FTMS-compatible machines; it is not part of normal workout operation.

## Same-day vitals

- Expanded the canonical vitals import/form support for Status, Guidance, stress band, respiratory rate, sleep efficiency and daily hydration consumed/target.
- Strength/LISS reporting uses the fuller same-day vitals object instead of separate incomplete field maps.
- Baseline deltas, sleep and cuff-pulse evidence remain source separated.

## Recovery ownership change

- **Vitals no longer owns or auto-populates recovery actions.**
- Legacy `recoveryActivities` entries in an imported vitals Markdown file are ignored with a warning.
- The Vitals UI no longer shows a recovery-action list.
- Recovery actions/routines are owned by the dedicated Recovery section.
- Added the standing default daily Recovery routine:
  - Inversion — 5 min on waking
  - Inversion — 5 min pre-training
  - Inversion — 5 min post-training
  - Acupressure — 30 min pre-bed
- Default items support daily completion/skip semantics. Planned future items are not automatically recorded as completed.

## Readiness and post-session audit

- Amber readiness wording is now `Amber — controlled training permitted` where the rules allow controlled resistance work.
- Readiness exposes recommended intensity, volume band and allowed actions separately from the actual action taken.
- Strength Coach Pack includes post-session outcome structure for later readiness-vs-outcome analysis.

## Exercise and set integrity

- Large load changes on the same source exercise ID are downgraded to `review` confidence when machine/load metadata are incomplete.
- Same source ID alone is no longer enough for high-confidence comparison in those cases.
- Added set-level consistency warnings including `Failure = Yes` with unusually low RPE. VANTAGE flags the contradiction but never silently changes either value.
- Existing exercise identity overlap review remains non-destructive: possible duplicates are flagged, never auto-merged.

## Reporting/export workflow

- Human-readable strength reports now prominently include VANTAGE App Version, Coach Pack Schema and Coach Pack Revision.
- Re-exporting a saved strength session increments `coachPackRevision` while retaining the same session ID, allowing Coach Pack regeneration after nutrition/macros are imported without duplicating the workout.
- Session hydration is reported separately from daily hydration consumed/target.
- Clean hash-based media packaging/deduplication from v1.3.9 is retained.
- Improved date state model is retained: detected date, session-date match and user confirmation remain separate.

## PWA / data compatibility

- App version: **1.3.10**
- Service-worker cache: `vantage-training-console-v13-10`
- Existing PWA identity is intentionally unchanged:
  - `id: ./vantage-training-console-v133`
  - `start_url: ./?pwa=133`
- Existing `http://localhost:8080` IndexedDB data remains compatible.

## Verification

- JavaScript syntax checks: PASS
- Full automated regression suite: **152 / 152 PASS**
- Local HTTP smoke test: **200 OK**
- Served version check: **v1.3.10**
