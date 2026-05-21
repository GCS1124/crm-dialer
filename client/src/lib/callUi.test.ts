import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrimaryCallActionLabel,
  getSecondaryCallActionLabel,
  isCallLaunchDisabled,
} from "./callUi.ts";

test("incoming ringing calls show Answer and Reject labels", () => {
  const activeCall = {
    direction: "incoming",
    status: "ringing",
  } as const;

  assert.equal(getPrimaryCallActionLabel(activeCall), "Answer");
  assert.equal(getSecondaryCallActionLabel(activeCall), "Reject");
});

test("a pending call launch disables the call button before activeCall exists", () => {
  assert.equal(
    isCallLaunchDisabled({
      activeCall: null,
      wrapUpLeadId: null,
      callLaunchPending: true,
    }),
    true,
  );
});
