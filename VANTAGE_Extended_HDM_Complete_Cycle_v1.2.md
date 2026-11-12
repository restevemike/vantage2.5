---
document_type: vantage_training_programme_extension
schema_version: "1.2"
programme_id: VANTAGE-HDM-EXTENDED-2026-10
programme_name: "VANTAGE | Extended Hybrid Heavy Duty — Maintenance to Lean Mass"
programme_version: "1.2"
timezone: Europe/London
cycle_start_date: "2026-10-25"
planned_cycle_end_date: "2026-12-06"
status: active
import_mode: extend_existing_programme

merge_rules:
  preserve_existing_programme: true
  preserve_existing_sessions: true
  preserve_existing_hdm_a_history: true
  preserve_existing_hdm_b_history: true
  preserve_existing_liss_history: true
  preserve_existing_vitals_snapshots: true
  preserve_existing_exercise_progression: true
  do_not_duplicate_existing_templates: true
  add_new_templates:
    - HDM-C
    - HDM-D
  first_new_template_date: "2026-10-30"
  historical_sessions_must_not_be_rewritten: true
  future_schedule_may_be_extended: true

phase_defaults:
  maintenance_weeks: 2
  lean_mass_transition_weeks: 4
  resistance_days_per_week: 3
  formal_liss_days_per_week: 2
  minimum_full_rest_days_per_week: 1
  progression_method: double-progression
---

# VANTAGE | Extended Hybrid Heavy Duty — Maintenance → Lean Mass

## 1. Purpose

This file extends the existing VANTAGE Hybrid Heavy Duty programme.

It **must not replace or duplicate** the already recorded:

- HDM-A sessions
- HDM-B sessions
- LISS sessions
- workout history
- exercise progression
- readiness snapshots
- vitals
- Coach Pack evidence

The existing A/B/LISS history forms the beginning of this extended programme.

The extension adds:

- `HDM-C` — Legs / Chest / Triceps variation
- `HDM-D` — Back / Shoulders / Biceps variation
- a complete six-week rotation
- maintenance → lean-mass transition logic
- phase-specific volume prescriptions
- exercise-specific progression identities
- recovery and blood-pressure gating

---

# 2. Existing recorded work

The app should treat the following as **existing historical programme data**, not as new planned entries.

## Week 1 already underway

| Date | Day | Session | Status |
|---|---|---|---|
| 2026-10-26 | Monday | HDM-A | **Already recorded — preserve** |
| 2026-10-27 | Tuesday | LISS | **Already recorded — preserve** |
| 2026-10-28 | Wednesday | HDM-B | **Already recorded — preserve** |
| 2026-10-29 | Thursday | LISS | **Already recorded — preserve** |
| 2026-10-30 | Friday | HDM-C | **New planned session** |
| 2026-10-31 | Saturday | Rest / optional easy walk | Planned |
| 2026-11-01 | Sunday | Full rest | Planned |

Do not create duplicate historical entries for 26–29 October.

---

# 3. Overall cycle structure

## Phase 1 — Maintenance / Re-entry

**Dates:** 25 October → 8 November 2026  
**Default:** 2 weeks  
**Purpose:** maintain lean mass, restore training rhythm, reduce accumulated fatigue, establish repeatable RIR and confirm true maintenance intake.

### Resistance intensity

- compounds: approximately **2 RIR**
- isolations: **1–2 RIR**
- no forced reps
- no assisted reps
- no deliberate negatives
- no drop sets
- no rest-pause
- no grinders
- no routine failure training

### LISS

- 2 formal sessions/week
- 30–40 min default
- Zone 1 / low Zone 2
- RPE 3–4/10
- conversational pace
- no intervals
- no conditioning finish

### Maintenance exit review

At the end of Week 2 assess:

- 7-day weight average
- waist
- HRV trend
- resting HR trend
- stress
- sleep
- BP
- shoulder symptoms
- strength
- session fatigue
- motivation
- hunger
- adherence

If recovery is not ready, **extend maintenance** and continue the rotation using maintenance set counts.

Do not automatically activate lean mass because a calendar date has arrived.

---

## Phase 2 — Lean Mass Transition

**Earliest start:** 9 November 2026  
**Planned duration:** 4 weeks

Activate only when maintenance exit criteria are met.

### Lean-mass intensity

- compounds: **1–2 RIR**
- isolations: **1–2 RIR**
- optional final isolation set: **0–1 RIR** only when pain-free and well recovered
- no forced reps
- no deliberate negatives
- no default drop sets/rest-pause
- shoulder press remains conservative

### Nutrition

- protein: approximately **180–200 g/day**
- start surplus: approximately **+150 to +250 kcal/day above observed maintenance**
- preferred rate of gain: approximately **0.1–0.2% body weight/week**
- adjust from 2-week trends, not individual scale readings

---

# 4. Six-week calendar

## Week 1 — Maintenance / already started
**26 October → 1 November**

| Day | Session |
|---|---|
| Mon | HDM-A — already recorded |
| Tue | LISS — already recorded |
| Wed | HDM-B — already recorded |
| Thu | LISS — already recorded |
| Fri | **HDM-C — new exercise block** |
| Sat | Rest / optional 20–30 min easy walk |
| Sun | Full rest |

## Week 2 — Maintenance
**2 → 8 November**

| Day | Session |
|---|---|
| Mon | **HDM-D** |
| Tue | LISS |
| Wed | **HDM-A** |
| Thu | Full rest / mobility |
| Fri | **HDM-B** |
| Sat | LISS |
| Sun | Full rest |

### End-of-week action

Run **Maintenance Exit Review**.

Possible outcomes:

```yaml
maintenance_exit_decision:
  - begin_lean_mass_transition
  - extend_maintenance_1_week
  - extend_maintenance_2_weeks
```

## Week 3 — Lean Mass Transition if approved
**9 → 15 November**

| Day | Session |
|---|---|
| Mon | **HDM-C** |
| Tue | LISS |
| Wed | **HDM-D** |
| Thu | Rest |
| Fri | **HDM-A** |
| Sat | LISS |
| Sun | Rest |

## Week 4 — Lean Mass Transition
**16 → 22 November**

| Day | Session |
|---|---|
| Mon | **HDM-B** |
| Tue | LISS |
| Wed | **HDM-C** |
| Thu | Rest |
| Fri | **HDM-D** |
| Sat | LISS |
| Sun | Rest |

## Week 5 — Lean Mass Transition
**23 → 29 November**

| Day | Session |
|---|---|
| Mon | **HDM-A** |
| Tue | LISS |
| Wed | **HDM-B** |
| Thu | Rest |
| Fri | **HDM-C** |
| Sat | LISS |
| Sun | Rest |

## Week 6 — Lean Mass Transition
**30 November → 6 December**

| Day | Session |
|---|---|
| Mon | **HDM-D** |
| Tue | LISS |
| Wed | **HDM-A** |
| Thu | Rest |
| Fri | **HDM-B** |
| Sat | LISS |
| Sun | Full review / rest |

---

# 5. HDM-A — Legs / Chest / Triceps

**Existing routine — preserve current exercise history.**

## Maintenance prescription

| Exercise | Sets | Reps | RIR | Rest |
|---|---:|---:|---:|---|
| Leg Press | 2 | 8–12 | 2 | 2–3 min |
| Seated Leg Curl | 2 | 8–12 | 1–2 | 60–120 sec |
| Leg Extension | 1–2 | 10–15 | 1–2 | 60–120 sec |
| Standing Calf Raise | 2 | 10–15 | 1–2 | 60–120 sec |
| Incline Machine Chest Press — neutral grip | 2 | 6–10 | 2 | 2–3 min |
| Pec Deck / Cable Fly | 2 | 10–15 | 1–2 | 60–120 sec |
| Rope Triceps Pushdown | 2 | 8–12 | 1–2 | 60–120 sec |

**Target:** approximately 13–14 working sets.

## Lean-mass prescription

| Exercise | Sets |
|---|---:|
| Leg Press | 3 |
| Seated Leg Curl | 3 |
| Leg Extension | 2 |
| Standing Calf Raise | 3 |
| Incline Machine Chest Press | 3 |
| Pec Deck / Cable Fly | 2–3 |
| Rope Triceps Pushdown | 3 |

### Priority alternation

Alternate:
- `legs-first`
- `chest-first`

---

# 6. HDM-B — Back / Shoulders / Biceps

**Existing routine — preserve current exercise history.**

## Maintenance prescription

| Exercise | Sets | Reps | RIR | Rest |
|---|---:|---:|---:|---|
| Neutral-Grip Lat Pulldown | 2 | 6–10 | 2 | 2–3 min |
| Chest-Supported Row | 2 | 8–12 | 2 | 2–3 min |
| Machine Pullover | 1 | 10–12 | 1–2 | 60–120 sec |
| Cable Lateral Raise | 2 | 12–20 | 1–2 | 60–120 sec |
| Reverse Pec Deck | 2 | 12–20 | 1–2 | 60–120 sec |
| Cable Biceps Curl | 2 | 8–12 | 1–2 | 60–120 sec |
| Hammer Curl | 1 | 10–12 | 1–2 | 60–120 sec |

**Target:** approximately 12 working sets.

## Lean-mass prescription

| Exercise | Sets |
|---|---:|
| Neutral-Grip Lat Pulldown | 2–3 |
| Chest-Supported Row | 2–3 |
| Machine Pullover | 1–2 |
| Cable Lateral Raise | 2–3 |
| Reverse Pec Deck | 2–3 |
| Cable Biceps Curl | 3 |
| Hammer Curl | 2 |

---

# 7. HDM-C — Legs / Chest / Triceps Variation

**New routine. First planned use: 30 October 2026.**

## Maintenance prescription

| Order | Exercise ID | Exercise | Sets | Reps | RIR | Rest |
|---:|---|---|---:|---:|---:|---|
| 1 | C-01 | Hack Squat | 2 | 8–12 | 2 | 2–3 min |
| 2 | C-02 | Lying Leg Curl | 2 | 8–12 | 1–2 | 60–120 sec |
| 3 | C-03 | Leg Extension | 1–2 | 10–15 | 1–2 | 60–120 sec |
| 4 | C-04 | Seated Calf Raise | 2 | 10–15 | 1–2 | 60–120 sec |
| 5 | C-05 | Hammer Strength Iso-Lateral Decline Plate Press | 2 | 6–10 | 2 | 2–3 min |
| 6 | C-06 | Low-to-High Cable Fly | 2 | 10–15 | 1–2 | 60–120 sec |
| 7 | C-07 | Single-Arm Cable Triceps Pushdown | 2 per arm | 8–12 | 1–2 | 60–120 sec |

### Priority alternation

First HDM-C:
- **legs first**

Next HDM-C:
- **chest first**

Then continue alternating.

## Lean-mass prescription

| Exercise | Sets |
|---|---:|
| Hack Squat | 3 |
| Lying Leg Curl | 3 |
| Leg Extension | 2 |
| Seated Calf Raise | 3 |
| Hammer Strength Iso-Lateral Decline Plate Press | 3 |
| Low-to-High Cable Fly | 2–3 |
| Single-Arm Cable Triceps Pushdown | 3 per arm |

---

# 8. HDM-D — Back / Shoulders / Biceps Variation

**New routine. First planned use: 2 November 2026.**

## Maintenance prescription

| Order | Exercise ID | Exercise | Sets | Reps | RIR | Rest |
|---:|---|---|---:|---:|---:|---|
| 1 | D-01 | Close-Grip Neutral Lat Pulldown | 2 | 6–10 | 2 | 2–3 min |
| 2 | D-02 | Plate-Loaded Low Row / Supported Low Row | 2 | 8–12 | 2 | 2–3 min |
| 3 | D-03 | Straight-Arm Cable Pulldown | 1 | 10–15 | 1–2 | 60–120 sec |
| 4 | D-04 | Neutral-Grip Machine Shoulder Press | 1–2 | 6–10 | 2 | 2–3 min |
| 5 | D-05 | Leaning Single-Arm Cable Lateral Raise | 2 per arm | 12–20 | 1–2 | 60–120 sec |
| 6 | D-06 | Bent-Over Rear Cable Fly | 2 | 12–20 | 1–2 | 60–120 sec |
| 7 | D-07 | Preacher Curl — machine or fixed chosen setup | 2 | 8–12 | 1–2 | 60–120 sec |
| 8 | D-08 | Rope Hammer Curl | 1 | 10–12 | 1–2 | 60–120 sec |

### Shoulder-press rule

- neutral or semi-neutral grip
- controlled ROM
- no grinding
- approximately 2 RIR
- pain-free

If sharp/load-related shoulder pain occurs:
- remove shoulder press
- continue other pain-free exercises
- flag for Coach review
- do not automatically replace it with free-weight overhead pressing

## Lean-mass prescription

| Exercise | Sets |
|---|---:|
| Close-Grip Neutral Lat Pulldown | 2–3 |
| Plate-Loaded Low Row | 2–3 |
| Straight-Arm Cable Pulldown | 1–2 |
| Neutral-Grip Machine Shoulder Press | 2 maximum unless Coach changes it |
| Leaning Single-Arm Cable Lateral Raise | 2–3 per arm |
| Bent-Over Rear Cable Fly | 2–3 |
| Preacher Curl | 3 |
| Rope Hammer Curl | 2 |

---

# 9. LISS routine

**Existing LISS templates and recorded LISS history must be preserved.**

## Standard prescription
- 30–40 minutes
- Zone 1 / low Zone 2
- RPE 3–4/10
- conversational pace
- nasal breathing optional/preferred
- no intervals
- no deliberate threshold work
- no conditioning finish

## Low-readiness modification
If readiness is amber:
- 20–35 minutes
- easy pace
- no steep incline
- no pace chasing

If BP remains materially elevated on repeat seated readings:
- use easy walking / mobility instead of formal LISS
- preserve morning BP and pre-session BP as separate readings

---

# 10. Exercise identity and progression history

Never merge:

- Leg Press ↔ Hack Squat
- Seated Leg Curl ↔ Lying Leg Curl
- Standing Calf Raise ↔ Seated Calf Raise
- Incline Machine Chest Press ↔ Hammer Strength Iso-Lateral Decline Plate Press
- Pec Deck ↔ Low-to-High Cable Fly
- Neutral-Grip Lat Pulldown ↔ Close-Grip Neutral Lat Pulldown
- Chest-Supported Row ↔ Plate-Loaded Low Row
- Machine Pullover ↔ Straight-Arm Cable Pulldown
- Reverse Pec Deck ↔ Bent-Over Rear Cable Fly
- Cable Biceps Curl ↔ Preacher Curl
- Hammer Curl ↔ Rope Hammer Curl

Existing VANTAGE rule remains:
- `Iso-Lateral Bench Press`
- `Hammer Strength Iso Lateral Decline Plate Press`

are separate exercise identities.

---

# 11. Progression method

Use **double progression**.

Increase load only when:
1. all working sets reach the target rep range;
2. prescribed RIR is preserved;
3. full comfortable ROM is maintained;
4. technique remains repeatable;
5. shoulder/joint symptoms do not worsen.

Do not increase load when:
- technique deteriorates;
- ROM shortens;
- RIR drops below prescription;
- pain increases;
- recovery is poor.

---

# 12. Warm-ups

Warm-up sets are not working sets.

For major compounds:
- 1–3 progressive warm-up sets as needed
- avoid fatigue
- do not count warm-up tonnage as work-set volume for progression decisions

The app must keep warm-up and working sets separate.

---

# 13. Readiness gating

## Green
Train as programmed.

## Amber
- reduce volume approximately 20–30% if needed
- maintain 2–3 RIR
- no failure/intensity techniques
- shorten session if recovery is deteriorating

## Red
- no hard lifting
- walking / mobility / rest

Use:
- recovery %
- HRV vs baseline
- resting HR vs baseline
- stress
- sleep
- BP
- soreness
- shoulder symptoms
- subjective readiness

---

# 14. Nutrition by phase

## Maintenance
Protein:
- **180–195 g/day**

Provisional energy:
- training days: **2700–2900 kcal**
- rest/LISS days: **2500–2700 kcal**

Update from:
- 7-day weight average
- 14-day trend
- waist
- hunger
- performance
- recovery

## Lean mass
Protein:
- **180–200 g/day**

Starting surplus:
- **+150 to +250 kcal/day over observed maintenance**

Target gain:
- **0.1–0.2% body weight/week**

At ~89–90 kg:
- approximately **0.09–0.18 kg/week**

---

# 15. Lean-mass volume rule

Do not add every extra set on Day 1.

Preferred order:
1. chest
2. hamstrings
3. triceps
4. calves
5. quads
6. biceps
7. back/delts only if progression needs it

If a muscle group is progressing at maintenance volume, do not automatically add volume.

---

# 16. Recovery / fatigue decision rule

```yaml
volume_decision:
  maintain:
    condition: "performance progressing and recovery acceptable"
  add_one_set:
    condition: "multiple comparable exposures stalled and recovery good"
  remove_one_set:
    condition: "persistent soreness, joint symptoms, recovery decline or performance regression"
```

---

# 17. End-of-cycle review — 6 December 2026

Review:
- body-weight trend
- waist trend
- visual physique trend
- comparable lifts
- progression by exact machine/exercise identity
- HRV
- resting HR
- stress
- sleep
- BP
- shoulder
- joint tolerance
- session duration
- motivation
- LISS interference
- calorie surplus accuracy

Decision:

```yaml
next_cycle:
  - continue_extended_hdm
  - return_to_usual_split
  - build_higher_volume_lean_mass_hdm
  - deload_then_return_to_usual_split
```

If returning to the usual split:
- begin at approximately 80–90% of previous normal working-set volume
- do not immediately return to maximum historical volume

---

# 18. App merge / import instructions

On import:

1. Find the currently active Heavy Duty maintenance programme beginning 25 October 2026.
2. Extend that existing programme rather than create a duplicate if a matching active programme exists.
3. Preserve all existing HDM-A, HDM-B and LISS templates.
4. Preserve all recorded A/B/LISS sessions.
5. Preserve all sets, reps, loads, RIR, Coach Packs, vitals snapshots and evidence.
6. Add `HDM-C`.
7. Add `HDM-D`.
8. Set first HDM-C planned date to **30 October 2026**.
9. Set first HDM-D planned date to **2 November 2026**.
10. Do not backfill C/D before those dates.
11. Add the six-week schedule in this file.
12. Do not auto-complete any future session.
13. Do not overwrite historical session dates.
14. Do not merge exercise identities.
15. Keep warm-up and work sets separate.
16. Keep maintenance and lean-mass prescriptions available on each routine.
17. Activate lean-mass prescriptions only after the Maintenance Exit Review approves transition.
18. Preserve previously recorded LISS values exactly by source.
19. Do not average conflicting cardio durations/HR/calorie sources.
20. Keep existing readiness logic active.

---

# 19. VANTAGE app routine registry

```yaml
routine_registry:
  - id: HDM-A
    status: existing
    action: preserve
    category: resistance
    emphasis: legs-chest-triceps

  - id: HDM-B
    status: existing
    action: preserve
    category: resistance
    emphasis: back-shoulders-biceps

  - id: HDM-C
    status: new
    action: create
    category: resistance
    emphasis: legs-chest-triceps-variation

  - id: HDM-D
    status: new
    action: create
    category: resistance
    emphasis: back-shoulders-biceps-variation

  - id: HDM-LISS
    status: existing
    action: preserve
    category: cardio

  - id: HDM-REST
    status: existing-or-create
    category: recovery
```

---

# 20. Coach summary

> Extend the active VANTAGE Heavy Duty programme rather than creating a second programme. Preserve all existing HDM-A, HDM-B and LISS history. Add HDM-C and HDM-D as new exercise-variation templates, beginning 30 October and 2 November respectively. The full cycle runs six weeks from 25 October to 6 December. Weeks 1–2 remain maintenance/re-entry; Weeks 3–6 become a lean-mass transition only if recovery, BP, weight stability and performance support the change. Keep the Heavy Duty-inspired method constant: low volume, high-quality work, compounds around 2 RIR in maintenance and 1–2 RIR in lean mass, isolation work 1–2 RIR, double progression and no routine forced reps/negatives/drop sets/rest-pause. Maintain exact exercise identity and separate progression histories for every A/B/C/D variation.
