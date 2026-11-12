# VANTAGE Training Console v1.3.9 — Evidence Validation, FTMS Bluetooth & Temporary Exercise Substitution

**Build date:** 2026-08-17  
**Base:** v1.3.8  
**Correction specification:** VANTAGE App Corrections & Improvements — 2026-08-16 to 2026-08-17

## Release intent

v1.3.9 is a stabilisation and workflow release. It fixes the remaining shared NOOP parsing/validation faults, improves source completeness, adds sensor-artifact handling, adds structured strength evidence, introduces a beta Bluetooth Fitness Machine Service (FTMS) connection for compatible treadmills/StairMaster-style machines, and adds temporary in-session exercise substitution without changing the normal workout template.

## 1. Shared NOOP activity-summary parser

The same parser is now used for NOOP activity-summary evidence across strength, walking, treadmill/LISS and recovery activity summaries.

Fixed:

- AVG, PEAK/MAX and LOW/MIN are parsed independently by label.
- LOW/MIN can no longer silently inherit AVG.
- Decimal Effort is preserved, including `7.4`, `16.9`, `22.6` and genuine `0.0` values.
- Z1-Z5 percentage/minute pairs are retained from visible source values.
- Explicit visible zero minutes remain zero.
- Minutes are not invented when a screenshot shows only a percentage.
- Displayed duration and duration calculated from the visible time range remain separate.

Regression examples now pass:

- 2026-08-16 strength: `94 / 127 / 65 bpm`, Effort `0.0`, Z1 `68% / 39m`, Z2 `31% / 18m`, Z3 `1% / 0m`.
- 2026-08-17 treadmill: `102 / 138 / 73 bpm`, Effort `7.4`, Z1 `51% / 23m`, Z2 `47% / 21m`, Z3 `1% / 0m`.

## 2. Suspicious source values stay source evidence

Visible NOOP values are no longer treated as VANTAGE errors merely because they look implausible.

Example from 16 August:

- raw NOOP calories: `37 kcal`
- raw NOOP Effort: `0.0`

They remain in the source record but receive source-quality/analysis-eligibility flags so they can be excluded from energy or training-load analysis without inventing replacements.

## 3. Transactional OCR validation

The OCR state model now separates:

- role confirmation
- OCR review
- metric validation
- metric user confirmation
- validation status

A blocked OCR result cannot simultaneously be exported as confirmed.

When validation fails:

- candidate/raw evidence is retained;
- the authoritative field is not populated from the blocked candidate;
- `metricsValidated = false`;
- `metricsConfirmed = false`;
- `validationStatus = review-required`;
- `extractionStatus = review-required`.

Legacy/stale media records with blocking OCR warnings are also prevented from being treated as authoritative simply because an older `metricsConfirmed` flag remains true.

## 4. Raw source and corrected/authoritative evidence remain distinct

OCR media can retain:

- raw OCR text/value
- parsed candidate value
- promotion candidate
- blocked fields
- validation warnings
- source quality
- authoritative/confirmed state

Warnings now control promotion instead of being informational only.

## 5. User-confirmed sensor artefacts

LISS has a dedicated maximum-HR artefact control.

A value such as the 17 August raw `138 bpm` spike can be retained while recording that strap movement caused suspected sensor noise.

The record keeps the raw value and reason but may exclude the raw maximum from physiological classification and maximum-HR guardrail logic. Duration and average-HR guardrails remain active independently.

## 6. Full same-day readiness linkage

Strength and LISS Coach Packs consume the same-date VANTAGE vitals record and support the fuller readiness snapshot, including:

- Recovery / Charge
- Rest
- Status / Synthesis / Guidance
- HRV and baseline delta
- resting HR and baseline delta
- respiratory rate
- stress and stress band
- high-stress time where available
- sleep duration, performance, efficiency and debt
- BP and cuff pulse
- weight

The LISS source-completeness check now checks for vitals on the session date rather than simply looking at today's latest record.

## 7. Exercise identity overlap review

Potential duplicate/overlapping exercise identities are flagged for review without automatic merge or removal.

When two exercises have strong overlap across movement, orientation, aliases/notes and machine identity, VANTAGE records:

- `exerciseIdentityReviewRequired = true`
- `duplicateRisk = possible`
- `crossExerciseComparisonConfidence = low`

The user remains responsible for confirming whether they are genuinely distinct.

## 8. Structured exercise symptom evidence

Each strength exercise now has an optional symptom/discomfort section with:

- symptom present
- area
- type
- trigger
- optional severity 0-10
- action taken

This is training evidence only; VANTAGE does not diagnose the symptom.

## 9. Strength media semantics and packaging integrity

Strength Coach Packs now retain clearer media confirmation/validation fields, including:

- role confirmation
- detected date
- session-date match
- user date confirmation
- OCR review
- metric validation
- metric confirmation
- validation status
- blocked OCR fields/warnings

Strength packaging also hashes media. Identical binary media cannot silently be linked to incompatible roles/exercises. Exact duplicate evidence with the same semantic linkage may be packaged once.

## 10. Source completeness before treadmill/StairMaster export

Before finishing treadmill or StairMaster LISS, VANTAGE records whether the session has:

- same-day morning vitals
- NOOP activity summary
- NOOP saved stream
- watch/device source
- machine console
- Bluetooth FTMS source
- pre-LISS BP
- hydration decision
- macros

If treadmill/StairMaster has neither console evidence nor a live FTMS source, VANTAGE asks whether to add machine evidence before export. Missing optional evidence can still be consciously accepted.

If a referenced image existed in app state but is missing from storage/packaging, export remains blocked.

## 11. Bluetooth treadmill / StairMaster module — Beta

A new **Bluetooth machine · Beta** panel appears for:

- Treadmill walk
- StairMaster

The module uses Web Bluetooth and the standard Bluetooth Fitness Machine Service (FTMS) when the selected machine exposes it.

Supported live source categories include, where supplied by the machine:

- elapsed time
- distance
- calories
- speed
- incline
- elevation
- power
- METs
- floors / steps / step rate on supported climber characteristics
- machine-provided HR when present

The live source is stored as `ftmsMachineLive` and is kept separate from:

- NOOP Strap physiology
- machine-console screenshot/OCR
- watch/device data

VANTAGE does not average source calories or overwrite NOOP values with machine values.

A Bluetooth diagnostic section retains device/profile/characteristic/sample information to help identify what a specific gym machine actually exposes.

### Compatibility limitation

This is intentionally Beta. A machine must expose the standard FTMS GATT service/characteristic to stream through this module. Equipment using proprietary Bluetooth or a vendor-specific Apple/Samsung integration may not expose FTMS. In that case VANTAGE reports the incompatibility and the existing console-screenshot workflow remains available.

## 12. Temporary exercise substitution

Every active strength exercise now has **Change** alongside Collapse/Remove.

Use it when the programmed machine is unavailable.

Behaviour:

1. Tap **Change** on the unavailable exercise.
2. Pick a replacement from the exercise library.
3. The replacement stays in exactly the same workout order/slot.
4. Only today's session changes.
5. The workout template is not edited.
6. The replacement can use its own previous history/default set values.
7. The session records a `sessionSubstitution` object containing the original and replacement identities.
8. Next week's normal template exercise automatically returns.
9. Next week, grey text above the normal exercise reports the previous-week substitution and its work-set weight/reps.
10. Normal-exercise history and replacement-exercise history remain separate comparison streams.

If meaningful set data is already entered for the exercise being replaced, VANTAGE asks for confirmation before discarding those current-session entries.

## 13. Coach Pack Bluetooth source separation

LISS Coach Pack output now includes a readable and structured Bluetooth FTMS section when live samples exist. The source is not merged with treadmill-console OCR.

## Verification

Automated regression suite:

- **144 / 144 tests passed**

Additional checks:

- all JavaScript files pass `node --check`;
- v1.3.9 PWA cache is `vantage-training-console-v13-9`;
- existing manifest ID and start URL remain unchanged to preserve the installed PWA/IndexedDB origin;
- FTMS module is included in the service-worker app shell;
- local HTTP smoke test returns `200 OK` and serves v1.3.9;
- release ZIP integrity verified after packaging.

## PWA identity preserved

The following remain deliberately unchanged:

- `manifest.id = ./vantage-training-console-v133`
- `manifest.start_url = ./?pwa=133`
- browser origin remains `http://localhost:8080`

Do not change the browser origin to `127.0.0.1` when opening the app because that would use a different browser storage origin.
