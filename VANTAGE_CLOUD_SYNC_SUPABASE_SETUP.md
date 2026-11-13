# VANTAGE Cloud Sync — Supabase Phase 2B setup

Phase 2B extends the existing Phase 2A snapshot safety net with incremental two-way record sync, private media sync and email OTP verification.

## Backend state

The live VANTAGE Supabase project now contains:

- `vantage_cloud_snapshots` — Phase 2A fallback snapshot table.
- `vantage_cloud_records` — user-scoped incremental core records.
- `vantage_cloud_media` — user-scoped media metadata.
- Private Storage bucket `vantage-media`.
- RLS policies restricting rows and media paths to `auth.uid()`.
- A 15 MB per-file Storage limit.

The browser uses only the Supabase publishable key. Never put a service-role key in the app.

## What Phase 2B syncs

**Core records:** sessions, vitals, meals, templates, settings, exercises, nutritionDays, recoveryLogs, bloodTests, bloodAnalyses, bodyMeasurements, trainingCycles, supplements, supplementEvents and programs.

**Private media:** sessionMedia, exerciseMedia and supplementMedia.

IndexedDB remains the local working database. Cloud sync is explicit rather than background/automatic in this phase.

## Conflict behaviour

VANTAGE stores a local fingerprint baseline after a successful sync.

- Local-only change → upload.
- Cloud-only change → download.
- Local deletion with unchanged cloud copy → delete cloud copy.
- Cloud deletion with unchanged local copy → delete local copy.
- Independent changes to the same record on both sides → **conflict**.

Conflicts are deliberately not auto-resolved. Both sides remain untouched until reviewed.

## Email OTP requirement

The app now supports `signInWithOtp()` + `verifyOtp()` for email codes.

Supabase's email template must expose the OTP token. In **Authentication → Email Templates → Magic Link**, use the token variable in the email body (for example `{{ .Token }}`) rather than relying only on the confirmation URL.

Until that one-time Auth template change is made, Supabase may continue sending its normal sign-in link. Clicking that link still authenticates the browser, but the numeric-code UX will not be complete.

## Production URL

Keep this in the Supabase Auth redirect allow-list:

`https://restevemike.github.io/vantage2.5/`

## Test sequence

1. Open VANTAGE → Data → VANTAGE Cloud Sync.
2. Enter the account email and request a verification email.
3. Enter the code and select **Verify code & sign in**.
4. Run **Sync core records**.
5. Confirm the first device uploads records to `vantage_cloud_records`.
6. Run **Sync private media**.
7. Confirm metadata appears in `vantage_cloud_media` and files appear under the signed-in user's folder in the private `vantage-media` bucket.
8. On a clean browser profile/device, sign in and run both sync actions.
9. Confirm records and media download without using the Phase 2A restore.
10. Modify the same test record independently on both devices and confirm VANTAGE reports a conflict instead of overwriting either copy.
11. Confirm **Create fallback snapshot** and **Restore fallback snapshot** still work as the rollback path.

## Security notes

- The Storage bucket is private.
- RLS limits database rows to the authenticated user.
- Storage policies require the first path segment to equal the authenticated user's UUID.
- The public repository contains no VANTAGE user health data.
- The publishable key is intentionally browser-safe; the service-role key is never exposed.
- JSON export remains an independent offline recovery option.
