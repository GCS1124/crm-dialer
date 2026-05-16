import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRingCentralAuthorizationUrl,
  buildRingOutRequestPayload,
  getRingOutProgressState,
  isRingCentralOutboundNumber,
  selectRingCentralCallerId,
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

test("builds a RingOut payload with the selected caller id", () => {
  assert.deepEqual(
    buildRingOutRequestPayload({
      to: "+1 (952) 840-9189",
      callerId: "+1 (555) 111-2222",
      playPrompt: false,
    }),
    {
      callerId: { phoneNumber: "+15551112222" },
      to: { phoneNumber: "+19528409189" },
      playPrompt: false,
    },
  );
});

test("builds a RingOut payload with separate from and caller id numbers", () => {
  assert.deepEqual(
    buildRingOutRequestPayload({
      to: "+1 (952) 840-9189",
      fromNumber: "+1 (702) 749-4172",
      callerId: "+1 (877) 578-7788",
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

test("builds a RingOut payload without a caller id when omitted", () => {
  assert.deepEqual(
    buildRingOutRequestPayload({
      to: "+1 (952) 840-9189",
      playPrompt: true,
    }),
    {
      to: { phoneNumber: "+19528409189" },
      playPrompt: true,
    },
  );
});

test("uses the first caller-id number when no preferred caller id is selected", () => {
  const callerId = selectRingCentralCallerId(
    [
      { phoneNumber: "18005550123", features: ["CallerId"] },
      { phoneNumber: "18005550124", features: ["CallForwarding"], usageType: "ForwardedNumber" },
    ],
    null,
  );

  assert.equal(callerId, "18005550123");
});

test("prefers a selected caller-id number over a forwarding number", () => {
  const callerId = selectRingCentralCallerId(
    [
      { phoneNumber: "18005550123", features: ["CallerId"] },
      { phoneNumber: "18005550124", features: ["CallForwarding"], usageType: "ForwardedNumber" },
    ],
    "18005550123",
  );

  assert.equal(callerId, "18005550123");
});

test("uses main company numbers as caller IDs", () => {
  const callerId = selectRingCentralCallerId(
    [{ phoneNumber: "18005550123", features: ["CallerId"], usageType: "MainCompanyNumber" }],
    null,
  );

  assert.equal(callerId, "18005550123");
});

test("does not use caller-id-only numbers as RingOut from numbers", () => {
  const fromNumber = selectRingCentralRingOutFromNumber(
    [{ phoneNumber: "18005550123", features: ["CallerId"], usageType: "MainCompanyNumber" }],
    null,
  );

  assert.equal(fromNumber, "");
});

test("does not treat call flip devices as RingOut numbers", () => {
  assert.equal(
    isRingCentralOutboundNumber({
      phoneNumber: "18005550125",
      features: ["CallFlip"],
    }),
    false,
  );
});

test("skips call flip devices when choosing the default RingOut from number", () => {
  const fromNumber = selectRingCentralRingOutFromNumber(
    [
      { phoneNumber: "18005550123", features: ["CallFlip"] },
      { phoneNumber: "18005550124", features: ["CallerId"] },
    ],
    null,
  );

  assert.equal(fromNumber, "");
});

test("uses forwarding targets as RingOut from numbers", () => {
  const fromNumber = selectRingCentralRingOutFromNumber(
    [
      { phoneNumber: "18005550123", features: ["CallerId"] },
      { phoneNumber: "18005550124", features: ["CallForwarding"], usageType: "ForwardedNumber" },
    ],
    null,
  );

  assert.equal(fromNumber, "18005550124");
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
  assert.match(progress.message ?? "", /busy/);
});
