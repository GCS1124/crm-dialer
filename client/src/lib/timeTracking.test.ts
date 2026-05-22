import assert from "node:assert/strict";
import test from "node:test";

import {
  checkIn,
  checkOut,
  createInitialTimeTrackingState,
  buildEmployeeAttendanceSnapshot,
  endBreak,
  getDisplayedSeconds,
  getBreakMenuOptions,
  getTimeTrackingPanelState,
  normalizeTimeTrackingState,
  startBreak,
} from "./timeTracking.ts";
import type { TimeTrackingState } from "../types";

test("check in, break, and check out preserve only active work time", () => {
  const started = checkIn(createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"), "2026-05-21T09:00:00.000Z");
  const onBreak = startBreak(started, "lunch", "2026-05-21T09:15:00.000Z");
  const resumed = endBreak(onBreak, "2026-05-21T09:30:00.000Z");
  const stopped = checkOut(resumed, "2026-05-21T09:45:00.000Z");

  assert.equal(stopped.status, "checked_out");
  assert.equal(started.hasCheckedIn, true);
  assert.equal(onBreak.hasCheckedIn, true);
  assert.equal(resumed.hasCheckedIn, true);
  assert.equal(stopped.hasCheckedIn, true);
  assert.equal(getDisplayedSeconds(stopped, "2026-05-21T09:45:00.000Z"), 1800);
  assert.equal(stopped.activeBreakSeconds, 900);
});

test("check out while on break freezes the active session and captures break time", () => {
  const started = checkIn(createInitialTimeTrackingState("2026-05-21T10:00:00.000Z"), "2026-05-21T10:00:00.000Z");
  const onBreak = startBreak(started, "tea", "2026-05-21T10:20:00.000Z");
  const stopped = checkOut(onBreak, "2026-05-21T10:25:00.000Z");

  assert.equal(stopped.status, "checked_out");
  assert.equal(stopped.activeSessionSeconds, 1200);
  assert.equal(stopped.activeBreakSeconds, 300);
  assert.equal(stopped.hasCheckedIn, true);
});

test("break menu options expose usage counters and durations", () => {
  const state = normalizeTimeTrackingState(createInitialTimeTrackingState("2026-05-21T11:00:00.000Z"));
  const options = getBreakMenuOptions(state);

  assert.equal(options.find((option) => option.value === "freshen_up")?.durationLabel, "00:00");
  assert.equal(options.find((option) => option.value === "lunch")?.usageLabel, "0/1 used");
  assert.equal(options.find((option) => option.value === "tea")?.usageLabel, "0/2 used");
  assert.equal(options.find((option) => option.value === "meeting_training")?.usageLabel, null);
});

test("lunch break usage is limited to one break per shift and resets on check in", () => {
  const started = checkIn(createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"), "2026-05-21T09:00:00.000Z");
  const lunch = startBreak(started, "lunch", "2026-05-21T09:05:00.000Z");
  const resumed = endBreak(lunch, "2026-05-21T09:20:00.000Z");
  const secondLunchAttempt = startBreak(resumed, "lunch", "2026-05-21T09:25:00.000Z");
  const nextShift = checkIn(resumed, "2026-05-21T17:00:00.000Z");

  assert.equal(secondLunchAttempt.status, "checked_in");
  assert.equal(secondLunchAttempt.breakUsageCounts.lunch, 1);
  assert.equal(secondLunchAttempt.breakDurationsSeconds.lunch, 900);
  assert.equal(getBreakMenuOptions(secondLunchAttempt).find((option) => option.value === "lunch")?.usageLabel, "1/1 used");
  assert.equal(getBreakMenuOptions(secondLunchAttempt).find((option) => option.value === "lunch")?.disabled, true);
  assert.equal(nextShift.breakUsageCounts.lunch, 0);
  assert.equal(nextShift.breakDurationsSeconds.lunch, 0);
});

test("normalizeTimeTrackingState restores checked-in history for legacy active records", () => {
  const legacyState: TimeTrackingState = {
    ...createInitialTimeTrackingState("2026-05-21T12:00:00.000Z"),
    status: "checked_in",
    checkedInAt: "2026-05-21T12:00:00.000Z",
    hasCheckedIn: false,
  };

  const normalized = normalizeTimeTrackingState(legacyState);

  assert.equal(normalized.hasCheckedIn, true);
});

test("time tracking panel state shows live login time and active break summary", () => {
  const checkedIn = checkIn(
    createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"),
    "2026-05-21T09:00:00.000Z",
  );
  const onBreak = startBreak(checkedIn, "lunch", "2026-05-21T09:15:00.000Z");
  const panel = getTimeTrackingPanelState(onBreak, "2026-05-21T09:25:00.000Z");

  assert.equal(panel.loginDurationLabel, "0:15:00");
  assert.equal(panel.isOnBreak, true);
  assert.equal(panel.activeBreakLabel, "Lunch Break");
  assert.equal(panel.activeBreakDurationLabel, "10:00");
  assert.equal(panel.activeBreakUsageLabel, "1/1 used");
});

test("buildEmployeeAttendanceSnapshot preserves the original shift start through break transitions", () => {
  const checkedIn = checkIn(
    createInitialTimeTrackingState("2026-05-22T13:57:00.000Z"),
    "2026-05-22T13:57:00.000Z",
  );
  const onBreak = startBreak(checkedIn, "lunch", "2026-05-22T15:30:00.000Z");
  const resumed = endBreak(onBreak, "2026-05-22T15:45:00.000Z");
  const checkedOut = checkOut(resumed, "2026-05-22T18:19:00.000Z");

  const snapshot = buildEmployeeAttendanceSnapshot(checkedOut as any, {
    employeeId: "agent-1",
    timezone: "Asia/Kolkata",
    nowIso: "2026-05-22T18:19:00.000Z",
  });

  assert.equal(snapshot.activityDate, "2026-05-22");
  assert.equal(snapshot.status, "checked_out");
  assert.equal(snapshot.checkedInAt, "2026-05-22T13:57:00.000Z");
  assert.equal(snapshot.checkedOutAt, "2026-05-22T18:19:00.000Z");
  assert.equal(snapshot.activeSessionSeconds, 14820);
  assert.equal(snapshot.activeBreakSeconds, 900);
  assert.equal(snapshot.hasCheckedIn, true);
});
