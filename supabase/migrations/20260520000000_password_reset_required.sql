begin;

alter table public.app_users
  add column if not exists must_reset_password boolean not null default false;

comment on column public.app_users.must_reset_password is
  'Marks workspace users who must change their temporary password before entering the app.';

commit;
