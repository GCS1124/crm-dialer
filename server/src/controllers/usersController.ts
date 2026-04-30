import type { Request, Response } from "express";
import { z } from "zod";

import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  getUserById,
  listUsers,
  updateWorkspaceUserStatus,
} from "../services/repository.js";
import type { CreateUserInput } from "../types/index.js";

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "team_leader", "agent"]),
  team: z.string().min(1),
  timezone: z.string().min(1),
  title: z.string().min(1),
});

const userStatusSchema = z.object({
  status: z.enum(["online", "away", "offline"]),
});

async function getCurrentUser(res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return null;
  }

  return getUserById(sessionUser.sub);
}

export async function listUsersController(_req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const items = await listUsers();
  return res.json({
    items,
    total: items.length,
  });
}

export async function inviteUserController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid user payload" });
  }

  const userInput: CreateUserInput = {
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    team: parsed.data.team,
    timezone: parsed.data.timezone,
    title: parsed.data.title,
  };

  const result = await createWorkspaceUser(userInput, currentUser);
  return res.status(201).json(result);
}

export async function updateUserStatusController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const parsed = userStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid status payload" });
  }

  await updateWorkspaceUserStatus(req.params.userId, parsed.data.status, currentUser);
  return res.json({ success: true });
}

export async function deleteUserController(req: Request, res: Response) {
  const currentUser = await getCurrentUser(res);
  if (!currentUser) {
    return res.status(401).json({ message: "Missing session context" });
  }

  await deleteWorkspaceUser(req.params.userId, currentUser);
  return res.status(204).send();
}
