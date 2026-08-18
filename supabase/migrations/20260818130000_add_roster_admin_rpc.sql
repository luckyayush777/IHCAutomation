create or replace function public.upsert_doctor_roster_entry(
  p_doctor jsonb,
  p_slots jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id uuid;
  v_slot jsonb;
begin
  insert into public.doctors (
    doctor_code,
    display_name,
    role,
    department,
    room,
    display_order,
    is_active
  )
  values (
    p_doctor->>'doctorCode',
    p_doctor->>'displayName',
    p_doctor->>'role',
    nullif(p_doctor->>'department', ''),
    nullif(p_doctor->>'room', ''),
    coalesce((p_doctor->>'displayOrder')::integer, 0),
    coalesce((p_doctor->>'isActive')::boolean, true)
  )
  on conflict (doctor_code) do update
  set
    display_name = excluded.display_name,
    role = excluded.role,
    department = excluded.department,
    room = excluded.room,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    updated_at = now()
  returning id into v_doctor_id;

  delete from public.doctor_availability
  where doctor_id = v_doctor_id;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    insert into public.doctor_availability (
      doctor_id,
      weekday,
      start_time,
      end_time,
      availability_type,
      note,
      valid_from,
      valid_until
    )
    values (
      v_doctor_id,
      (v_slot->>'weekday')::smallint,
      (v_slot->>'startTime')::time,
      (v_slot->>'endTime')::time,
      v_slot->>'availabilityType',
      nullif(v_slot->>'note', ''),
      nullif(v_slot->>'validFrom', '')::date,
      nullif(v_slot->>'validUntil', '')::date
    );
  end loop;

  return v_doctor_id;
end;
$$;

revoke all on function public.upsert_doctor_roster_entry(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_doctor_roster_entry(jsonb, jsonb)
  to service_role;

comment on function public.upsert_doctor_roster_entry(jsonb, jsonb) is
  'Atomically updates one public doctor directory entry and replaces its weekly availability slots.';
