import test from "node:test";
import assert from "node:assert/strict";

import { createVoiceSessionPayloadFromSipProfile } from "../src/services/voiceProviderService.js";

test("builds a live SIP session from the selected profile", () => {
  const payload = createVoiceSessionPayloadFromSipProfile(
    {
      id: "profile-1",
      label: "Shared Unified Voice",
      providerUrl: "wss://umsg.uvcpbx.in:7443/",
      sipDomain: "umsg.uvcpbx.in",
      sipUsername: "908089",
      sipPassword: "Loginuser@908089",
      callerId: "17252182800",
      ownerUserId: null,
      isShared: true,
      isActive: true,
    },
    "Anushi Mittal",
  );

  assert.equal(payload.available, true);
  assert.equal(payload.websocketUrl, "wss://umsg.uvcpbx.in:7443/");
  assert.equal(payload.sipDomain, "umsg.uvcpbx.in");
  assert.equal(payload.username, "908089");
  assert.equal(payload.authorizationUsername, "908089");
  assert.equal(payload.authorizationPassword, "Loginuser@908089");
  assert.equal(payload.callerId, "17252182800");
  assert.equal(payload.displayName, "Anushi Mittal");
  assert.equal(payload.sipUri, "sip:908089@umsg.uvcpbx.in");
});
