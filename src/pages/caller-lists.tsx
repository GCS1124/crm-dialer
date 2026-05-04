import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CallerListsTable } from "@/components/lists/caller-lists-table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { archiveCallerList, assignCallerList, exportCompletedCallerList, getCallerLists } from "@/services/caller-lists";
import { listAgents } from "@/services/profiles";

export function CallerListsPage() {
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const listsQuery = useQuery({
    queryKey: queryKeys.lists.all,
    queryFn: getCallerLists,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.profiles.agents,
    queryFn: listAgents,
  });

  const selectedList = listsQuery.data?.find((item) => item.id === selectedListId) ?? null;

  const archiveMutation = useMutation({
    mutationFn: archiveCallerList,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
      toast.success("Caller list archived.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignMutation = useMutation({
    mutationFn: ({ listId, profileId }: { listId: string; profileId: string | null }) =>
      assignCallerList(listId, profileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
      toast.success("Assignment updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Caller list management</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(100%-76px)]">
          <CallerListsTable
            items={listsQuery.data ?? []}
            onArchive={(id) => archiveMutation.mutate(id)}
            onExport={(id) => void exportCompletedCallerList(id)}
            onOpen={setSelectedListId}
          />
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedList)} onOpenChange={(open) => !open && setSelectedListId(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{selectedList?.name ?? "Caller list"}</SheetTitle>
            <SheetDescription>Assignment, queue counts, and current list state.</SheetDescription>
          </SheetHeader>

          {selectedList ? (
            <div className="mt-6 space-y-4">
              <Card>
                <CardContent className="grid gap-3 p-5">
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Total callers</span>
                    <span className="text-lg font-semibold">{selectedList.total_callers}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Pending</span>
                    <span className="text-lg font-semibold">{selectedList.pending_count}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Completed</span>
                    <span className="text-lg font-semibold">{selectedList.completed_count}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Assign list</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={selectedList.assigned_to ?? "unassigned"}
                    onValueChange={(value) =>
                      assignMutation.mutate({
                        listId: selectedList.id,
                        profileId: value === "unassigned" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {(agentsQuery.data ?? []).map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.full_name ?? agent.email ?? agent.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Button onClick={() => void exportCompletedCallerList(selectedList.id)} variant="outline">
                      Export results
                    </Button>
                    <Button onClick={() => archiveMutation.mutate(selectedList.id)} variant="secondary">
                      Archive list
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
