import { Router } from "express";

import {
  createCallController,
  deleteCallController,
  listCallsController,
  updateCallController,
} from "../controllers/callsController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const callsRouter = Router();

callsRouter.use(requireAuth);
callsRouter.get("/", asyncHandler(listCallsController));
callsRouter.post("/", asyncHandler(createCallController));
callsRouter.patch("/:callId", asyncHandler(updateCallController));
callsRouter.delete("/:callId", asyncHandler(deleteCallController));
