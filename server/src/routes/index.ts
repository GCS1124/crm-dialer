import { Router } from "express";

import { authRouter } from "./auth.js";
import { callbacksRouter } from "./callbacks.js";
import { callsRouter } from "./calls.js";
import { dialerRouter } from "./dialer.js";
import { leadsRouter } from "./leads.js";
import { reportsRouter } from "./reports.js";
import { runtimeRouter } from "./runtime.js";
import { usersRouter } from "./users.js";
import { workspaceRouter } from "./workspace.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/runtime", runtimeRouter);
apiRouter.use("/calls", callsRouter);
apiRouter.use("/leads", leadsRouter);
apiRouter.use("/dialer", dialerRouter);
apiRouter.use("/callbacks", callbacksRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/workspace", workspaceRouter);
