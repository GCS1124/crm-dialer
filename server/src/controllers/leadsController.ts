import type { Request, Response } from "express";
import { z } from "zod";

import {
  assignLeadToUser,
  deleteLeadRecords,
  getUserById,
  importLeads,
  listLeads,
  markLeadInvalid,
  updateLeadStatuses,
} from "../services/repository.js";
import type { ApiLeadImportRecord, ApiLeadPriority, ApiLeadStatus } from "../types/index.js";

const leadStatusEnum = z.enum([
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

const leadPriorityEnum = z.enum(["Low", "Medium", "High", "Urgent"]);

const importSchema = z.object({
  records: z.array(
    z.object({
      fullName: z.string(),
      phone: z.string(),
      altPhone: z.string().default(""),
      phoneNumbers: z.array(z.string()).default([]),
      email: z.string().default(""),
      company: z.string().default(""),
      jobTitle: z.string().default(""),
      location: z.string().default(""),
      source: z.string().default(""),
      interest: z.string().default(""),
      status: leadStatusEnum.default("new"),
      notes: z.string().default(""),
      lastContacted: z.string().nullable().default(null),
      assignedAgentName: z.string().default(""),
      callbackTime: z.string().nullable().default(null),
      priority: leadPriorityEnum.default("Medium"),
    }),
  ),
  assignToUserId: z.string().optional(),
});

const assignSchema = z.object({
  userId: z.string(),
});

const bulkStatusSchema = z.object({
  leadIds: z.array(z.string()),
  status: leadStatusEnum,
});

const bulkDeleteSchema = z.object({
  leadIds: z.array(z.string()),
});

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

export async function listLeadsController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const items = await listLeads(currentUser);
  return res.json({ items, total: items.length });
}

export async function uploadLeadsController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid upload payload" });
  }

  const records: ApiLeadImportRecord[] = parsed.data.records.map((record) => ({
    fullName: record.fullName,
    phone: record.phone,
    altPhone: record.altPhone,
    phoneNumbers: record.phoneNumbers,
    email: record.email,
    company: record.company,
    jobTitle: record.jobTitle,
    location: record.location,
    source: record.source,
    interest: record.interest,
    status: record.status,
    notes: record.notes,
    lastContacted: record.lastContacted,
    assignedAgentName: record.assignedAgentName,
    callbackTime: record.callbackTime,
    priority: record.priority,
  }));

  const result = await importLeads(records, currentUser, parsed.data.assignToUserId);
  return res.status(201).json(result);
}

export async function assignLeadController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid assign payload" });
  }

  await assignLeadToUser(req.params.leadId, parsed.data.userId, currentUser);
  return res.json({ success: true });
}

export async function bulkStatusController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = bulkStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid bulk status payload" });
  }

  const updated = await updateLeadStatuses(
    parsed.data.leadIds,
    parsed.data.status as ApiLeadStatus,
    currentUser,
  );
  return res.json({ updated });
}

export async function bulkDeleteController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = bulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid bulk delete payload" });
  }

  const deleted = await deleteLeadRecords(parsed.data.leadIds, currentUser);
  return res.json({ deleted });
}

export async function markLeadInvalidController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  await markLeadInvalid(req.params.leadId, currentUser);
  return res.json({ success: true });
}
