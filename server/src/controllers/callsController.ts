import type { Request, Response } from "express";
import { z } from "zod";

import {
  createManualCallLog,
  deleteManualCallLog,
  getUserById,
  listCallLogs,
  updateManualCallLog,
} from "../services/repository.js";

const callSchema = z.object({
  leadId: z.string(),
  callType: z.enum(["incoming", "outgoing"]),
  durationSeconds: z.number().int().nonnegative(),
  status: z.enum(["connected", "missed", "follow_up"]),
  notes: z.string().default(""),
  callbackAt: z.string().default(""),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
});

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

export async function listCallsController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const items = await listCallLogs(currentUser);
  return res.json({ items, total: items.length });
}

export async function createCallController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = callSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid call payload" });
  }

  await createManualCallLog(parsed.data, currentUser);
  return res.status(201).json({ success: true });
}

export async function updateCallController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = callSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid call payload" });
  }

  await updateManualCallLog(req.params.callId, parsed.data, currentUser);
  return res.json({ success: true });
}

export async function deleteCallController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  await deleteManualCallLog(req.params.callId, currentUser);
  return res.json({ success: true });
}
