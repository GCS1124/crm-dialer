import type { Request, Response } from "express";
import { z } from "zod";

import { getUserByEmail, getUserById, syncAuthUserLink } from "../services/repository.js";
import { signInWithPassword } from "../services/supabaseAuthService.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  team: z.string().min(2),
  timezone: z.string().min(2),
  title: z.string().min(2),
});

export async function loginController(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid login payload" });
  }

  const authResult = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!authResult.success) {
    return res.status(401).json({ message: authResult.message });
  }

  const user = await getUserByEmail(parsed.data.email);
  if (!user) {
    return res.status(403).json({
      message:
        "Your account is valid in Auth, but no application role is assigned yet. Contact an administrator.",
    });
  }

  await syncAuthUserLink(parsed.data.email, authResult.data.user.id);

  return res.json({
    token: authResult.data.access_token,
    refreshToken: authResult.data.refresh_token,
    user,
  });
}

export async function meController(_req: Request, res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const user = await getUserById(sessionUser.sub);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({ user });
}

export async function signupController(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid signup payload" });
  }
  return res.status(403).json({
    message: "Account creation is managed by an administrator.",
  });
}
