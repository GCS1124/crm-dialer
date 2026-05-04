import { format, formatDistanceToNow, intervalToDuration } from "date-fns";

export function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  return format(new Date(value), "dd MMM yyyy, hh:mm a");
}

export function formatRelative(value?: string | null) {
  if (!value) return "just now";
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function formatDuration(start?: string | null, end?: string | null) {
  if (!start || !end) return "0s";
  const duration = intervalToDuration({
    start: new Date(start),
    end: new Date(end),
  });
  if (duration.hours) return `${duration.hours}h ${duration.minutes ?? 0}m`;
  if (duration.minutes) return `${duration.minutes}m ${duration.seconds ?? 0}s`;
  return `${duration.seconds ?? 0}s`;
}

export function initials(value?: string | null) {
  if (!value) return "AG";
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
