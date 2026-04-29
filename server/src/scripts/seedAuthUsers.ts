import { env } from "../config/env.js";
import { supabaseAdmin } from "../services/supabaseAdmin.js";

interface AuthAdminUser {
  id: string;
  email?: string;
}

interface AuthAdminListResponse {
  users: AuthAdminUser[];
}

const shouldResetPasswords = process.argv.includes("--reset-passwords");

function getAdminHeaders() {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function listWorkspaceUsers() {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, full_name, email")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load workspace users: ${error.message}`);
  }

  return (data ?? []) as Array<{ id: string; full_name: string; email: string }>;
}

async function listAuthUsers() {
  const response = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`,
    {
      headers: getAdminHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to list auth users: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as AuthAdminListResponse;
}

async function createAuthUser(email: string, name: string) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({
      email,
      password: env.AUTH_SEED_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: name,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to create auth user ${email}: ${errorText}`);
  }
}

async function updateAuthUser(userId: string) {
  const payload: {
    email_confirm: boolean;
    password?: string;
  } = {
    email_confirm: true,
  };

  if (shouldResetPasswords) {
    payload.password = env.AUTH_SEED_PASSWORD;
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to update auth user ${userId}: ${errorText}`);
  }
}

async function main() {
  const [workspaceUsers, existingUsers] = await Promise.all([
    listWorkspaceUsers(),
    listAuthUsers(),
  ]);

  for (const user of workspaceUsers) {
    const existing = existingUsers.users.find(
      (authUser) => authUser.email?.toLowerCase() === user.email.toLowerCase(),
    );

    if (existing) {
      await updateAuthUser(existing.id);
      console.log(
        shouldResetPasswords
          ? `Updated auth user and reset password: ${user.email}`
          : `Updated auth user without changing password: ${user.email}`,
      );
      continue;
    }

    await createAuthUser(user.email, user.full_name);
    console.log(`Created auth user: ${user.email}`);
  }

  console.log(
    shouldResetPasswords
      ? "Auth user seeding complete with password resets."
      : "Auth user seeding complete without resetting existing passwords.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
