import type { Database, Json } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ImportRecord = Database["public"]["Tables"]["imports"]["Row"];
export type CallerList = Database["public"]["Tables"]["caller_lists"]["Row"];
export type Caller = Database["public"]["Tables"]["callers"]["Row"];
export type CallLog = Database["public"]["Tables"]["call_logs"]["Row"];
export type CallerNote = Database["public"]["Tables"]["caller_notes"]["Row"];
export type FollowUp = Database["public"]["Tables"]["follow_ups"]["Row"];

export type DialMode = "preview" | "manual";
export type QueueFilter = "pending" | "callback" | "completed";

export type InternalImportField =
  | "full_name"
  | "first_name"
  | "last_name"
  | "phone"
  | "alt_phone"
  | "email"
  | "company"
  | "city"
  | "state"
  | "country"
  | "notes"
  | "source"
  | "tags";

export interface ParsedImportFile {
  file: File;
  fileType: "csv" | "xlsx" | "xls";
  headers: string[];
  rows: Record<string, string>[];
  previewRows: Record<string, string>[];
}

export type ColumnMapping = Record<string, InternalImportField | "ignore">;

export interface ValidatedImportRow {
  rowNumber: number;
  normalized: Omit<
    Database["public"]["Tables"]["callers"]["Insert"],
    "caller_list_id"
  >;
  rawData: Json;
}

export interface InvalidImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  issues: string[];
}

export interface DuplicateImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  reason: string;
}

export interface ImportValidationResult {
  validRows: ValidatedImportRow[];
  invalidRows: InvalidImportRow[];
  duplicateRows: DuplicateImportRow[];
}

export interface DashboardSummary {
  totalImports: number;
  pendingCallers: number;
  inProgressCallers: number;
  completedCallers: number;
  callbacksDue: number;
  invalidRowsRecent: number;
  recentActivity: Array<{
    id: string;
    title: string;
    detail: string;
    timestamp: string;
    type: "call" | "import" | "note" | "follow_up";
  }>;
  performance: {
    callsToday: number;
    connected: number;
    interested: number;
    completionRate: number;
  };
}

export interface CallerListWithRelations extends CallerList {
  import?: ImportRecord | null;
  creator?: Profile | null;
  assignee?: Profile | null;
}

export interface CallerWithContext extends Caller {
  list?: CallerList | null;
  latestNote?: CallerNote | null;
}

export interface QueueFilters {
  listId?: string;
  search?: string;
  tab?: QueueFilter;
}
