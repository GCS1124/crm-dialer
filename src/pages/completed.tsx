import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CompletedFilters } from "@/components/completed/completed-filters";
import { CompletedTable } from "@/components/completed/completed-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/lib/query-keys";
import { getCompletedCallers, exportCompletedRows } from "@/services/completed";
import { getCallerLists } from "@/services/caller-lists";

export function CompletedPage() {
  const [listId, setListId] = useState("all");

  const listsQuery = useQuery({
    queryKey: queryKeys.lists.all,
    queryFn: getCallerLists,
  });

  const completedQuery = useQuery({
    queryKey: ["completed", listId],
    queryFn: () => getCompletedCallers(listId === "all" ? undefined : listId),
  });

  return (
    <Card className="h-full">
      <CardHeader className="space-y-4">
        <CardTitle>Completed and archived outcomes</CardTitle>
        <CompletedFilters
          lists={listsQuery.data ?? []}
          onExport={() => exportCompletedRows(completedQuery.data ?? [])}
          onListChange={setListId}
          selectedListId={listId}
        />
      </CardHeader>
      <CardContent className="h-[calc(100%-116px)]">
        <CompletedTable callers={completedQuery.data ?? []} />
      </CardContent>
    </Card>
  );
}
