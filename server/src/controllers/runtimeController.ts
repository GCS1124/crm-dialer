import type { Request, Response } from "express";

import { getRuntimeStatus } from "../services/runtimeMode.js";
import { getTwilioVoiceConfig } from "../services/twilioService.js";

export async function runtimeController(_req: Request, res: Response) {
  const runtime = await getRuntimeStatus(true);
  const twilio = getTwilioVoiceConfig();

  const message =
    runtime.dataMode === "supabase"
      ? "Live Supabase mode is active."
      : runtime.supabase.reason ??
        "Supabase is unavailable, so the workspace is running in local development mode.";

  return res.json({
    backend: "ok" as const,
    dataMode: runtime.dataMode,
    signupEnabled: true,
    message,
    supabase: runtime.supabase,
    twilio: {
      available: twilio.available,
    },
  });
}
