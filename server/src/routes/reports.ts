import { Router } from "express";

import { reportsOverviewController } from "../controllers/reportsController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const reportsRouter = Router();

reportsRouter.get("/overview", requireAuth, requireRole("admin", "team_leader"), asyncHandler(reportsOverviewController));
