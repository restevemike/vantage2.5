# VANTAGE Metrics Method — v1.1.1

This document describes how VANTAGE calculates its local analytics and the limits of the conclusions that can be drawn from them.

## Core principles

- All calculations happen locally on the device.
- Date filters use phone-local calendar dates.
- Different exercise and machine names remain separate.
- Missing macro, RPE, duration, bodyweight or context values are not invented.
- Association is not causation. Nutrition, supplement and cycle comparisons are personal observational signals only.

## Estimated one-rep maximum

The selected formula is applied to the best work set for an exercise on each session date:

- Epley: `weight × (1 + reps / 30)`
- Brzycki: `weight × 36 / (37 - reps)`
- Lander: `weight × 100 / (101.3 - 2.67123 × reps)`

Estimated 1RM is not a tested maximum. It is most useful when machine, setup, range of motion and execution remain consistent.

## Performance index and PB logic

For each selected-exercise session, VANTAGE compares that day's best e1RM with the best e1RM recorded before that date.

- `performance index = current e1RM / previous best × 100`
- a PB is flagged when current e1RM exceeds the previous best by more than a very small rounding tolerance;
- the first session creates a baseline and has no performance index.

The fuel correlation uses performance index rather than raw e1RM so that a naturally rising long-term strength trend is partly normalised against the athlete's previous standard.

## Nutrition matching

Saved individual meals take precedence over an imported daily macro summary for the same date.

For each selected-exercise session, the user chooses one fuel window:

### Same day

Uses total recorded calories and macros on the workout date.

### Previous day

Uses the complete day immediately before the workout.

### Rolling three days

Uses the arithmetic average of available totals from:

- workout day;
- one day before;
- two days before.

A rolling window can contain fewer than three days if one or more daily records are missing. The number of matched fuel days is retained in the analysis row.

## Macro percentages

Macro percentages are calculated from macro-derived energy rather than the entered calorie total:

- protein calories = protein grams × 4;
- carbohydrate calories = carbohydrate grams × 4;
- fat calories = fat grams × 9.

Each macro percentage is its calorie contribution divided by the sum of those three contributions. This avoids distortions caused by fibre, alcohol, rounding or inconsistent food-label calorie totals.

## Nutrition/performance correlation

VANTAGE uses Pearson's correlation coefficient between a chosen nutrition variable and the selected output:

- performance versus previous best;
- estimated 1RM;
- exercise work-set volume.

A correlation is shown only when at least four matched sessions with numeric values for the selected output exist. The UI deliberately uses cautious descriptions:

- near zero: no clear relationship;
- small positive/negative;
- moderate positive/negative;
- strong positive/negative.

Even a strong correlation does not prove that calories or a macro caused better lifting. Relevant confounders include:

- sleep and recovery;
- bodyweight change;
- training cycle and accumulated fatigue;
- exercise order;
- equipment or setup changes;
- RPE accuracy;
- technique and range of motion;
- illness, hydration and stimulant use.

The top-quartile comparison ranks matched sessions by e1RM and compares average calories and macros in the strongest quarter with the remaining sessions. It is descriptive, not a prescription.

## Volume load

Each loaded set contributes:

`weight × reps`

Total volume load includes loaded warm-ups. Work-set volume is calculated separately for relevant comparisons.

## RIR estimate

When RPE is logged:

`estimated RIR = 10 - RPE`

The result is limited to 0–10. This remains subjective because logged RPE is subjective.

## Estimated effective reps

VANTAGE uses a transparent proximity-to-failure heuristic:

- RPE 10 / RIR 0: up to 5;
- RPE 9 / RIR 1: up to 4;
- RPE 8 / RIR 2: up to 3;
- RPE 7 / RIR 3: up to 2;
- RPE 6 / RIR 4: up to 1;
- lower RPE: 0.

This is an estimated comparison tool. It is not a biological measurement and does not prove that lower-RPE work was useless.

## Muscle distribution

Exercises are mapped to their saved primary body group. The module reports:

- direct work-set count;
- volume load;
- estimated effective reps;
- hard sets at RPE 8 or above.

The current version does not allocate fractional indirect sets to secondary muscles.

## Training-cycle calculations

A cycle has:

- a start date;
- a planned number of weeks;
- an inclusive end date of `start + weeks × 7 - 1 day`;
- a category (`phase` or `block`);
- active/inactive status.

Current week is:

`floor((selected date - start date) / 7 days) + 1`

Only dates inside the planned cycle duration receive a cycle week.

Cycle metrics include sessions, sets, volume, average RPE and selected-exercise e1RM change from first to last matched point. These describe what happened during the dated window; they do not isolate the effect of the cycle from other changes.

## Supplement/TRT state history

Each creation, activation, deactivation or edit writes a dated supplement event. For a session date, VANTAGE uses the latest event whose effective date is on or before that date.

The active-versus-inactive comparison reports:

- number of selected-exercise sessions;
- average e1RM;
- best e1RM;
- average work-set volume.

This comparison is highly confounded by training phase, bodyweight, dose changes, duration of exposure, adherence and time. It must not be interpreted as proof that a supplement or prescribed treatment improved or harmed performance.

## Personal benchmarking

VANTAGE calculates:

- e1RM divided by bodyweight;
- the current result's percentile against the user's own saved history for that exact exercise.

It does not claim to reproduce Hevy's population percentile because VANTAGE does not have access to Hevy's comparison dataset.

## Readiness alignment

VANTAGE compares the readiness level stored with the saved record to the actual action:

- Green: strength or LISS is treated as aligned;
- Amber: rest, LISS, deload, BP-watch or recovery-watch is treated as aligned;
- Red: rest or LISS is treated as aligned.

This is a behavioural audit, not medical judgement.

## Wearable biometrics

The PWA uses values already stored in VANTAGE, including LISS heart rate and session duration. Direct Health Connect, Wear OS, Apple Health and Apple Watch ingestion remains reserved for the native APK phase.
