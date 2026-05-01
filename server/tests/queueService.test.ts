import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceQueueCursor,
  buildQueueItems,
  selectQueueState,
} from "../src/services/queueService.js";
import type { ApiLead, ApiUser } from "../src/types/index.js";

const agent: ApiUser = {
  id: "agent-1",
  name: "Queue Agent",
  email: "agent@example.com",
  role: "agent",
  team: "Outbound",
  timezone: "Asia/Kolkata",
  avatar: "QA",
  title: "Agent",
  status: "online",
};

function createLead(overrides: Partial<ApiLead>): ApiLead {
  return {
    id: overrides.id ?? "lead-1",
    fullName: overrides.fullName ?? "Lead",
    phone: overrides.phone ?? "+14155550101",
    altPhone: overrides.altPhone ?? "",
    email: overrides.email ?? "lead@example.com",
    company: overrides.company ?? "Company",
    jobTitle: overrides.jobTitle ?? "Manager",
    location: overrides.location ?? "Delhi",
    source: overrides.source ?? "Import",
    interest: overrides.interest ?? "Dialer",
    status: overrides.status ?? "new",
    notes: overrides.notes ?? "",
    lastContacted: overrides.lastContacted ?? null,
    assignedAgentId: overrides.assignedAgentId ?? agent.id,
    assignedAgentName: overrides.assignedAgentName ?? agent.name,
    callbackTime: overrides.callbackTime ?? null,
    priority: overrides.priority ?? "Medium",
    createdAt: overrides.createdAt ?? "2026-04-30T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-30T00:00:00.000Z",
    tags: overrides.tags ?? [],
    callHistory: overrides.callHistory ?? [],
    notesHistory: overrides.notesHistory ?? [],
    activities: overrides.activities ?? [],
    leadScore: overrides.leadScore ?? 50,
    timezone: overrides.timezone ?? "Asia/Kolkata",
  } as ApiLead;
}

test("returns the first pending item and advances through multiple numbers", () => {
  const leads = [
    createLead({
      id: "lead-a",
      fullName: "Alpha",
      phone: "+1 (415) 555-0101, +1 (415) 555-0102",
      priority: "High",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    }),
    createLead({
      id: "lead-b",
      fullName: "Bravo",
      phone: "+1 (212) 555-0103",
      priority: "Medium",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
    }),
  ];

  const queue = buildQueueItems(leads, agent, "priority", "all", "default");
  assert.deepEqual(
    queue.map((item) => `${item.leadId}:${item.phoneIndex}:${item.phoneNumber}`),
    ["lead-a:0:+14155550101", "lead-a:1:+14155550102", "lead-b:0:+12125550103"],
  );

  const initial = selectQueueState(queue, null);
  assert.equal(initial.currentItem?.leadId, "lead-a");
  assert.equal(initial.currentItem?.phoneIndex, 0);
  assert.equal(initial.currentItem?.phoneNumber, "+14155550101");
  assert.equal(initial.nextItem?.leadId, "lead-a");
  assert.equal(initial.nextItem?.phoneIndex, 1);

  const afterFirstDial = advanceQueueCursor(queue, {
    currentLeadId: "lead-a",
    currentPhoneIndex: 0,
  });
  assert.equal(afterFirstDial.currentLeadId, "lead-a");
  assert.equal(afterFirstDial.currentPhoneIndex, 1);

  const afterSecondDial = advanceQueueCursor(queue, afterFirstDial);
  assert.equal(afterSecondDial.currentLeadId, "lead-b");
  assert.equal(afterSecondDial.currentPhoneIndex, 0);
});

test("preserves duplicate numbers across different contacts", () => {
  const queue = buildQueueItems(
    [
      createLead({
        id: "lead-a",
        fullName: "Alpha",
        phone: "+1 (415) 555-0101",
      }),
      createLead({
        id: "lead-b",
        fullName: "Bravo",
        phone: "+1 (415) 555-0101",
        createdAt: "2026-04-29T00:00:00.000Z",
      }),
    ],
    agent,
    "priority",
    "all",
    "default",
  );

  assert.equal(queue.length, 2);
  assert.equal(queue[0].phoneNumber, "+14155550101");
  assert.equal(queue[1].phoneNumber, "+14155550101");
  assert.notEqual(queue[0].leadId, queue[1].leadId);
});
