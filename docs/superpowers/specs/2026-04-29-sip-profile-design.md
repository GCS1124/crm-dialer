# SIP Profile Selection Design

## Goal

Add a real SIP profile system to the CRM so the inbuilt browser softphone no longer depends on one backend `.env` credential set. Profiles must be stored in Supabase, selectable per user, usable on first login, manageable from the frontend, and visible in settings.

## Scope

- Store SIP profiles in Supabase.
- Support shared profiles and user-owned profiles.
- Track the active SIP profile per user.
- If a user has no active SIP profile, show a required selector after login.
- Allow creating a new SIP profile from the frontend.
- Show configured SIP details in settings.
- Build dialer sessions from the selected profile instead of only from env vars.
- Keep backend env fallback support for emergency/default provisioning.

## Data Model

### `public.sip_profiles`

- `id uuid primary key`
- `label text not null`
- `provider_url text not null`
- `sip_domain text not null`
- `sip_username text not null`
- `sip_password text not null`
- `caller_id text not null`
- `owner_user_id uuid null references public.app_users(id) on delete cascade`
- `is_shared boolean not null default false`
- `is_active boolean not null default true`
- `created_by uuid null references public.app_users(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Rules:
- `owner_user_id is null` with `is_shared = true` means shared profile.
- `owner_user_id = user.id` with `is_shared = false` means personal profile.

### `public.user_sip_preferences`

- `user_id uuid primary key references public.app_users(id) on delete cascade`
- `active_sip_profile_id uuid null references public.sip_profiles(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## Backend Design

- Extend repository types with SIP profile entities and workspace settings state.
- Add repository functions to:
  - list available SIP profiles for a user
  - create a SIP profile
  - set active SIP profile
  - fetch active SIP profile
  - ensure a default shared SIP profile exists when configured
- Update dialer session generation to resolve credentials from the user’s active SIP profile first, then fallback to env-only behavior if needed.
- Expose REST endpoints:
  - `GET /api/sip-profiles`
  - `POST /api/sip-profiles`
  - `PATCH /api/sip-profiles/active`
- Include SIP profile data and selection state in `/api/workspace`.

## Frontend Design

- Add SIP profile types to the client model.
- Extend app state with:
  - available SIP profiles
  - active SIP profile
  - `sipProfileSelectionRequired`
  - actions for creating/selecting profiles
- Show a blocking modal after login when no active SIP profile is set.
- The modal must let the user:
  - choose an existing shared/personal profile
  - create a new one directly
- Settings page must show:
  - active SIP profile details
  - saved profiles visible to the user
  - new profile form
  - action to switch active profile

## First-Login Behavior

1. User signs in.
2. Workspace loads.
3. If `sipProfileSelectionRequired = true`, the app shows the selector modal before normal dialer use.
4. User either selects a profile or creates one.
5. App persists the selection and reloads workspace state.

## Default Profile Provisioning

- The provided Unified Voice credentials will be treated as the initial shared default profile.
- The implementation should support provisioning that profile into Supabase once, without requiring the frontend to hardcode secrets.
- Runtime should remain stable if the profile already exists.

## Security Model

- Per user request, SIP passwords will be stored as plain text in a private table.
- The frontend will receive the password only for the currently selected active SIP profile when building a live browser session.
- Admins may see and manage shared profiles.
- Non-admin users may only see shared profiles plus their own personal profiles.

## Verification

- Build client and server successfully.
- Verify workspace payload includes SIP profile selection state.
- Verify profile create/select APIs work.
- Verify dialer session payload resolves selected SIP credentials.
- Verify first-login modal appears when no active profile exists.
