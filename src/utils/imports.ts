import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import type {
  ColumnMapping,
  DuplicateImportRow,
  ImportValidationResult,
  InternalImportField,
  InvalidImportRow,
  ParsedImportFile,
  ValidatedImportRow,
} from "@/types/app";

const emailSchema = z.string().email();

export const knownImportFields: Array<{
  value: InternalImportField;
  label: string;
}> = [
  { value: "full_name", label: "Full name" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "phone", label: "Phone" },
  { value: "alt_phone", label: "Alternate phone" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "country", label: "Country" },
  { value: "notes", label: "Notes" },
  { value: "source", label: "Source" },
  { value: "tags", label: "Tags" },
];

const autoMapDictionary: Record<string, InternalImportField> = {
  fullname: "full_name",
  name: "full_name",
  firstname: "first_name",
  lastname: "last_name",
  mobile: "phone",
  phonenumber: "phone",
  telephone: "phone",
  emailaddress: "email",
  organisation: "company",
  zipcode: "state",
  remarks: "notes",
};

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function headersToRows(headers: string[], body: unknown[][]) {
  return body
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, String(row[index] ?? "").trim()]),
      ),
    );
}

export function buildInitialMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(
    headers.map((header) => {
      const normalized = normalizeHeader(header);
      const exact =
        knownImportFields.find((field) => field.value === normalized)?.value ??
        autoMapDictionary[normalized];
      return [header, exact ?? "ignore"];
    }),
  );
}

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `${hasPlus ? "+" : ""}${digits}` : "";
}

function normalizeTags(value?: string | null) {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const csvText = await file.text();
    const parsed = Papa.parse<string[]>(csvText, {
      skipEmptyLines: true,
    });
    const [headerRow = [], ...bodyRows] = parsed.data;
    const headers = headerRow.map((cell, index) => {
      const label = String(cell ?? "").trim();
      return label || `Column ${index + 1}`;
    });
    const rows = headersToRows(headers, bodyRows as unknown[][]);
    return {
      file,
      fileType: "csv",
      headers,
      rows,
      previewRows: rows.slice(0, 15),
    };
  }

  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    const [headerRow = [], ...bodyRows] = matrix;
    const headers = headerRow.map((cell, index) => {
      const label = String(cell ?? "").trim();
      return label || `Column ${index + 1}`;
    });
    const rows = headersToRows(headers, bodyRows as unknown[][]);
    return {
      file,
      fileType: extension,
      headers,
      rows,
      previewRows: rows.slice(0, 15),
    };
  }

  throw new Error("Unsupported file format. Upload CSV, XLSX, or XLS.");
}

export function validateImportRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  existingDuplicates?: { phones: Set<string>; emails: Set<string> },
): ImportValidationResult {
  const validRows: ValidatedImportRow[] = [];
  const invalidRows: InvalidImportRow[] = [];
  const duplicateRows: DuplicateImportRow[] = [];

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const issues: string[] = [];
    const normalized: Record<string, unknown> = {};
    const rawData: Record<string, string> = {};

    Object.entries(rawRow).forEach(([header, value]) => {
      const field = mapping[header];
      const trimmed = String(value ?? "").trim();
      if (!field || field === "ignore") {
        rawData[header] = trimmed;
        return;
      }

      if (field === "phone" || field === "alt_phone") {
        normalized[field] = normalizePhone(trimmed);
        return;
      }

      if (field === "tags") {
        normalized.tags = normalizeTags(trimmed);
        return;
      }

      normalized[field] = trimmed || null;
    });

    const phone = String(normalized.phone ?? "");
    const email = String(normalized.email ?? "");

    if (!phone) {
      issues.push("Phone is required.");
    }

    if (email) {
      const result = emailSchema.safeParse(email);
      if (!result.success) {
        issues.push("Email format is invalid.");
      }
    }

    if (phone && seenPhones.has(phone)) {
      duplicateRows.push({
        rowNumber,
        raw: rawRow,
        reason: "Duplicate phone found in this file.",
      });
      return;
    }

    if (email && seenEmails.has(email.toLowerCase())) {
      duplicateRows.push({
        rowNumber,
        raw: rawRow,
        reason: "Duplicate email found in this file.",
      });
      return;
    }

    if (phone && existingDuplicates?.phones.has(phone)) {
      duplicateRows.push({
        rowNumber,
        raw: rawRow,
        reason: "Phone already exists in Supabase callers.",
      });
      return;
    }

    if (email && existingDuplicates?.emails.has(email.toLowerCase())) {
      duplicateRows.push({
        rowNumber,
        raw: rawRow,
        reason: "Email already exists in Supabase callers.",
      });
      return;
    }

    if (issues.length > 0) {
      invalidRows.push({
        rowNumber,
        raw: rawRow,
        issues,
      });
      return;
    }

    seenPhones.add(phone);
    if (email) seenEmails.add(email.toLowerCase());

    validRows.push({
      rowNumber,
      normalized: {
        full_name: (normalized.full_name as string | null | undefined) ?? null,
        first_name: (normalized.first_name as string | null | undefined) ?? null,
        last_name: (normalized.last_name as string | null | undefined) ?? null,
        phone,
        alt_phone: (normalized.alt_phone as string | null | undefined) ?? null,
        email: email || null,
        company: (normalized.company as string | null | undefined) ?? null,
        city: (normalized.city as string | null | undefined) ?? null,
        state: (normalized.state as string | null | undefined) ?? null,
        country: (normalized.country as string | null | undefined) ?? null,
        notes: (normalized.notes as string | null | undefined) ?? null,
        source: (normalized.source as string | null | undefined) ?? null,
        tags: (normalized.tags as string[] | undefined) ?? [],
      },
      rawData,
    });
  });

  return {
    validRows,
    invalidRows,
    duplicateRows,
  };
}

export function importTemplateRows() {
  return [
    {
      full_name: "Jane Doe",
      first_name: "Jane",
      last_name: "Doe",
      phone: "+15551234567",
      alt_phone: "",
      email: "jane@example.com",
      company: "Northwind",
      city: "Austin",
      state: "Texas",
      country: "USA",
      notes: "Warm lead from webinar",
      source: "Webinar",
      tags: "warm,priority",
    },
  ];
}
