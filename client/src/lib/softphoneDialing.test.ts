import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDialNumberForSession,
  formatManualDialNumberForCountry,
  normalizeDialTarget,
  sanitizeDialPadInput,
} from "./softphoneDialing";

test("sanitizes manual dial input without changing digits", () => {
  assert.equal(sanitizeDialPadInput("(952) 840-9189"), "9528409189");
});

test("formats manual dial numbers using the US calling code", () => {
  assert.equal(
    formatManualDialNumberForCountry("9528409189", {
      callingCode: "1",
      nationalNumberLength: 10,
    }),
    "+19528409189",
  );
});

test("formats session dial numbers as US numbers even when the user timezone is India", () => {
  assert.equal(
    formatDialNumberForSession("9528409189", {
      callerId: "908089@umsg.uvcpbx.in",
      timezone: "Asia/Calcutta",
    }),
    "+19528409189",
  );
});

test("rejects non-US dial numbers instead of silently forwarding them", () => {
  assert.equal(
    formatManualDialNumberForCountry("1", {
      callingCode: "1",
      nationalNumberLength: 10,
    }),
    "",
  );

  assert.equal(
    formatManualDialNumberForCountry("+919528409189", {
      callingCode: "1",
      nationalNumberLength: 10,
    }),
    "",
  );

  assert.equal(
    formatDialNumberForSession("+919528409189", {
      callerId: "908089@umsg.uvcpbx.in",
      timezone: "Asia/Calcutta",
    }),
    "",
  );
});

test("normalizes SIP targets by stripping the plus from E.164 numbers", () => {
  assert.equal(
    normalizeDialTarget("+19528409189", "umsg.uvcpbx.in", "1"),
    "sip:19528409189@umsg.uvcpbx.in;user=phone",
  );
});
