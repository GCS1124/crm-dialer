# Employee Activity Calendar Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the employee calendar into a two-pane attendance-and-call activity view that matches the requested screenshot style and uses persisted per-employee daily attendance records.

**Architecture:** Store one attendance snapshot per employee per day in Supabase, updated whenever the live time-tracking state changes. The calendar API will merge that attendance row with the existing call log aggregation so the grid can show call outcome badges while the right pane shows check-in, check-out, working hours, break usage, and status. The React calendar will keep the current employee search and month navigation, but the main layout will shift to a month grid on the left and a sticky detail panel on the right, with a mobile fallback drawer.

**Tech Stack:** TypeScript, React, Tailwind, Supabase Postgres, existing app state/services, Vite.

---

### Task 1: Add persisted employee attendance rows in Supabase

**Files:**
- Create: `supabase/migrations/20260522000000_employee_attendance_days.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Define the attendance table, indexes, and policies**

```sql
begin;

create table if not exists public.employee_attendance_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.app_users(id) on delete cascade,
  activity_date date not null,
  timezone text not null default 'UTC',
  status text not null check (status in ('checked_out', 'checked_in', 'on_break')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  break_started_at timestamptz,
  break_type text,
  active_session_seconds integer not null default 0,
  active_break_seconds integer not null default 0,
  has_checked_in boolean not null default false,
  break_usage_counts jsonb not null default '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
  break_durations_seconds jsonb not null default '{"freshen_up":0,"lunch":0,"tea":0,"meeting_training":0}'::jsonb,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, activity_date)
);

create index if not exists employee_attendance_days_employee_date_idx
  on public.employee_attendance_days (employee_id, activity_date desc);

alter table public.employee_attendance_days enable row level security;
grant select, insert, update, delete on public.employee_attendance_days to authenticated;

drop policy if exists "Employees can view attendance" on public.employee_attendance_days;
create policy "Employees can view attendance"
on public.employee_attendance_days
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users viewer
    where viewer.auth_user_id = auth.uid()
      and (
        viewer.id = employee_id
        or viewer.role in ('admin', 'team_leader')
      )
  )
);

drop policy if exists "Employees can manage their own attendance" on public.employee_attendance_days;
create policy "Employees can manage their own attendance"
on public.employee_attendance_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
);

drop policy if exists "Employees can update their own attendance" on public.employee_attendance_days;
create policy "Employees can update their own attendance"
on public.employee_attendance_days
for update
to authenticated
using (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
)
with check (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
);

drop policy if exists "Employees can delete their own attendance" on public.employee_attendance_days;
create policy "Employees can delete their own attendance"
on public.employee_attendance_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.app_users owner
    where owner.auth_user_id = auth.uid()
      and owner.id = employee_id
  )
);

commit;
```

- [ ] **Step 2: Add representative seed rows so the screenshot-style UI has data in local dev**
- [ ] **Step 3: Verify the table exists and policies are active with a read query against `public.employee_attendance_days`**

### Task 2: Persist live time-tracking transitions into the new table

**Files:**
- Modify: `client/src/types/index.ts`
- Modify: `client/src/lib/timeTracking.ts`
- Modify: `client/src/services/workspace.ts`
- Modify: `client/src/hooks/useAppState.tsx`
- Test: `client/src/lib/timeTracking.test.ts`

- [ ] **Step 1: Add a serializable attendance snapshot shape alongside the existing `TimeTrackingState` helpers**

```ts
export interface EmployeeAttendanceSnapshot {
  employeeId: string;
  activityDate: string;
  timezone: string;
  status: TimeTrackingStatus;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  breakStartedAt: string | null;
  breakType: BreakType | null;
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  hasCheckedIn: boolean;
  breakUsageCounts: Record<BreakType, number>;
  breakDurationsSeconds: Record<BreakType, number>;
  lastUpdatedAt: string;
}
```

- [ ] **Step 2: Add helper functions that turn the current in-memory time-tracking state into an upsert payload**
- [ ] **Step 3: Add workspace-service functions to upsert and query attendance snapshots for a user/month**
- [ ] **Step 4: Call the attendance upsert after check in, check out, break start, and break end so the server always has the latest snapshot**
- [ ] **Step 5: Expand the time-tracking tests to cover the snapshot conversion and the persisted break counters**

### Task 3: Merge attendance rows into the employee calendar data

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/lib/employeeActivityCalendar.ts`
- Modify: `client/src/lib/employeeActivityCalendar.test.ts`

- [ ] **Step 1: Fetch the employee's attendance rows for the requested month and merge them with the existing call-log summary**

```ts
interface EmployeeAttendanceDay {
  activityDate: string;
  timezone: string;
  status: "checked_out" | "checked_in" | "on_break";
  checkedInAt: string | null;
  checkedOutAt: string | null;
  breakStartedAt: string | null;
  breakType: BreakType | null;
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  hasCheckedIn: boolean;
  breakUsageCounts: Record<BreakType, number>;
  breakDurationsSeconds: Record<BreakType, number>;
  lastUpdatedAt: string;
}
```

- [ ] **Step 2: Derive screenshot-style day metadata from attendance state**
  - on time
  - late
  - on break
  - absent
  - weekend
  - upcoming
- [ ] **Step 3: Keep the call summary counts and detailed call records in the same response so the grid and detail panel stay in sync**
- [ ] **Step 4: Update the calendar helper tests to verify a month with both attendance data and call logs renders the expected day summaries**

### Task 4: Redesign the calendar UI to match the requested layout

**Files:**
- Modify: `client/src/components/dialer/EmployeeActivityCalendar.tsx`
- Modify: `client/src/components/dialer/CalendarDayCard.tsx`
- Modify: `client/src/components/dialer/ActivityDetailsModal.tsx`
- Modify: `client/src/components/dialer/StatusLegend.tsx`
- Modify: `client/src/pages/PreviewDialerPage.tsx`

- [ ] **Step 1: Rework the top control bar into month/year selectors, previous/next buttons, and filter chips**
- [ ] **Step 2: Render the month grid as large rounded cards with status colors, small outcome dots, and a selected-day border**
- [ ] **Step 3: Replace the modal-only interaction with a sticky right-side details panel on desktop**
  - check-in / check-out
  - working hours
  - breaks
  - status
  - call activity summary
  - detailed call records
- [ ] **Step 4: Keep the existing modal component as the mobile fallback drawer so the feature still works on small screens**
- [ ] **Step 5: Wire the employee picker to the admin and team leader user list, and keep the empty-state copy when no employee is selected**

### Task 5: Verify, clean up, and publish

**Files:**
- Modify: any files touched above

- [ ] **Step 1: Run the targeted tests for time tracking and the employee calendar helper**
- [ ] **Step 2: Run the workspace build and lint checks**
- [ ] **Step 3: Re-check the Supabase schema with a sample query to confirm the new attendance table is readable for the intended role**
- [ ] **Step 4: Commit the implementation once build, lint, and tests are green**
