# VANTAGE v1.3.10.5 — History, Profile & Data-Linking Foundation

## Baseline
Built from v1.3.10.4 Vitals & Readiness Integrity. Retains the v1.3.10.3 tall-screen/Xperia layout and v1.3.10.2 LISS hard-save behaviour.

## 1. Previous-session history repaired
- Replaced template-perfection-first selection with session-family recency first.
- For Back, Legs, Chest & Biceps, Shoulders & Triceps etc., the most recent prior session in that family now wins even if an exercise was temporarily substituted, renamed or omitted.
- Added one-time `v13105HistoryRepair` migration to recalculate existing `previousSessionId` links.
- Previous weights/reps, previous-session date and Coach Pack comparisons use compatible exercise identity rather than source ID alone.

## 2. One canonical exercise comparison stream
- Added canonical identity fields/logic for core exercise, variation, brand, model, grip, stance, unilateral state, load convention and explicit `comparisonStreamId`.
- Source IDs are provenance and no longer define the metrics stream by themselves.
- Notes that contradict the stored movement/equipment automatically force identity review.
- Temporary substitutions use their replacement exercise's separate comparison stream.
- History, previous-set display, progression, PB/e1RM and Fuel & Performance now use the shared identity engine.
- Added History → History matching audit.
- Added explicit `Confirm equivalent` action for a user-approved historical variant/machine when load convention really is comparable.

## 3. Same-day vitals/readiness linkage
- New sessions resolve vitals in this order: exact `vitalsId`, same Europe/London local date, latest valid same-date record at/before start.
- Vitals and readiness are frozen into the session at start.
- Existing sessions with missing vitals/readiness are repaired once by `v13105VitalsLinkRepair` using same-local-date evidence.
- Coach Pack export can repair a missing legacy link without silently changing an already-recorded valid readiness decision.
- UTC/BST rollover no longer controls same-day matching.

## 4. Expanded vitals schema
Now retains structured fields including:
- BP time/status and weight change
- body fat, muscle mass, body water, visceral fat, fat mass and fat-free weight
- blood oxygen object and separate respiratory sources
- sleep window, time in bed, sleep stages/consistency
- Baevsky stress index, autonomic balance and calm-time percentage
- training recommendation and approximate nutrition targets
- trend-only blood components/device estimates

Unknown future fields are preserved under `extensions` and warned once rather than silently discarded.

## 5. Profile foundation
- Added Data → Profile.
- Existing local records are stamped with a stable `profileId` on first launch.
- Profile stores name, birth year, height, sex, units, timezone, goal, training experience, target bodyweight, food preferences/exclusions and notes.
- Existing benchmark sex/birth-year fields remain compatible with the Profile.
- Coach context and strength manifests expose profile identity for future multi-user migration.

This is deliberately local-first. It prepares the schema for a later Lovable/Supabase small-group beta without moving Steve's data to the cloud yet.

## 6. Daily hydration linkage
- Session hydration remains its own event.
- Recorded session hydration can contribute once to the same-day vitals hydration ledger.
- Session IDs prevent repeated automatic contribution.
- If a manual daily hydration total already exists, VANTAGE preserves that value rather than blindly adding and risking double counting.

## 7. Macro re-link
- Importing a valid same-day VANTAGE macro file now links existing sessions from that date.
- Workout recreation is not required.
- Existing Coach Pack revision/re-export behaviour is retained.
- `Nutrition pending Alex macro file import.` remains the pending wording until a valid day is linked.

## 8. Medication / injection administration events
- Active supplement/TRT plan and actual administrations are separate.
- Added Supplements → Medication / injection events.
- Records date, dose, unit, route and user-confirmed source.
- Same-day sessions can be updated with the dated administration event.
- VANTAGE never assumes an injection occurred just because an item is active in the stack.

## 9. HR source quality / zone integrity
- Existing suspicious NOOP values remain source evidence.
- Added normalised metric quality states (`valid`, `suspect`, `invalid`, `not-recorded`) alongside the existing source-quality model.
- Added `zoneMinutesIncomplete` when percentages exist but visible minute values do not.
- Suspect calories/Effort remain excluded from derived energy/load analysis unless validated.

## Preserved behaviour
- LISS Finish hard-save remains save/close first.
- FTMS remains hidden from normal workout flow.
- NOOP/watch/machine values remain source-separated.
- Incompatible calories/HR are never averaged.
- Current vs archived/reference media remain distinct.
- Tall portrait/Xperia UI remains intact.
- Recovery remains separate from Vitals.
- HRV/RHR baseline integrity from v1.3.10.4 remains intact.

## Verification
- 172/172 automated regression tests passed.
- JavaScript syntax checks passed for app/history/metrics/vitals/OCR/workout export modules.
- Service worker cache advanced to `vantage-training-console-v13-10-5`.
- Local HTTP smoke test passed.
- ZIP integrity verified after packaging.
