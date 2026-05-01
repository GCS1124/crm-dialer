import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDialTarget, sanitizeDialPadInput } from "./softphoneDialing";

test("sanitizes manual dial input without changing digits", () => {
  assert.equal(sanitizeDialPadInput("+91 (952) 840-9189"), "+919528409189");
});

test("normalizes SIP targets without preserving a leading plus in the user part", () => {
  assert.equal(
    normalizeDialTarget("+919528409189", "umsg.uvcpbx.in"),
    "sip:919528409189@umsg.uvcpbx.in;user=phone",
  );
  assert.equal(
    normalizeDialTarget("9528409189", "umsg.uvcpbx.in", "0"),
    "sip:09528409189@umsg.uvcpbx.in;user=phone",
  );
});
