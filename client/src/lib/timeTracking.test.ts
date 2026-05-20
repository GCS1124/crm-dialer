import assert from "node:assert/strict";
import test from "node:test";

import {
  checkIn,
  checkOut,
  createInitialTimeTrackingState,
  endBreak,
  getDisplayedSeconds,
  startBreak,
} from "./timeTracking.ts";

test("check in, break, and check out preserve only active work time", () => {
  const started = checkIn(createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"), "2026-05-21T09:00:00.000Z");
  const onBreak = startBreak(started, "lunch", "2026-05-21T09:15:00.000Z");
  const resumed = endBreak(onBreak, "2026-05-21T09:30:00.000Z");
  const stopped = checkOut(resumed, "2026-05-21T09:45:00.000Z");

  assert.equal(stopped.status, "checked_out");
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
});
