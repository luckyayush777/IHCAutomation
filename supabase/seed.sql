with seeded_devices (device_code, name, location, device_type, status) as (
  values
    ('fridge_male_ward', 'Male Ward Refrigerator', 'Male Ward', 'fridge_probe', 'offline'),
    ('fridge_female_ward', 'Female Ward Refrigerator', 'Female Ward', 'fridge_probe', 'offline'),
    ('doctors_room', 'Doctors Room', 'Doctors Room', 'room_monitor', 'offline'),
    ('monitoring_room', 'Monitoring Room', 'Monitoring Room', 'room_monitor', 'offline'),
    ('male_ward', 'Male Ward Room Monitor', 'Male Ward', 'room_monitor', 'offline'),
    ('female_ward', 'Female Ward Room Monitor', 'Female Ward', 'room_monitor', 'offline')
),
upserted_devices as (
  insert into public.devices (device_code, name, location, device_type, status)
  select device_code, name, location, device_type, status
  from seeded_devices
  on conflict (device_code) do update
  set
    name = excluded.name,
    location = excluded.location,
    device_type = excluded.device_type,
    status = excluded.status
  returning id, device_code, name, device_type
)
insert into public.alert_rules (
  name,
  device_id,
  metric,
  minimum_value,
  maximum_value,
  duration_seconds,
  severity,
  enabled,
  recovery_seconds,
  hysteresis_value
)
select * from (
  select
    upserted_devices.name || ' temperature range' as name,
    upserted_devices.id as device_id,
    'temperature' as metric,
    2.000::numeric as minimum_value,
    5.000::numeric as maximum_value,
    600 as duration_seconds,
    'critical' as severity,
    true as enabled,
    120 as recovery_seconds,
    0.200::numeric as hysteresis_value
  from upserted_devices
  where upserted_devices.device_code in ('fridge_male_ward', 'fridge_female_ward')
  union all
  select
    upserted_devices.name || ' humidity range' as name,
    upserted_devices.id as device_id,
    'humidity' as metric,
    30.000::numeric as minimum_value,
    70.000::numeric as maximum_value,
    600 as duration_seconds,
    'warning' as severity,
    true as enabled,
    120 as recovery_seconds,
    2.000::numeric as hysteresis_value
  from upserted_devices
  where upserted_devices.device_type = 'room_monitor'
  union all
  select
    upserted_devices.name || ' detector alarm' as name,
    upserted_devices.id as device_id,
    'detector_alarm' as metric,
    0.000::numeric as minimum_value,
    0.000::numeric as maximum_value,
    1 as duration_seconds,
    'emergency' as severity,
    true as enabled,
    30 as recovery_seconds,
    0.000::numeric as hysteresis_value
  from upserted_devices
  where upserted_devices.device_type = 'room_monitor'
  union all
  select
    upserted_devices.name || ' connectivity' as name,
    upserted_devices.id as device_id,
    'heartbeat' as metric,
    null::numeric as minimum_value,
    null::numeric as maximum_value,
    300 as duration_seconds,
    'warning' as severity,
    true as enabled,
    60 as recovery_seconds,
    0.000::numeric as hysteresis_value
  from upserted_devices
) seeded_rules
on conflict on constraint alert_rules_device_metric_name_unique do update
set
  minimum_value = excluded.minimum_value,
  maximum_value = excluded.maximum_value,
  duration_seconds = excluded.duration_seconds,
  severity = excluded.severity,
  enabled = excluded.enabled,
  recovery_seconds = excluded.recovery_seconds,
  hysteresis_value = excluded.hysteresis_value;
