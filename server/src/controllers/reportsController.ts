import type { Request, Response } from "express";

import { getUserById, getWorkspace } from "../services/repository.js";

export async function reportsOverviewController(_req: Request, res: Response) {
  const sessionUser = res.locals.user as { sub?: string } | undefined;
  if (!sessionUser?.sub) {
    return res.status(401).json({ message: "Missing session context" });
  }

  const currentUser = await getUserById(sessionUser.sub);
  if (!currentUser) {
    return res.status(404).json({ message: "User not found" });
  }

  const workspace = await getWorkspace(currentUser);
  return res.json({
    analytics: workspace.analytics,
    summary: {
      totalLeads: workspace.leads.length,
      callbacksScheduled: workspace.leads.filter((lead) => lead.callbackTime).length,
      activeLeads: workspace.leads.filter((lead) =>
        [
          "new",
          "contacted",
          "callback_due",
          "follow_up",
          "qualified",
          "appointment_booked",
        ].includes(lead.status),
      ).length,
    },
  });
}
