import { Router } from "express";

import { workspaceController } from "../controllers/workspaceController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const workspaceRouter = Router();

workspaceRouter.get("/", requireAuth, asyncHandler(workspaceController));
