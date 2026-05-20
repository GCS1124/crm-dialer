import type { BreakType, TimeTrackingState } from "../types/index.ts";

function diffSeconds(startIso: string | null, nowIso: string) {
  if (!startIso) {
    return 0;
  }

  const start = Date.parse(startIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(now) || now <= start) {
    return 0;
  }

  return Math.floor((now - start) / 1000);
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

export function getDisplayedSeconds(state: TimeTrackingState, nowIso = new Date().toISOString()) {
  const liveActiveSeconds =
    state.status === "checked_in" ? diffSeconds(state.checkedInAt, nowIso) : 0;
  return Math.max(0, state.activeSessionSeconds + liveActiveSeconds);
}

export function checkIn(
  _state: TimeTrackingState,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  return {
    status: "checked_in",
    checkedInAt: nowIso,
    breakStartedAt: null,
    breakType: null,
    activeSessionSeconds: 0,
    activeBreakSeconds: 0,
    lastUpdatedAt: nowIso,
  };
}

export function startBreak(
  state: TimeTrackingState,
  breakType: BreakType,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  if (state.status !== "checked_in") {
    return state;
  }

  return {
    ...state,
    status: "on_break",
    checkedInAt: null,
    breakStartedAt: nowIso,
    breakType,
    activeSessionSeconds: getDisplayedSeconds(state, nowIso),
    lastUpdatedAt: nowIso,
  };
}

export function endBreak(state: TimeTrackingState, nowIso = new Date().toISOString()): TimeTrackingState {
  if (state.status !== "on_break") {
    return state;
  }

  return {
    ...state,
    status: "checked_in",
    checkedInAt: nowIso,
    breakStartedAt: null,
    breakType: null,
    activeBreakSeconds: state.activeBreakSeconds + diffSeconds(state.breakStartedAt, nowIso),
    lastUpdatedAt: nowIso,
  };
}

export function checkOut(state: TimeTrackingState, nowIso = new Date().toISOString()): TimeTrackingState {
  const sessionSeconds =
    state.status === "checked_in" ? getDisplayedSeconds(state, nowIso) : state.activeSessionSeconds;
  const breakSeconds =
    state.status === "on_break"
      ? state.activeBreakSeconds + diffSeconds(state.breakStartedAt, nowIso)
      : state.activeBreakSeconds;

  return {
    ...state,
    status: "checked_out",
    checkedInAt: null,
    breakStartedAt: null,
    breakType: null,
    activeSessionSeconds: sessionSeconds,
    activeBreakSeconds: breakSeconds,
    lastUpdatedAt: nowIso,
  };
}
