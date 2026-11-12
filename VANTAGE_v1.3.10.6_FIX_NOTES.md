# VANTAGE v1.3.10.6 — Historical Markdown Import

## Purpose

Allow Steve to add a VANTAGE Markdown record after the original day has passed without changing the record to today's date.

## New Data module

Data -> Historical Markdown import now accepts:

- `vantage-macros-v1` — daily meals/macros
- `vantage-vitals-v1` — vitals/readiness
- `vantage-recovery-session-v1` — recovery history
- `vantage-bloodwork-v1` — bloodwork panels

The importer detects the schema and date before saving anything. The date in the file is authoritative.

## Safe overwrite behaviour

If data already exists for the same date, VANTAGE warns and blocks import unless **Replace an existing same-date record** is explicitly selected. This prevents an accidental historical import from duplicating or overwriting existing records.

## Macros

Historical macro files use the existing nutrition importer, store meals and daily totals on the original date, and re-link the imported nutrition day to same-date sessions.

## Vitals

Historical vitals are written directly to their original date, including rich fields not exposed by the current-day form. If a same-date workout has no valid vitals snapshot, the historical vitals can backfill its vitals/readiness link. Existing valid session-start snapshots are not overwritten.

## Recovery

A `vantage-recovery-session-v1` file can backfill a dated recovery log without pretending the activity happened today.

## Bloodwork

Historical bloodwork panels use their source collection date and retain existing fingerprint/deduplication behaviour.

## Audit metadata

Historical records retain import metadata including original date, file name, import time and historical-import type.

## Guardrails

- Future-dated files are blocked in Historical Import.
- Unsupported Markdown schemas fail visibly rather than being silently ignored.
- The current-day Vitals and Macro import screens continue to work as before.
- No database reset or destructive migration is required.

## Verification

- 176/176 automated tests passed.
- Historical macro regression confirms a 2026-09-11 file remains dated 2026-09-11.
- Historical vitals regression confirms source-date readiness data is preserved.
- Historical recovery schema detection passed.
- JavaScript syntax checks passed.
- Service-worker cache advanced to `vantage-training-console-v13-10-6`.
