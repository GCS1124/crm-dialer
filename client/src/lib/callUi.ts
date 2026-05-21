import type { ActiveCall } from "../types";

type CallLikeState = Pick<ActiveCall, "direction" | "status"> | null | undefined;
type CallLaunchState = {
  activeCall: CallLikeState;
  wrapUpLeadId: string | null;
  callLaunchPending: boolean;
  allowDuringWrapUp?: boolean;
};

export function getPrimaryCallActionLabel(activeCall: CallLikeState) {
  if (!activeCall) {
    return "Call";
  }

  if (activeCall.direction === "incoming" && activeCall.status === "ringing") {
    return "Answer";
  }

  return "End call";
}

export function getSecondaryCallActionLabel(activeCall: CallLikeState) {
  if (activeCall?.direction === "incoming" && activeCall.status === "ringing") {
    return "Reject";
  }

  return null;
}

export function isCallLaunchDisabled({
  activeCall,
  wrapUpLeadId,
  callLaunchPending,
  allowDuringWrapUp = false,
}: CallLaunchState) {
  return Boolean(activeCall) || callLaunchPending || (Boolean(wrapUpLeadId) && !allowDuringWrapUp);
}
