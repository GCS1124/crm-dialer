import type { Request, Response } from "express";
import { z } from "zod";

import {
  assignSipProfileToUser,
  createSipProfile,
  deleteSipProfile,
  getUserById,
  listSipProfiles,
  setActiveSipProfile,
  updateSipProfile,
} from "../services/repository.js";
import type { CreateSipProfileInput, UpdateSipProfileInput } from "../types/index.js";

const createSipProfileSchema = z.object({
  label: z.string().min(1),
  providerUrl: z.string().min(1),
  sipDomain: z.string().min(1),
  sipUsername: z.string().min(1),
  sipPassword: z.string().min(1),
  callerId: z.string().min(1),
  isShared: z.boolean().default(false),
});

const setActiveSipProfileSchema = z.object({
  profileId: z.string().min(1),
});

const updateSipProfileSchema = z.object({
  label: z.string().min(1),
  providerUrl: z.string().min(1),
  sipDomain: z.string().min(1),
  sipUsername: z.string().min(1),
  sipPassword: z.string().optional(),
  callerId: z.string().min(1),
  isShared: z.boolean().default(false),
});

const assignSipProfileSchema = z.object({
  userId: z.string().min(1),
  profileId: z.string().min(1).nullable(),
});

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

export async function listSipProfilesController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const profiles = await listSipProfiles(currentUser);
  return res.json({ profiles });
}

export async function createSipProfileController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = createSipProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid SIP profile payload" });
  }

  const profileInput: CreateSipProfileInput = {
    label: parsed.data.label,
    providerUrl: parsed.data.providerUrl,
    sipDomain: parsed.data.sipDomain,
    sipUsername: parsed.data.sipUsername,
    sipPassword: parsed.data.sipPassword,
    callerId: parsed.data.callerId,
    isShared: parsed.data.isShared,
  };

  const profile = await createSipProfile(profileInput, currentUser);
  return res.status(201).json({ profile });
}

export async function setActiveSipProfileController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = setActiveSipProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid active SIP profile payload" });
  }

  await setActiveSipProfile(parsed.data.profileId, currentUser);
  return res.json({ success: true });
}

export async function updateSipProfileController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = updateSipProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid SIP profile payload" });
  }

  const profileInput: UpdateSipProfileInput = {
    label: parsed.data.label,
    providerUrl: parsed.data.providerUrl,
    sipDomain: parsed.data.sipDomain,
    sipUsername: parsed.data.sipUsername,
    sipPassword: parsed.data.sipPassword,
    callerId: parsed.data.callerId,
    isShared: parsed.data.isShared,
  };

  const profile = await updateSipProfile(req.params.profileId, profileInput, currentUser);
  return res.json({ profile });
}

export async function deleteSipProfileController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  await deleteSipProfile(req.params.profileId, currentUser);
  return res.status(204).send();
}

export async function assignSipProfileController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = assignSipProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid SIP assignment payload" });
  }

  await assignSipProfileToUser(parsed.data.userId, parsed.data.profileId, currentUser);
  return res.json({ success: true });
}
