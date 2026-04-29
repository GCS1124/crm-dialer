import type { Request, Response } from "express";
import { z } from "zod";

import {
  createSipProfile,
  getUserById,
  listSipProfiles,
  setActiveSipProfile,
} from "../services/repository.js";
import type { CreateSipProfileInput } from "../types/index.js";

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
  profileId: z.string().uuid(),
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
