import assert from "node:assert/strict";
import test from "node:test";

import { buildWebPhoneSipInfo } from "./ringcentralSoftphone.ts";

test("buildWebPhoneSipInfo converts the browser config into WebPhone sipInfo", () => {
  const sipInfo = buildWebPhoneSipInfo({
    available: true,
    source: "profile",
    callerId: "+17325939636",
    websocketUrl: "wss://sip.ringcentral.example/ws",
    sipDomain: "sip.ringcentral.example",
    authorizationId: "instance-123",
    sipUri: "sip:1001@sip.ringcentral.example",
    authorizationUsername: "1001",
    authorizationPassword: "secret",
    dialPrefix: "9",
    displayName: "Rocco Sgro",
    profileId: "profile-1",
    profileLabel: "Primary",
    message: null,
  });

  assert.equal(sipInfo.authorizationId, "instance-123");
  assert.equal(sipInfo.domain, "sip.ringcentral.example");
  assert.equal(sipInfo.outboundProxy, "sip.ringcentral.example");
  assert.equal(sipInfo.outboundProxyBackup, "sip.ringcentral.example");
  assert.equal(sipInfo.username, "1001");
  assert.equal(sipInfo.password, "secret");
  assert.deepEqual(sipInfo.stunServers, ["stun.l.google.com:19302"]);
});
