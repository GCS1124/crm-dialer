import type { Request, Response } from "express";
import { z } from "zod";

import {
  getQueueProgress,
  getActiveSipProfile,
  getUserById,
  getVoiceIdentity,
  listSipProfiles,
  listLeads,
  saveDisposition,
  saveFailedCallAttempt,
  saveQueueProgress,
} from "../services/repository.js";
import { advanceQueueCursor, buildQueueItems, selectQueueState } from "../services/queueService.js";
import {
  createVoiceSessionPayload,
  createVoiceSessionPayloadFromSipProfile,
  getVoiceProviderConfig,
} from "../services/voiceProviderService.js";
import type { SaveDispositionInput, SaveFailedCallAttemptInput } from "../types/index.js";

const dispositionSchema = z.object({
  leadId: z.string(),
  disposition: z.enum([
    "No Answer",
    "Busy",
    "Voicemail",
    "Wrong Number",
    "Not Interested",
    "Interested",
    "Call Back Later",
    "Follow-Up Required",
    "Appointment Booked",
    "Sale Closed",
  ]),
  notes: z.string().default(""),
  callbackAt: z.string().default(""),
  followUpPriority: z.enum(["Low", "Medium", "High", "Urgent"]),
  outcomeSummary: z.string(),
  durationSeconds: z.number().nonnegative(),
  recordingEnabled: z.boolean().default(false),
  queueScope: z.string().trim().min(1).max(128).default("default"),
  queueSort: z.enum(["priority", "newest", "callback_due"]).default("priority"),
  queueFilter: z.enum([
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
  ]).default("all"),
  currentPhoneIndex: z.number().int().nonnegative().default(0),
});

const failedAttemptSchema = z.object({
  leadId: z.string(),
  dialedNumber: z.string().trim().min(1).max(64),
  failureStage: z
    .enum([
      "session_unavailable",
      "session_start",
      "invite",
      "microphone",
      "server_disconnect",
      "sip_reject",
      "hangup_before_connect",
      "unknown",
    ])
    .default("unknown"),
  sipStatus: z.number().int().positive().nullable().optional(),
  sipReason: z.string().trim().max(160).nullable().optional(),
  failureMessage: z.string().trim().max(500).nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
});

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

export async function voiceSessionController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const identity = await getVoiceIdentity(currentUser);
  const [activeSipProfile, visibleProfiles] = await Promise.all([
    getActiveSipProfile(currentUser),
    listSipProfiles(currentUser),
  ]);

  if (activeSipProfile) {
    return res.json(
      createVoiceSessionPayloadFromSipProfile(activeSipProfile, currentUser.name || identity),
    );
  }

  if (visibleProfiles.length > 0) {
    return res.status(409).json({
      ...getVoiceProviderConfig(),
      available: false,
      source: "unconfigured" as const,
      callerId: null,
      websocketUrl: null,
      sipDomain: null,
      username: null,
      profileId: null,
      profileLabel: null,
      message: "Select a SIP profile before starting browser calls.",
    });
  }

  return res.json(createVoiceSessionPayload(currentUser.name || identity));
}

export async function dispositionController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = dispositionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid post-call payload" });
  }

  const dispositionInput: SaveDispositionInput = {
    leadId: parsed.data.leadId,
    disposition: parsed.data.disposition,
    notes: parsed.data.notes,
    callbackAt: parsed.data.callbackAt,
    followUpPriority: parsed.data.followUpPriority,
    outcomeSummary: parsed.data.outcomeSummary,
    durationSeconds: parsed.data.durationSeconds,
    recordingEnabled: parsed.data.recordingEnabled,
  };

  await saveDisposition(dispositionInput, currentUser);

  const leads = await listLeads(currentUser);
  const queueItems = buildQueueItems(
    leads,
    currentUser,
    parsed.data.queueSort,
    parsed.data.queueFilter,
    parsed.data.queueScope,
  );
  const queueKey = `${parsed.data.queueScope}:${parsed.data.queueSort}:${parsed.data.queueFilter}`;
  const nextCursor = advanceQueueCursor(
    queueItems,
    {
      currentLeadId: parsed.data.leadId,
      currentPhoneIndex: parsed.data.currentPhoneIndex,
    },
    "completed",
  );
  const savedProgress = await saveQueueProgress(
    {
      queueScope: parsed.data.queueScope,
      queueSort: parsed.data.queueSort,
      queueFilter: parsed.data.queueFilter,
      currentLeadId: nextCursor.currentLeadId,
      currentPhoneIndex: nextCursor.currentPhoneIndex,
    },
    currentUser,
  );

  const queueProgress = (await getQueueProgress(currentUser, queueKey))[0] ?? savedProgress;
  const queueState = selectQueueState(
    queueItems,
    queueProgress,
    parsed.data.queueScope,
    parsed.data.queueSort,
    parsed.data.queueFilter,
  );

  return res.json({ success: true, queueState });
}

export async function failedAttemptController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = failedAttemptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid failed call attempt payload" });
  }

  const attemptInput: SaveFailedCallAttemptInput = {
    leadId: parsed.data.leadId,
    dialedNumber: parsed.data.dialedNumber,
    failureStage: parsed.data.failureStage,
    sipStatus: parsed.data.sipStatus ?? null,
    sipReason: parsed.data.sipReason ?? null,
    failureMessage: parsed.data.failureMessage ?? null,
    startedAt: parsed.data.startedAt,
    endedAt: parsed.data.endedAt,
  };

  await saveFailedCallAttempt(attemptInput, currentUser);

  return res.status(201).json({ success: true });
}
