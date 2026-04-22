import type { Request, Response } from "express";

import { getUserById, getWorkspace } from "../services/repository.js";

export async function workspaceController(_req: Request, res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const user = await getUserById(sessionUser.sub);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json(await getWorkspace(user));
}
