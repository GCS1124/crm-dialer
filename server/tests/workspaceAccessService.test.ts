import assert from "node:assert/strict";
import test from "node:test";

import { buildSipWorkspaceExposure } from "../src/services/workspaceAccessService.js";
import type { ApiSipProfile, ApiUser } from "../src/types/index.js";

const adminUser: ApiUser = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
  role: "admin",
  team: "Ops",
  timezone: "Asia/Kolkata",
  avatar: "A",
  title: "Admin",
  status: "online",
};

const agentUser: ApiUser = {
  ...adminUser,
  id: "agent-1",
  email: "agent@example.com",
  role: "agent",
  title: "Agent",
};

const profile: ApiSipProfile = {
  id: "profile-1",
  label: "Assigned SIP",
  providerUrl: "wss://umsg.uvcpbx.in:7443/",
  sipDomain: "umsg.uvcpbx.in",
  sipUsername: "908089",
  callerId: "17252182800",
  ownerUserId: null,
  ownerUserName: null,
  isShared: true,
  isActive: true,
  passwordPreview: "********1234",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

test("admins retain SIP profile management visibility", () => {
  const result = buildSipWorkspaceExposure(adminUser, {
    profiles: [profile],
    activeProfile: profile,
    selectionRequired: true,
  });

  assert.equal(result.selectionRequired, true);
  assert.equal(result.activeProfile?.id, profile.id);
  assert.deepEqual(result.profiles.map((item) => item.id), [profile.id]);
});

test("non-admins do not receive SIP profile management data", () => {
  const result = buildSipWorkspaceExposure(agentUser, {
    profiles: [profile],
    activeProfile: profile,
    selectionRequired: true,
  });

  assert.equal(result.selectionRequired, false);
  assert.equal(result.activeProfile, null);
  assert.deepEqual(result.profiles, []);
});
