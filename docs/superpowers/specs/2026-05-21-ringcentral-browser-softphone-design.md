# RingCentral Browser Softphone Design

## Goal

Build a browser-first calling system for the CRM that supports both outgoing and incoming RingCentral calls inside the app.

Primary behavior:

- outbound calls use the browser softphone when it is registered and ready
- incoming calls can ring inside the app and be answered or rejected from the existing dialer surface
- the current RingOut flow remains as a technical fallback only

The UI should stay close to the current dialer experience. The only intentional UI additions are the incoming-call answer/reject controls and the minimal state needed to show that a browser call is ringing or connected.

## Scope

- Turn the dormant browser voice/session scaffolding into a real softphone client.
- Use the existing SIP profile and workspace voice configuration as the registration source for the browser client.
- Keep RingCentral outbound RingOut as a fallback path when the browser softphone is unavailable.
- Add incoming-call answer handling to the dialer views that already surface ringing state.
- Keep the current call queue, disposition flow, history, notes, and timeline intact.
- Preserve existing RingCentral history capture and webhook-based call logging.

## Non-goals

- No redesign of the dialer layout.
- No new sidebar, navbar, or page structure work.
- No separate call-center dashboard.
- No idle-break or time-tracking changes.
- No rework of lead import/export.
- No new alerts area behavior beyond what already exists.
- No attempt to replace RingCentral itself with a different telephony provider.

## Recommended Approach

Use a browser softphone as the primary transport and keep RingOut as the safety net.

Why this approach:

- It matches the user requirement for a proper incoming and outgoing call system.
- It aligns with the existing SIP profile plumbing already in the codebase.
- It lets us keep the UI changes small because the app can continue to use the existing active call state and disposition flow.
- The fallback stays hidden unless registration fails, so the normal user path remains browser-based.

## Architecture

### Call Transport

The app should have one active client for browser calling:

- registers using the active SIP profile or workspace voice session data
- emits events for ready, ringing, connected, ended, and failed states
- can place outbound calls
- can accept or reject inbound calls
- can disconnect cleanly on logout or settings changes

The existing RingOut backend remains available only when the browser client is unavailable.

### State Ownership

`useAppState` should remain the single place that owns:

- `activeCall`
- `callError`
- queue progression after call end
- answer / reject / end actions
- browser softphone lifecycle

The browser client should not be spread across multiple pages.

### Data Sources

The call system should use these existing sources:

- `client/src/services/workspace.ts` for SIP profile selection and workspace voice config
- `client/src/services/ringcentral.ts` for RingCentral connection and RingOut fallback
- `supabase/functions/ringcentral-webhook/index.ts` for inbound telephony session history and call logging
- `supabase/functions/ringcentral-live/index.ts` for live RingOut status and call-ending control

## Functional Flow

### 1. App bootstrap

When the user loads the app:

- workspace state loads the active SIP profile and browser voice session config
- `useAppState` creates or refreshes the browser softphone client
- if the client registers successfully, the app marks browser calling as ready
- if the client fails, the app keeps the fallback available without blocking the workspace

### 2. Outgoing call

When the user presses `Call`:

- if the browser softphone is ready, place the call through the browser client
- if the browser softphone is not ready, fall back to the current RingOut flow
- create `activeCall` immediately so the UI shows ringing / connected state
- keep the existing queue advancement and disposition flow

### 3. Incoming call

When RingCentral delivers an inbound call to the browser client:

- set `activeCall.direction = "incoming"`
- set the active call state to `ringing`
- surface the current lead or matching phone number if it can be resolved
- show `Answer` and `Reject` controls in the existing call control area

Answering should:

- accept the browser session
- transition the call to connected
- keep the existing wrap-up / disposition flow after the call ends

Rejecting should:

- decline or release the incoming session
- clear the ringing state
- leave the queue position unchanged unless the backend history logic advances it

### 4. Call end and disposition

After any call finishes:

- open the existing disposition flow at the bottom of the screen
- save the disposition into the current lead history
- close the call session cleanly
- move to the next queued lead automatically once disposition is saved

## UI Changes

Keep UI changes minimal.

### Dialer header

- keep the current lead name, call button, and call status row
- when `activeCall.direction === "incoming"` and the call is ringing, the primary action becomes `Answer`
- keep `Reject` next to it for inbound ringing
- keep the existing `End call` behavior for connected calls

### Incoming call state

- reuse the current in-progress call styling
- do not add a new full-screen dialer redesign
- do not add extra panels just for softphone registration
- if the browser client is unavailable, show a compact reconnect or unavailable message rather than changing the whole layout

### Pages in scope

- `client/src/pages/PreviewDialerPage.tsx`
- `client/src/pages/ManualDialerPage.tsx`

## Backend And Service Changes

### Workspace voice session

Extend the workspace voice session shape so the browser client can register without guessing at transport settings.

The browser client should receive, at minimum:

- SIP or websocket endpoint information
- authorization username
- authorization password
- display name or caller identity
- any dial prefix needed by the current tenant

### RingCentral status

Expose active telephony state in RingCentral status so the app can recover and display accurate call state after refresh.

Status should include:

- active telephony session id
- active telephony party id
- active telephony direction
- active telephony status code
- updated timestamp

This lets the client reconcile history and ringing state even if the browser session refreshes.

### Fallback control

Keep the current RingOut endpoints available:

- `status`
- `ring-out`
- `ring-out-end`
- `disconnect`

The fallback should only be used when the browser softphone cannot register or has already failed.

## State Model

The app should continue using a single `ActiveCall` shape, with the addition of browser softphone metadata where needed.

Recommended runtime state:

```ts
type CallTransportMode = "browser_softphone" | "ringout_fallback";
type CallLifecycleState = "idle" | "ringing" | "connected" | "ending" | "failed";

interface ActiveCall {
  leadId: string | null;
  dialedNumber: string;
  displayName: string;
  startedAt: number;
  status: CallControlStatus;
  muted: boolean;
  recordingEnabled: boolean;
  direction?: "incoming" | "outgoing";
  callId?: string | null;
  transportMode?: CallTransportMode;
  lifecycleState?: CallLifecycleState;
}
```

The browser client should be the source of truth for transport state; the UI should just render what the app state says.

## Error Handling

- If browser registration fails, keep the workspace usable and fall back to RingOut for outgoing calls.
- If an incoming call arrives while the browser client is unavailable, surface a compact error state and keep the rest of the app working.
- If a call answer or reject action races with a stale call state, ignore the stale event and keep the newest session.
- If the app refreshes mid-call, recover the active telephony state from RingCentral status and the browser session where possible.
- If the browser softphone disconnects during a call, do not auto-rewrite the UI into a different workflow; show a short call error and keep the existing wrap-up flow available.

## Verification

- Browser softphone registers successfully for the active user.
- Outgoing calls place from the browser client when it is available.
- Outgoing calls still work through the RingOut fallback if the browser client is unavailable.
- Incoming calls surface as ringing inside the dialer.
- `Answer` connects the inbound call.
- `Reject` clears the inbound ring state.
- Disposition still opens after the call ends.
- Saving disposition advances to the next queued lead.
- Refreshing the app during a live session preserves the call state as much as the backend allows.

## Acceptance Criteria

- The app has a browser-first calling path.
- Outgoing and incoming RingCentral calls work through the same in-app call state.
- The fallback exists but does not change the normal user path.
- The UI stays close to the current dialer, with only the incoming-answer additions required for the new flow.
- Existing call history, queue progression, and disposition handling remain intact.
