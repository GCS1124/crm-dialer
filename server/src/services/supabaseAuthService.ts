import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { authenticateLocalUser } from "./localRepository.js";
import { getDataBackend } from "./runtimeMode.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

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

interface LocalTokenPayload {
  sub: string;
  authUserId: string;
  email: string;
  mode: "local";
}

function getAuthHeaders() {
  return {
    apikey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
}

function createLocalAccessToken(payload: LocalTokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "8h",
  });
}

export async function signInWithPassword(email: string, password: string) {
  if ((await getDataBackend()) === "local") {
    const user = await authenticateLocalUser(email, password);
    if (!user) {
      return {
        success: false as const,
        message:
          "Account not found in the local workspace. Create a new account from the signup page or switch the backend to a live Supabase project.",
      };
    }

    return {
      success: true as const,
      data: {
        access_token: createLocalAccessToken({
          sub: user.id,
          authUserId: user.authUserId,
          email: user.email,
          mode: "local",
        }),
        expires_in: 8 * 60 * 60,
        refresh_token: "",
        token_type: "bearer",
        user: {
          id: user.authUserId,
          email: user.email,
        },
      },
    };
  }

  try {
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
  } catch (error) {
    return {
      success: false as const,
      message:
        error instanceof Error
          ? `Supabase sign-in request failed: ${error.message}`
          : "Supabase sign-in request failed.",
    };
  }
}

export async function verifyAccessToken(token: string) {
  if ((await getDataBackend()) === "local") {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as LocalTokenPayload;
      return {
        success: true as const,
        data: {
          user: {
            id: payload.authUserId,
            email: payload.email,
          },
        },
      };
    } catch {
      return {
        success: false as const,
        message: "Invalid or expired local session token",
      };
    }
  }

  try {
    const authResult = await supabaseAdmin.auth.getUser(token);
    if (authResult.error || !authResult.data.user) {
      return {
        success: false as const,
        message: "Invalid or expired Supabase session token",
      };
    }

    return {
      success: true as const,
      data: {
        user: {
          id: authResult.data.user.id,
          email: authResult.data.user.email ?? "",
        },
      },
    };
  } catch {
    return {
      success: false as const,
      message: "Unable to validate the session token",
    };
  }
}
