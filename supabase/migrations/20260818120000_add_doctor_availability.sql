create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  doctor_code text not null unique,
  display_name text not null,
  role text not null,
  department text,
  room text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctors_code_format check (doctor_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint doctors_display_name_not_blank check (btrim(display_name) <> ''),
  constraint doctors_role_not_blank check (btrim(role) <> '')
);

create table public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  availability_type text not null default 'available',
  note text,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_availability_weekday_check check (weekday between 0 and 6),
  constraint doctor_availability_time_order check (start_time < end_time),
  constraint doctor_availability_type_check check (
    availability_type in ('available', 'on_call', 'appointment_only', 'unavailable')
  ),
  constraint doctor_availability_validity_check check (
    valid_from is null or valid_until is null or valid_from <= valid_until
  ),
  constraint doctor_availability_slot_unique unique (doctor_id, weekday, start_time, availability_type)
);

create index doctor_availability_doctor_weekday_idx
  on public.doctor_availability (doctor_id, weekday, start_time);

alter table public.doctors enable row level security;
alter table public.doctor_availability enable row level security;

revoke all on table public.doctors from anon, authenticated;
revoke all on table public.doctor_availability from anon, authenticated;

grant select (id, doctor_code, display_name, role, department, room, display_order, is_active)
  on table public.doctors to anon;
grant select (
  id,
  doctor_id,
  weekday,
  start_time,
  end_time,
  availability_type,
  note,
  valid_from,
  valid_until
)
  on table public.doctor_availability to anon;

grant all on table public.doctors to service_role;
grant all on table public.doctor_availability to service_role;

create policy "public display can read active doctors"
  on public.doctors for select
  to anon
  using (is_active);

create policy "public display can read doctor availability"
  on public.doctor_availability for select
  to anon
  using (
    exists (
      select 1
      from public.doctors
      where doctors.id = doctor_availability.doctor_id
        and doctors.is_active
    )
  );

comment on table public.doctors is
  'Public directory entries for the health-centre availability display; do not store patient data.';
comment on table public.doctor_availability is
  'Recurring public weekly availability. Weekday uses 0=Sunday through 6=Saturday.';
