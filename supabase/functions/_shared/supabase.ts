import { createClient, type SupabaseClient, type User as SupabaseUser } from "npm:@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";

function requireEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`);
  }

  return value;
}

export function createAnonClient(authorization?: string | null) {
  return createClient(
    requireEnv(supabaseUrl, "SUPABASE_URL"),
    requireEnv(supabaseAnonKey, "SUPABASE_ANON_KEY"),
    {
      global: authorization
        ? {
            headers: { Authorization: authorization },
          }
        : undefined,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function createServiceClient() {
  return createClient(
    requireEnv(supabaseUrl, "SUPABASE_URL"),
    requireEnv(supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return null;
  }

  const client = createAnonClient(authorization);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user as SupabaseUser;
}

export type { SupabaseClient, SupabaseUser };
