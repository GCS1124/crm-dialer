import { env } from "../config/env.js";

interface SupabaseAuthResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
  };
}

function getAuthHeaders() {
  return {
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, password }),
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { msg?: string; message?: string; error_description?: string }
      | null;

    return {
      success: false as const,
      message:
        error?.msg ??
        error?.message ??
        error?.error_description ??
        "Unable to sign in with those credentials.",
    };
  }

  const payload = (await response.json()) as SupabaseAuthResponse;
  return {
    success: true as const,
    data: payload,
  };
}
