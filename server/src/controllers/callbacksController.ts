import type { Request, Response } from "express";
import { z } from "zod";

import {
  completeLeadCallback,
  getUserById,
  getWorkspace,
  reopenLead,
  rescheduleLeadCallback,
} from "../services/appRepository.js";

const rescheduleSchema = z.object({
  callbackTime: z.string(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]),
});

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

export async function listCallbacksController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const workspace = await getWorkspace(currentUser);
  const items = workspace.leads.filter((lead) => Boolean(lead.callbackTime));
  return res.json({ items, total: items.length });
}

export async function rescheduleCallbackController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid callback payload" });
  }

  await rescheduleLeadCallback(
    req.params.leadId,
    parsed.data.callbackTime,
    parsed.data.priority,
    currentUser,
  );

  return res.json({ success: true });
}

export async function completeCallbackController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  await completeLeadCallback(req.params.leadId, currentUser);
  return res.json({ success: true });
}

export async function reopenLeadController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  await reopenLead(req.params.leadId, currentUser);
  return res.json({ success: true });
}
