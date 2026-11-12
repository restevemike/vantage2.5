# VANTAGE Training Console v1.3.6 — Fix notes

## Scope

This release applies Steve's corrections from the screenshots supplied on 5 August 2026. It is built directly on v1.3.5 and preserves the same PWA identity, `localhost:8080` origin and IndexedDB storage.

## 1. Recovery layout

### Previous behaviour

Every recovery activity was displayed as a separate large card. Even when collapsed, the full list made the page unnecessarily long.

### New behaviour

- Category headings such as **Restorative recovery**, **Movement recovery**, **Thermal stressors** and **Other** remain visible.
- One **Recovery session** dropdown appears beneath each heading.
- Selecting an activity displays only that activity's entry form.
- Existing duration, timing, intensity, notes and save behaviour remain unchanged.

## 2. Add-set placement

### Previous behaviour

The `+ Set` control was in the exercise header, away from the set rows.

### New behaviour

- The control is now labelled **+ Add set**.
- It sits directly beneath the final set row.
- A newly added set appears immediately above the button.
- The new set still inherits sensible values from the preceding set.
- The control remains hidden when an exercise is collapsed.

## 3. Calories/macros versus workout output

### Previous behaviour

Fuel analytics were based on one exactly matched exercise. A Back workout could be excluded or give a narrow reading when the exercise list changed from week to week.

### New behaviour

Fuel analytics are now based on **workout session families**.

Examples:

- Back
- Legs
- Chest & Biceps
- Shoulders & Triceps
- Chest
- Shoulders
- Arms

A workout remains in the comparison when one exercise is added or removed, provided the overall session family is the same.

### Performance-output options

1. **Normalised session performance** — recommended default.
   - Calculates each exercise's performance against its own prior comparable history.
   - Uses the median of the comparable exercise changes for that workout.
   - This prevents one unusual exercise from dominating the whole-session score.
   - Newly added exercises do not invalidate the session; they simply wait for prior history before contributing to the normalised score.
2. **Work-set volume per exercise** — reduces distortion from adding or removing one exercise.
3. **Work-set volume per set** — compares average loaded work per work set.
4. **Total work-set volume** — shows raw session tonnage and is intentionally sensitive to session size.

Where machine brand, model or variation is recorded, different machine identities remain separate for the normalised comparison.

### Display changes

- Added a **Session family** selector.
- Summary cards show matched sessions, usable output samples and session PBs.
- The insight panel explains the comparison method.
- Session rows show workout name, macros, exercise count, work-set count and the selected output.

## Data safety and compatibility

- Existing IndexedDB data is not migrated or rewritten.
- Existing workouts, photos, macros, recovery logs and settings remain in the same browser origin.
- The PWA manifest identity remains unchanged to prevent a duplicate installation.
- Old saved fuel-output preferences are mapped to the nearest new session output.

## Verification

- JavaScript syntax checks passed.
- **116/116 automated tests passed.**
- Existing v1.3.5 StairMaster, OCR, evidence, workout-history, recovery, database and export tests still pass.
- New regression tests cover variable Back-session matching, recovery dropdown layout and bottom add-set placement.
