import type { NextFunction, Request, Response } from "express";

import type { ApiUserRole } from "../types/index.js";

export function requireRole(...roles: ApiUserRole[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as { role?: ApiUserRole } | undefined;
    if (!user?.role || !roles.includes(user.role)) {
      return res.status(403).json({ message: "You do not have permission for this action" });
    }

    return next();
  };
}
