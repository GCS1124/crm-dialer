insert into public.app_users (id, full_name, email, role, team_name, title, timezone, status, must_reset_password)
values
  ('11111111-1111-1111-1111-111111111111', 'Olivia Hart', 'admin@previewdialer.io', 'admin', 'Global Revenue Ops', 'Revenue Operations Admin', 'America/New_York', 'online', false),
  ('22222222-2222-2222-2222-222222222222', 'Marcus Reed', 'leader@previewdialer.io', 'team_leader', 'North America SDR', 'Outbound Team Lead', 'America/Chicago', 'online', false),
  ('33333333-3333-3333-3333-333333333333', 'Priya Nair', 'priya@previewdialer.io', 'agent', 'North America SDR', 'Senior Appointment Setter', 'Asia/Kolkata', 'online', false);

insert into public.leads (
  id,
  external_id,
  full_name,
  phone,
  alt_phone,
  email,
  company,
  job_title,
  location,
  source,
  interest,
  status,
  notes,
  last_contacted,
  assigned_agent,
  callback_time,
  priority,
  lead_score
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'lead-1001',
    'Amelia Brooks',
    '+14155550101',
    '+14155550991',
    'amelia.brooks@northpeak.io',
    'Northpeak Advisory',
    'Revenue Manager',
    'Austin, TX',
    'LinkedIn Ads',
    'Sales enablement analytics',
    'follow_up',
    'Interested in a 14-day trial if pricing is aligned with their 18-seat team.',
    now() - interval '18 hours',
    '33333333-3333-3333-3333-333333333333',
    now() + interval '3 hours',
    'Urgent',
    91
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'lead-1002',
    'Noah Fernandez',
    '+14155550102',
    '+14155550992',
    'noah.fernandez@axonworks.co',
    'Axon Works',
    'Sales Director',
    'Miami, FL',
    'Website Demo Form',
    'Cloud-based preview dialer',
    'new',
    'Fresh inbound lead from comparison page.',
    null,
    '33333333-3333-3333-3333-333333333333',
    null,
    'High',
    84
  );

insert into public.lead_tags (lead_id, label)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'trial-ready'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mid-market'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'inbound');

insert into public.lead_notes (lead_id, author_id, note_body)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Decision-maker loop includes CRO and RevOps analyst.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Mention ROI calculator in next call.');

insert into public.call_logs (
  lead_id,
  agent_id,
  disposition,
  duration_seconds,
  call_status,
  recording_enabled,
  outcome_summary,
  notes
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'Interested',
    482,
    'completed',
    true,
    'Warm prospect wants pricing comparison.',
    'Asked for case studies and security details before next conversation.'
  );

insert into public.callbacks (lead_id, owner_id, scheduled_for, priority, status)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    now() + interval '3 hours',
    'Urgent',
    'scheduled'
  );

insert into public.activity_logs (lead_id, actor_id, activity_type, title, description)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'call',
    'Connected call completed',
    'Discussed current outbound workflow and qualification criteria.'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'callback',
    'Callback scheduled',
    'Follow-up meeting scheduled for later today.'
  );

insert into public.employee_attendance_days (
  employee_id,
  activity_date,
  timezone,
  status,
  checked_in_at,
  checked_out_at,
  break_started_at,
  break_type,
  active_session_seconds,
  active_break_seconds,
  has_checked_in,
  break_usage_counts,
  break_durations_seconds,
  last_updated_at
)
values
  (
    '33333333-3333-3333-3333-333333333333',
    date '2026-05-20',
    'Asia/Kolkata',
    'checked_out',
    timestamptz '2026-05-20 09:05:00+05:30',
    timestamptz '2026-05-20 17:46:00+05:30',
    null,
    null,
    31260,
    0,
    true,
    '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
    '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
    timestamptz '2026-05-20 17:46:00+05:30'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    date '2026-05-21',
    'Asia/Kolkata',
    'on_break',
    timestamptz '2026-05-21 09:12:00+05:30',
    null,
    timestamptz '2026-05-21 12:15:00+05:30',
    'lunch',
    11700,
    900,
    true,
    '{"freshen_up":0,"lunch":1,"tea":0,"meeting_training":0}'::jsonb,
    '{"freshen_up":0,"lunch":900,"tea":0,"meeting_training":0}'::jsonb,
    timestamptz '2026-05-21 12:15:00+05:30'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    date '2026-05-22',
    'Asia/Kolkata',
    'checked_out',
    timestamptz '2026-05-22 19:27:00+05:30',
    timestamptz '2026-05-22 23:34:00+05:30',
    null,
    null,
    14820,
    0,
    true,
    '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
    '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
    timestamptz '2026-05-22 23:34:00+05:30'
  );
