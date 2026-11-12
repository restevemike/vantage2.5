# VANTAGE Training Console v1.3.7 — Strength Evidence & Identity Fix

**Based on:** v1.3.6  
**Correction source:** VANTAGE Strength Coach correction pack for Chest & Biceps, 6 August 2026

## What was wrong

The 6 August Coach Pack retained the set rows but exposed faults in strength HR extraction, cuff-pulse linkage, nutrition state, exercise identity, photo linkage and historical comparison confidence.

The most serious issue was stale exercise identity: separate machines could inherit the same `sourceExerciseId`, the wrong historical exercise and both current-session photos.

## Fixes included

### Strength HR evidence

- Parses `1h 6m`, `1h 24m`, `1h 29m` and `2h 05m` as complete durations.
- Retains the raw visible duration text alongside parsed minutes.
- Extracts AVG, MAX/PEAK and LOW/MIN independently.
- Does not fill LOW from AVG when a separate low-HR label is present but unclear.
- Preserves decimal effort values such as `21.4`.
- Preserves all Z1-Z5 percentages and minutes, including `0% / 0 min`.
- Does not invent missing minutes when rounded zone totals differ from total duration.
- Stores raw OCR text, parsed evidence tokens and extraction confidence.
- Retains suspicious visible calories as evidence and flags them instead of replacing them.

### Cuff pulse and nutrition

- Imports cuff pulse from a structured field or same-day vitals notes.
- Keeps cuff pulse separate from resting HR and workout HR.
- Adds nutrition states: `linked`, `pending-import` and `not-recorded`.
- Uses the required pending wording: `Nutrition pending Alex macro file import.`

### Exercise identity and history

- Keeps display name, machine brand, machine model, movement pattern, nickname and variation as separate fields.
- Infers brand/model/movement from a confirmed correction where the corrected name provides them.
- Updates both the historical session and its workout template.
- Assigns a new unique source identity where a machine, movement or duplicate identity changed.
- Preserves the former name as an alias without allowing the alias to revive invalid history.
- Stops comparisons against the former source identity.
- Allows future comparisons once subsequent sessions use the corrected source identity.
- A matching source ID alone no longer produces high confidence.
- Machine, movement, variation, imported photo conflict and user-confirmed equivalence affect comparison confidence.

### Duplicate IDs and media

- Detects separate exercise rows sharing one `sourceExerciseId`, even when stale stored names are identical.
- Blocks completion/export until duplicate identities are merged or separated.
- Current-session images link to the unique session exercise ID.
- The original `sourceExerciseId` remains separately available in the manifest.
- Legacy source-ID image links are only recovered when they resolve to exactly one exercise.
- Ambiguous or unlinked current-session images block Coach Pack export.
- Manifest entries include `sourceRole`, `linkedExerciseId`, `sourceExerciseId`, current-session state and `createdAt`.
- OCR evidence metadata includes parsed evidence and extraction confidence.

### Imported correction action

After importing a corrected `vantage-strength-analysis` file, History now offers:

```text
Apply confirmed exercise and media corrections
```

The action can:

- correct confirmed exercise names and machine identity;
- update the corresponding workout template;
- separate duplicate/stale source identities;
- invalidate wrong historical comparison streams;
- replace stale per-set exercise labels without overwriting unrelated notes;
- remap named current-session image files to one corrected exercise;
- import confirmed same-day blood-pressure and cuff-pulse evidence;
- retain an audit of every applied correction.

Workout HR evidence still requires the separate explicit action:

```text
Use confirmed HR screenshot values
```

This preserves the rule that imported analysis cannot silently overwrite structured session data.

## Correcting the existing 6 August session

1. Install v1.3.7.
2. Open **History**.
3. Open the **Chest & Biceps** session dated 6 August 2026.
4. Select **Import Coach analysis**.
5. Choose `VANTAGE_Strength_Analysis_2026-08-06_Chest_and_Biceps_Corrected.md`.
6. Select **Apply confirmed exercise and media corrections**.
7. Select **Use confirmed HR screenshot values**.
8. Reopen the session and verify Seated Hammer Curl and Prime Arm Curl are separate.
9. Export a fresh Coach Pack.

Expected corrected HR evidence:

- 18:09-19:38
- 89 minutes
- Average HR 105 bpm
- Maximum HR 157 bpm
- Minimum HR 82 bpm
- 122 kcal, retained with a suspicious-value warning
- Effort 21.4
- Z1 48% / 39 min
- Z2 39% / 32 min
- Z3 10% / 8 min
- Z4 3% / 2 min
- Z5 0% / 0 min

## Verification

- 125 automated tests pass.
- All JavaScript files pass syntax checking.
- PWA cache advanced to `vantage-training-console-v13-7`.
- Existing manifest identity, app ID, icons and `localhost:8080` IndexedDB origin are unchanged.
