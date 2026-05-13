# Preview Dialer SaaS App

Supabase-first CRM dialer built with React, Vite, TypeScript, and Tailwind. The app is now designed to run without a custom Node server: the frontend talks directly to Supabase, and Supabase Edge Functions handle privileged voice/workspace operations.

## Stack

- React + Vite frontend in `client/`
- Supabase Auth, Postgres, Realtime, and Edge Functions
- Vercel for static frontend hosting only

## What’s included

- Role-aware signup and login
- Agent dashboard with productivity metrics
- Preview dialer with queue navigation and call wrap-up
- Manual dialer with RingCentral RingOut
- Callbacks, lead management, reports, and user management
- RingCentral caller-ID selection and RingOut flow

## Repo layout

```text
.
|-- client
|-- supabase
|   |-- schema.sql
|   |-- seed.sql
|   `-- functions
`-- package.json
```

## Setup

1. Install dependencies.

```powershell
npm.cmd install
```

2. Configure the frontend env in `client/.env`.

```powershell
Copy-Item client\.env.example client\.env
```

3. Run the frontend locally.

```powershell
npm.cmd run dev:client
```

4. Build for production.

```powershell
npm.cmd run build
```

## Supabase

The Supabase CLI uses a personal access token for Management API actions. Generate one in the Supabase dashboard, then log in with:

```powershell
npx supabase@latest login --token <SUPABASE_ACCESS_TOKEN>
```

If you prefer CI-style auth, set `SUPABASE_ACCESS_TOKEN` in the shell environment instead.

Link the project, apply the schema and seed data, then deploy the Edge Functions:

```powershell
npx supabase@latest link --project-ref uhnbpmzlsuzaxnkbiupc
npx supabase@latest db push --linked
npx supabase@latest functions deploy workspace-users ringcentral --project-ref uhnbpmzlsuzaxnkbiupc
```

Functions in this repo:

- `workspace-users` creates and deletes managed workspace users
- `ringcentral` handles RingCentral auth, caller IDs, and RingOut placement

Required Supabase secrets for the RingCentral function:

- `RINGCENTRAL_CLIENT_ID`
- `RINGCENTRAL_CLIENT_SECRET`
- `RINGCENTRAL_SERVER_URL` if you use a non-default RingCentral environment

The Edge Functions also use Supabase's built-in API key secrets. The shared function helper supports both current hosted defaults (`SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`) and legacy/local names (`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`).

If you are using the provided RingCentral app registration, keep the redirect URI registered in RingCentral aligned with the CRM origin, for example `https://crm-dialer-client.vercel.app`.

## Vercel deployment

- Set the Vercel project root to the repo root
- Build command: `npm run vercel-build`
- Output directory: `client/dist`
- Required frontend env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
- RingCentral RingOut is handled through Supabase Edge Functions

## Notes

- There is no local JSON fallback and no separate Node runtime anymore.
- All CRM data access goes through Supabase.
- RingCentral now places RingOut calls and stores the selected caller ID per workspace user.
