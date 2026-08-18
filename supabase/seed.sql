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

-- Generic demonstration entries only. Replace these names and hours with the
-- institute-approved public roster before deployment.
with seeded_doctors (doctor_code, display_name, role, department, room, display_order) as (
  values
    ('duty_medical_officer', 'Duty Medical Officer', 'Medical Officer', 'General Medicine', 'Consultation Room 1', 1),
    ('visiting_physician', 'Visiting Physician', 'Physician', 'General Medicine', 'Consultation Room 2', 2),
    ('on_call_doctor', 'On-call Doctor', 'Medical Officer', 'Emergency Support', 'Contact Reception', 3)
),
upserted_doctors as (
  insert into public.doctors (doctor_code, display_name, role, department, room, display_order, is_active)
  select doctor_code, display_name, role, department, room, display_order, true
  from seeded_doctors
  on conflict (doctor_code) do update
  set
    display_name = excluded.display_name,
    role = excluded.role,
    department = excluded.department,
    room = excluded.room,
    display_order = excluded.display_order,
    is_active = true,
    updated_at = now()
  returning id, doctor_code
),
seeded_availability (doctor_code, weekday, start_time, end_time, availability_type, note) as (
  values
    ('duty_medical_officer', 1, '09:00'::time, '17:00'::time, 'available', 'General consultation'),
    ('duty_medical_officer', 2, '09:00'::time, '17:00'::time, 'available', 'General consultation'),
    ('duty_medical_officer', 3, '09:00'::time, '17:00'::time, 'available', 'General consultation'),
    ('duty_medical_officer', 4, '09:00'::time, '17:00'::time, 'available', 'General consultation'),
    ('duty_medical_officer', 5, '09:00'::time, '17:00'::time, 'available', 'General consultation'),
    ('duty_medical_officer', 6, '09:00'::time, '13:00'::time, 'available', 'General consultation'),
    ('visiting_physician', 2, '14:00'::time, '17:00'::time, 'appointment_only', 'Prior appointment required'),
    ('visiting_physician', 4, '14:00'::time, '17:00'::time, 'appointment_only', 'Prior appointment required'),
    ('on_call_doctor', 0, '00:00'::time, '23:59'::time, 'on_call', 'Contact reception'),
    ('on_call_doctor', 1, '17:00'::time, '23:59'::time, 'on_call', 'Contact reception'),
    ('on_call_doctor', 2, '17:00'::time, '23:59'::time, 'on_call', 'Contact reception'),
    ('on_call_doctor', 3, '17:00'::time, '23:59'::time, 'on_call', 'Contact reception'),
    ('on_call_doctor', 4, '17:00'::time, '23:59'::time, 'on_call', 'Contact reception'),
    ('on_call_doctor', 5, '17:00'::time, '23:59'::time, 'on_call', 'Contact reception'),
    ('on_call_doctor', 6, '13:00'::time, '23:59'::time, 'on_call', 'Contact reception')
)
insert into public.doctor_availability (
  doctor_id,
  weekday,
  start_time,
  end_time,
  availability_type,
  note
)
select
  upserted_doctors.id,
  seeded_availability.weekday,
  seeded_availability.start_time,
  seeded_availability.end_time,
  seeded_availability.availability_type,
  seeded_availability.note
from seeded_availability
join upserted_doctors using (doctor_code)
on conflict on constraint doctor_availability_slot_unique do update
set
  end_time = excluded.end_time,
  note = excluded.note,
  updated_at = now();
