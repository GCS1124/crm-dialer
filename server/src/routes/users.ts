import { Router } from "express";

import {
  deleteUserController,
  inviteUserController,
  listUsersController,
  updateUserStatusController,
} from "../controllers/usersController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("admin"));
usersRouter.get("/", asyncHandler(listUsersController));
usersRouter.post("/", asyncHandler(inviteUserController));
usersRouter.patch("/:userId/status", asyncHandler(updateUserStatusController));
usersRouter.delete("/:userId", asyncHandler(deleteUserController));
