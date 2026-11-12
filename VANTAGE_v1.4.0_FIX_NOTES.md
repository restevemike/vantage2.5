# VANTAGE v1.4.0 — Programs, Phases, Profiles & Exercise Library

## Purpose

v1.4.0 is the first platform-oriented VANTAGE release. It keeps the local-first training, vitals, nutrition, recovery, history and evidence model from v1.3.10.5/1.3.10.6, but removes the assumption that every user follows Steve's current body-part split.

## Main changes

### Flexible training phases

- Training phases/blocks now live under Data rather than Metrics.
- A phase/block has a start date, type, name and duration in weeks.
- Duration can be extended or shortened one week at a time without recreating the phase.
- Maximum configured duration is 104 weeks.
- Existing Cut / Gain / Maintenance / Deload / Hypertrophy / Strength / Custom types remain available.
- Phase/block context continues to be frozen into completed session evidence.

### Programs and splits

New profile-scoped Programs store and Program Manager.

Programs can operate as:
- **Rotation** — VANTAGE advances to the next slot after a completed workout/rest slot.
- **Manual** — routines act as a folder and the user chooses the workout.

Included starting presets:
- Custom
- Current VANTAGE rotation
- Full Body · 3 day
- Upper / Lower · 4 day
- Push / Pull / Legs
- Body-part split · 5 day
- Heavy Duty A / B

A program can contain saved workout routines and rest-day slots in any order. Slots can be moved or removed. Program settings can be edited later.

### Existing VANTAGE split migration

On first v1.4.0 launch, an existing pre-1.4 installation is migrated to an active **Current VANTAGE rotation** where the corresponding templates exist:

Chest & Biceps → LISS → Shoulders & Triceps → LISS → Legs → LISS → Back → LISS.

The migration does not delete or rewrite existing workout history or templates.

### Routine Builder

- Create any custom strength routine.
- Add/remove/reorder exercises.
- Add exercises from the central exercise catalogue.
- Existing user-created/imported exercises remain available.
- Program presets create normal editable templates, not locked proprietary workouts.

### Exercise Library

v1.4.0 ships with **461 built-in exercises** covering strength, machines, cables, free weights, cardio and mobility.

Library search/filter supports:
- exercise name / alias
- muscle group
- equipment
- workout type in the live-session exercise picker

Custom exercises can still be created and coexist with the built-in catalogue.

### Profile module controls

Profile now controls which optional modules are visible:
- Vitals & readiness
- Meals & macros
- Recovery
- Metrics & analytics
- Supplements / TRT
- BioLab / bloodwork
- Body measurements

Turning a module off hides its navigation/UI. It does **not** delete stored data.

### Historical Markdown Import retained

The v1.3.10.6 Historical Markdown Import is included in v1.4.0. Older VANTAGE vitals/macros/recovery/bloodwork Markdown can be imported later using the date stored in the file rather than today's date.

### History and metrics foundation retained

The v1.3.10.5 canonical exercise/history matching and previous-session repair remain intact. Programs and routine creation use the same exercise identity/history model rather than introducing a separate progression system.

### Data model

- IndexedDB base schema advances to version 12.
- New `programs` object store is profile-scoped.
- Full JSON backup schema advances to 12.
- Existing PWA identity remains unchanged to preserve `localhost` IndexedDB data and the installed app identity.

## Deliberately not included yet

v1.4.0 is still the local-first single-profile application foundation. It does not yet provide cloud login, multi-account switching, coach/client sharing or Supabase sync. Those belong in the later small-group beta after this flexible-program model has been proven locally.

## Verification

- 183 / 183 automated tests passing
- All JavaScript files pass syntax checks
- No duplicate HTML IDs
- 461 built-in exercises verified
- Service-worker cache advanced to `vantage-training-console-v14-0`
- Existing PWA ID remains `./vantage-training-console-v133`
