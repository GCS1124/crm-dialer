import { read, utils } from "xlsx";

import type { LeadImportRecord, LeadPriority, LeadStatus } from "../types";

const defaultStatus: LeadStatus = "new";
const defaultPriority: LeadPriority = "Medium";

const fieldMap: Record<string, keyof LeadImportRecord> = {
  full_name: "fullName",
  fullname: "fullName",
  name: "fullName",
  phone: "phone",
  alt_phone: "altPhone",
  alternate_number: "altPhone",
  altphone: "altPhone",
  email: "email",
  company: "company",
  company_name: "company",
  job_title: "jobTitle",
  title: "jobTitle",
  location: "location",
  source: "source",
  lead_source: "source",
  interest: "interest",
  product: "interest",
  service: "interest",
  status: "status",
  notes: "notes",
  last_contacted: "lastContacted",
  assigned_agent: "assignedAgentName",
  assigned_agent_name: "assignedAgentName",
  callback_time: "callbackTime",
  priority: "priority",
};

function splitCsvLine(line: string) {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      columns.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  columns.push(current.trim());
  return columns.map((column) => column.replace(/^"|"$/g, ""));
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseStatus(value: string): LeadStatus {
  const normalized = normalize(value);
  const allowed: LeadStatus[] = [
    "new",
    "contacted",
    "callback_due",
    "follow_up",
    "qualified",
    "appointment_booked",
    "closed_won",
    "closed_lost",
    "invalid",
  ];

  if (allowed.includes(normalized as LeadStatus)) {
    return normalized as LeadStatus;
  }

  return defaultStatus;
}

function parsePriority(value: string): LeadPriority {
  const normalized = value.trim().toLowerCase();
  if (normalized === "low") {
    return "Low";
  }
  if (normalized === "high") {
    return "High";
  }
  if (normalized === "urgent") {
    return "Urgent";
  }
  return defaultPriority;
}

function createEmptyRow(): LeadImportRecord {
  return {
    fullName: "",
    phone: "",
    altPhone: "",
    email: "",
    company: "",
    jobTitle: "",
    location: "",
    source: "",
    interest: "",
    status: defaultStatus,
    notes: "",
    lastContacted: null,
    assignedAgentName: "",
    callbackTime: null,
    priority: defaultPriority,
  };
}

function parseMappedRows(rawRows: Array<Record<string, unknown>>) {
  let invalidRows = 0;
  const rows: LeadImportRecord[] = [];

  rawRows.forEach((rawRow) => {
    const row = createEmptyRow();

    Object.entries(rawRow).forEach(([header, rawValue]) => {
      const mappedField = fieldMap[normalize(header)];
      if (!mappedField) {
        return;
      }

      const value = String(rawValue ?? "").trim();
      if (mappedField === "status") {
        row.status = parseStatus(value);
        return;
      }

      if (mappedField === "priority") {
        row.priority = parsePriority(value);
        return;
      }

      if (mappedField === "lastContacted") {
        row.lastContacted = value ? new Date(value).toISOString() : null;
        return;
      }

      if (mappedField === "callbackTime") {
        row.callbackTime = value ? new Date(value).toISOString() : null;
        return;
      }

      row[mappedField] = value as never;
    });

    if (!row.fullName || !row.phone) {
      invalidRows += 1;
      return;
    }

    rows.push(row);
  });

  return { rows, invalidRows };
}

export function parseLeadCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      rows: [] as LeadImportRecord[],
      invalidRows: 0,
    };
  }

  const headers = splitCsvLine(lines[0]).map(normalize);
  const rawRows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<Record<string, string>>((result, header, index) => {
      result[header] = values[index] ?? "";
      return result;
    }, {});
  });

  return parseMappedRows(rawRows);
}

export async function parseLeadFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    return parseMappedRows(rawRows);
  }

  return parseLeadCsv(await file.text());
}
