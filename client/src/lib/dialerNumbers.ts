import type { Lead } from "../types";
import { formatPhone } from "./utils";

export interface DialDestinationOption {
  value: string;
  label: string;
  phoneIndex?: number;
}

function normalizeDialNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function addOption(
  options: DialDestinationOption[],
  seen: Set<string>,
  rawValue: string,
  label: string,
  phoneIndex?: number,
) {
  const value = normalizeDialNumber(rawValue);
  if (!value || seen.has(value)) {
    return;
  }

  seen.add(value);
  options.push({
    value,
    label,
    phoneIndex,
  });
}

export function buildLeadDestinationOptions(
  lead: Pick<Lead, "phone" | "altPhone" | "phoneNumbers"> | null | undefined,
) {
  const options: DialDestinationOption[] = [];
  const seen = new Set<string>();
  const phoneNumbers = lead?.phoneNumbers?.length
    ? lead.phoneNumbers
    : [lead?.phone ?? "", lead?.altPhone ?? ""];

  phoneNumbers.forEach((phoneNumber, index) => {
    const labelPrefix = lead?.phoneNumbers?.length
      ? `Phone ${index + 1}`
      : index === 0
        ? "Primary"
        : "Alternate";

    addOption(options, seen, phoneNumber, `${labelPrefix} · ${formatPhone(phoneNumber)}`, index);
  });

  return options;
}

export function buildWorkspaceDestinationOptions(leads: Array<Pick<Lead, "fullName" | "phone" | "altPhone" | "phoneNumbers">>) {
  const options: DialDestinationOption[] = [];
  const seen = new Set<string>();

  leads.forEach((lead) => {
    const phoneNumbers = lead.phoneNumbers?.length ? lead.phoneNumbers : [lead.phone, lead.altPhone];

    phoneNumbers.forEach((phoneNumber) => {
      addOption(options, seen, phoneNumber, `${lead.fullName} · ${formatPhone(phoneNumber)}`);
    });
  });

  return options;
}
