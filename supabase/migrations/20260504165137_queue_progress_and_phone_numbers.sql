alter table public.leads
  add column if not exists phone_numbers text[] not null default array[]::text[];

update public.leads
set phone_numbers = case
  when coalesce(cardinality(phone_numbers), 0) > 0 then phone_numbers
  else array_remove(array[phone, alt_phone], null)
end;

create table if not exists public.queue_progress (
  user_id uuid not null references public.app_users(id) on delete cascade,
  queue_key text not null,
  queue_scope text not null default 'default',
  queue_sort text not null check (queue_sort in ('priority', 'newest', 'callback_due')),
  queue_filter text not null,
  current_lead_id uuid references public.leads(id) on delete set null,
  current_phone_index integer not null default 0 check (current_phone_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, queue_key)
);

create index if not exists queue_progress_user_idx
  on public.queue_progress (user_id, updated_at desc);

alter table public.queue_progress enable row level security;

drop policy if exists "Users can view their queue progress" on public.queue_progress;
create policy "Users can view their queue progress"
on public.queue_progress
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

drop policy if exists "Users can insert their queue progress" on public.queue_progress;
create policy "Users can insert their queue progress"
on public.queue_progress
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

drop policy if exists "Users can update their queue progress" on public.queue_progress;
create policy "Users can update their queue progress"
on public.queue_progress
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

drop policy if exists "Users can delete their queue progress" on public.queue_progress;
create policy "Users can delete their queue progress"
on public.queue_progress
for delete
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.id = user_id
  )
);
