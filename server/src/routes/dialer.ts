import { Router } from "express";

import {
  dispositionController,
  failedAttemptController,
  voiceSessionController,
} from "../controllers/dialerController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const dialerRouter = Router();

dialerRouter.get("/session", requireAuth, asyncHandler(voiceSessionController));
dialerRouter.get("/token", requireAuth, asyncHandler(voiceSessionController));
dialerRouter.post("/disposition", requireAuth, asyncHandler(dispositionController));
dialerRouter.post("/attempt", requireAuth, asyncHandler(failedAttemptController));
