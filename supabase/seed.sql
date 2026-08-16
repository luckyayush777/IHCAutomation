with seeded_devices (device_code, name, location, device_type, status) as (
  values
    ('fridge_male_ward', 'Male Ward Refrigerator', 'Male Ward', 'fridge_probe', 'offline'),
    ('fridge_female_ward', 'Female Ward Refrigerator', 'Female Ward', 'fridge_probe', 'offline'),
    ('doctors_room', 'Doctors Room', 'Doctors Room', 'room_monitor', 'offline'),
    ('monitoring_room', 'Monitoring Room', 'Monitoring Room', 'room_monitor', 'offline'),
    ('male_ward', 'Male Ward Room Monitor', 'Male Ward', 'room_monitor', 'offline'),
    ('female_ward', 'Female Ward Room Monitor', 'Female Ward', 'room_monitor', 'offline')
)
insert into public.devices (device_code, name, location, device_type, status)
select device_code, name, location, device_type, status
from seeded_devices
on conflict (device_code) do update
set
  name = excluded.name,
  location = excluded.location,
  device_type = excluded.device_type,
  status = excluded.status;

insert into public.alert_rules (
  name,
  device_id,
  metric,
  minimum_value,
  maximum_value,
  duration_seconds,
  severity,
  enabled
)
select
  devices.name || ' temperature range',
  devices.id,
  'temperature',
  2.000,
  5.000,
  600,
  'critical',
  true
from public.devices
where devices.device_code in ('fridge_male_ward', 'fridge_female_ward')
on conflict on constraint alert_rules_device_metric_name_unique do update
set
  minimum_value = excluded.minimum_value,
  maximum_value = excluded.maximum_value,
  duration_seconds = excluded.duration_seconds,
  severity = excluded.severity,
  enabled = excluded.enabled;
