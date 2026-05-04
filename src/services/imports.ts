import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { ColumnMapping, ImportValidationResult } from "@/types/app";
import { refreshCallerListCounts } from "@/services/caller-lists";

export async function getImports() {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getImportDetails(importId: string) {
  assertSupabaseConfigured();
  const [{ data: record, error: recordError }, { data: mapping, error: mappingError }] =
    await Promise.all([
      supabase.from("imports").select("*").eq("id", importId).single(),
      supabase
        .from("import_mappings")
        .select("*")
        .eq("import_id", importId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (recordError) throw recordError;
  if (mappingError) throw mappingError;
  return { record, mapping };
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function findExistingDuplicates(phones: string[], emails: string[]) {
  assertSupabaseConfigured();
  const phoneMatches = new Set<string>();
  const emailMatches = new Set<string>();

  for (const slice of chunk(
    phones.filter(Boolean),
    150,
  )) {
    const { data, error } = await supabase
      .from("callers")
      .select("phone")
      .in("phone", slice);
    if (error) throw error;
    data.forEach((item) => phoneMatches.add(item.phone));
  }

  for (const slice of chunk(
    emails.filter(Boolean),
    150,
  )) {
    const { data, error } = await supabase
      .from("callers")
      .select("email")
      .in("email", slice);
    if (error) throw error;
    data.forEach((item) => {
      if (item.email) emailMatches.add(item.email.toLowerCase());
    });
  }

  return { phones: phoneMatches, emails: emailMatches };
}

interface PersistImportInput {
  file: File;
  fileType: string;
  mapping: ColumnMapping;
  validation: ImportValidationResult;
  uploadedBy: string;
  listName: string;
  existingListId?: string;
}

export async function persistImportBatch({
  file,
  fileType,
  mapping,
  validation,
  uploadedBy,
  listName,
  existingListId,
}: PersistImportInput) {
  assertSupabaseConfigured();

  const storagePath = `${uploadedBy}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("dialer-imports")
    .upload(storagePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: importRecord, error: importError } = await supabase
    .from("imports")
    .insert({
      file_name: file.name,
      file_type: fileType,
      uploaded_by: uploadedBy,
      storage_path: storagePath,
      total_rows: validation.validRows.length + validation.invalidRows.length + validation.duplicateRows.length,
      valid_rows: validation.validRows.length,
      invalid_rows: validation.invalidRows.length,
      duplicate_rows: validation.duplicateRows.length,
      status:
        validation.invalidRows.length || validation.duplicateRows.length
          ? "partial_import"
          : "imported",
    })
    .select("*")
    .single();

  if (importError) throw importError;

  const { error: mappingError } = await supabase.from("import_mappings").insert({
    import_id: importRecord.id,
    mapping_json: mapping,
  });
  if (mappingError) throw mappingError;

  let listId = existingListId;
  if (!listId) {
    const { data: newList, error: listError } = await supabase
      .from("caller_lists")
      .insert({
        name: listName,
        import_id: importRecord.id,
        created_by: uploadedBy,
        assigned_to: uploadedBy,
        status: "active",
      })
      .select("*")
      .single();

    if (listError) throw listError;
    listId = newList.id;
  }

  const payload = validation.validRows.map((row) => ({
    ...row.normalized,
    caller_list_id: listId!,
    import_id: importRecord.id,
    assigned_to: uploadedBy,
    import_row_number: row.rowNumber,
    raw_data: row.rawData,
    status: "pending" as const,
  }));

  for (const slice of chunk(payload, 250)) {
    const { error } = await supabase.from("callers").insert(slice);
    if (error) throw error;
  }

  await refreshCallerListCounts(listId!);

  return {
    importRecord,
    listId,
    insertedCount: payload.length,
    failedRows: [...validation.invalidRows, ...validation.duplicateRows],
  };
}
