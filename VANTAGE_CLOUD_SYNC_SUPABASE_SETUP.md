# VANTAGE Cloud Sync — Supabase Phase 2A setup

This is the backend setup for the `feature/cloud-sync` branch.

## What Phase 2A syncs

Core VANTAGE IndexedDB stores are stored as one user-scoped JSON snapshot in Postgres.

**Included:** sessions, vitals, meals, templates, settings, exercises, nutritionDays, recoveryLogs, bloodTests, bloodAnalyses, bodyMeasurements, trainingCycles, supplements, supplementEvents and programs.

**Excluded for Phase 2A:** sessionMedia, exerciseMedia and supplementMedia. These stay local until the private Storage phase.

## 1. Create a Supabase project

Create a project, then copy:

- Project URL
- Publishable key (or legacy anon key)

Do **not** use a service-role key in the browser.

## 2. Auth URL configuration

In Supabase Auth URL configuration, add the production VANTAGE URL:

`https://restevemike.github.io/vantage2.5/`

For testing the feature branch via another origin, add that origin separately.

## 3. Run this SQL

```sql
create table if not exists public.vantage_cloud_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null,
  snapshot_format text not null,
  payload jsonb not null,
  record_counts jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.vantage_cloud_snapshots enable row level security;

revoke all on public.vantage_cloud_snapshots from anon;
revoke all on public.vantage_cloud_snapshots from authenticated;
grant select, insert, update, delete on public.vantage_cloud_snapshots to authenticated;

drop policy if exists "VANTAGE users read own snapshot" on public.vantage_cloud_snapshots;
create policy "VANTAGE users read own snapshot"
on public.vantage_cloud_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "VANTAGE users insert own snapshot" on public.vantage_cloud_snapshots;
create policy "VANTAGE users insert own snapshot"
on public.vantage_cloud_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "VANTAGE users update own snapshot" on public.vantage_cloud_snapshots;
create policy "VANTAGE users update own snapshot"
on public.vantage_cloud_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "VANTAGE users delete own snapshot" on public.vantage_cloud_snapshots;
create policy "VANTAGE users delete own snapshot"
on public.vantage_cloud_snapshots
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.set_vantage_cloud_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vantage_cloud_updated_at on public.vantage_cloud_snapshots;
create trigger set_vantage_cloud_updated_at
before update on public.vantage_cloud_snapshots
for each row execute function public.set_vantage_cloud_updated_at();
```

## 4. Test sequence

1. Open VANTAGE.
2. Data → VANTAGE Cloud Sync.
3. Enter project URL and publishable key.
4. Enter email and request the sign-in link.
5. Open the email link on the same device.
6. Return to Data and confirm **Cloud connected**.
7. Select **Sync core data now**.
8. Verify one row exists in `vantage_cloud_snapshots`.
9. On a disposable browser profile/device, sign in and use **Restore core data from cloud**.
10. Verify workouts, vitals, meals/macros, recovery, bloodwork, measurements, cycles, supplements and programs are present.

## Security notes

- The browser only receives the Supabase publishable/anon key.
- RLS restricts each snapshot row to `auth.uid() = user_id`.
- The public GitHub repository contains no VANTAGE user data.
- JSON backup/export remains an independent recovery path.
- Media is deliberately not placed into the Postgres snapshot.
