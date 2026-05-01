import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDialNumberForCountry,
  formatDialNumberForSession,
  normalizeDialTarget,
  sanitizeDialPadInput,
} from "./softphoneDialing";

test("sanitizes manual dial input without changing digits", () => {
  assert.equal(sanitizeDialPadInput("+91 (952) 840-9189"), "+919528409189");
});

test("normalizes SIP targets while preserving a leading plus in the user part", () => {
  assert.equal(
    normalizeDialTarget("+919528409189", "umsg.uvcpbx.in"),
    "sip:+919528409189@umsg.uvcpbx.in;user=phone",
  );
  assert.equal(
    normalizeDialTarget("9528409189", "umsg.uvcpbx.in", "0"),
    "sip:09528409189@umsg.uvcpbx.in;user=phone",
  );
});

test("formats ten digit NANP numbers from a US caller ID before SIP dialing", () => {
  assert.equal(
    formatDialNumberForSession("8773841516", {
      callerId: "17252182800",
      timezone: "Asia/Kolkata",
    }),
    "+18773841516",
  );
});

test("formats manual country selections without double prefixing", () => {
  assert.equal(
    formatDialNumberForCountry("8773841516", {
      callingCode: "1",
      nationalNumberLength: 10,
    }),
    "+18773841516",
  );
  assert.equal(
    formatDialNumberForCountry("+18773841516", {
      callingCode: "1",
      nationalNumberLength: 10,
    }),
    "+18773841516",
  );
});
