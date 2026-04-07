import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().default("preview-dialer-secret"),
  SUPABASE_URL: z.string().default("https://your-project.supabase.co"),
  SUPABASE_PUBLISHABLE_KEY: z.string().default("publishable-key"),
  SUPABASE_ANON_KEY: z.string().default("anon-key"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default("service-role-key"),
  TWILIO_ACCOUNT_SID: z.string().default("ACxxxxxxxx"),
  TWILIO_API_KEY: z.string().default("SKxxxxxxxx"),
  TWILIO_API_SECRET: z.string().default("twilio-api-secret"),
  TWILIO_APP_SID: z.string().default("APxxxxxxxx"),
  TWILIO_OUTBOUND_CALLER_ID: z.string().default("+10000000000"),
  AUTH_SEED_PASSWORD: z.string().default("ChangeMeSeedPass!2026"),
});

export const env = schema.parse(process.env);
