# Preview Dialer SaaS App

Modern CRM-style preview dialer for remote sales teams, appointment setters, and outbound call center agents. The project is set up as a workspace monorepo with a React/Vite frontend, a Node/Express backend, and Supabase schema files plus seed data.

## What is included

- Fast React + TypeScript + Tailwind frontend
- Role-aware signup and login flow for `Admin`, `Team Leader`, and `Agent`
- Agent dashboard with productivity metrics
- Preview dialer screen with lead context, queue navigation, call controls, and required wrap-up flow
- Callback and follow-up workspace
- Lead upload and assignment page with CSV and Excel parsing plus duplicate handling
- Reports dashboard with charts and agent leaderboard
- Admin user management page
- Settings page with backend-managed CRM softphone and Supabase configuration
- Node.js API for auth, leads, dialer, callbacks, reports, users, and workspace bootstrap
- Supabase/Postgres schema and seed SQL

## Authentication

- `POST /api/auth/signup` creates a new agent account in Supabase Auth and `app_users`
- `POST /api/auth/login` signs users in through Supabase Auth and returns a Supabase access token for the app session
- Admins can create additional users from the user management page
- If you seed auth users, new Supabase Auth accounts use `AUTH_SEED_PASSWORD` as the initial password
- Existing Supabase Auth users keep their current password during `npm run seed:auth`; use `npm run seed:auth:reset-passwords --workspace server` only when you explicitly want to rotate them back to `AUTH_SEED_PASSWORD`
- If the configured Supabase host is unavailable and `DATA_MODE=auto`, the backend falls back to a local development data store and issues local JWT sessions so the workspace still runs

## Folder structure

```text
.
|-- client
|   |-- src
|   |   |-- components
|   |   |-- hooks
|   |   |-- lib
|   |   |-- pages
|   |   `-- types
|   |-- .env.example
|   `-- package.json
|-- server
|   |-- src
|   |   |-- config
|   |   |-- controllers
|   |   |-- middleware
|   |   |-- routes
|   |   |-- services
|   |   |-- types
|   |   `-- utils
|   |-- .env.example
|   `-- package.json
|-- samples
|   `-- bulk-call-leads.csv
|-- supabase
|   |-- schema.sql
|   `-- seed.sql
`-- package.json
```

## Setup

1. Install dependencies from the repo root.

```powershell
npm.cmd install
```

2. Copy env examples if you want local configuration.

```powershell
Copy-Item client\.env.example client\.env
Copy-Item server\.env.example server\.env
```

3. Start both workspaces.

```powershell
npm.cmd run dev
```

4. Or build everything.

```powershell
npm.cmd run build
```

## Vercel deployment

This repo is wired for a single Vercel project:

- the frontend is built from `client/` into `client/dist`
- the Node API runs as one Vercel Function from [api/[[...route]].ts](/C:/Users/Anushi%20Mittal/Downloads/GCS%20PROJECTS/crm%20dialer/api/[[...route]].ts)
- frontend routes are rewritten back to `index.html`
- production API calls default to the same deployed origin at `/api`

Recommended project setup on Vercel:

1. Use the repo root as the project root directory.
2. Let [vercel.json](/C:/Users/Anushi%20Mittal/Downloads/GCS%20PROJECTS/crm%20dialer/vercel.json) control the build command and output directory.
3. Leave `VITE_API_BASE_URL` empty unless the frontend should call a different API host.
4. Set `DATA_MODE=supabase` so production never falls back to the local JSON store.

Required Vercel environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `DATA_MODE=supabase`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional if inbuilt CRM softphone calling is enabled:

- `VOICE_PROVIDER=embedded-sip`
- `SIP_WEBSOCKET_URL`
- `SIP_DOMAIN`
- `SIP_USERNAME`
- `SIP_PASSWORD`
- `SIP_OUTBOUND_CALLER_ID`
- `SIP_DIAL_PREFIX`

## Frontend env vars

Defined in [client/.env.example](/C:/Users/Anushi%20Mittal/Downloads/GCS%20PROJECTS/crm%20dialer/client/.env.example).

- `VITE_API_BASE_URL` optional, leave blank on Vercel for same-origin `/api`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Backend env vars

Defined in [server/.env.example](/C:/Users/Anushi%20Mittal/Downloads/GCS%20PROJECTS/crm%20dialer/server/.env.example).

- `PORT`
- `DATA_MODE`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VOICE_PROVIDER`
- `SIP_WEBSOCKET_URL`
- `SIP_DOMAIN`
- `SIP_USERNAME`
- `SIP_PASSWORD`
- `SIP_OUTBOUND_CALLER_ID`
- `SIP_DIAL_PREFIX`
- `AUTH_SEED_PASSWORD`

## Key routes

### Frontend

- `/login`
- `/signup`
- `/dashboard`
- `/calls`
- `/dialer`
- `/callbacks`
- `/leads`
- `/reports`
- `/users`
- `/settings`

### Backend

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/workspace`
- `GET /api/calls`
- `POST /api/calls`
- `PATCH /api/calls/:callId`
- `DELETE /api/calls/:callId`
- `GET /api/leads`
- `POST /api/leads/upload`
- `POST /api/leads/bulk-delete`
- `PATCH /api/leads/:leadId/assign`
- `PATCH /api/leads/:leadId/invalid`
- `POST /api/leads/bulk-status`
- `GET /api/dialer/session`
- `GET /api/dialer/token`
- `POST /api/dialer/disposition`
- `GET /api/callbacks`
- `PATCH /api/callbacks/:leadId/reschedule`
- `PATCH /api/callbacks/:leadId/complete`
- `PATCH /api/callbacks/:leadId/reopen`
- `GET /api/reports/overview`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:userId/status`

## Supabase

Run the SQL files in order:

1. [supabase/schema.sql](/C:/Users/Anushi%20Mittal/Downloads/GCS%20PROJECTS/crm%20dialer/supabase/schema.sql)
2. [supabase/seed.sql](/C:/Users/Anushi%20Mittal/Downloads/GCS%20PROJECTS/crm%20dialer/supabase/seed.sql)

Main tables:

- `app_users`
- `leads`
- `lead_tags`
- `lead_notes`
- `call_logs`
- `callbacks`
- `activity_logs`
- `appointments`
- `audit_logs`

Realtime:

- The frontend initializes a Supabase browser client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- UI refreshes automatically from Supabase realtime subscriptions on call and follow-up changes

## Local development fallback

- `DATA_MODE=auto` tries Supabase first and automatically falls back to a local JSON-backed workspace if the configured Supabase host cannot be reached
- `DATA_MODE=local` forces local mode even if Supabase is configured
- In local mode, signup still works and creates local workspace users
- Seeded local users are available at `admin@previewdialer.local`, `lead@previewdialer.local`, and `agent@previewdialer.local`
- The seeded local password is whatever you set in `AUTH_SEED_PASSWORD`

## CRM softphone notes

The dialer now exposes browser calling as an inbuilt CRM softphone using SIP/WebRTC.

How it works:
- the CRM owns the softphone UI and browser calling lifecycle
- the browser client uses SIP.js under the hood
- any SIP/WebRTC-compatible backend can supply the actual credentials and routing

To enable browser calling:

1. Set `SIP_WEBSOCKET_URL`, `SIP_DOMAIN`, `SIP_USERNAME`, `SIP_PASSWORD`, and `SIP_OUTBOUND_CALLER_ID`.
2. If your SIP dial plan needs a prefix for outbound PSTN routing, set `SIP_DIAL_PREFIX`.
3. The client will request the browser session configuration from `GET /api/dialer/session` and register a SIP.js user agent automatically when the agent starts a call.

Backward compatibility:
- legacy `UNIFIED_VOICE_*` environment variables are still accepted by the backend as fallbacks
- that means existing Unified Voice Vercel envs do not need an immediate rename

If the SIP configuration is not ready yet, the dialer falls back to manual call logging so agents can still work the queue and capture dispositions.

## Current implementation notes

- Signup and sign-in are handled through Supabase Auth, with the Node API enforcing CRM roles from `app_users`.
- Lead, call, callback, report, and user flows are loaded from backend APIs backed by Supabase tables.
- The frontend also uses a Supabase client for realtime subscriptions so call and follow-up updates appear without a manual refresh.
- CSV and Excel imports both feed the backend and can be used to build bulk calling queues quickly.
- Embedded SIP/WebRTC session configuration is wired on the backend, with manual call logging available as a fallback.
- On Vercel, the frontend defaults to same-origin `/api` calls and production defaults to `DATA_MODE=supabase` when `VERCEL` is present.
