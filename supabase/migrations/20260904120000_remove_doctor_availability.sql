-- Doctor availability belongs to a later product version. Keep this deployment
-- limited to sensor monitoring by removing its RPC and tables.
drop function if exists public.upsert_doctor_roster_entry(jsonb, jsonb);
drop table if exists public.doctor_availability;
drop table if exists public.doctors;
