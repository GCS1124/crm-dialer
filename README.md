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
- Settings page with backend-managed Twilio and Supabase configuration
- Node.js API for auth, leads, dialer, callbacks, reports, users, and workspace bootstrap
- Supabase/Postgres schema and seed SQL

## Authentication

- `POST /api/auth/signup` creates a new agent account in Supabase Auth and `app_users`
- `POST /api/auth/login` signs users in through Supabase Auth and returns a Supabase access token for the app session
- Admins can create additional users from the user management page
- If you seed local users, control the initial password with `AUTH_SEED_PASSWORD`
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

## Frontend env vars

Defined in [client/.env.example](/C:/Users/Anushi%20Mittal/Downloads/crm%20dialer/client/.env.example).

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Backend env vars

Defined in [server/.env.example](/C:/Users/Anushi%20Mittal/Downloads/crm%20dialer/server/.env.example).

- `PORT`
- `DATA_MODE`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_APP_SID`
- `TWILIO_OUTBOUND_CALLER_ID`
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
- `GET /api/dialer/token`
- `POST /api/dialer/disposition`
- `POST /api/dialer/voice/outbound`
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

1. [supabase/schema.sql](/C:/Users/Anushi%20Mittal/Downloads/crm%20dialer/supabase/schema.sql)
2. [supabase/seed.sql](/C:/Users/Anushi%20Mittal/Downloads/crm%20dialer/supabase/seed.sql)

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

## Twilio integration notes

The dialer now supports a browser-calling path using Twilio Voice SDK when the backend has valid Twilio credentials.

1. Point your TwiML App voice webhook to `POST /api/dialer/voice/outbound`
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_APP_SID`, and `TWILIO_OUTBOUND_CALLER_ID`
3. The client will request a voice token from `GET /api/dialer/token` and register a browser device automatically when the agent starts a call

If Twilio is not configured yet, the dialer falls back to manual call logging so agents can still work the queue and capture dispositions.

## Current implementation notes

- Signup and sign-in are handled through Supabase Auth, with the Node API enforcing CRM roles from `app_users`.
- Lead, call, callback, report, and user flows are loaded from backend APIs backed by Supabase tables.
- The frontend also uses a Supabase client for realtime subscriptions so call and follow-up updates appear without a manual refresh.
- CSV and Excel imports both feed the backend and can be used to build bulk calling queues quickly.
- Twilio token generation and outbound TwiML routing are wired on the backend, with manual call logging available as a fallback.
