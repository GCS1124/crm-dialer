import { Router } from "express";

import { runtimeController } from "../controllers/runtimeController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const runtimeRouter = Router();

runtimeRouter.get("/", asyncHandler(runtimeController));
