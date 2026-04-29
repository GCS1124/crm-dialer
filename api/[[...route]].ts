import { createApp } from "../server/src/app";

const app = createApp({
  apiMounts: ["/", "/api"],
  healthMounts: ["/health", "/api/health"],
});

export default app;
