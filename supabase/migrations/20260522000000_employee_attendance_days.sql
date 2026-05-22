begin;

create table if not exists public.employee_attendance_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.app_users(id) on delete cascade,
  activity_date date not null,
  timezone text not null default 'UTC',
  status text not null check (status in ('checked_out', 'checked_in', 'on_break')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  break_started_at timestamptz,
  break_type text check (break_type is null or break_type in ('freshen_up', 'lunch', 'tea', 'meeting_training')),
  active_session_seconds integer not null default 0,
  active_break_seconds integer not null default 0,
  has_checked_in boolean not null default false,
  break_usage_counts jsonb not null default '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
  break_durations_seconds jsonb not null default '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, activity_date)
);

create index if not exists employee_attendance_days_employee_date_idx
  on public.employee_attendance_days (employee_id, activity_date desc);

alter table public.employee_attendance_days enable row level security;

grant select, insert, update, delete on public.employee_attendance_days to authenticated;

drop policy if exists "Employees can view attendance" on public.employee_attendance_days;
create policy "Employees can view attendance"
on public.employee_attendance_days
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users viewer
    where viewer.auth_user_id = auth.uid()
      and (
        viewer.id = employee_id
        or viewer.role in ('admin', 'team_leader')
      )
  )
);

drop policy if exists "Employees can manage their own attendance" on public.employee_attendance_days;
create policy "Employees can manage their own attendance"
on public.employee_attendance_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
);

drop policy if exists "Employees can update their own attendance" on public.employee_attendance_days;
create policy "Employees can update their own attendance"
on public.employee_attendance_days
for update
to authenticated
using (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
)
with check (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
);

drop policy if exists "Employees can delete their own attendance" on public.employee_attendance_days;
create policy "Employees can delete their own attendance"
on public.employee_attendance_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
);

commit;
