import type { Request, Response } from "express";
import { z } from "zod";

import { getUserById, getVoiceIdentity, saveDisposition } from "../services/repository.js";
import {
  buildOutboundVoiceResponse,
  createVoiceAccessToken,
  getTwilioVoiceConfig,
  isTwilioConfigured,
} from "../services/twilioService.js";

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

export async function voiceTokenController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const twilio = getTwilioVoiceConfig();
  if (!isTwilioConfigured()) {
    return res.json({
      available: false,
      callerId: null,
      appSid: null,
      message:
        "Twilio is not configured yet. Add your Twilio account SID, API key, API secret, app SID, and outbound caller ID on the backend.",
    });
  }

  const identity = await getVoiceIdentity(currentUser);

  return res.json({
    available: true,
    callerId: twilio.callerId,
    appSid: twilio.appSid,
    identity,
    token: createVoiceAccessToken(identity),
  });
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

export function outboundVoiceWebhookController(req: Request, res: Response) {
  const phoneNumber = String(req.body.To ?? req.query.To ?? "").trim();
  if (!phoneNumber) {
    return res.status(400).type("text/plain").send("Missing destination number");
  }

  res.type("text/xml");
  return res.send(buildOutboundVoiceResponse(phoneNumber));
}
