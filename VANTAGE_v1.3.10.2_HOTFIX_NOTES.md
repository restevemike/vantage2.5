# VANTAGE v1.3.10.2 — LISS Hard-Save Hotfix

## Why this hotfix exists

A freshly reset LISS session still could not finish under v1.3.10.1. This proved the problem was in the Finish LISS execution path rather than legacy session state.

The v1.3.10.1 implementation claimed to save before Coach Pack validation, but several optional operations still happened before the IndexedDB session write, including hydration workflow and session-media processing. Any failure or unresolved workflow in those stages could therefore prevent the workout closing.

## Fix

`Finish LISS` is now a hard-save transaction.

The order is now:

1. Read/update manual duration.
2. Build the completed session object.
3. Write the completed session to IndexedDB.
4. Clear the active session/draft.
5. Return the UI to History.
6. Run media normalisation, source-completeness review and Coach Pack generation asynchronously afterwards.

Only a genuinely missing/zero duration can intentionally block the Finish button.

Hydration review, OCR, media roles, machine-console evidence, source completeness and Coach Pack generation cannot prevent the workout being saved and closed.

If post-save processing fails, the stored workout remains intact and VANTAGE reports that the Coach Pack requires review in History.

## Additional safeguards

- Removed the hydration reminder as a blocking dependency from `Finish LISS`.
- Existing hydration form values are preserved when present.
- Empty hydration is stored semantically as `not-recorded` rather than blocking completion.
- Media queries now occur only after the workout has already been committed.
- Coach Pack share/download now occurs only in the post-save finaliser.
- UI refresh failure cannot undo a successfully stored workout.
- Previous v1.3.10/v1.3.10.1 validation, Recovery separation, field-level NOOP validation and FTMS-removal changes remain intact.

## Version/cache

- App version: `1.3.10.2`
- Service worker cache: `vantage-training-console-v13-10-2`

## Verification

- JavaScript syntax check: pass
- Automated tests: 157/157 pass
- Dedicated LISS hard-save regression tests: pass
