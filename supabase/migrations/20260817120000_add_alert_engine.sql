alter table public.alert_rules
  add column recovery_seconds integer not null default 60,
  add column hysteresis_value numeric(10, 3) not null default 0.200,
  add constraint alert_rules_recovery_positive check (recovery_seconds > 0),
  add constraint alert_rules_hysteresis_nonnegative check (hysteresis_value >= 0);

create table public.alert_condition_states (
  rule_id uuid not null references public.alert_rules(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  violation_started_at timestamptz,
  recovery_started_at timestamptz,
  violation_direction text,
  last_evaluated_at timestamptz not null,
  primary key (rule_id, device_id),
  constraint alert_condition_states_direction_check
    check (violation_direction is null or violation_direction in ('low', 'high', 'missing'))
);

alter table public.alert_condition_states enable row level security;
revoke all on table public.alert_condition_states from anon, authenticated;
grant all on table public.alert_condition_states to service_role;

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
  latest_reading public.readings%rowtype;
  state_record public.alert_condition_states%rowtype;
  open_alert public.alerts%rowtype;
  direction text;
  recovered boolean;
begin
  for rule_record in
    select * from public.alert_rules
    where device_id = p_device_id and enabled and metric <> 'heartbeat'
  loop
    select * into latest_reading
    from public.readings
    where device_id = p_device_id
      and metric = rule_record.metric
      and quality <> 'invalid'
    order by recorded_at desc, id desc
    limit 1;

    if not found then
      continue;
    end if;

    direction := case
      when rule_record.minimum_value is not null and latest_reading.value < rule_record.minimum_value then 'low'
      when rule_record.maximum_value is not null and latest_reading.value > rule_record.maximum_value then 'high'
      else null
    end;

    select * into open_alert
    from public.alerts
    where rule_id = rule_record.id
      and device_id = p_device_id
      and status in ('active', 'acknowledged')
    limit 1;

    select * into state_record
    from public.alert_condition_states
    where rule_id = rule_record.id and device_id = p_device_id;

    if direction is not null then
      if state_record.rule_id is null or state_record.violation_direction is distinct from direction then
        insert into public.alert_condition_states (
          rule_id, device_id, violation_started_at, recovery_started_at,
          violation_direction, last_evaluated_at
        ) values (
          rule_record.id, p_device_id, latest_reading.recorded_at, null,
          direction, p_evaluated_at
        )
        on conflict (rule_id, device_id) do update set
          violation_started_at = excluded.violation_started_at,
          recovery_started_at = null,
          violation_direction = excluded.violation_direction,
          last_evaluated_at = excluded.last_evaluated_at;
        state_record.violation_started_at := latest_reading.recorded_at;
      else
        update public.alert_condition_states set
          recovery_started_at = null,
          last_evaluated_at = p_evaluated_at
        where rule_id = rule_record.id and device_id = p_device_id;
      end if;

      if open_alert.id is null
        and latest_reading.recorded_at >= state_record.violation_started_at
          + make_interval(secs => rule_record.duration_seconds)
      then
        insert into public.alerts (
          rule_id, device_id, status, message, trigger_value, triggered_at
        ) values (
          rule_record.id,
          p_device_id,
          'active',
          rule_record.name || ' is ' || direction || ' (' || latest_reading.value || ' ' || latest_reading.unit || ')',
          latest_reading.value,
          state_record.violation_started_at
        ) on conflict do nothing;
      end if;
    else
      if open_alert.id is null then
        delete from public.alert_condition_states
        where rule_id = rule_record.id and device_id = p_device_id;
        continue;
      end if;

      recovered := case state_record.violation_direction
        when 'low' then latest_reading.value >= rule_record.minimum_value + rule_record.hysteresis_value
        when 'high' then latest_reading.value <= rule_record.maximum_value - rule_record.hysteresis_value
        else true
      end;

      if not recovered then
        update public.alert_condition_states set
          recovery_started_at = null,
          last_evaluated_at = p_evaluated_at
        where rule_id = rule_record.id and device_id = p_device_id;
      elsif state_record.recovery_started_at is null then
        update public.alert_condition_states set
          recovery_started_at = latest_reading.recorded_at,
          last_evaluated_at = p_evaluated_at
        where rule_id = rule_record.id and device_id = p_device_id;
      elsif latest_reading.recorded_at >= state_record.recovery_started_at
        + make_interval(secs => rule_record.recovery_seconds)
      then
        update public.alerts set status = 'resolved', resolved_at = latest_reading.recorded_at
        where id = open_alert.id;
        delete from public.alert_condition_states
        where rule_id = rule_record.id and device_id = p_device_id;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_offline_alerts(
  p_evaluated_at timestamptz default now(),
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rule_record public.alert_rules%rowtype;
  device_record public.devices%rowtype;
  open_alert public.alerts%rowtype;
  state_record public.alert_condition_states%rowtype;
  missing_since timestamptz;
begin
  for rule_record in
    select * from public.alert_rules
    where enabled and metric = 'heartbeat'
      and (p_device_id is null or device_id = p_device_id)
  loop
    select * into device_record from public.devices where id = rule_record.device_id;
    if device_record.status in ('maintenance', 'disabled') then
      continue;
    end if;

    select * into open_alert from public.alerts
    where rule_id = rule_record.id and device_id = rule_record.device_id
      and status in ('active', 'acknowledged') limit 1;
    select * into state_record from public.alert_condition_states
    where rule_id = rule_record.id and device_id = rule_record.device_id;

    missing_since := coalesce(device_record.last_seen_at, device_record.created_at);
    if p_evaluated_at >= missing_since + make_interval(secs => rule_record.duration_seconds) then
      update public.devices set status = 'offline'
      where id = device_record.id and status = 'online';
      insert into public.alert_condition_states (
        rule_id, device_id, violation_started_at, recovery_started_at,
        violation_direction, last_evaluated_at
      ) values (
        rule_record.id, rule_record.device_id, missing_since, null, 'missing', p_evaluated_at
      ) on conflict (rule_id, device_id) do update set
        violation_started_at = excluded.violation_started_at,
        recovery_started_at = null,
        violation_direction = 'missing',
        last_evaluated_at = excluded.last_evaluated_at;

      if open_alert.id is null then
        insert into public.alerts (
          rule_id, device_id, status, message, trigger_value, triggered_at
        ) values (
          rule_record.id, rule_record.device_id, 'active',
          device_record.name || ' stopped reporting', null,
          missing_since + make_interval(secs => rule_record.duration_seconds)
        ) on conflict do nothing;
      end if;
    elsif open_alert.id is not null then
      if state_record.recovery_started_at is null then
        insert into public.alert_condition_states (
          rule_id, device_id, violation_started_at, recovery_started_at,
          violation_direction, last_evaluated_at
        ) values (
          rule_record.id, rule_record.device_id, state_record.violation_started_at,
          p_evaluated_at, 'missing', p_evaluated_at
        ) on conflict (rule_id, device_id) do update set
          recovery_started_at = excluded.recovery_started_at,
          last_evaluated_at = excluded.last_evaluated_at;
      elsif p_evaluated_at >= state_record.recovery_started_at
        + make_interval(secs => rule_record.recovery_seconds)
      then
        update public.alerts set status = 'resolved', resolved_at = p_evaluated_at
        where id = open_alert.id;
        delete from public.alert_condition_states
        where rule_id = rule_record.id and device_id = rule_record.device_id;
      end if;
    else
      delete from public.alert_condition_states
      where rule_id = rule_record.id and device_id = rule_record.device_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.evaluate_device_alerts(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.evaluate_offline_alerts(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.evaluate_device_alerts(uuid, timestamptz) to service_role;
grant execute on function public.evaluate_offline_alerts(timestamptz, uuid) to service_role;
