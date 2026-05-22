import assert from "node:assert/strict";
import test from "node:test";

import type { Lead, User } from "../types";
import { buildEmployeeActivityCalendar } from "./employeeActivityCalendar.ts";

test("builds a full monthly employee activity calendar with daily summaries", () => {
  const users: User[] = [
    {
      id: "agent-1",
      name: "Asha Rao",
      email: "asha@example.com",
      role: "agent",
      team: "Sales",
      timezone: "Asia/Kolkata",
      avatar: "AR",
      title: "Sales Agent",
      status: "online",
    },
    {
      id: "agent-2",
      name: "Ravi Singh",
      email: "ravi@example.com",
      role: "agent",
      team: "Sales",
      timezone: "Asia/Kolkata",
      avatar: "RS",
      title: "Sales Agent",
      status: "online",
    },
  ];

  const leads: Lead[] = [
    {
      id: "lead-1",
      fullName: "Rahul Sharma",
      phone: "9999999999",
      altPhone: "",
      phoneNumbers: ["9999999999"],
      email: "rahul@example.com",
      company: "Acme",
      jobTitle: "Manager",
      location: "Delhi",
      source: "Import",
      interest: "Sales",
      status: "new",
      notes: "",
      lastContacted: null,
      assignedAgentId: "agent-1",
      assignedAgentName: "Asha Rao",
      callbackTime: null,
      priority: "Medium",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      tags: [],
      callHistory: [
        {
          id: "call-1",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-02T04:30:00.000Z",
          agentId: "agent-1",
          agentName: "Asha Rao",
          callType: "outgoing",
          durationSeconds: 57,
          disposition: "Interested",
          status: "connected",
          notes: "Customer asked for follow-up",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "positive",
          suggestedNextAction: "",
          followUpAt: null,
        },
        {
          id: "call-2",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-02T05:15:00.000Z",
          agentId: "agent-1",
          agentName: "Asha Rao",
          callType: "outgoing",
          durationSeconds: 23,
          disposition: "Not Interested",
          status: "connected",
          notes: "",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "negative",
          suggestedNextAction: "",
          followUpAt: null,
        },
        {
          id: "call-3",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-02T06:00:00.000Z",
          agentId: "agent-2",
          agentName: "Ravi Singh",
          callType: "outgoing",
          durationSeconds: 40,
          disposition: "Sale Closed",
          status: "connected",
          notes: "",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "positive",
          suggestedNextAction: "",
          followUpAt: null,
        },
        {
          id: "call-4",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-03T03:00:00.000Z",
          agentId: "agent-1",
          agentName: "Asha Rao",
          callType: "outgoing",
          durationSeconds: 89,
          disposition: "Appointment Booked",
          status: "connected",
          notes: "Booked for Friday",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "positive",
          suggestedNextAction: "",
          followUpAt: null,
        },
      ],
      notesHistory: [],
      activities: [],
      leadScore: 80,
      timezone: "Asia/Kolkata",
    },
  ];

  const result = buildEmployeeActivityCalendar({
    users,
    leads,
    employeeId: "agent-1",
    month: "2026-05",
    attendanceDays: [
      {
        employeeId: "agent-1",
        activityDate: "2026-05-22",
        timezone: "Asia/Kolkata",
        status: "checked_out",
        checkedInAt: "2026-05-22T13:57:00.000Z",
        checkedOutAt: "2026-05-22T18:04:00.000Z",
        breakStartedAt: null,
        breakType: null,
        activeSessionSeconds: 14820,
        activeBreakSeconds: 0,
        hasCheckedIn: true,
        breakUsageCounts: {
          freshen_up: 0,
          lunch: 0,
          tea: 0,
          meeting_training: 0,
        },
        breakDurationsSeconds: {
          freshen_up: 0,
          lunch: 0,
          tea: 0,
          meeting_training: 0,
        },
        lastUpdatedAt: "2026-05-22T18:04:00.000Z",
      },
    ],
  } as any);

  assert.equal(result.employeeId, "agent-1");
  assert.equal(result.employeeName, "Asha Rao");
  assert.equal(result.month, "2026-05");
  assert.equal(result.days.length, 31);

  const may2 = result.days.find((day) => day.date === "2026-05-02");
  assert.ok(may2);
  assert.equal(may2?.totalCalls, 2);
  assert.equal(may2?.connectedCalls, 2);
  assert.equal(may2?.interested, 1);
  assert.equal(may2?.notInterested, 1);
  assert.equal(may2?.disposedCompleted, 0);
  assert.equal(may2?.failed, 0);
  assert.equal(may2?.records.length, 2);

  const may3 = result.days.find((day) => day.date === "2026-05-03");
  assert.ok(may3);
  assert.equal(may3?.disposedCompleted, 1);
  assert.equal(may3?.records.length, 1);

  const may4 = result.days.find((day) => day.date === "2026-05-04");
  assert.ok(may4);
  assert.equal(may4?.totalCalls, 0);
  assert.equal(may4?.records.length, 0);

  const may22 = result.days.find((day) => day.date === "2026-05-22") as any;
  assert.ok(may22);
  assert.equal(may22.attendance.statusLabel, "Late");
  assert.equal(may22.attendance.checkInLabel, "19:27");
  assert.equal(may22.attendance.checkOutLabel, "23:34");
  assert.equal(may22.attendance.workingHoursLabel, "4h 7m");
  assert.equal(may22.attendance.breaksLabel, "0m • 0 breaks");
});
