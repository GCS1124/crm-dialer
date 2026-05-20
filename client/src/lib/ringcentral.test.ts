import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRingCentralAuthorizationUrl,
  buildRingOutRequestPayload,
  getRingOutProgressState,
  isRingCentralOutboundNumber,
  isRingCentralRingOutFromNumber,
  selectRingCentralRingOutFromNumber,
} from "./ringcentral";

test("builds the RingCentral PKCE authorization url", () => {
  const url = buildRingCentralAuthorizationUrl({
    clientId: "rc-client-id",
    redirectUri: "https://crm.example.com/",
    codeChallenge: "code-challenge",
    state: "state-token",
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://platform.ringcentral.com");
  assert.equal(parsed.pathname, "/restapi/oauth/authorize");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("client_id"), "rc-client-id");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://crm.example.com/");
  assert.equal(parsed.searchParams.get("state"), "state-token");
  assert.equal(parsed.searchParams.get("code_challenge"), "code-challenge");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
});

test("builds a RingOut payload with a forwarding number", () => {
  assert.deepEqual(
    buildRingOutRequestPayload({
      to: "+1 (952) 840-9189",
      fromNumber: "+1 (702) 749-4172",
      callerIdNumber: "+1 (877) 578-7788",
      playPrompt: false,
    }),
    {
      from: { phoneNumber: "+17027494172" },
      callerId: { phoneNumber: "+18775787788" },
      to: { phoneNumber: "+19528409189" },
      playPrompt: false,
    },
  );
});

test("preserves an app-only RingOut extension target", () => {
  assert.deepEqual(
    buildRingOutRequestPayload({
      to: "+1 (732) 593-9636",
      fromNumber: "+1 (877) 578-7788*101",
      callerIdNumber: "+1 (877) 578-7788",
      playPrompt: false,
    }),
    {
      from: { phoneNumber: "+18775787788*101" },
      callerId: { phoneNumber: "+18775787788" },
      to: { phoneNumber: "+17325939636" },
      playPrompt: false,
    },
  );
});

test("does not treat call flip devices as caller-id numbers", () => {
  assert.equal(
    isRingCentralOutboundNumber({
      phoneNumber: "18005550125",
      features: ["CallFlip"],
    }),
    false,
  );
});

test("treats call flip devices as RingOut numbers", () => {
  assert.equal(
    selectRingCentralRingOutFromNumber(
      [{ phoneNumber: "18005550123", features: ["CallFlip"] }],
      null,
    ),
    "18005550123",
  );
});

test("selects the first enabled RingOut number as the default forwarding target", () => {
  const fromNumber = selectRingCentralRingOutFromNumber(
    [
      { phoneNumber: "18005550123", features: ["CallFlip"] },
      { phoneNumber: "18005550124", features: ["CallerId"] },
    ],
    null,
  );

  assert.equal(fromNumber, "18005550123");
});

test("does not use disabled forwarding numbers as RingOut from numbers", () => {
  const fromNumber = selectRingCentralRingOutFromNumber(
    [
      { phoneNumber: "18005550123", features: ["CallForwarding"], usageType: "ForwardedNumber", enabled: false },
      { phoneNumber: "18005550124", features: ["CallForwarding"], usageType: "ForwardedNumber", enabled: true },
    ],
    null,
  );

  assert.equal(fromNumber, "18005550124");
});

test("treats forwarding targets as RingOut from numbers", () => {
  assert.equal(
    isRingCentralRingOutFromNumber({
      phoneNumber: "18005550124",
      features: ["CallForwarding"],
      usageType: "ForwardedNumber",
    }),
    true,
  );
});

test("treats legacy RingCentral usage types as RingOut from numbers", () => {
  assert.equal(
    isRingCentralRingOutFromNumber({
      phoneNumber: "18005550124",
      usageType: "ForwardedNumber",
    }),
    true,
  );
  assert.equal(
    isRingCentralRingOutFromNumber({
      phoneNumber: "18005550125",
      usageType: "DirectNumber",
    }),
    true,
  );
  assert.equal(
    isRingCentralRingOutFromNumber({
      phoneNumber: "18005550127",
      usageType: "MainCompanyNumber",
    }),
    true,
  );
});

test("treats forwarding target types as RingOut from numbers", () => {
  assert.equal(
    isRingCentralRingOutFromNumber({
      phoneNumber: "18005550126",
      type: "PhoneLine",
      enabled: true,
    }),
    true,
  );
  assert.equal(
    isRingCentralRingOutFromNumber({
      phoneNumber: "18005550127",
      type: "VoiceFax",
      usageType: "DirectNumber",
      enabled: true,
    }),
    true,
  );
});

test("keeps polling while a RingOut leg is still being established", () => {
  assert.deepEqual(
    getRingOutProgressState({
      callStatus: "CannotReach",
      callerStatus: "InProgress",
      calleeStatus: "InProgress",
    }),
    {
      state: "ringing",
      message: null,
      advanceQueue: false,
      failureType: null,
    },
  );
});

test("does not mark RingOut connected until both legs are connected", () => {
  assert.deepEqual(
    getRingOutProgressState({
      callStatus: "InProgress",
      callerStatus: "Success",
      calleeStatus: "InProgress",
    }),
    {
      state: "ringing",
      message: null,
      advanceQueue: false,
      failureType: null,
    },
  );
});

test("marks RingOut connected when the aggregate call status succeeds", () => {
  assert.deepEqual(
    getRingOutProgressState({
      callStatus: "Success",
      callerStatus: "Success",
      calleeStatus: "Success",
    }),
    {
      state: "connected",
      message: null,
      advanceQueue: false,
      failureType: null,
    },
  );
});

test("keeps the lead selected when RingCentral cannot reach the RingOut device", () => {
  const progress = getRingOutProgressState({
    callStatus: "CannotReach",
    callerStatus: "NoAnswer",
    calleeStatus: "InProgress",
  });

  assert.equal(progress.state, "failed");
  assert.equal(progress.advanceQueue, false);
  assert.equal(progress.failureType, "caller");
  assert.match(progress.message ?? "", /RingOut device or forwarding target/);
});

test("advances queue when the destination is busy", () => {
  const progress = getRingOutProgressState({
    callStatus: "CannotReach",
    callerStatus: "Success",
    calleeStatus: "Busy",
  });

  assert.equal(progress.state, "failed");
  assert.equal(progress.advanceQueue, true);
  assert.equal(progress.failureType, "callee");
  assert.match(progress.message ?? "", /busy/);
});
