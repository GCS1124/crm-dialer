import { Router } from "express";

import { loginController, meController, signupController } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post("/signup", asyncHandler(signupController));
authRouter.post("/login", asyncHandler(loginController));
authRouter.get("/me", requireAuth, asyncHandler(meController));
