# Global Navbar, Alerts, and Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact global navbar across authenticated CRM pages with manual time tracking controls, a left-to-right pill layout, and an Alerts popover that shows incoming call history only.

**Architecture:** Build the domain logic as pure helpers first so the time-tracking rules and incoming-alert derivation are testable without React. Then wire those helpers into `useAppState` for user-scoped persistence, and replace the current page-title top bar with a shared navbar rendered from `AppShell` on every authenticated route. Keep the alert list derived from loaded workspace data and keep all time-tracking state client-side for this first pass.

**Tech Stack:** React, TypeScript, Vite, node:test with `--experimental-strip-types`, localStorage, lucide-react, existing shared UI components.

---

### Task 1: Add time-tracking domain helpers and tests

**Files:**
- Modify: `client/src/types/index.ts`
- Create: `client/src/lib/timeTracking.ts`
- Create: `client/src/lib/timeTracking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  checkIn,
  checkOut,
  endBreak,
  getDisplayedSeconds,
  startBreak,
  createInitialTimeTrackingState,
} from "./timeTracking";

test("check in, break, and check out preserve only active work time", () => {
  const started = checkIn(createInitialTimeTrackingState(), "2026-05-21T09:00:00.000Z");
  const onBreak = startBreak(started, "lunch", "2026-05-21T09:15:00.000Z");
  const resumed = endBreak(onBreak, "2026-05-21T09:30:00.000Z");
  const stopped = checkOut(resumed, "2026-05-21T09:45:00.000Z");

  assert.equal(stopped.status, "checked_out");
  assert.equal(getDisplayedSeconds(stopped, "2026-05-21T09:45:00.000Z"), 2700);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/timeTracking.test.ts`

Expected: fail with missing export or missing module errors until `timeTracking.ts` exists.

- [ ] **Step 3: Write the minimal implementation**

```ts
export type BreakType = "freshen_up" | "lunch" | "tea" | "meeting_training";
export type TimeTrackingStatus = "checked_out" | "checked_in" | "on_break";

export interface TimeTrackingState {
  status: TimeTrackingStatus;
  checkedInAt: string | null;
  breakStartedAt: string | null;
  breakType: BreakType | null;
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  lastUpdatedAt: string | null;
}

export function createInitialTimeTrackingState(nowIso = new Date().toISOString()): TimeTrackingState {
  return {
    status: "checked_out",
    checkedInAt: null,
    breakStartedAt: null,
    breakType: null,
    activeSessionSeconds: 0,
    activeBreakSeconds: 0,
    lastUpdatedAt: nowIso,
  };
}
```

Add the transition helpers in the same file:

```ts
export function checkIn(state: TimeTrackingState, nowIso = new Date().toISOString()): TimeTrackingState;
export function startBreak(state: TimeTrackingState, breakType: BreakType, nowIso = new Date().toISOString()): TimeTrackingState;
export function endBreak(state: TimeTrackingState, nowIso = new Date().toISOString()): TimeTrackingState;
export function checkOut(state: TimeTrackingState, nowIso = new Date().toISOString()): TimeTrackingState;
export function getDisplayedSeconds(state: TimeTrackingState, nowIso = new Date().toISOString()): number;
```

Persisting state belongs in `useAppState`, not in the helper file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/timeTracking.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/types/index.ts client/src/lib/timeTracking.ts client/src/lib/timeTracking.test.ts
git commit -m "feat: add manual time tracking helpers"
```

### Task 2: Add incoming-alert derivation and tests

**Files:**
- Create: `client/src/lib/incomingAlerts.ts`
- Create: `client/src/lib/incomingAlerts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildIncomingAlerts, countUnreadIncomingAlerts } from "./incomingAlerts";

test("returns only incoming calls sorted newest first", () => {
  const alerts = buildIncomingAlerts([
    {
      id: "lead-1",
      fullName: "Asha Rao",
      phone: "+1 (555) 111-2222",
      altPhone: "",
      email: "asha@example.com",
      company: "Asha Co",
      jobTitle: "",
      location: "Delhi",
      source: "",
      interest: "",
      status: "new",
      notes: "",
      lastContacted: null,
      assignedAgentId: "",
      assignedAgentName: "",
      callbackTime: null,
      priority: "Medium",
      createdAt: "2026-05-21T08:00:00.000Z",
      updatedAt: "2026-05-21T08:00:00.000Z",
      tags: [],
      callHistory: [
        { id: "c-1", leadId: "lead-1", leadName: "Asha Rao", phone: "+1", createdAt: "2026-05-21T08:10:00.000Z", agentId: "u1", agentName: "Agent", callType: "incoming", durationSeconds: 10, disposition: "Interested", status: "connected", notes: "", recordingEnabled: false, outcomeSummary: "", aiSummary: "", sentiment: "neutral", suggestedNextAction: "", followUpAt: null },
        { id: "c-2", leadId: "lead-1", leadName: "Asha Rao", phone: "+1", createdAt: "2026-05-21T08:00:00.000Z", agentId: "u1", agentName: "Agent", callType: "incoming", durationSeconds: 10, disposition: "Interested", status: "connected", notes: "", recordingEnabled: false, outcomeSummary: "", aiSummary: "", sentiment: "neutral", suggestedNextAction: "", followUpAt: null },
        { id: "c-3", leadId: "lead-1", leadName: "Asha Rao", phone: "+1", createdAt: "2026-05-21T07:50:00.000Z", agentId: "u1", agentName: "Agent", callType: "outgoing", durationSeconds: 10, disposition: "Interested", status: "connected", notes: "", recordingEnabled: false, outcomeSummary: "", aiSummary: "", sentiment: "neutral", suggestedNextAction: "", followUpAt: null }
      ],
      notesHistory: [],
      activities: [],
      leadScore: 80,
      timezone: "UTC",
    },
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.callId, "c-1");
  assert.equal(alerts[0]?.createdAt, "2026-05-21T08:10:00.000Z");
});

test("counts only unseen incoming alerts", () => {
  const alerts = buildIncomingAlerts([
    {
      id: "lead-1",
      fullName: "Asha Rao",
      phone: "+1 (555) 111-2222",
      altPhone: "",
      email: "asha@example.com",
      company: "Asha Co",
      jobTitle: "",
      location: "Delhi",
      source: "",
      interest: "",
      status: "new",
      notes: "",
      lastContacted: null,
      assignedAgentId: "",
      assignedAgentName: "",
      callbackTime: null,
      priority: "Medium",
      createdAt: "2026-05-21T08:00:00.000Z",
      updatedAt: "2026-05-21T08:00:00.000Z",
      tags: [],
      callHistory: [
        { id: "c-1", leadId: "lead-1", leadName: "Asha Rao", phone: "+1", createdAt: "2026-05-21T08:10:00.000Z", agentId: "u1", agentName: "Agent", callType: "incoming", durationSeconds: 10, disposition: "Interested", status: "connected", notes: "", recordingEnabled: false, outcomeSummary: "", aiSummary: "", sentiment: "neutral", suggestedNextAction: "", followUpAt: null },
        { id: "c-2", leadId: "lead-1", leadName: "Asha Rao", phone: "+1", createdAt: "2026-05-21T08:00:00.000Z", agentId: "u1", agentName: "Agent", callType: "incoming", durationSeconds: 10, disposition: "Interested", status: "connected", notes: "", recordingEnabled: false, outcomeSummary: "", aiSummary: "", sentiment: "neutral", suggestedNextAction: "", followUpAt: null },
      ],
      notesHistory: [],
      activities: [],
      leadScore: 80,
      timezone: "UTC",
    },
  ]);

  assert.equal(countUnreadIncomingAlerts(alerts, new Set([alerts[0]?.id ?? ""])), 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/incomingAlerts.test.ts`

Expected: fail until `incomingAlerts.ts` exists.

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { Lead } from "../types";

export interface IncomingAlertItem {
  id: string;
  callId: string;
  leadId: string;
  leadName: string;
  phone: string;
  createdAt: string;
  status: "connected" | "missed" | "follow_up" | "failed";
  disposition:
    | "No Answer"
    | "Busy"
    | "Voicemail"
    | "Wrong Number"
    | "Not Interested"
    | "Interested"
    | "Call Back Later"
    | "Follow-Up Required"
    | "Appointment Booked"
    | "Sale Closed"
    | "Failed Attempt"
    | null;
}

export function buildIncomingAlerts(leads: Lead[]): IncomingAlertItem[] {
  return leads.flatMap((lead) =>
    lead.callHistory
      .filter((call) => call.callType === "incoming")
      .map((call) => ({
        id: `${lead.id}:${call.id}`,
        callId: call.id,
        leadId: lead.id,
        leadName: lead.fullName,
        phone: call.phone || lead.phone,
        createdAt: call.createdAt,
        status: call.status,
        disposition: call.disposition,
      })),
  ).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}
```

Add the local seen-state helpers in the same file:

```ts
export function loadSeenIncomingAlertIds(userId: string): Set<string>;
export function saveSeenIncomingAlertIds(userId: string, ids: Set<string>): void;
export function countUnreadIncomingAlerts(items: IncomingAlertItem[], seenIds: Set<string>): number;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/incomingAlerts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/incomingAlerts.ts client/src/lib/incomingAlerts.test.ts
git commit -m "feat: derive incoming alerts from call history"
```

### Task 3: Wire the global navbar into the app shell

**Files:**
- Create: `client/src/components/layout/GlobalNavbar.tsx`
- Create: `client/src/components/layout/AlertsPopover.tsx`
- Create: `client/src/components/layout/BreakMenu.tsx`
- Modify: `client/src/components/layout/AppShell.tsx`
- Modify: `client/src/components/layout/TopBar.tsx`
- Modify: `client/src/hooks/useAppState.tsx`

- [ ] **Step 1: Add the new app-state surface**

Extend the app context with these fields and actions:

```ts
timeTracking: TimeTrackingState;
checkIn: () => void;
checkOut: () => void;
startBreak: (breakType: BreakType) => void;
endBreak: () => void;
incomingAlerts: IncomingAlertItem[];
unseenIncomingAlertCount: number;
markIncomingAlertsSeen: () => void;
```

Persist the user-scoped state with keys like:

```ts
const timeTrackingKey = `preview-dialer-time-tracking:${currentUser.id}`;
const seenAlertsKey = `preview-dialer-incoming-alerts-seen:${currentUser.id}`;
```

The provider should load those values when `currentUser` changes, save them whenever they change, and reset to safe defaults when localStorage is empty or corrupt.

- [ ] **Step 2: Build the navbar surface**

`GlobalNavbar.tsx` should own the three-cluster layout:

```tsx
<div className="flex items-center justify-between gap-3 rounded-[20px] border bg-white px-4 py-3">
  <div>{/* date/time chip + workspace status chip */}</div>
  <div>{/* check in/out button + active timer chip + break menu */}</div>
  <div>{/* alerts button + sign out */}</div>
</div>
```

`BreakMenu.tsx` should expose the manual break list and call `startBreak` / `endBreak` from the app state.

`AlertsPopover.tsx` should render a scrollable list of `incomingAlerts` with a minimal empty state and call `markIncomingAlertsSeen()` when opened.

- [ ] **Step 3: Replace the old page-title header**

Update `AppShell.tsx` so the global navbar renders on every authenticated route, including the dialer pages.

```tsx
return (
  <div className="min-h-screen px-3 py-3 lg:px-5 lg:py-5">
    <div className="crm-shell mx-auto flex min-h-[calc(100vh-24px)] max-w-[1560px] overflow-hidden rounded-[24px]">
      <div className="hidden w-[92px] shrink-0 lg:block">
        <Sidebar />
      </div>
      <main className="min-w-0 flex-1 bg-[#f4f8fc] dark:bg-slate-950">
        <GlobalNavbar />
        <div className="p-4 lg:p-6">
          {workspaceError ? <AlertBanner ... /> : null}
          <Outlet />
        </div>
      </main>
    </div>
  </div>
);
```

The old `isDialerView` conditional should be removed so the navbar does not disappear on `/dialer` and `/manual-dialer`.

- [ ] **Step 4: Remove the obsolete top bar**

Once `AppShell.tsx` points to the new navbar, delete the old `TopBar.tsx` page-title implementation or replace it with a thin compatibility export that simply forwards to `GlobalNavbar`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout/GlobalNavbar.tsx client/src/components/layout/AlertsPopover.tsx client/src/components/layout/BreakMenu.tsx client/src/components/layout/AppShell.tsx client/src/components/layout/TopBar.tsx client/src/hooks/useAppState.tsx
git commit -m "feat: add global navbar and manual time tracking"
```

### Task 4: Verify the UI shell and clean up the implementation

**Files:**
- Modify: `client/src/components/layout/TopBar.tsx` if a compatibility shim is kept
- Modify: `client/src/components/layout/AppShell.tsx` if any final layout tuning is needed

- [ ] **Step 1: Run the helper tests together**

Run: `node --experimental-strip-types --test src/lib/timeTracking.test.ts src/lib/incomingAlerts.test.ts`

Expected: PASS.

- [ ] **Step 2: Build the client**

Run: `npm.cmd run build`

Expected: TypeScript passes and Vite produces a production build without errors.

- [ ] **Step 3: Open the app in the browser and verify the shell**

Run: `npm.cmd run dev`

Then open the local app in the Browser plugin and confirm:

- the navbar appears on authenticated pages
- the left chip shows date/time and workspace status
- the center controls show manual check in / check out plus the break menu
- the Alerts button shows only incoming call history
- outbound calls do not appear in Alerts
- sign out still works

- [ ] **Step 4: Final cleanup commit**

```bash
git add client/src/components/layout/AppShell.tsx client/src/components/layout/TopBar.tsx client/src/components/layout/GlobalNavbar.tsx client/src/components/layout/AlertsPopover.tsx client/src/components/layout/BreakMenu.tsx client/src/hooks/useAppState.tsx client/src/lib/timeTracking.ts client/src/lib/incomingAlerts.ts client/src/lib/timeTracking.test.ts client/src/lib/incomingAlerts.test.ts client/src/types/index.ts
git commit -m "feat: ship global navbar alerts and time tracking"
```
