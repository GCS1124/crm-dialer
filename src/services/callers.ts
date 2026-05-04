import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import { refreshCallerListCounts } from "@/services/caller-lists";
import type { DialMode, QueueFilter } from "@/types/app";

export async function getCallersByList(listId?: string, tab?: QueueFilter, search?: string) {
  assertSupabaseConfigured();
  if (!listId) return [];

  let query = supabase
    .from("callers")
    .select("*")
    .eq("caller_list_id", listId)
    .order("updated_at", { ascending: true });

  if (tab === "callback") {
    query = query.eq("status", "callback");
  } else if (tab === "completed") {
    query = query.eq("status", "completed");
  } else {
    query = query.in("status", ["pending", "in_progress", "failed", "dnc"]);
  }

  if (search) {
    const safe = search.replaceAll(",", " ");
    query = query.or(
      `full_name.ilike.%${safe}%,phone.ilike.%${safe}%,company.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function searchCallers(term: string) {
  assertSupabaseConfigured();
  if (!term.trim()) return [];
  const safe = term.replaceAll(",", " ");
  const { data, error } = await supabase
    .from("callers")
    .select("*")
    .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  return data;
}

export async function getCallHistory(callerId?: string) {
  assertSupabaseConfigured();
  if (!callerId) return [];

  const { data, error } = await supabase
    .from("call_logs")
    .select("*")
    .eq("caller_id", callerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getCallerNotes(callerId?: string) {
  assertSupabaseConfigured();
  if (!callerId) return [];
  const { data, error } = await supabase
    .from("caller_notes")
    .select("*")
    .eq("caller_id", callerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getFollowUps(callerId?: string) {
  assertSupabaseConfigured();
  if (!callerId) return [];
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .eq("caller_id", callerId)
    .order("due_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function saveCallerNote(callerId: string, agentId: string, note: string) {
  assertSupabaseConfigured();
  const { error } = await supabase.from("caller_notes").insert({
    caller_id: callerId,
    agent_id: agentId,
    note,
  });
  if (error) throw error;
}

export async function saveFollowUp(input: {
  callerId: string;
  agentId: string;
  dueAt: string;
  note?: string;
  type?: string;
}) {
  assertSupabaseConfigured();
  const { error } = await supabase.from("follow_ups").insert({
    caller_id: input.callerId,
    assigned_to: input.agentId,
    due_at: input.dueAt,
    note: input.note ?? null,
    type: input.type ?? "callback",
    status: "pending",
  });
  if (error) throw error;

  const { error: callerError } = await supabase
    .from("callers")
    .update({
      status: "callback",
      next_follow_up_at: input.dueAt,
    })
    .eq("id", input.callerId);

  if (callerError) throw callerError;
}

export async function logCallOutcome(input: {
  callerId?: string | null;
  listId?: string | null;
  agentId: string;
  phoneNumber: string;
  dialMode: DialMode;
  startedAt?: string | null;
  endedAt?: string | null;
  status?: string;
  disposition?: string;
  notes?: string;
  callerStatus?: "pending" | "in_progress" | "completed" | "callback" | "failed" | "dnc";
  nextFollowUpAt?: string | null;
}) {
  assertSupabaseConfigured();
  const startedAt = input.startedAt ?? new Date().toISOString();
  const endedAt = input.endedAt ?? new Date().toISOString();

  const durationSeconds = Math.max(
    0,
    Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
    ),
  );

  const { error: logError } = await supabase.from("call_logs").insert({
    caller_id: input.callerId ?? null,
    agent_id: input.agentId,
    phone_number: input.phoneNumber,
    dial_mode: input.dialMode,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    status: input.status ?? input.callerStatus ?? "completed",
    disposition: input.disposition ?? null,
    notes: input.notes ?? null,
  });

  if (logError) throw logError;

  if (input.callerId) {
    const { error: callerError } = await supabase
      .from("callers")
      .update({
        status: input.callerStatus ?? "completed",
        disposition: (input.disposition as never) ?? null,
        notes: input.notes ?? null,
        last_called_at: endedAt,
        next_follow_up_at: input.nextFollowUpAt ?? null,
      })
      .eq("id", input.callerId);

    if (callerError) throw callerError;
  }

  if (input.listId) {
    await refreshCallerListCounts(input.listId);
  }
}

export async function updateCallerStatus(input: {
  callerId: string;
  listId: string;
  status: "pending" | "in_progress" | "completed" | "callback" | "failed" | "dnc";
  disposition?: string | null;
}) {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from("callers")
    .update({
      status: input.status,
      disposition: (input.disposition as never) ?? null,
      last_called_at: input.status === "in_progress" ? new Date().toISOString() : undefined,
    })
    .eq("id", input.callerId);

  if (error) throw error;
  await refreshCallerListCounts(input.listId);
}
