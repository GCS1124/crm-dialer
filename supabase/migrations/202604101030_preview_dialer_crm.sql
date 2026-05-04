create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;

create or replace function app_private.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'agent'
  );
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.current_role() = 'admin';
$$;

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    'agent',
    'offline'
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  status text not null default 'offline' check (status in ('online', 'offline', 'busy', 'break')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  storage_path text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'validated', 'imported', 'partial_import', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  mapping_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.caller_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  total_callers integer not null default 0,
  pending_count integer not null default 0,
  completed_count integer not null default 0,
  callback_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.callers (
  id uuid primary key default gen_random_uuid(),
  caller_list_id uuid not null references public.caller_lists (id) on delete cascade,
  import_id uuid references public.imports (id) on delete set null,
  full_name text,
  first_name text,
  last_name text,
  phone text not null,
  alt_phone text,
  email text,
  company text,
  city text,
  state text,
  country text,
  notes text,
  source text,
  tags text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'callback', 'failed', 'dnc')),
  disposition text
    check (disposition in ('interested', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'voicemail', 'callback_requested', 'converted')),
  assigned_to uuid references public.profiles (id) on delete set null,
  last_called_at timestamptz,
  next_follow_up_at timestamptz,
  import_row_number integer,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references public.callers (id) on delete set null,
  agent_id uuid references public.profiles (id) on delete set null,
  phone_number text not null,
  dial_mode text not null check (dial_mode in ('preview', 'manual')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  status text,
  disposition text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.caller_notes (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.callers (id) on delete cascade,
  agent_id uuid references public.profiles (id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.callers (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  due_at timestamptz not null,
  type text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists imports_uploaded_by_created_at_idx on public.imports (uploaded_by, created_at desc);
create index if not exists caller_lists_assigned_to_status_idx on public.caller_lists (assigned_to, status);
create index if not exists callers_caller_list_id_idx on public.callers (caller_list_id);
create index if not exists callers_assigned_to_status_idx on public.callers (assigned_to, status);
create index if not exists callers_phone_idx on public.callers (phone);
create index if not exists callers_next_follow_up_at_idx on public.callers (next_follow_up_at);
create index if not exists call_logs_caller_id_created_at_idx on public.call_logs (caller_id, created_at desc);
create index if not exists call_logs_agent_id_created_at_idx on public.call_logs (agent_id, created_at desc);
create index if not exists follow_ups_assigned_to_due_at_idx on public.follow_ups (assigned_to, due_at);

create or replace function app_private.recompute_caller_list_counts(target_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.caller_lists as cl
  set
    total_callers = counts.total_callers,
    pending_count = counts.pending_count,
    completed_count = counts.completed_count,
    callback_count = counts.callback_count,
    status = case
      when cl.status = 'archived' then 'archived'
      when counts.total_callers = 0 then 'draft'
      when counts.pending_count = 0 and counts.callback_count = 0 then 'completed'
      else 'active'
    end
  from (
    select
      count(*)::integer as total_callers,
      count(*) filter (where status in ('pending', 'in_progress', 'failed', 'dnc'))::integer as pending_count,
      count(*) filter (where status = 'completed')::integer as completed_count,
      count(*) filter (where status = 'callback')::integer as callback_count
    from public.callers
    where caller_list_id = target_list_id
  ) as counts
  where cl.id = target_list_id;
end;
$$;

create or replace function app_private.sync_caller_list_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform app_private.recompute_caller_list_counts(old.caller_list_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.caller_list_id is distinct from new.caller_list_id then
    perform app_private.recompute_caller_list_counts(old.caller_list_id);
  end if;

  perform app_private.recompute_caller_list_counts(new.caller_list_id);
  return new;
end;
$$;

create or replace function app_private.sync_last_called_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.caller_id is not null then
    update public.callers
    set last_called_at = coalesce(new.ended_at, new.started_at, now())
    where id = new.caller_id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function app_private.touch_updated_at();

drop trigger if exists caller_lists_touch_updated_at on public.caller_lists;
create trigger caller_lists_touch_updated_at
before update on public.caller_lists
for each row execute function app_private.touch_updated_at();

drop trigger if exists callers_touch_updated_at on public.callers;
create trigger callers_touch_updated_at
before update on public.callers
for each row execute function app_private.touch_updated_at();

drop trigger if exists follow_ups_touch_updated_at on public.follow_ups;
create trigger follow_ups_touch_updated_at
before update on public.follow_ups
for each row execute function app_private.touch_updated_at();

drop trigger if exists callers_refresh_list_counts on public.callers;
create trigger callers_refresh_list_counts
after insert or update or delete on public.callers
for each row execute function app_private.sync_caller_list_counts();

drop trigger if exists call_logs_sync_last_called_at on public.call_logs;
create trigger call_logs_sync_last_called_at
after insert on public.call_logs
for each row execute function app_private.sync_last_called_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure app_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.imports enable row level security;
alter table public.import_mappings enable row level security;
alter table public.caller_lists enable row level security;
alter table public.callers enable row level security;
alter table public.call_logs enable row level security;
alter table public.caller_notes enable row level security;
alter table public.follow_ups enable row level security;

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all
on public.profiles
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists imports_admin_all on public.imports;
create policy imports_admin_all
on public.imports
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists imports_select_relevant on public.imports;
create policy imports_select_relevant
on public.imports
for select
to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1
    from public.caller_lists cl
    where cl.import_id = imports.id
      and (cl.assigned_to = auth.uid() or cl.created_by = auth.uid())
  )
);

drop policy if exists imports_insert_own on public.imports;
create policy imports_insert_own
on public.imports
for insert
to authenticated
with check (uploaded_by = auth.uid());

drop policy if exists imports_update_own on public.imports;
create policy imports_update_own
on public.imports
for update
to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());

drop policy if exists import_mappings_admin_all on public.import_mappings;
create policy import_mappings_admin_all
on public.import_mappings
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists import_mappings_select_relevant on public.import_mappings;
create policy import_mappings_select_relevant
on public.import_mappings
for select
to authenticated
using (
  exists (
    select 1
    from public.imports i
    where i.id = import_id
      and (
        i.uploaded_by = auth.uid()
        or exists (
          select 1
          from public.caller_lists cl
          where cl.import_id = i.id
            and (cl.assigned_to = auth.uid() or cl.created_by = auth.uid())
        )
      )
  )
);

drop policy if exists import_mappings_insert_relevant on public.import_mappings;
create policy import_mappings_insert_relevant
on public.import_mappings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.imports i
    where i.id = import_id and i.uploaded_by = auth.uid()
  )
);

drop policy if exists caller_lists_admin_all on public.caller_lists;
create policy caller_lists_admin_all
on public.caller_lists
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists caller_lists_select_assigned on public.caller_lists;
create policy caller_lists_select_assigned
on public.caller_lists
for select
to authenticated
using (assigned_to = auth.uid() or created_by = auth.uid());

drop policy if exists caller_lists_insert_own on public.caller_lists;
create policy caller_lists_insert_own
on public.caller_lists
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (assigned_to is null or assigned_to = auth.uid())
);

drop policy if exists caller_lists_update_relevant on public.caller_lists;
create policy caller_lists_update_relevant
on public.caller_lists
for update
to authenticated
using (assigned_to = auth.uid() or created_by = auth.uid())
with check (assigned_to = auth.uid() or created_by = auth.uid());

drop policy if exists callers_admin_all on public.callers;
create policy callers_admin_all
on public.callers
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists callers_select_relevant on public.callers;
create policy callers_select_relevant
on public.callers
for select
to authenticated
using (
  assigned_to = auth.uid()
  or exists (
    select 1
    from public.caller_lists cl
    where cl.id = callers.caller_list_id
      and (cl.assigned_to = auth.uid() or cl.created_by = auth.uid())
  )
);

drop policy if exists callers_insert_relevant on public.callers;
create policy callers_insert_relevant
on public.callers
for insert
to authenticated
with check (
  assigned_to = auth.uid()
  or exists (
    select 1
    from public.caller_lists cl
    where cl.id = callers.caller_list_id
      and (cl.assigned_to = auth.uid() or cl.created_by = auth.uid())
  )
);

drop policy if exists callers_update_relevant on public.callers;
create policy callers_update_relevant
on public.callers
for update
to authenticated
using (
  assigned_to = auth.uid()
  or exists (
    select 1
    from public.caller_lists cl
    where cl.id = callers.caller_list_id
      and (cl.assigned_to = auth.uid() or cl.created_by = auth.uid())
  )
)
with check (
  assigned_to = auth.uid()
  or exists (
    select 1
    from public.caller_lists cl
    where cl.id = callers.caller_list_id
      and (cl.assigned_to = auth.uid() or cl.created_by = auth.uid())
  )
);

drop policy if exists call_logs_admin_all on public.call_logs;
create policy call_logs_admin_all
on public.call_logs
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists call_logs_select_own on public.call_logs;
create policy call_logs_select_own
on public.call_logs
for select
to authenticated
using (agent_id = auth.uid());

drop policy if exists call_logs_insert_own on public.call_logs;
create policy call_logs_insert_own
on public.call_logs
for insert
to authenticated
with check (agent_id = auth.uid());

drop policy if exists caller_notes_admin_all on public.caller_notes;
create policy caller_notes_admin_all
on public.caller_notes
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists caller_notes_select_own on public.caller_notes;
create policy caller_notes_select_own
on public.caller_notes
for select
to authenticated
using (agent_id = auth.uid());

drop policy if exists caller_notes_insert_own on public.caller_notes;
create policy caller_notes_insert_own
on public.caller_notes
for insert
to authenticated
with check (agent_id = auth.uid());

drop policy if exists follow_ups_admin_all on public.follow_ups;
create policy follow_ups_admin_all
on public.follow_ups
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists follow_ups_select_assigned on public.follow_ups;
create policy follow_ups_select_assigned
on public.follow_ups
for select
to authenticated
using (assigned_to = auth.uid());

drop policy if exists follow_ups_insert_assigned on public.follow_ups;
create policy follow_ups_insert_assigned
on public.follow_ups
for insert
to authenticated
with check (assigned_to = auth.uid());

drop policy if exists follow_ups_update_assigned on public.follow_ups;
create policy follow_ups_update_assigned
on public.follow_ups
for update
to authenticated
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

grant usage on schema app_private to authenticated, service_role;
grant execute on all functions in schema app_private to authenticated, service_role;
alter default privileges in schema app_private grant execute on functions to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dialer-imports',
  'dialer-imports',
  false,
  52428800,
  array[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_imports_admin_all on storage.objects;
create policy storage_imports_admin_all
on storage.objects
for all
to authenticated
using (bucket_id = 'dialer-imports' and app_private.is_admin())
with check (bucket_id = 'dialer-imports' and app_private.is_admin());

drop policy if exists storage_imports_select_own on storage.objects;
create policy storage_imports_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dialer-imports'
  and (
    owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);

drop policy if exists storage_imports_insert_own on storage.objects;
create policy storage_imports_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dialer-imports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists storage_imports_update_own on storage.objects;
create policy storage_imports_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dialer-imports'
  and (
    owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
)
with check (
  bucket_id = 'dialer-imports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists storage_imports_delete_own on storage.objects;
create policy storage_imports_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dialer-imports'
  and (
    owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);
