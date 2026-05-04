import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: "admin" | "team_leader" | "agent";
  team_name: string;
  title: string | null;
  timezone: string;
  status: "online" | "away" | "offline";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function mapUser(row: AppUserRow) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    team: row.team_name,
    timezone: row.timezone,
    avatar: getInitials(row.full_name),
    title: row.title ?? "Outbound Agent",
    status: row.status,
    activeSipProfileId: null,
    activeSipProfileLabel: null,
  };
}

function buildTemporaryPassword() {
  return `Dialer${Math.random().toString(36).slice(2, 8)}!2026`;
}

async function requireAdminUser(request: Request) {
  const currentUser = await getAuthenticatedUser(request);
  if (!currentUser) {
    throw new Error("Missing authentication.");
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("auth_user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.role !== "admin") {
    const status = data ? 403 : 401;
    const message = data ? "Only administrators can manage workspace users." : "Missing workspace profile.";
    throw Object.assign(new Error(message), { status });
  }

  return { currentUser, workspaceUser: data as AppUserRow, serviceClient };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json().catch(() => ({}))
      : {};
    const action = typeof body.action === "string" ? body.action : "";
    const { workspaceUser, serviceClient } = await requireAdminUser(request);

    if (action === "create") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const role = body.role === "admin" || body.role === "team_leader" || body.role === "agent" ? body.role : "agent";
      const team = typeof body.team === "string" ? body.team.trim() : "";
      const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "UTC";
      const title = typeof body.title === "string" ? body.title.trim() : "Outbound Agent";

      if (!name || !email || !team) {
        return jsonResponse({ message: "Name, email, and team are required." }, { status: 400 });
      }

      const temporaryPassword = buildTemporaryPassword();
      const { data: authResult, error: authError } = await serviceClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          role,
          team,
          title,
        },
      });

      if (authError || !authResult.user) {
        return jsonResponse(
          { message: authError?.message ?? "Unable to create auth user." },
          { status: 400 },
        );
      }

      const { data: inserted, error: insertError } = await serviceClient
        .from("app_users")
        .insert({
          auth_user_id: authResult.user.id,
          full_name: name,
          email,
          role,
          team_name: team,
          title,
          timezone,
          status: "offline",
        })
        .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
        .single();

      if (insertError || !inserted) {
        await serviceClient.auth.admin.deleteUser(authResult.user.id, false).catch(() => void 0);
        return jsonResponse(
          { message: insertError?.message ?? "Unable to create workspace user." },
          { status: 400 },
        );
      }

      await serviceClient.from("audit_logs").insert({
        actor_id: workspaceUser.id,
        entity_type: "user",
        entity_id: inserted.id,
        action: "create_user",
        metadata: { email: inserted.email, role: inserted.role },
      });

      return jsonResponse({
        user: mapUser(inserted as AppUserRow),
        temporaryPassword,
      });
    }

    if (action === "delete") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) {
        return jsonResponse({ message: "userId is required." }, { status: 400 });
      }

      if (userId === workspaceUser.id) {
        return jsonResponse({ message: "You cannot delete your own admin account." }, { status: 400 });
      }

      const { data: targetUser, error: targetError } = await serviceClient
        .from("app_users")
        .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
        .eq("id", userId)
        .maybeSingle();

      if (targetError) {
        return jsonResponse({ message: targetError.message }, { status: 500 });
      }

      if (!targetUser) {
        return jsonResponse({ message: "User not found." }, { status: 404 });
      }

      const { error: deleteError } = await serviceClient.from("app_users").delete().eq("id", userId);
      if (deleteError) {
        return jsonResponse({ message: deleteError.message }, { status: 500 });
      }

      if (targetUser.auth_user_id) {
        const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(targetUser.auth_user_id, false);
        if (authDeleteError) {
          return jsonResponse(
            {
              message:
                "Workspace user deleted, but the linked auth account could not be removed.",
            },
            { status: 500 },
          );
        }
      }

      await serviceClient.from("audit_logs").insert({
        actor_id: workspaceUser.id,
        entity_type: "user",
        entity_id: targetUser.id,
        action: "delete_user",
        metadata: { email: targetUser.email },
      });

      return jsonResponse({ success: true });
    }

    return jsonResponse({ message: "Unsupported workspace user action." }, { status: 400 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? (error as { status?: number }).status ?? 500 : 500;
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Unable to manage workspace users." },
      { status },
    );
  }
});
