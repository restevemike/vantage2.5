
-- VANTAGE NOOP bridge: additive tables only. Existing VANTAGE data untouched.
create table if not exists public.vantage_noop_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  timezone text not null default 'Europe/London',
  receiver_state_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_received_at timestamptz
);
create table if not exists public.vantage_noop_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  device_id text not null,
  stream text not null,
  record_key jsonb not null,
  datum jsonb not null,
  received_at timestamptz not null default now(),
  primary key(user_id,source_id,device_id,stream,record_key)
);
create index if not exists noop_records_by_owner_stream on public.vantage_noop_records(user_id,stream,received_at desc);
create index if not exists noop_records_day on public.vantage_noop_records(user_id,stream,((record_key->>'day'))) where stream='dailyMetric';
create index if not exists noop_records_ts on public.vantage_noop_records(user_id,stream,((record_key->>'ts'))) where stream='hrSample';
create table if not exists public.vantage_noop_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  device_id text not null,
  batch_id uuid not null,
  decoded_hash text not null,
  ack jsonb not null,
  accepted_at timestamptz not null default now(),
  primary key(user_id,source_id,device_id,batch_id)
);
create table if not exists public.vantage_noop_window_parts (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  device_id text not null,
  stream text not null,
  replacement_id uuid not null,
  part int not null,
  parts int not null,
  selector text not null,
  start_inclusive text not null,
  end_exclusive text not null,
  record_list jsonb not null,
  batch_hash text not null,
  received_at timestamptz not null default now(),
  primary key (user_id,source_id,device_id,stream,replacement_id,part)
);
create table if not exists public.vantage_noop_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null,
  slot text not null check(slot in ('morning','afternoon','evening')),
  generated_at timestamptz not null default now(),
  summary jsonb not null,
  primary key(user_id,review_date,slot)
);
do $$
declare t text;
begin
 foreach t in array array['vantage_noop_connections','vantage_noop_records','vantage_noop_batches','vantage_noop_window_parts','vantage_noop_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy noop_connection_read on public.vantage_noop_connections for select to authenticated using (user_id=(select auth.uid()));
create policy noop_connection_insert on public.vantage_noop_connections for insert to authenticated with check(user_id=(select auth.uid()));
create policy noop_connection_update on public.vantage_noop_connections for update to authenticated using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy noop_connection_delete on public.vantage_noop_connections for delete to authenticated using (user_id=(select auth.uid()));
create policy noop_records_read on public.vantage_noop_records for select to authenticated using (user_id=(select auth.uid()));
create policy noop_reviews_read on public.vantage_noop_reviews for select to authenticated using (user_id=(select auth.uid()));
grant select,insert,update,delete on public.vantage_noop_connections to authenticated;
grant select on public.vantage_noop_records,public.vantage_noop_reviews to authenticated;
revoke all on public.vantage_noop_batches,public.vantage_noop_window_parts from anon,authenticated;
grant all on public.vantage_noop_records,public.vantage_noop_batches,public.vantage_noop_window_parts,public.vantage_noop_reviews to service_role;
-- A narrowly-scoped transaction boundary for NOOP's batch acknowledgement protocol.
create or replace function public.vantage_noop_accept_secure(
 p_user_id uuid,p_envelope jsonb,p_hash text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare h jsonb := p_envelope->'header';
        input_rows jsonb := p_envelope->'records';
        batch uuid := (h->>'batchId')::uuid;
        source uuid := (h->>'sourceId')::uuid;
        device text := h->>'deviceId';
        v_stream text := h->>'stream';
        delivery text := h->>'delivery';
        reply jsonb;
        saved public.vantage_noop_batches%rowtype;
        w jsonb := h->'window';
        rep uuid;
        num_part int;
        total_parts int;
        v_selector text;
        first_bound text;
        last_bound text;
        staged int;
        scope_conflicts int;
        entry jsonb;
begin
 if not exists (select 1 from public.vantage_noop_connections where user_id=p_user_id and enabled=true)
   then raise exception 'NOOP connection disabled'; end if;
 if v_stream not in ('hrSample','rrInterval','dailyMetric','sleepSession','workout') then
  raise exception 'Unsupported NOOP stream'; end if;
 if jsonb_typeof(input_rows)<>'array' or jsonb_array_length(input_rows)>5000 or
    jsonb_array_length(input_rows)<>(h->>'recordCount')::int then raise exception 'Invalid NOOP record count'; end if;
 select * into saved from public.vantage_noop_batches b
 where b.user_id=p_user_id and b.source_id=source and b.device_id=device and b.batch_id=batch;
 if found then
  if saved.decoded_hash<>p_hash then raise exception 'Conflicting NOOP batch reuse'; end if;
  return saved.ack;
 end if;
 reply:=jsonb_build_object('protocolVersion','1.0','batchId',h->>'batchId','stream',v_stream,
 'deviceId',device,'endCursor',h->'endCursor','acceptedRows',jsonb_array_length(input_rows),'status','accepted');
 if delivery='append' then
  if v_stream not in ('hrSample','rrInterval') then raise exception 'Unsupported append stream';end if;
  for entry in select value from jsonb_array_elements(input_rows) loop
   insert into public.vantage_noop_records(user_id,source_id,device_id,stream,record_key,datum)
   values(p_user_id,source,device,v_stream,entry->'key',entry->'data')
   on conflict(user_id,source_id,device_id,stream,record_key) do nothing;
  end loop;
 elsif delivery='replace_window' then
  if v_stream not in ('dailyMetric','sleepSession','workout') then raise exception 'Unsupported replacement stream';end if;
  rep:=(w->>'replacementId')::uuid;
  num_part:=(w->>'part')::int;
  total_parts:=(w->>'parts')::int;
  v_selector:=w->>'selector';first_bound:=w->>'startInclusive';last_bound:=w->>'endExclusive';
  if num_part<1 or total_parts<1 or num_part>total_parts or total_parts>100 or
  v_selector not in ('day','startTs') or first_bound is null or last_bound is null or
  (v_stream='dailyMetric' and v_selector<>'day') or (v_stream<>'dailyMetric' and v_selector<>'startTs')
  then raise exception 'Invalid NOOP replacement window'; end if;
  select count(*) into scope_conflicts from public.vantage_noop_window_parts
  where user_id=p_user_id and source_id=source and device_id=device and stream=v_stream
    and replacement_id<>rep;
  if scope_conflicts>0 then raise exception 'Another replacement is incomplete'; end if;
  if exists(select 1 from public.vantage_noop_window_parts wp where wp.user_id=p_user_id
    and wp.source_id=source and wp.device_id=device and wp.stream=v_stream
    and wp.replacement_id=rep and (wp.parts<>total_parts or wp.selector<>v_selector or
      wp.start_inclusive<>first_bound or wp.end_exclusive<>last_bound))
    then raise exception 'Inconsistent replacement metadata';end if;
  insert into public.vantage_noop_window_parts(user_id,source_id,device_id,stream,
   replacement_id,part,parts,selector,start_inclusive,end_exclusive,record_list,batch_hash)
  values(p_user_id,source,device,v_stream,rep,num_part,total_parts,v_selector,first_bound,last_bound,input_rows,p_hash)
  on conflict do nothing;
  if not found then
    if not exists(select 1 from public.vantage_noop_window_parts wp where wp.user_id=p_user_id and wp.source_id=source
     and wp.device_id=device and wp.stream=v_stream and wp.replacement_id=rep
     and wp.part=num_part and wp.batch_hash=p_hash) then raise exception 'Conflicting replacement part'; end if;
  end if;
  select count(*) into staged from public.vantage_noop_window_parts wp
  where wp.user_id=p_user_id and wp.source_id=source and wp.device_id=device
    and wp.stream=v_stream and wp.replacement_id=rep;
  if staged=total_parts then
   -- Atomic authoritative replacement, scoped only to source, device, stream and window.
   delete from public.vantage_noop_records rr
   where rr.user_id=p_user_id and rr.source_id=source and rr.device_id=device and rr.stream=v_stream
   and (case when v_selector='day' then rr.record_key->>'day'
         else rr.record_key->>'startTs' end)>=first_bound
   and (case when v_selector='day' then rr.record_key->>'day'
         else lpad(rr.record_key->>'startTs',16,'0') end)
       <(case when v_selector='day' then last_bound else lpad(last_bound,16,'0') end);
   for entry in select each_row.value from public.vantage_noop_window_parts wp
      cross join lateral jsonb_array_elements(wp.record_list) each_row(value)
      where wp.user_id=p_user_id and wp.source_id=source and wp.device_id=device
       and wp.stream=v_stream and wp.replacement_id=rep
   loop
    insert into public.vantage_noop_records(user_id,source_id,device_id,stream,record_key,datum)
    values(p_user_id,source,device,v_stream,entry->'key',entry->'data')
    on conflict(user_id,source_id,device_id,stream,record_key)
    do update set datum=excluded.datum,received_at=now();
   end loop;
   delete from public.vantage_noop_window_parts wp
   where wp.user_id=p_user_id and wp.source_id=source and wp.device_id=device and
     wp.stream=v_stream and wp.replacement_id=rep;
  end if;
 else raise exception 'Unknown delivery type'; end if;
 insert into public.vantage_noop_batches(user_id,source_id,device_id,batch_id,decoded_hash,ack)
 values(p_user_id,source,device,batch,p_hash,reply);
 update public.vantage_noop_connections set last_received_at=now() where user_id=p_user_id;
 return reply;
end $$;
revoke all on function public.vantage_noop_accept_secure(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.vantage_noop_accept_secure(uuid,jsonb,text) to service_role;
