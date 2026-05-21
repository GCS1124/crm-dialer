import assert from "node:assert/strict";
import test from "node:test";

import { buildBrowserSoftphoneConfig } from "./browserSoftphone.ts";

test("buildBrowserSoftphoneConfig returns a ready config when workspace and SIP profile data are complete", () => {
  const config = buildBrowserSoftphoneConfig(
    {
      available: true,
      source: "profile",
      callerId: "+17325939636",
      websocketUrl: "wss://sip.ringcentral.example/ws",
      sipDomain: "sip.ringcentral.example",
      authorizationId: "instance-123",
      profileId: "profile-1",
      profileLabel: "Primary",
    },
    {
      sipUri: "sip:1001@sip.ringcentral.example",
      authorizationUsername: "1001",
      authorizationPassword: "secret",
      dialPrefix: "9",
      displayName: "Rocco Sgro",
    },
  );

  assert.equal(config.available, true);
  assert.equal(config.websocketUrl, "wss://sip.ringcentral.example/ws");
  assert.equal(config.authorizationId, "instance-123");
  assert.equal(config.authorizationUsername, "1001");
  assert.equal(config.displayName, "Rocco Sgro");
  assert.equal(config.dialPrefix, "9");
});

test("buildBrowserSoftphoneConfig stays unavailable when required session fields are missing", () => {
  const config = buildBrowserSoftphoneConfig(
    {
      available: true,
      source: "environment",
      callerId: null,
      websocketUrl: "wss://sip.ringcentral.example/ws",
      sipDomain: "sip.ringcentral.example",
      profileId: null,
      profileLabel: null,
    },
    {
      authorizationUsername: "1001",
      authorizationPassword: "secret",
    },
  );

  assert.equal(config.available, false);
  assert.equal(config.message, "RingCentral browser calling is not ready.");
  assert.equal(config.displayName, null);
});
