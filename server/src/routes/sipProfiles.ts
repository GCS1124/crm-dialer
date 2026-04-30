import { Router } from "express";

import {
  assignSipProfileController,
  createSipProfileController,
  deleteSipProfileController,
  listSipProfilesController,
  setActiveSipProfileController,
  updateSipProfileController,
} from "../controllers/sipProfilesController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const sipProfilesRouter = Router();

sipProfilesRouter.use(requireAuth, requireRole("admin"));
sipProfilesRouter.get("/", asyncHandler(listSipProfilesController));
sipProfilesRouter.post("/", asyncHandler(createSipProfileController));
sipProfilesRouter.patch("/active", asyncHandler(setActiveSipProfileController));
sipProfilesRouter.patch("/assign", asyncHandler(assignSipProfileController));
sipProfilesRouter.patch("/:profileId", asyncHandler(updateSipProfileController));
sipProfilesRouter.delete("/:profileId", asyncHandler(deleteSipProfileController));
