# VANTAGE v1.4.2 — Rich Vitals Importer Integrity

## Purpose
v1.4.2 fixes the v1.4.1 vitals Markdown importer so current richer `vantage-vitals` files import cleanly without a large false unsupported-field warning list or loss of structured data.

## Fixed
- Parses numeric and duration-style sleep values including `7.95`, `"7.95"`, `7h57m`, `7h`, `9m` and nested sleep objects.
- Maps `weightKg` into core `weight` while preserving source conflicts rather than averaging.
- Maps nested `bloodPressure` objects into systolic, diastolic and cuff pulse; preserves BP time.
- Adds a recognised VANTAGE extension registry so established fields import silently rather than generating false warnings.
- Stores body-composition metrics in a queryable `bodyComposition` object while retaining compatible top-level values.
- Preserves device-reported metabolic markers as device/app-derived estimates and explicitly keeps them separate from BioLab laboratory results.
- Preserves separate blood-oxygen monitor evidence separately from a NOOP Strap `No Data` state when the source note identifies that distinction.
- Unknown fields still import under extensions but now generate one concise warning: `Unknown VANTAGE vitals field: <name>`.
- Import warnings are deduplicated.
- Maintains compatibility with older flat vitals Markdown files.
- Preserves recovery actions as Recovery-owned data rather than importing them as vitals.

## Import precedence
When aliases conflict, VANTAGE uses:
1. explicit core field;
2. recognised nested field;
3. recognised alias;
4. extension.

Conflicting source values are retained in `extensions.importConflicts`; values are never silently averaged.

## Body-composition fields supported
`weightKg`, `bmi`, `bodyFatPercent`, `muscleRatePercent`, `bodyWaterPercent`, `boneMassKg`, `bmrKcal`, `proteinRatePercent`, `metabolicAge`, `visceralFatIndex`, `subcutaneousFatPercent`, `standardWeightKg`, `weightControlKg`, `fatMassKg`, `fatFreeMassKg`, `muscleMassKg`, `proteinMassKg`, `bodyScore`.

## Known extension fields
Includes `effort`, `autonomicBalanceLfHf`, `sleepLedger14Day`, `sleepDurationConflict`, `sleepStagesShownForSegment`, `heartRateToday`, `deviceReportedMetabolicMarkers`, `additionalMetrics`, `dataQualityNotes` and established body-composition aliases.

## Validation
- 192 / 192 automated tests pass.
- New v1.4.2 vitals-import regression suite covers rich sleep, nested BP, weight aliasing, body composition, recognised extensions, unknown fields and old flat-file compatibility.
- JavaScript syntax checks pass across all top-level modules.
- Service-worker cache advanced to `vantage-training-console-v14-2`.
