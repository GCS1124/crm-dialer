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

function isConfiguredSupabaseUrl() {
  const normalized = normalizeSupabaseUrl().toLowerCase();
  return (
    Boolean(normalized) &&
    normalized.startsWith("https://") &&
    !normalized.includes("your-project.supabase.co")
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
  const configured = isConfiguredSupabaseUrl();
  const host = configured ? extractHost(normalizeSupabaseUrl()) : null;

  if (!configured || !host) {
    return {
      configured,
      reachable: false,
      host,
      reason: "Supabase URL is not configured.",
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
    const dataMode =
      env.DATA_MODE === "supabase"
        ? "supabase"
        : supabase.configured && supabase.reachable
          ? "supabase"
          : "local";

    status = {
      dataMode,
      supabase:
        dataMode === "local" && env.DATA_MODE === "supabase"
          ? {
              ...supabase,
              reason:
                supabase.reason ??
                "Supabase mode is forced by DATA_MODE=supabase, but the host check did not pass.",
            }
          : supabase,
    };
  }

  cachedStatus = status;
  cachedAt = Date.now();
  return status;
}

export async function getDataBackend() {
  return (await getRuntimeStatus()).dataMode;
}
