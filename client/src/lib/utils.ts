import clsx from "clsx";

import type {
  CallDisposition,
  LeadPriority,
  LeadStatus,
  UserRole,
} from "../types";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return clsx(inputs);
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not contacted yet";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function formatPhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+1") && digits.length === 12) {
    return `${digits.slice(0, 2)} (${digits.slice(2, 5)}) ${digits.slice(
      5,
      8,
    )}-${digits.slice(8)}`;
  }

  return value;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function getDispositionTone(disposition: CallDisposition) {
  const palette: Record<CallDisposition, string> = {
    "No Answer": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    Busy: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    Voicemail:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    "Wrong Number":
      "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    "Not Interested":
      "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    Interested:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    "Call Back Later":
      "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
    "Follow-Up Required":
      "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    "Appointment Booked":
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    "Sale Closed":
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  };

  return palette[disposition];
}

export function getLeadStatusTone(status: LeadStatus) {
  const palette: Record<LeadStatus, string> = {
    new: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    contacted:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    callback_due:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
    follow_up:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    qualified:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    appointment_booked:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    closed_won:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    closed_lost:
      "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    invalid:
      "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  };

  return palette[status];
}

export function getPriorityTone(priority: LeadPriority) {
  const palette: Record<LeadPriority, string> = {
    Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    High: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    Urgent: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  };

  return palette[priority];
}

export function getRoleLabel(role: UserRole) {
  const labels: Record<UserRole, string> = {
    admin: "Admin",
    team_leader: "Team Leader",
    agent: "Agent",
  };

  return labels[role];
}

export function toSentenceCase(value: string) {
  return value
    .split("_")
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function isPast(value?: string | null) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() < Date.now();
}

export function toDatetimeLocalInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
