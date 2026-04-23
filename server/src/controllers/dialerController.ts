import type { Request, Response } from "express";
import { z } from "zod";

import { getUserById, getVoiceIdentity, saveDisposition } from "../services/repository.js";
import { createVoiceSessionPayload } from "../services/voiceProviderService.js";

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

  await saveDisposition(parsed.data, currentUser);
  return res.json({ success: true });
}
