-- VANTAGE NOOP check-ins: scheduled summaries, no medical diagnoses.
create or replace function public.vantage_noop_run_reviews()
returns int language plpgsql security definer set search_path=pg_catalog,public
as $$
declare c record;
 local_now timestamp;
 day_key date;
 hh int;
 slot_name text;
 latest_record record;
 hr_n int;
 hr_mean numeric;
 hr_peak int;
 hrv_baseline numeric;
 score_status text;
 produced int:=0;
begin
 for c in select user_id,timezone from public.vantage_noop_connections where enabled=true loop
  begin local_now:=now() at time zone c.timezone; exception when invalid_parameter_value then
    local_now:=now() at time zone 'Europe/London'; end;
  hh:=extract(hour from local_now)::int;
  if hh not in (7,14,21) or extract(minute from local_now)>=15 then continue; end if;
  slot_name:=case hh when 7 then 'morning' when 14 then 'afternoon' else 'evening' end;
  day_key:=local_now::date;
  select r.record_key,r.datum,r.received_at into latest_record
    from public.vantage_noop_records r where r.user_id=c.user_id and r.stream='dailyMetric'
    and r.record_key->>'day'<=day_key::text
    order by r.record_key->>'day' desc,r.received_at desc limit 1;
  if not found then
   score_status:='no_daily_metric_received';
  elsif latest_record.record_key->>'day'=day_key::text then
   score_status:='same_day_snapshot';
  else score_status:='previous_day_or_older';
  end if;
  select count(*)::int,round(avg((r.datum->>'bpm')::numeric),0),
    max((r.datum->>'bpm')::int)
  into hr_n,hr_mean,hr_peak
  from public.vantage_noop_records r
  where r.user_id=c.user_id and r.stream='hrSample'
  and (r.record_key->>'ts')::bigint between extract(epoch from now()-interval '4 hours')::bigint
    and extract(epoch from now())::bigint
  and (r.datum->>'bpm')::numeric between 30 and 250;
  select round(avg((r.datum->>'avgHrv')::numeric),1) into hrv_baseline
  from public.vantage_noop_records r
  where r.user_id=c.user_id and r.stream='dailyMetric'
  and (r.record_key->>'day')::date between day_key-7 and day_key-1
  and (r.datum->>'avgHrv') is not null;
  insert into public.vantage_noop_reviews(user_id,review_date,slot,summary)
  values(c.user_id,day_key,slot_name,
   jsonb_build_object(
    'source','NOOP push v1.0',
    'slot',slot_name,
    'reviewedAt',now(),
    'dataStatus',score_status,
    'latestDailyDate',latest_record.record_key->>'day',
    'latestDailyReceivedAt',latest_record.received_at,
    'dailyMetric',latest_record.datum,
    'hrWindowHours',4,
    'hrSampleCount',coalesce(hr_n,0),
    'hrAverageBpm',hr_mean,
    'hrPeakBpm',hr_peak,
    'prior7DayAvgHrvMs',hrv_baseline,
    'hrvDeltaMs',case when latest_record.datum->>'avgHrv' is not null and hrv_baseline is not null
      then round((latest_record.datum->>'avgHrv')::numeric-hrv_baseline,1) else null end,
    'interpretation','Trends only; data must be fresh and readings interpreted with context. Not a medical assessment.'
   ))
  on conflict(user_id,review_date,slot) do update set summary=excluded.summary,generated_at=now();
  produced:=produced+1;
 end loop;
 return produced;
end $$;
revoke all on function public.vantage_noop_run_reviews() from public,anon,authenticated;
grant execute on function public.vantage_noop_run_reviews() to service_role;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('vantage-noop-review-15m','*/15 * * * *',
 'select public.vantage_noop_run_reviews();');
