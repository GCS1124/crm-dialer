import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImportUploadCard } from "@/components/imports/import-upload-card";
import { FilePreviewTable } from "@/components/imports/file-preview-table";
import { ImportHistoryTable } from "@/components/imports/import-history-table";
import { ValidationSummary } from "@/components/imports/validation-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/hooks/use-auth";
import { getCallerLists } from "@/services/caller-lists";
import { getImportDetails, getImports, persistImportBatch, findExistingDuplicates } from "@/services/imports";
import type { ImportValidationResult, ParsedImportFile } from "@/types/app";
import {
  buildInitialMapping,
  importTemplateRows,
  parseImportFile,
  validateImportRows,
} from "@/utils/imports";
import { downloadCsv } from "@/utils/export";

export function ImportsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [parsedFile, setParsedFile] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [view, setView] = useState<"preview" | "invalid" | "duplicates">("preview");
  const [listName, setListName] = useState("");
  const [detailsImportId, setDetailsImportId] = useState<string | null>(null);

  const importsQuery = useQuery({
    queryKey: queryKeys.imports.all,
    queryFn: getImports,
  });

  const listsQuery = useQuery({
    queryKey: queryKeys.lists.all,
    queryFn: getCallerLists,
  });

  const importDetailsQuery = useQuery({
    queryKey: detailsImportId ? queryKeys.imports.detail(detailsImportId) : ["imports", "none"],
    queryFn: () => getImportDetails(detailsImportId!),
    enabled: Boolean(detailsImportId),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!parsedFile) throw new Error("Upload a file first.");
      const phoneHeader = Object.keys(mapping).find((header) => mapping[header] === "phone");
      const emailHeader = Object.keys(mapping).find((header) => mapping[header] === "email");

      const duplicates = await findExistingDuplicates(
        parsedFile.rows
          .map((row) => (phoneHeader ? row[phoneHeader] : ""))
          .filter(Boolean),
        parsedFile.rows
          .map((row) => (emailHeader ? row[emailHeader] : ""))
          .filter(Boolean),
      );

      return validateImportRows(parsedFile.rows, mapping as never, duplicates);
    },
    onSuccess: (result) => {
      setValidation(result);
      setListName((current) => current || parsedFile?.file.name.replace(/\.[^.]+$/, "") || "Imported list");
      toast.success("Validation complete.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!parsedFile || !validation || !profile) {
        throw new Error("Missing import context.");
      }
      return persistImportBatch({
        file: parsedFile.file,
        fileType: parsedFile.fileType,
        mapping: mapping as never,
        validation,
        uploadedBy: profile.id,
        listName,
      });
    },
    onSuccess: async (result) => {
      if (result.failedRows.length) {
        downloadCsv(
          "failed-import-rows.csv",
          result.failedRows.map((row) => {
            const detail =
              "reason" in row ? row.reason : row.issues.join("; ");
            return {
              ...row.raw,
              detail,
            };
          }),
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists.all }),
      ]);
      toast.success(`Imported ${result.insertedCount} callers.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleFile(file: File) {
    try {
      const nextParsed = await parseImportFile(file);
      setParsedFile(nextParsed);
      setMapping(buildInitialMapping(nextParsed.headers));
      setValidation(null);
      setListName(file.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="grid h-full gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="grid min-h-0 gap-6">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <ImportUploadCard
            fileName={parsedFile?.file.name}
            onFileChange={handleFile}
            onDownloadTemplate={() => downloadCsv("dialer-import-template.csv", importTemplateRows())}
            onValidate={() => validateMutation.mutate()}
            onImport={() => importMutation.mutate()}
            isValidating={validateMutation.isPending}
            isImporting={importMutation.isPending}
            canImport={Boolean(validation?.validRows.length)}
          />
          <div className="grid gap-6">
            <ValidationSummary validation={validation} />
            <Card>
              <CardHeader>
                <CardTitle>List creation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="New caller list name" />
                <p className="text-sm text-muted-foreground">
                  A dedicated caller list is created for this import. Existing active lists: {listsQuery.data?.length ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="min-h-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Preview and mapping</CardTitle>
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="invalid">Invalid</TabsTrigger>
                <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-[420px]">
            {parsedFile ? (
              <FilePreviewTable
                duplicateRows={validation?.duplicateRows ?? []}
                headers={parsedFile.headers}
                invalidRows={validation?.invalidRows ?? []}
                mapping={mapping as never}
                onMappingChange={(header, value) =>
                  setMapping((current) => ({
                    ...current,
                    [header]: value,
                  }))
                }
                rows={parsedFile.previewRows}
                view={view}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
                Upload a file to preview its columns and rows.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-full">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Import history</CardTitle>
          <Button onClick={() => importsQuery.refetch()} size="sm" variant="ghost">
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="h-[calc(100%-76px)]">
          <ImportHistoryTable items={importsQuery.data ?? []} onOpen={setDetailsImportId} />
        </CardContent>
      </Card>

      <Sheet open={Boolean(detailsImportId)} onOpenChange={(open) => !open && setDetailsImportId(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Import details</SheetTitle>
            <SheetDescription>Latest mapping and import metadata for the selected file.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm">
            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <p className="font-medium">{importDetailsQuery.data?.record.file_name}</p>
              <p className="mt-2 text-muted-foreground">
                Status: {importDetailsQuery.data?.record.status} • Valid: {importDetailsQuery.data?.record.valid_rows}
              </p>
            </div>
            <pre className="rounded-xl border border-border/70 bg-background/70 p-4 text-xs text-muted-foreground">
              {JSON.stringify(importDetailsQuery.data?.mapping?.mapping_json ?? {}, null, 2)}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
