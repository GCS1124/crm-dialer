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
- Manual dialer with SIP-backed browser calling
- Callbacks, lead management, reports, and user management
- Supabase-backed SIP profile management

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
npx supabase@latest functions deploy voice-session workspace-users --project-ref uhnbpmzlsuzaxnkbiupc
```

Functions in this repo:

- `voice-session` returns the active SIP session for the signed-in workspace user
- `workspace-users` creates and deletes managed workspace users

## Vercel deployment

- Set the Vercel project root to the repo root
- Build command: `npm run vercel-build`
- Output directory: `client/dist`
- Required frontend env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
- Voice/SIP secrets belong in Supabase function secrets, not in the browser

## Notes

- There is no local JSON fallback and no separate Node runtime anymore.
- All CRM data access goes through Supabase.
- Unified Voice/SIP integration is now handled through Supabase Edge Functions.
