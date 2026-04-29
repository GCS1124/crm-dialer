import { lookup } from "node:dns/promises";

import { env } from "../config/env.js";

export type RuntimeDataMode = "supabase" | "local";

export interface RuntimeStatus {
  dataMode: RuntimeDataMode;
  supabase: {
    configured: boolean;
    reachable: boolean;
    host: string | null;
    reason: string | null;
  };
}

const CACHE_TTL_MS = 30_000;

let cachedStatus: RuntimeStatus | null = null;
let cachedAt = 0;

function normalizeSupabaseUrl() {
  return env.SUPABASE_URL.trim();
}

function normalizeSupabaseKey(value: string) {
  return value.trim().toLowerCase();
}

function isConfiguredSupabaseUrl() {
  const normalized = normalizeSupabaseUrl().toLowerCase();
  return (
    Boolean(normalized) &&
    normalized.startsWith("https://") &&
    !normalized.includes("your-project.supabase.co")
  );
}

function isConfiguredSupabasePublishableKey() {
  const normalized = normalizeSupabaseKey(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY);

  return (
    normalized.length > 20 &&
    !["publishable-key", "anon-key", "your-supabase-publishable-key", "your-supabase-anon-key"].includes(
      normalized,
    ) &&
    !normalized.startsWith("replace-with-")
  );
}

function isConfiguredSupabaseServiceRoleKey() {
  const normalized = normalizeSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    normalized.length > 20 &&
    !["service-role-key", "your-service-role-key"].includes(normalized) &&
    !normalized.startsWith("replace-with-")
  );
}

function extractHost(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

async function probeSupabaseHost() {
  const urlConfigured = isConfiguredSupabaseUrl();
  const publishableKeyConfigured = isConfiguredSupabasePublishableKey();
  const serviceRoleConfigured = isConfiguredSupabaseServiceRoleKey();
  const configured = urlConfigured && publishableKeyConfigured && serviceRoleConfigured;
  const host = urlConfigured ? extractHost(normalizeSupabaseUrl()) : null;

  if (!urlConfigured) {
    return {
      configured: false,
      reachable: false,
      host,
      reason: "Supabase URL is not configured.",
    };
  }

  if (!publishableKeyConfigured) {
    return {
      configured: false,
      reachable: false,
      host,
      reason: "Supabase publishable credentials are not configured.",
    };
  }

  if (!serviceRoleConfigured) {
    return {
      configured: false,
      reachable: false,
      host,
      reason: "Supabase service role credentials are not configured.",
    };
  }

  if (!host) {
    return {
      configured: false,
      reachable: false,
      host,
      reason: "Supabase URL is invalid.",
    };
  }

  try {
    await lookup(host);
    return {
      configured: true,
      reachable: true,
      host,
      reason: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The configured Supabase host could not be resolved.";

    return {
      configured: true,
      reachable: false,
      host,
      reason: `The configured Supabase host is unreachable: ${message}`,
    };
  }
}

function buildExplicitLocalStatus(): RuntimeStatus {
  return {
    dataMode: "local",
    supabase: {
      configured: isConfiguredSupabaseUrl(),
      reachable: false,
      host: extractHost(normalizeSupabaseUrl()),
      reason: "Local development mode is forced by DATA_MODE=local.",
    },
  };
}

export async function getRuntimeStatus(forceRefresh = false): Promise<RuntimeStatus> {
  if (!forceRefresh && cachedStatus && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }

  let status: RuntimeStatus;
  if (env.DATA_MODE === "local") {
    status = buildExplicitLocalStatus();
  } else {
    const supabase = await probeSupabaseHost();
    const canUseSupabase = supabase.configured && supabase.reachable;
    const dataMode = canUseSupabase ? "supabase" : "local";
    const fallbackReason =
      env.DATA_MODE === "supabase" && !canUseSupabase
        ? `Supabase mode was requested, but ${supabase.reason?.toLowerCase() ?? "the configuration check did not pass"}. Falling back to local mode.`
        : supabase.reason;

    status = {
      dataMode,
      supabase: {
        ...supabase,
        reason: dataMode === "local" ? fallbackReason : supabase.reason,
      },
    };
  }

  cachedStatus = status;
  cachedAt = Date.now();
  return status;
}

export async function getDataBackend() {
  return (await getRuntimeStatus()).dataMode;
}
