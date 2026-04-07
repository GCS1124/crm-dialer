import { Router } from "express";

import {
  completeCallbackController,
  listCallbacksController,
  reopenLeadController,
  rescheduleCallbackController,
} from "../controllers/callbacksController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const callbacksRouter = Router();

callbacksRouter.use(requireAuth);
callbacksRouter.get("/", asyncHandler(listCallbacksController));
callbacksRouter.patch("/:leadId/reschedule", asyncHandler(rescheduleCallbackController));
callbacksRouter.patch("/:leadId/complete", asyncHandler(completeCallbackController));
callbacksRouter.patch("/:leadId/reopen", asyncHandler(reopenLeadController));
