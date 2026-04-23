import cors from "cors";
import express from "express";

import { apiRouter } from "./routes/index.js";

interface CreateAppOptions {
  apiMounts?: string[];
  healthMounts?: string[];
}

function normalizeMounts(mounts: string[] | undefined, fallback: string[]) {
  return [...new Set((mounts ?? fallback).map((mount) => mount.trim() || "/"))];
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const apiMounts = normalizeMounts(options.apiMounts, ["/api"]);
  const healthMounts = normalizeMounts(options.healthMounts, ["/health"]);

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  for (const mount of healthMounts) {
    app.get(mount, (_req, res) => {
      res.json({ status: "ok" });
    });
  }

  for (const mount of apiMounts) {
    if (mount === "/") {
      app.use(apiRouter);
      continue;
    }

    app.use(mount, apiRouter);
  }

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({
      message: error.message || "Internal server error",
    });
  });

  return app;
}
