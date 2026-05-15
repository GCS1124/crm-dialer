import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRingCentralAuthorizationUrl,
  buildRingOutRequestPayload,
  isRingCentralOutboundNumber,
  selectRingCentralCallerId,
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
      from: { phoneNumber: "+15551112222" },
      to: { phoneNumber: "+19528409189" },
      playPrompt: false,
    },
  );
});

test("prefers a selected caller id and falls back to the first callable number", () => {
  const callerId = selectRingCentralCallerId(
    [
      { phoneNumber: "18005550123", features: ["CallerId"] },
      { phoneNumber: "18005550124", features: [] },
    ],
    null,
  );

  assert.equal(callerId, "18005550123");
});

test("prefers a forwarding number over a plain caller-id number", () => {
  const callerId = selectRingCentralCallerId(
    [
      { phoneNumber: "18005550123", features: ["CallerId"] },
      { phoneNumber: "18005550124", features: ["CallForwarding"], usageType: "ForwardedNumber" },
    ],
    null,
  );

  assert.equal(callerId, "18005550124");
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

test("skips call flip devices when choosing the default RingOut number", () => {
  const callerId = selectRingCentralCallerId(
    [
      { phoneNumber: "18005550123", features: ["CallFlip"] },
      { phoneNumber: "18005550124", features: ["CallerId"] },
    ],
    null,
  );

  assert.equal(callerId, "18005550124");
});
