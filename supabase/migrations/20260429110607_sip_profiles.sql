create table if not exists public.sip_profiles (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  provider_url text not null,
  sip_domain text not null,
  sip_username text not null,
  sip_password text not null,
  caller_id text not null,
  owner_user_id uuid references public.app_users(id) on delete set null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_sip_preferences (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  active_sip_profile_id uuid references public.sip_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sip_profiles_owner_idx on public.sip_profiles (owner_user_id, is_shared);

alter table public.sip_profiles enable row level security;
alter table public.user_sip_preferences enable row level security;

drop policy if exists "Users can view accessible sip profiles" on public.sip_profiles;
create policy "Users can view accessible sip profiles"
on public.sip_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and (
        au.role = 'admin'
        or is_shared = true
        or owner_user_id = au.id
      )
  )
);

drop policy if exists "Users can insert owned or shared sip profiles" on public.sip_profiles;
create policy "Users can insert owned or shared sip profiles"
on public.sip_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and (
        (is_shared = false and owner_user_id = au.id)
        or (
          au.role in ('admin', 'team_leader')
          and (is_shared = true or owner_user_id = au.id)
        )
      )
  )
);

drop policy if exists "Users can update accessible sip profiles" on public.sip_profiles;
create policy "Users can update accessible sip profiles"
on public.sip_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and (
        au.role = 'admin'
        or owner_user_id = au.id
      )
  )
)
with check (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and (
        (is_shared = false and owner_user_id = au.id)
        or (
          au.role in ('admin', 'team_leader')
          and (is_shared = true or owner_user_id = au.id)
        )
      )
  )
);

drop policy if exists "Users can view their sip preference" on public.user_sip_preferences;
create policy "Users can view their sip preference"
on public.user_sip_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
);

drop policy if exists "Users can insert their sip preference" on public.user_sip_preferences;
create policy "Users can insert their sip preference"
on public.user_sip_preferences
for insert
to authenticated
with check (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
);

drop policy if exists "Users can update their sip preference" on public.user_sip_preferences;
create policy "Users can update their sip preference"
on public.user_sip_preferences
for update
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
)
with check (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
);
