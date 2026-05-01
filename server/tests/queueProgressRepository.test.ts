import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("persists queue progress in the local repository", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-dialer-queue-"));
  const storePath = path.join(tempDir, "local-store.json");

  process.env.DATA_MODE = "local";
  process.env.CRM_DIALER_LOCAL_STORE_PATH = storePath;

  const repository = await import("../src/services/repository.js");
  const user = await repository.getUserByEmail("agent@previewdialer.local");

  assert.ok(user);

  await repository.saveQueueProgress(
    {
      queueScope: "default",
      queueSort: "priority",
      queueFilter: "all",
      currentLeadId: "lead-2",
      currentPhoneIndex: 1,
    },
    user,
  );

  const progress = await repository.getQueueProgress(user);
  assert.equal(progress.length, 1);
  assert.equal(progress[0].queueScope, "default");
  assert.equal(progress[0].currentLeadId, "lead-2");
  assert.equal(progress[0].currentPhoneIndex, 1);

  const written = JSON.parse(await fs.readFile(storePath, "utf8")) as {
    queueProgress?: Array<{ currentLeadId: string | null; currentPhoneIndex: number }>;
  };

  assert.equal(written.queueProgress?.length, 1);
  assert.equal(written.queueProgress?.[0].currentLeadId, "lead-2");
  assert.equal(written.queueProgress?.[0].currentPhoneIndex, 1);
});
