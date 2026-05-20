# Global Navbar, Time Tracking, and Incoming Alerts Design

## Goal

Create a single global navbar for authenticated CRM pages that matches the compact, pill-based layout in the reference screenshot. The navbar must support manual check-in / check-out and break tracking, and the Alerts area must show incoming call history only.

The result should feel simple and operational:

- the left side shows date/time and workspace status
- the center area controls manual time tracking
- the right side exposes incoming-call alerts and sign out

## Scope

- Replace the current top header surface with one reusable global navbar.
- Render the navbar across all authenticated routes, including dialer pages.
- Keep the rest of the page content and sidebar structure intact.
- Add manual time tracking state for check in, check out, and breaks.
- Add an Alerts popover that lists incoming call history only.
- Keep the design compact, shallow, and pill-based rather than card-heavy.
- Persist time tracking and alerts acknowledgment locally so the experience survives refresh.

## Non-goals

- No automatic idle detection.
- No auto-breaks or inactivity timers.
- No outbound call notifications in Alerts.
- No backend schema changes in the first pass.
- No redesign of page content below the navbar.
- No new call-routing or dialing workflow changes.

## UX Layout

### Left cluster

- Live date and time chip using the user locale.
- Small workspace/status chip if space allows.
- Visual style should stay light, compact, and rounded.

### Center cluster

- Manual `Check in` / `Check out` primary control.
- Session timer chip that shows the current active work time.
- Break control as a compact dropdown or popover.
- Default break options should include:
  - Freshen up
  - Lunch
  - Tea
  - Meeting / Training

### Right cluster

- Alerts button with a badge count.
- Sign out control.
- Theme toggle can remain only if it fits cleanly without crowding the navbar.

### Alerts popover

- Opens from the Alerts button.
- Shows a compact list of incoming calls only.
- Uses a dense, scrollable list instead of large cards.
- Empty state should be minimal and explicit.

## Time Tracking Model

Time tracking is manual and client-managed for this phase. It should live in the app state layer and persist to `localStorage`.

Proposed state shape:

```ts
type TimeTrackingStatus = "checked_out" | "checked_in" | "on_break";
type BreakType = "freshen_up" | "lunch" | "tea" | "meeting_training";

interface TimeTrackingState {
  status: TimeTrackingStatus;
  checkedInAt: string | null;
  breakStartedAt: string | null;
  breakType: BreakType | null;
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  lastUpdatedAt: string | null;
}
```

Behavior:

- `Check in` starts a new active work session and sets the session timer running.
- `Check out` ends the current active session and freezes the displayed time.
- Starting a break pauses active time accumulation.
- Ending a break resumes active time accumulation without resetting the total.
- The timer should update every second while the user is checked in.
- The timer must not count break time as active time.
- If the app reloads, the current state should restore from `localStorage`.

Guardrails:

- Do not allow check-out while a live call is active or the user is in wrap-up/disposition flow.
- Do not allow a new break while a call is active.
- If stored time-tracking data is corrupt, reset to a safe `checked_out` state.

## Alerts Model

The Alerts panel should be derived from existing workspace call data rather than a new backend feed.

Source:

- Use `lead.callHistory` entries from the workspace payload.
- Filter to `callType === "incoming"`.
- Sort newest first by `createdAt`.

Suggested alert item shape:

```ts
interface IncomingAlertItem {
  id: string;
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
```

Display:

- lead name
- phone number
- status or outcome pill
- timestamp

Behavior:

- The badge count reflects unseen incoming history items.
- Opening the popover marks the current list as seen locally.
- The panel should be scrollable and capped in height.
- If there are no incoming calls, show a compact empty state.

Important rule:

- Do not show outbound calls in Alerts.
- Do not show descriptive call narratives in Alerts.
- This area is historical only; live ringing state can remain elsewhere in the app.

## Component And State Architecture

Likely implementation surfaces:

- `src/components/layout/AppShell.tsx`
- `src/components/layout/TopBar.tsx` or a replacement `GlobalNavbar.tsx`
- `src/hooks/useAppState.tsx`
- `src/types/index.ts`
- optional presentational subcomponents for the alerts popover and break menu

Architecture decisions:

- `AppShell` should render the navbar for every authenticated route.
- The navbar should be a shared component, not repeated per page.
- Page-level headers can remain below the navbar where needed, but the global navbar no longer carries the page title.
- Time tracking state should belong in `useAppState` so it is global and route-independent.
- Alerts should be computed from the already-loaded workspace leads so they stay in sync with the current account.

## Responsive And Accessibility Behavior

- On wide screens, the navbar stays as one row with three clusters.
- On smaller screens, the center controls should collapse into compact stacked chips or a menu.
- Alerts popover should become a full-width sheet on very narrow screens if needed.
- Buttons and menu items should keep strong focus states and keyboard access.
- Text should remain readable at small sizes without wrapping into tall blocks.

## Error Handling

- If workspace data has no incoming history, show an empty alerts state instead of an error.
- If the time-tracking state cannot be restored from storage, default to `checked_out`.
- If the user tries to check out during an active call, keep the current session active and show a brief inline message.
- If alert data cannot be derived, fail closed and show no items rather than inventing entries.

## Verification

- Navbar appears on all authenticated pages.
- Manual check in and check out work from the navbar.
- Break start and end pause and resume the session timer.
- The timer excludes break time.
- Alerts only show incoming call history.
- Outbound calls never appear in Alerts.
- Refreshing the app preserves the current time-tracking state and seen alerts state.
- The layout remains compact and does not expand into large boxed sections.

## Acceptance Criteria

- The top shell looks and feels like the provided reference: compact pills, not card stacks.
- Time tracking is manual and global.
- The Alerts area surfaces only incoming call history.
- The navbar is available across the authenticated workspace, not just on one page.
- The implementation does not introduce extra workflow clutter.
