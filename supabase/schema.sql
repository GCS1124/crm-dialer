create extension if not exists "pgcrypto";

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'team_leader', 'agent')),
  team_name text not null,
  title text,
  timezone text not null default 'UTC',
  status text not null default 'offline' check (status in ('online', 'away', 'offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  full_name text not null,
  phone text not null,
  alt_phone text,
  email text,
  company text,
  job_title text,
  location text,
  source text,
  interest text,
  status text not null default 'new',
  notes text,
  last_contacted timestamptz,
  assigned_agent uuid references public.app_users(id) on delete set null,
  callback_time timestamptz,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  lead_score integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references public.app_users(id) on delete set null,
  note_body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid references public.app_users(id) on delete set null,
  direction text not null default 'outgoing' check (direction in ('incoming', 'outgoing')),
  disposition text not null,
  duration_seconds integer not null default 0,
  call_status text not null default 'connected' check (call_status in ('connected', 'missed', 'follow_up')),
  recording_enabled boolean not null default false,
  recording_url text,
  outcome_summary text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.callbacks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid references public.app_users(id) on delete set null,
  scheduled_for timestamptz not null,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'overdue', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.app_users(id) on delete set null,
  activity_type text not null,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid references public.app_users(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leads_assigned_agent_idx on public.leads (assigned_agent);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_callback_time_idx on public.leads (callback_time);
create index if not exists call_logs_agent_id_idx on public.call_logs (agent_id, created_at desc);
create index if not exists callbacks_owner_idx on public.callbacks (owner_id, scheduled_for);

create or replace view public.agent_daily_metrics as
select
  au.id as agent_id,
  au.full_name as agent_name,
  date_trunc('day', cl.created_at) as activity_day,
  count(cl.id) as total_calls,
  count(*) filter (where cl.disposition in ('Interested', 'Appointment Booked', 'Sale Closed')) as connected_calls,
  count(*) filter (where cl.disposition = 'Appointment Booked') as appointments_booked,
  count(*) filter (where cl.disposition = 'Sale Closed') as sales_closed,
  round(avg(cl.duration_seconds)::numeric, 2) as avg_call_duration
from public.app_users au
left join public.call_logs cl on cl.agent_id = au.id
where au.role = 'agent'
group by au.id, au.full_name, date_trunc('day', cl.created_at);
