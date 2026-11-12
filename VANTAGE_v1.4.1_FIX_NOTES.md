# VANTAGE v1.4.1 — Flint Grey + Hybrid Heavy Duty Cycle

## Summary

v1.4.1 builds on v1.4.0 and adds the new `VANTAGE | Hybrid Heavy Duty Maintenance Programme` as a native programme/cycle preset rather than treating the Markdown file as a completed workout.

## New Hybrid Heavy Duty cycle

- Eight-week maintenance training block.
- Two-week repeating rotation.
- Week 1: A / LISS / B / LISS / A / LISS / recovery walk or rest.
- Week 2: B / LISS / A / LISS / B / LISS / recovery walk or rest.
- Six generated routine templates:
  - HDM A · Legs, Chest & Triceps
  - HDM B · Back, Shoulders & Biceps
  - HDM LISS · Incline Treadmill
  - HDM LISS · Easy Cycle / Walk
  - HDM LISS · Outdoor Walk
  - HDM Recovery Walk / Rest
- Quick-create button creates the eight-week training block and activates the matching programme.
- Planned sessions are not marked completed until actually logged.

## Workout A prescription

1. Leg Press — 2 × 8–12
2. Seated Leg Curl — 2 × 8–12
3. Leg Extension — 1–2 × 10–15 (template starts at 2; editable)
4. Standing Calf Raise — 2 × 10–15
5. Incline Machine Chest Press — 2 × 6–10
6. Pec Deck — 2 × 10–15
7. Rope Cable Triceps Pushdown — 2 × 8–12

Exercise notes preserve the shoulder-safe guidance and A-session order note from the source programme.

## Workout B prescription

1. Neutral-Grip Cable Lat Pulldown — 2 × 6–10
2. Chest-Supported Machine Row — 2 × 8–12
3. Machine Pullover — 1 × 10–12
4. Cable Lateral Raise — 2 × 12–20
5. Reverse Pec Deck Fly — 2 × 12–20
6. Cable Curl — 2 × 8–12
7. Hammer Curl — 1 × 10–12

## Training UI

The training builder now exposes a clearer navigation pattern:

- Cycles
- Routines
- Exercises

Routine exercise cards show the prescription (working sets, target reps, rest and RIR) and can be edited inline without rebuilding the whole routine. Exercises can still be reordered, removed or added from the full library.

## Flint Grey theme

The main VANTAGE palette is now Flint Grey:

- background `#111315`
- cards `#1b1e20`
- secondary surfaces `#25292c`
- raised surfaces `#30363a`
- accent `#899197`
- text `#f1f2f2`
- muted text `#9ca2a6`

Readiness keeps independent semantic Green / Amber / Red colours.

## Data integrity

- Existing workout history is not rewritten.
- Routine edits affect saved templates/future sessions, not completed historical sessions.
- Exercise identities remain separate for substitutions and different machine variations.
- Programme creation produces planned structure only; no session is automatically completed.

## Validation

- 186/186 automated tests pass.
- All JavaScript files pass `node --check`.
- Hybrid Heavy Duty preset resolves all prescribed exercises against the built-in exercise catalogue (0 missing exercise names).
- Service worker cache advances to `vantage-training-console-v14-1`.
