import { Router } from "express";

import {
  dispositionController,
  outboundVoiceWebhookController,
  voiceTokenController,
} from "../controllers/dialerController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const dialerRouter = Router();

dialerRouter.get("/token", requireAuth, asyncHandler(voiceTokenController));
dialerRouter.post("/disposition", requireAuth, asyncHandler(dispositionController));
dialerRouter.post("/voice/outbound", outboundVoiceWebhookController);
