import { Router } from "express";

import {
  bulkDeleteController,
  assignLeadController,
  bulkStatusController,
  listLeadsController,
  markLeadInvalidController,
  uploadLeadsController,
} from "../controllers/leadsController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const leadsRouter = Router();

leadsRouter.use(requireAuth);
leadsRouter.get("/", asyncHandler(listLeadsController));
leadsRouter.post("/upload", requireRole("admin", "team_leader", "agent"), asyncHandler(uploadLeadsController));
leadsRouter.post("/bulk-status", requireRole("admin", "team_leader"), asyncHandler(bulkStatusController));
leadsRouter.post("/bulk-delete", requireRole("admin", "team_leader"), asyncHandler(bulkDeleteController));
leadsRouter.patch("/:leadId/assign", requireRole("admin", "team_leader"), asyncHandler(assignLeadController));
leadsRouter.patch("/:leadId/invalid", asyncHandler(markLeadInvalidController));
