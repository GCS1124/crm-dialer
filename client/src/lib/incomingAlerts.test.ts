import assert from "node:assert/strict";
import test from "node:test";

import type { Lead } from "../types/index.ts";
import { buildIncomingAlerts, countUnreadIncomingAlerts } from "./incomingAlerts.ts";

const lead: Lead = {
  id: "lead-1",
  fullName: "Asha Rao",
  phone: "+1 (555) 111-2222",
  altPhone: "",
  email: "asha@example.com",
  company: "Asha Co",
  jobTitle: "",
  location: "Delhi",
  source: "",
  interest: "",
  status: "new",
  notes: "",
  lastContacted: null,
  assignedAgentId: "",
  assignedAgentName: "",
  callbackTime: null,
  priority: "Medium",
  createdAt: "2026-05-21T08:00:00.000Z",
  updatedAt: "2026-05-21T08:00:00.000Z",
  tags: [],
  callHistory: [
    {
      id: "c-1",
      leadId: "lead-1",
      leadName: "Asha Rao",
      phone: "+1",
      createdAt: "2026-05-21T08:10:00.000Z",
      agentId: "u1",
      agentName: "Agent",
      callType: "incoming",
      durationSeconds: 10,
      disposition: "Interested",
      status: "connected",
      notes: "",
      recordingEnabled: false,
      outcomeSummary: "",
      aiSummary: "",
      sentiment: "neutral",
      suggestedNextAction: "",
      followUpAt: null,
    },
    {
      id: "c-2",
      leadId: "lead-1",
      leadName: "Asha Rao",
      phone: "+1",
      createdAt: "2026-05-21T08:00:00.000Z",
      agentId: "u1",
      agentName: "Agent",
      callType: "incoming",
      durationSeconds: 10,
      disposition: "Voicemail",
      status: "missed",
      notes: "",
      recordingEnabled: false,
      outcomeSummary: "",
      aiSummary: "",
      sentiment: "neutral",
      suggestedNextAction: "",
      followUpAt: null,
    },
    {
      id: "c-3",
      leadId: "lead-1",
      leadName: "Asha Rao",
      phone: "+1",
      createdAt: "2026-05-21T07:50:00.000Z",
      agentId: "u1",
      agentName: "Agent",
      callType: "outgoing",
      durationSeconds: 10,
      disposition: "Interested",
      status: "connected",
      notes: "",
      recordingEnabled: false,
      outcomeSummary: "",
      aiSummary: "",
      sentiment: "neutral",
      suggestedNextAction: "",
      followUpAt: null,
    },
  ],
  notesHistory: [],
  activities: [],
  leadScore: 80,
  timezone: "UTC",
};

test("returns only incoming calls sorted newest first", () => {
  const alerts = buildIncomingAlerts([lead]);

  assert.equal(alerts.length, 2);
  assert.equal(alerts[0]?.callId, "c-1");
  assert.equal(alerts[1]?.callId, "c-2");
});

test("counts only unseen incoming alerts", () => {
  const alerts = buildIncomingAlerts([lead]);

  assert.equal(countUnreadIncomingAlerts(alerts, new Set([alerts[0]?.id ?? ""])), 1);
});
