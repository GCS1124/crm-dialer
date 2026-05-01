import { Router } from "express";

import {
  advanceQueueController,
  getQueueController,
  restartQueueController,
  saveQueueController,
} from "../controllers/queueController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const queueRouter = Router();

queueRouter.get("/", requireAuth, asyncHandler(getQueueController));
queueRouter.put("/", requireAuth, asyncHandler(saveQueueController));
queueRouter.post("/advance", requireAuth, asyncHandler(advanceQueueController));
queueRouter.post("/restart", requireAuth, asyncHandler(restartQueueController));
