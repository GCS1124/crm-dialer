import type { NextFunction, Request, Response } from "express";

import {
  getUserByAuthUserId,
  getUserByEmail,
  syncAuthUserLink,
} from "../services/repository.js";
import { verifyAccessToken } from "../services/supabaseAuthService.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  try {
    const token = header.replace("Bearer ", "");
    const authResult = await verifyAccessToken(token);
    if (!authResult.success || !authResult.data.user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const authUser = authResult.data.user;
    let user = await getUserByAuthUserId(authUser.id);

    if (!user && authUser.email) {
      await syncAuthUserLink(authUser.email, authUser.id);
      user = await getUserByAuthUserId(authUser.id);
      user = user ?? (await getUserByEmail(authUser.email));
    }

    if (!user) {
      return res.status(403).json({
        message:
          "Your Supabase account is valid, but no CRM role is assigned yet. Contact an administrator.",
      });
    }

    res.locals.user = {
      sub: user.id,
      role: user.role,
      email: user.email,
      authUserId: authUser.id,
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
