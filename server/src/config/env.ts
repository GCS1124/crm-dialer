import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const defaultDataMode = "auto";
const withLegacyFallback = (currentName: string, legacyName: string, fallback: string) =>
  process.env[currentName] ?? process.env[legacyName] ?? fallback;

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATA_MODE: z.enum(["auto", "supabase", "local"]).default(defaultDataMode),
  JWT_SECRET: z.string().default("preview-dialer-jwt-secret-local"),
  SUPABASE_URL: z.string().default("https://your-project.supabase.co"),
  SUPABASE_PUBLISHABLE_KEY: z.string().default("publishable-key"),
  SUPABASE_ANON_KEY: z.string().default("anon-key"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default("service-role-key"),
  VOICE_PROVIDER: z.enum(["embedded-sip"]).default("embedded-sip"),
  SIP_WEBSOCKET_URL: z
    .string()
    .default(withLegacyFallback("SIP_WEBSOCKET_URL", "UNIFIED_VOICE_WEBSOCKET_URL", "wss://sip.example.com")),
  SIP_DOMAIN: z
    .string()
    .default(withLegacyFallback("SIP_DOMAIN", "UNIFIED_VOICE_SIP_DOMAIN", "sip.example.com")),
  SIP_USERNAME: z
    .string()
    .default(withLegacyFallback("SIP_USERNAME", "UNIFIED_VOICE_SIP_USERNAME", "agent1001")),
  SIP_PASSWORD: z
    .string()
    .default(withLegacyFallback("SIP_PASSWORD", "UNIFIED_VOICE_SIP_PASSWORD", "replace-with-sip-password")),
  SIP_OUTBOUND_CALLER_ID: z
    .string()
    .default(withLegacyFallback("SIP_OUTBOUND_CALLER_ID", "UNIFIED_VOICE_OUTBOUND_CALLER_ID", "+10000000000")),
  SIP_DIAL_PREFIX: z
    .string()
    .default(withLegacyFallback("SIP_DIAL_PREFIX", "UNIFIED_VOICE_DIAL_PREFIX", "")),
  AUTH_SEED_PASSWORD: z.string().default("ChangeMeSeedPass!2026"),
});

export const env = schema.parse(process.env);
