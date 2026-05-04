import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("persists failed browser call attempts without creating a normal disposition", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-dialer-failed-call-"));
  const storePath = path.join(tempDir, "local-store.json");

  process.env.DATA_MODE = "local";
  process.env.CRM_DIALER_LOCAL_STORE_PATH = storePath;

  const repository = await import("../src/services/repository.js");
  const user = await repository.getUserByEmail("agent@previewdialer.local");

  assert.ok(user);

  const leadBefore = (await repository.listLeads(user)).find((lead) => lead.id === "lead_1");
  assert.ok(leadBefore);

  const initialStatus = leadBefore.status;
  const initialLastContacted = leadBefore.lastContacted;
  const initialCallbackTime = leadBefore.callbackTime;
  const initialCallCount = leadBefore.callHistory.length;

  await repository.saveFailedCallAttempt(
    {
      leadId: leadBefore.id,
      dialedNumber: "+91 98765 43210",
      failureStage: "server_disconnect",
      sipStatus: 503,
      sipReason: "Service Unavailable",
      failureMessage:
        "The CRM softphone disconnected from the SIP server before the call could be completed.",
      startedAt: "2026-05-04T06:00:00.000Z",
      endedAt: "2026-05-04T06:00:08.000Z",
    },
    user,
  );

  const leadAfter = (await repository.listLeads(user)).find((lead) => lead.id === leadBefore.id);
  assert.ok(leadAfter);

  assert.equal(leadAfter.status, initialStatus);
  assert.equal(leadAfter.lastContacted, initialLastContacted);
  assert.equal(leadAfter.callbackTime, initialCallbackTime);
  assert.equal(leadAfter.callHistory.length, initialCallCount + 1);

  const attempt = leadAfter.callHistory[0];
  assert.equal(attempt.source, "failed_attempt");
  assert.equal(attempt.status, "failed");
  assert.equal(attempt.disposition, "Failed Attempt");
  assert.equal(attempt.phone, "+91 98765 43210");
  assert.equal(attempt.failureStage, "server_disconnect");
  assert.equal(attempt.sipStatus, 503);
  assert.equal(attempt.sipReason, "Service Unavailable");
  assert.equal(
    attempt.notes,
    "The CRM softphone disconnected from the SIP server before the call could be completed.",
  );

  const activity = leadAfter.activities[0];
  assert.equal(activity.title, "Call failed before connect");
  assert.match(activity.description, /SIP server disconnect before connect/i);

  const callLogs = await repository.listCallLogs(user);
  assert.equal(callLogs[0]?.id, attempt.id);
  assert.equal(callLogs[0]?.source, "failed_attempt");
  assert.equal(callLogs[0]?.failureStage, "server_disconnect");
  assert.equal(callLogs[0]?.phone, "+91 98765 43210");

  const written = JSON.parse(await fs.readFile(storePath, "utf8")) as {
    leads?: Array<{
      id: string;
      status: string;
      lastContacted: string | null;
      callbackTime: string | null;
      callHistory: Array<{ source?: string; failureStage?: string }>;
      activities: Array<{ title: string }>;
    }>;
  };
  const writtenLead = written.leads?.find((lead) => lead.id === leadBefore.id);

  assert.ok(writtenLead);
  assert.equal(writtenLead?.callHistory[0]?.source, "failed_attempt");
  assert.equal(writtenLead?.callHistory[0]?.failureStage, "server_disconnect");
  assert.equal(writtenLead?.activities[0]?.title, "Call failed before connect");
});
