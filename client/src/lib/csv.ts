import { read, utils } from "xlsx";

import type { LeadImportRecord, LeadPriority, LeadStatus } from "../types";

const defaultStatus: LeadStatus = "new";
const defaultPriority: LeadPriority = "Medium";

type ParsedField =
  | keyof LeadImportRecord
  | "firstName"
  | "lastName"
  | "address"
  | "city"
  | "state"
  | "zipCode"
  | "age"
  | "importDate";

const fieldMap: Record<string, ParsedField> = {
  full_name: "fullName",
  fullname: "fullName",
  name: "fullName",
  first_name: "firstName",
  firstname: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  phone: "phone",
  phone_number: "phone",
  alt_phone: "altPhone",
  alternate_number: "altPhone",
  altphone: "altPhone",
  email: "email",
  company: "company",
  company_name: "company",
  job_title: "jobTitle",
  title: "jobTitle",
  address: "address",
  city: "city",
  state: "state",
  zip: "zipCode",
  zipcode: "zipCode",
  zip_code: "zipCode",
  postal_code: "zipCode",
  location: "location",
  source: "source",
  lead_source: "source",
  interest: "interest",
  product: "interest",
  service: "interest",
  status: "status",
  notes: "notes",
  age: "age",
  import_date: "importDate",
  created_at: "importDate",
  __empty: "source",
  __empty_1: "importDate",
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

function normalizeCellValue(rawValue: unknown) {
  if (rawValue == null) {
    return "";
  }

  if (typeof rawValue === "number") {
    return Number.isInteger(rawValue) ? String(rawValue) : String(rawValue).trim();
  }

  return String(rawValue).trim();
}

function excelSerialToIsoString(serial: number) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 24 * 60 * 60 * 1000).toISOString();
}

function parseIsoDate(rawValue: unknown) {
  if (rawValue == null || rawValue === "") {
    return null;
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 20000) {
    return excelSerialToIsoString(rawValue);
  }

  const value = normalizeCellValue(rawValue);
  if (/^\d{5,}$/.test(value)) {
    const serial = Number(value);
    if (Number.isFinite(serial) && serial > 20000) {
      return excelSerialToIsoString(serial);
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function compactJoin(parts: Array<string | null | undefined>, separator: string) {
  return parts.map((part) => part?.trim() ?? "").filter(Boolean).join(separator);
}

function buildNotes(baseNotes: string, extras: string[]) {
  return [baseNotes.trim(), ...extras.filter(Boolean)]
    .filter(Boolean)
    .join(baseNotes.trim() ? "\n" : "\n")
    .trim();
}

function isTemplateInstructionRow(rawRow: Record<string, unknown>) {
  return Object.values(rawRow).some((rawValue) => /^notes?:/i.test(normalizeCellValue(rawValue)));
}

function parseMappedRows(rawRows: Array<Record<string, unknown>>) {
  let invalidRows = 0;
  const rows: LeadImportRecord[] = [];

  rawRows.forEach((rawRow) => {
    if (isTemplateInstructionRow(rawRow)) {
      return;
    }

    const row = createEmptyRow();
    const scratch = {
      firstName: "",
      lastName: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      age: "",
      importDate: "",
    };

    Object.entries(rawRow).forEach(([header, rawValue]) => {
      const mappedField = fieldMap[normalize(header)];
      if (!mappedField) {
        return;
      }

      const value = normalizeCellValue(rawValue);

      if (mappedField === "status") {
        row.status = parseStatus(value);
        return;
      }

      if (mappedField === "priority") {
        row.priority = parsePriority(value);
        return;
      }

      if (mappedField === "lastContacted") {
        row.lastContacted = parseIsoDate(rawValue);
        return;
      }

      if (mappedField === "callbackTime") {
        row.callbackTime = parseIsoDate(rawValue);
        return;
      }

      if (mappedField in scratch) {
        scratch[mappedField as keyof typeof scratch] = value;
        return;
      }

      row[mappedField as keyof LeadImportRecord] = value as never;
    });

    if (!row.fullName) {
      row.fullName = compactJoin([scratch.firstName, scratch.lastName], " ");
    }

    if (!row.location) {
      row.location = compactJoin(
        [
          scratch.address,
          compactJoin(
            [
              scratch.city,
              compactJoin([scratch.state, scratch.zipCode], " "),
            ],
            ", ",
          ),
        ],
        ", ",
      );
    }

    row.notes = buildNotes(row.notes, [
      scratch.age ? `Age: ${scratch.age}` : "",
      parseIsoDate(scratch.importDate)?.slice(0, 10)
        ? `Import Date: ${parseIsoDate(scratch.importDate)?.slice(0, 10)}`
        : "",
    ]);

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
