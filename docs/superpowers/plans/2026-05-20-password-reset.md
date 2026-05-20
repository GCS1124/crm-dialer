# Password Reset Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password reset action in Settings and force first-time users created with a temporary password to change it before entering the workspace.

**Architecture:** Store a `must_reset_password` flag on `app_users`. Admin-created users start with the flag enabled, login reads that flag, and the app redirects flagged users to a dedicated reset page. The same password-update service powers both the forced reset page and the Settings panel, and clears the flag after success.

**Tech Stack:** React, Vite, TypeScript, Supabase Auth, Supabase Postgres, Tailwind CSS

---

### Task 1: Add the database flag and seed compatibility

**Files:**
- Create: `supabase/migrations/20260520000000_password_reset_required.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Add the failing schema expectation**

```sql
alter table public.app_users
  add column if not exists must_reset_password boolean not null default false;
```

- [ ] **Step 2: Run the SQL in Supabase**

Run: add the column in the project and verify `app_users.must_reset_password` exists.

- [ ] **Step 3: Update the seed rows**
Add `must_reset_password = false` to every seeded `public.app_users` row so local fixtures match the live schema.

- [ ] **Step 4: Commit the migration**

```bash
git add supabase/migrations/20260520000000_password_reset_required.sql supabase/schema.sql supabase/seed.sql
git commit -m "feat: add password reset flag"
```

### Task 2: Wire password update into auth and invite creation

**Files:**
- Modify: `client/src/services/auth.ts`
- Modify: `client/src/lib/api.ts`
- Modify: `supabase/functions/workspace-users/index.ts`
- Modify: `client/src/types/index.ts`

- [ ] **Step 1: Make the failing auth test scenario explicit**

```ts
// user should be able to update their password and clear the reset flag
```

- [ ] **Step 2: Add password update support**

```ts
await client.auth.updateUser({ password: newPassword });
await client.from("app_users").update({ must_reset_password: false }).eq("auth_user_id", authUser.id);
```

- [ ] **Step 3: Mark invite-created accounts as reset-required**

```ts
must_reset_password: true,
```

- [ ] **Step 4: Return the flag with loaded users**

```ts
mustResetPassword: row.must_reset_password,
```

- [ ] **Step 5: Commit the auth wiring**

```bash
git add client/src/services/auth.ts client/src/lib/api.ts supabase/functions/workspace-users/index.ts client/src/types/index.ts
git commit -m "feat: require password reset for invited users"
```

### Task 3: Add the reset UI and first-login gate

**Files:**
- Create: `client/src/pages/ResetPasswordPage.tsx`
- Create: `client/src/components/auth/PasswordResetPanel.tsx`
- Modify: `client/src/pages/SettingsPage.tsx`
- Modify: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/hooks/useAppState.tsx`

- [ ] **Step 1: Add the page shell and panel**

```tsx
<PasswordResetPanel mode="forced" />
```

- [ ] **Step 2: Gate the workspace**

```tsx
if (currentUser?.mustResetPassword) {
  return <Navigate to="/reset-password" replace />;
}
```

- [ ] **Step 3: Add the Settings action**

```tsx
<PasswordResetPanel mode="settings" />
```

- [ ] **Step 4: Clear the gate after password change**

```ts
await changePassword(newPassword);
await loadWorkspace(authToken, { silent: true });
```

- [ ] **Step 5: Commit the UI flow**

```bash
git add client/src/pages/ResetPasswordPage.tsx client/src/components/auth/PasswordResetPanel.tsx client/src/pages/SettingsPage.tsx client/src/pages/LoginPage.tsx client/src/App.tsx client/src/hooks/useAppState.tsx
git commit -m "feat: force first-login password reset"
```

### Task 4: Verify in browser and deploy

**Files:**
- Modify: Vercel deployment target

- [ ] **Step 1: Build and typecheck locally**

```bash
cd client && npm run build
```

- [ ] **Step 2: Open the app in the browser and test**

```text
Login with a temporary account -> redirected to password reset -> set new password -> enter dashboard -> settings reset form updates password again.
```

- [ ] **Step 3: Deploy and verify live**

```text
Deploy the branch, then recheck the login flow and the Settings reset action in Safari.
```
