import { Router } from "express";

import {
  createSipProfileController,
  listSipProfilesController,
  setActiveSipProfileController,
} from "../controllers/sipProfilesController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const sipProfilesRouter = Router();

sipProfilesRouter.get("/", requireAuth, asyncHandler(listSipProfilesController));
sipProfilesRouter.post("/", requireAuth, asyncHandler(createSipProfileController));
sipProfilesRouter.patch("/active", requireAuth, asyncHandler(setActiveSipProfileController));
