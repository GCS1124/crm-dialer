# SIP Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase-backed SIP profile management with first-login profile selection and active-profile-based softphone sessions.

**Architecture:** Store SIP profiles and active selections in Supabase, expose them through the existing backend repository/controller pattern, then hydrate them into app state so the client can force selection on first login and build softphone sessions from the selected profile.

**Tech Stack:** React, Vite, TypeScript, Express, Supabase, SIP.js

---

### Task 1: Add SIP profile schema and shared types

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\supabase\schema.sql`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\types\index.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\types\index.ts`

- [ ] Add `sip_profiles` and `user_sip_preferences` schema.
- [ ] Add server/client SIP profile types and workspace shape.
- [ ] Keep naming aligned across backend and frontend.

### Task 2: Add repository support for SIP profiles

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\repository.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\appRepository.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\localRepository.ts`

- [ ] Add repository APIs for listing, creating, and selecting SIP profiles.
- [ ] Add workspace payload mapping for active profile and selection state.
- [ ] Add default shared-profile provisioning support.

### Task 3: Resolve dialer sessions from selected SIP profiles

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\voiceProviderService.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\controllers\dialerController.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\config\env.ts`

- [ ] Update voice session generation to use the selected profile.
- [ ] Preserve env fallback for bootstrap/default provisioning.
- [ ] Return enough profile detail for settings and softphone readiness.

### Task 4: Add SIP profile REST APIs

**Files:**
- Create: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\controllers\sipProfilesController.ts`
- Create: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\routes\sipProfiles.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\app.ts`

- [ ] Add list/create/select endpoints.
- [ ] Reuse current auth model and role-aware backend access.
- [ ] Keep payloads minimal and consistent with existing API style.

### Task 5: Add frontend state for SIP profiles

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\hooks\useAppState.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\types\index.ts`

- [ ] Hydrate SIP profiles and selection state from workspace.
- [ ] Add actions to create/select profiles.
- [ ] Update softphone session handling to rely on selected profile data.

### Task 6: Add first-login SIP profile selector

**Files:**
- Create: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\components\softphone\SipProfileSelectorDialog.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\components\layout\AppShell.tsx`

- [ ] Add a blocking selector dialog when a user has no active SIP profile.
- [ ] Allow choosing existing profiles or creating a new one.
- [ ] Prevent dialer use until a profile is selected.

### Task 7: Add settings management UI for SIP profiles

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\pages\SettingsPage.tsx`

- [ ] Show active SIP profile details.
- [ ] Show saved shared/personal profiles.
- [ ] Add create/select controls from settings.

### Task 8: Provision the default shared SIP profile and verify

**Files:**
- Modify if needed: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\.env`
- Verify: live Supabase project data

- [ ] Ensure the supplied Unified Voice credentials exist as the initial shared profile.
- [ ] Build client and server.
- [ ] Verify workspace, SIP APIs, and dialer session behavior.
