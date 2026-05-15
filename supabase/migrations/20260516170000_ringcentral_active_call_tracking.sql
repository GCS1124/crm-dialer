begin;

alter table public.ringcentral_integrations
  add column if not exists active_telephony_session_id text,
  add column if not exists active_telephony_party_id text,
  add column if not exists active_telephony_direction text,
  add column if not exists active_telephony_status_code text,
  add column if not exists active_telephony_updated_at timestamptz;

commit;
