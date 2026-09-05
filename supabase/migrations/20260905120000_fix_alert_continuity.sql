-- Invalid samples are evidence of a sensor fault, never threshold measurements.
alter table public.readings
  drop constraint readings_temperature_range,
  drop constraint readings_humidity_range,
  drop constraint readings_smoke_range,
  drop constraint readings_alarm_state_range,
  add constraint readings_temperature_range check (quality = 'invalid' or metric <> 'temperature' or value between -50 and 80),
  add constraint readings_humidity_range check (quality = 'invalid' or metric <> 'humidity' or value between 0 and 100),
  add constraint readings_smoke_range check (quality = 'invalid' or metric <> 'smoke' or value >= 0),
  add constraint readings_alarm_state_range check (quality = 'invalid' or metric <> 'detector_alarm' or value in (0, 1));

alter table public.alert_rules
  add column max_sample_gap_seconds integer not null default 300
  check (max_sample_gap_seconds > 0);

alter table public.alert_condition_states
  add column last_reading_at timestamptz;

-- The old evaluator did not establish continuity. Keep existing alerts open, but
-- require new evidence for both persistence and recovery after this upgrade.
update public.alert_condition_states s set
  violation_started_at = null,
  recovery_started_at = null,
  last_reading_at = (
    select max(r.recorded_at) from public.readings r
    join public.alert_rules a on a.id = s.rule_id
    where r.device_id = s.device_id and r.metric = a.metric
  )
where exists (select 1 from public.alert_rules a where a.id = s.rule_id and a.metric <> 'heartbeat');

create or replace function public.evaluate_device_alerts(
  p_device_id uuid,
  p_evaluated_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rule_record public.alert_rules%rowtype;
  sample public.readings%rowtype;
  state_record public.alert_condition_states%rowtype;
  open_alert public.alerts%rowtype;
  direction text;
  recovered boolean;
begin
  -- Serialize evaluation, including concurrent uploads from the same device.
  perform 1 from public.devices where id = p_device_id for update;
  for rule_record in
    select * from public.alert_rules
    where device_id = p_device_id and enabled and metric <> 'heartbeat'
    order by id
  loop
    insert into public.alert_condition_states (rule_id, device_id, last_evaluated_at)
    values (rule_record.id, p_device_id, p_evaluated_at)
    on conflict do nothing;
    select * into state_record from public.alert_condition_states
    where rule_id = rule_record.id and device_id = p_device_id;
    select * into open_alert from public.alerts
    where rule_id = rule_record.id and device_id = p_device_id
      and status in ('active', 'acknowledged');

    for sample in
      select * from public.readings
      where device_id = p_device_id and metric = rule_record.metric
        and (state_record.last_reading_at is null or recorded_at > state_record.last_reading_at)
      order by recorded_at, id
    loop
      if state_record.last_reading_at is null
        or sample.recorded_at - state_record.last_reading_at >= make_interval(secs => rule_record.max_sample_gap_seconds)
        or sample.quality <> 'good'
      then
        state_record.violation_started_at := null;
        state_record.recovery_started_at := null;
      end if;
      state_record.last_reading_at := sample.recorded_at;
      if sample.quality <> 'good' then
        continue;
      end if;

      direction := case
        when sample.value < rule_record.minimum_value then 'low'
        when sample.value > rule_record.maximum_value then 'high'
        else null
      end;
      if direction is not null then
        if state_record.violation_started_at is null
          or state_record.violation_direction is distinct from direction
        then
          state_record.violation_started_at := sample.recorded_at;
        end if;
        state_record.violation_direction := direction;
        state_record.recovery_started_at := null;
        if open_alert.id is null and sample.recorded_at >= state_record.violation_started_at
          + make_interval(secs => rule_record.duration_seconds)
        then
          insert into public.alerts (rule_id, device_id, status, message, trigger_value, triggered_at)
          values (
            rule_record.id, p_device_id, 'active',
            rule_record.name || ' is ' || direction || ' (' || sample.value || ' ' || sample.unit || ')',
            sample.value, state_record.violation_started_at
          ) returning * into open_alert;
        end if;
      else
        state_record.violation_started_at := null;
        if open_alert.id is null then
          state_record.violation_direction := null;
          state_record.recovery_started_at := null;
          continue;
        end if;
        recovered := case state_record.violation_direction
          when 'low' then sample.value >= rule_record.minimum_value + rule_record.hysteresis_value
          when 'high' then sample.value <= rule_record.maximum_value - rule_record.hysteresis_value
          else (rule_record.minimum_value is null or sample.value >= rule_record.minimum_value + rule_record.hysteresis_value)
            and (rule_record.maximum_value is null or sample.value <= rule_record.maximum_value - rule_record.hysteresis_value)
        end;
        if not recovered then
          state_record.recovery_started_at := null;
        elsif state_record.recovery_started_at is null then
          state_record.recovery_started_at := sample.recorded_at;
        elsif sample.recorded_at >= state_record.recovery_started_at
          + make_interval(secs => rule_record.recovery_seconds)
        then
          update public.alerts set status = 'resolved', resolved_at = sample.recorded_at
          where id = open_alert.id;
          open_alert := null;
          state_record.recovery_started_at := null;
          state_record.violation_direction := null;
        end if;
      end if;
    end loop;
    -- Keep the cursor even after resolution: retries must not replay old episodes.
    update public.alert_condition_states set
      violation_started_at = state_record.violation_started_at,
      recovery_started_at = state_record.recovery_started_at,
      violation_direction = state_record.violation_direction,
      last_reading_at = state_record.last_reading_at,
      last_evaluated_at = p_evaluated_at
    where rule_id = rule_record.id and device_id = p_device_id;
  end loop;
end;
$$;

-- Store each batch and evaluate it under the same lock and transaction. No other
-- upload can insert a later batch between this batch's insert and its evaluation.
create function public.ingest_device_readings(
  p_device_id uuid,
  p_readings jsonb,
  p_received_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  replay_rules uuid[];
  previous_alerts jsonb;
begin
  perform 1 from public.devices where id = p_device_id for update;
  if not found then raise exception 'Unknown device'; end if;

  with inserted as (
    insert into public.readings (device_id, metric, value, unit, quality, recorded_at, received_at)
    select p_device_id, r.metric, r.value, r.unit, coalesce(r.quality, 'good'), r."recordedAt", p_received_at
    from jsonb_to_recordset(p_readings) as r(metric text, value numeric, unit text, quality text, "recordedAt" timestamptz)
    order by r."recordedAt"
    on conflict (device_id, metric, recorded_at) do nothing
    returning metric, recorded_at
  )
  select array_agg(distinct a.id) into replay_rules
  from inserted r join public.alert_rules a on a.device_id = p_device_id and a.metric = r.metric and a.enabled
  join public.alert_condition_states s on s.rule_id = a.id and s.device_id = p_device_id
  where r.recorded_at <= s.last_reading_at;

  -- A previously unseen backfill can change an already evaluated interval. Rebuild
  -- only affected rules, atomically, so late normal/fault samples can retract a
  -- false excursion or reopen a recovery that was not continuous. Ordinary uploads
  -- and duplicate retries continue incrementally without scanning old history.
  if replay_rules is not null then
    select jsonb_agg(to_jsonb(a)) into previous_alerts
    from public.alerts a where a.rule_id = any(replay_rules);
    delete from public.alerts a where a.rule_id = any(replay_rules)
      and a.triggered_at >= (
        select min(r.recorded_at) from public.readings r
        join public.alert_rules rule on rule.id = a.rule_id
        where r.device_id = p_device_id and r.metric = rule.metric
      );
    delete from public.alert_condition_states where rule_id = any(replay_rules);
  end if;

  update public.devices set last_seen_at = greatest(last_seen_at, p_received_at),
    status = case when status in ('maintenance', 'disabled') then status else 'online' end
  where id = p_device_id;
  perform public.evaluate_device_alerts(p_device_id, p_received_at);
  if previous_alerts is not null then
    -- Preserve identity and acknowledgement for episodes that still exist.
    update public.alerts a set
      id = old.id, created_at = old.created_at,
      acknowledged_at = old.acknowledged_at, acknowledged_by = old.acknowledged_by,
      status = case when a.status = 'active' and old.acknowledged_at is not null then 'acknowledged' else a.status end
    from jsonb_populate_recordset(null::public.alerts, previous_alerts) old
    where a.rule_id = old.rule_id and a.device_id = old.device_id and a.triggered_at = old.triggered_at;
  end if;
  perform public.evaluate_offline_alerts(p_received_at, p_device_id);
end;
$$;

revoke all on function public.ingest_device_readings(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_device_readings(uuid, jsonb, timestamptz) to service_role;
