import type { Request, Response } from "express";
import { z } from "zod";

import {
  getQueueProgress,
  listLeads,
  resetQueueProgress,
  saveQueueProgress,
  getUserById,
} from "../services/repository.js";
import { advanceQueueCursor, buildQueueItems, getQueueKey, selectQueueState } from "../services/queueService.js";
import type { QueueFilter, QueueSort } from "../types/index.js";

const queueSortEnum = z.enum(["priority", "newest", "callback_due"]);
const queueFilterEnum = z.enum([
  "all",
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
  "closed_won",
  "closed_lost",
  "invalid",
]);

const queueScopeEnum = z.string().trim().min(1).max(128).default("default");

const queueStateSchema = z.object({
  queueScope: queueScopeEnum.default("default"),
  queueSort: queueSortEnum.default("priority"),
  queueFilter: queueFilterEnum.default("all"),
});

const queueProgressSchema = queueStateSchema.extend({
  currentLeadId: z.string().nullable().default(null),
  currentPhoneIndex: z.number().int().nonnegative().default(0),
});

const queueAdvanceSchema = queueProgressSchema.extend({
  outcome: z.enum(["completed", "failed", "skipped", "invalid", "restart"]).default("completed"),
});

type QueueStateInput = {
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
};

type QueueProgressInput = QueueStateInput & {
  currentLeadId: string | null;
  currentPhoneIndex: number;
};

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

function logQueueEvent(event: string, details: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      event,
      ...details,
    }),
  );
}

function normalizeQueueStateInput(input: Partial<QueueStateInput>): QueueStateInput {
  return {
    queueScope: input.queueScope ?? "default",
    queueSort: input.queueSort ?? "priority",
    queueFilter: input.queueFilter ?? "all",
  };
}

function normalizeQueueProgressInput(input: Partial<QueueProgressInput>): QueueProgressInput {
  return {
    ...normalizeQueueStateInput(input),
    currentLeadId: input.currentLeadId ?? null,
    currentPhoneIndex: input.currentPhoneIndex ?? 0,
  };
}

async function loadQueueState(
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  input: QueueStateInput,
) {
  const leads = await listLeads(currentUser);
  const queueKey = getQueueKey(input.queueScope, input.queueSort, input.queueFilter);
  const queueItems = buildQueueItems(
    leads,
    currentUser,
    input.queueSort,
    input.queueFilter,
    input.queueScope,
  );
  const progress = (await getQueueProgress(currentUser, queueKey))[0] ?? null;

  return {
    ...selectQueueState(queueItems, progress ?? null, input.queueScope, input.queueSort, input.queueFilter),
    progress,
  };
}

export async function getQueueController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = queueStateSchema.safeParse({
    queueScope: req.query.scope,
    queueSort: req.query.sort,
    queueFilter: req.query.filter,
  });

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid queue query" });
  }

  const queueInput = normalizeQueueStateInput(parsed.data);
  const state = await loadQueueState(currentUser, queueInput);
  return res.json(state);
}

export async function saveQueueController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = queueProgressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid queue progress payload" });
  }

  const progressInput = normalizeQueueProgressInput(parsed.data);
  const saved = await saveQueueProgress(progressInput, currentUser);
  const state = await loadQueueState(currentUser, progressInput);

  logQueueEvent("queue_progress_saved", {
    userId: currentUser.id,
    queueKey: saved.queueKey,
    leadId: saved.currentLeadId,
    phoneIndex: saved.currentPhoneIndex,
    queueSize: state.items.length,
  });

  return res.json(state);
}

export async function advanceQueueController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = queueAdvanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid queue advance payload" });
  }

  const progressInput = normalizeQueueProgressInput(parsed.data);
  const queueItems = buildQueueItems(
    await listLeads(currentUser),
    currentUser,
    progressInput.queueSort,
    progressInput.queueFilter,
    progressInput.queueScope,
  );
  const nextCursor =
    parsed.data.outcome === "restart"
      ? advanceQueueCursor(queueItems, null, "restart")
      : advanceQueueCursor(queueItems, {
          currentLeadId: progressInput.currentLeadId,
          currentPhoneIndex: progressInput.currentPhoneIndex,
        }, parsed.data.outcome);

  const saved = await saveQueueProgress(
    {
      queueScope: progressInput.queueScope,
      queueSort: progressInput.queueSort,
      queueFilter: progressInput.queueFilter,
      currentLeadId: nextCursor.currentLeadId,
      currentPhoneIndex: nextCursor.currentPhoneIndex,
    },
    currentUser,
  );
  const state = await loadQueueState(currentUser, {
    queueScope: progressInput.queueScope,
    queueSort: progressInput.queueSort,
    queueFilter: progressInput.queueFilter,
  });

  logQueueEvent("queue_progress_advanced", {
    userId: currentUser.id,
    queueKey: saved.queueKey,
    outcome: parsed.data.outcome,
    leadId: nextCursor.currentLeadId,
    phoneIndex: nextCursor.currentPhoneIndex,
    queueSize: state.items.length,
  });

  return res.json(state);
}

export async function restartQueueController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = queueStateSchema.safeParse({
    queueScope: req.body?.queueScope ?? req.query.scope,
    queueSort: req.body?.queueSort ?? req.query.sort,
    queueFilter: req.body?.queueFilter ?? req.query.filter,
  });

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid queue restart payload" });
  }

  const queueInput = normalizeQueueStateInput(parsed.data);
  await resetQueueProgress(
    currentUser,
    queueInput.queueScope,
    queueInput.queueSort,
    queueInput.queueFilter,
  );

  const queueItems = buildQueueItems(
    await listLeads(currentUser),
    currentUser,
    queueInput.queueSort,
    queueInput.queueFilter,
    queueInput.queueScope,
  );
  const firstCursor = advanceQueueCursor(queueItems, null, "restart");
  await saveQueueProgress(
    {
      queueScope: queueInput.queueScope,
      queueSort: queueInput.queueSort,
      queueFilter: queueInput.queueFilter,
      currentLeadId: firstCursor.currentLeadId,
      currentPhoneIndex: firstCursor.currentPhoneIndex,
    },
    currentUser,
  );

  const state = await loadQueueState(currentUser, queueInput);
  logQueueEvent("queue_progress_restarted", {
    userId: currentUser.id,
    queueKey: getQueueKey(queueInput.queueScope, queueInput.queueSort, queueInput.queueFilter),
    queueSize: state.items.length,
  });

  return res.json(state);
}
