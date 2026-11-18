# VANTAGE v1.6.0 — NOOP biometric integration

This optional module lets NOOP Android send sensor and daily-metric batches to VANTAGE Cloud without replacing normal VANTAGE vitals or workout records.

## User setup

1. Open the current VANTAGE app in Android Chrome and verify the header displays v1.6.0. Export a current JSON backup first.
2. Sign in via the VANTAGE **Cloud** tab.
3. Open **NOOP**, expand **Connect NOOP (experimental)** and select **Generate / rotate private token**.
4. Copy the endpoint URL and private token. The token is shown only in the current page session and is not stored in plaintext in VANTAGE Cloud.
5. In the latest NOOP Android app, go to **Settings → Experimental → Self-hosted push**. Paste the endpoint and token; select **Test connection**.
6. Configure the advertised supported streams (hrSample, rrInterval, dailyMetric, sleepSession, workout), then run **Export now** after a strap offload.
7. Return to VANTAGE → NOOP → Refresh NOOP readings. Verify last upload, source date, and latest daily snapshot.
8. For **live workout HR**, select Connect live HR sensor, choose the Bluetooth strap and keep Chrome open. Select Stop & save HR session to save the raw HR stream locally and attach the summary to any active workout.

## Scheduled analysis

Supabase runs a 15-minute cron job. For enabled NOOP connections it generates check-ins at **07:00, 14:00 and 21:00 Europe/London local time**, accounting for BST/GMT. It computes latest daily summary and source date, mean/peak HR with a 4-hour sampling window, prior seven-day HRV baseline and delta when available.

NOOP's push is asynchronous and usually follows a completed device offload or app launch. VANTAGE must never label an imported daily recovery value as a fresh afternoon HRV measurement. Missing data remains unknown.

## Live BLE constraints

This is an optional Web Bluetooth heart-rate prototype, using the standard Heart Rate Profile. The sensor must expose service 0x180D / characteristic 0x2A37, and Android/WHOOP must allow the connection. It might not coexist with the NOOP BLE connection. Chrome may suspend BLE when backgrounded or when the screen is off. It is **not** medical monitoring and provides no emergency alerts.

## Security

- NOOP v1.0 push uses an independently generated 256-bit Bearer token. The server stores a SHA-256 digest, not plaintext.
- The Edge Function uses custom token authentication. JWT verification is disabled at the platform layer deliberately, but every GET/POST request is authenticated inside the function.
- Never enter a Supabase service-role key into NOOP, share the receiver token or include it in screenshots.
- Supabase RLS isolates each account's NOOP data. Private intake batches and replacement-stage rows have no client read policy.
- The NOOP receiver supports documented append streams and atomic authoritative replacement windows, gzip and uncompressed NDJSON, exact acknowledgements, idempotent retries and empty deletions.
- VANTAGE cannot alter NOOP's local data; push is one-way. The NOOP module never overwrites the existing VANTAGE vitals table.

## Acceptance checklist

- Main VANTAGE Dashboard, Workout, Vitals, Meals and Cloud still work normally.
- NOOP Test connection succeeds, Export now delivers data, and the VANTAGE source date matches NOOP's daily report.
- Scheduled morning/afternoon/evening reviews appear after each local time slot; stale metrics are labelled.
- Chrome connects to the actual WHOOP strap if the device permits it; live BPM changes during a workout; Stop saves locally.
- Completing a VANTAGE session preserves existing data and includes the recorded live HR summary in exported workout Markdown.
- Verify offline local recording plus subsequent online Cloud sync.
- Do not clear app data, rebootstrap or uninstall if a sync error appears; export a backup first.

## Code map

- noop-metrics.js — pure Bluetooth HR decoder, zones and statistics
- noop-integration-ui.js — NOOP setup, summaries, reviews and live HR UI
- supabase/functions/vantage-noop-push/index.ts — custom-bearer NOOP receiver
- supabase/noop-bridge-schema.sql — database schema and transactional ingest
- supabase/noop-bridge-reviews.sql — scheduler and summary calculations
- supabase/noop-bridge-fix-*.sql — iterative function amendments, retained as applied migration history
- tests/v160-noop-biometrics.test.mjs — regression tests

NOOP protocol: https://github.com/ryanbr/noop/blob/main/docs/PUSH_PROTOCOL.md
