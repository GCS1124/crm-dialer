import { createApp } from "../server/src/app.js";

const app = createApp({
  apiMounts: ["/", "/api"],
  healthMounts: ["/health", "/api/health"],
});

export default app;
