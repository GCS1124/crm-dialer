import { addDays, formatISO } from "date-fns";
import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ActiveCallerCard } from "@/components/dialer/active-caller-card";
import { CallControlBar } from "@/components/dialer/call-control-bar";
import { CallerHistoryTabs } from "@/components/dialer/caller-history-tabs";
import { CallerQueuePanel } from "@/components/dialer/caller-queue-panel";
import { DialerModeToggle } from "@/components/dialer/dialer-mode-toggle";
import { ManualDialPanel } from "@/components/dialer/manual-dial-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/hooks/use-auth";
import { getCallerLists } from "@/services/caller-lists";
import {
  getCallersByList,
  getCallHistory,
  getCallerNotes,
  getFollowUps,
  logCallOutcome,
  saveCallerNote,
  saveFollowUp,
  searchCallers,
  updateCallerStatus,
} from "@/services/callers";
import type { Caller, DialMode, QueueFilter } from "@/types/app";

function mapDispositionToCallerState(disposition: string) {
  if (disposition === "callback_requested") return "callback" as const;
  if (disposition === "no_answer") return "failed" as const;
  if (disposition === "wrong_number") return "dnc" as const;
  return "completed" as const;
}

export function DialerPage() {
  const queryClient = useQueryClient();
  const { profile, updateStatus } = useAuth();
  const [mode, setMode] = useState<DialMode>("preview");
  const [queueTab, setQueueTab] = useState<QueueFilter>("pending");
  const [search, setSearch] = useState("");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedCaller, setSelectedCaller] = useState<Caller | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [linkedManualCaller, setLinkedManualCaller] = useState<Caller | null>(null);
  const [activeCallStartedAt, setActiveCallStartedAt] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredManualSearch = useDeferredValue(manualSearch);

  const listsQuery = useQuery({
    queryKey: queryKeys.lists.all,
    queryFn: getCallerLists,
  });

  useEffect(() => {
    if (!selectedListId && listsQuery.data?.length) {
      const firstActive = listsQuery.data.find((item) => item.status !== "archived");
      if (firstActive) setSelectedListId(firstActive.id);
    }
  }, [listsQuery.data, selectedListId]);

  const callersQuery = useQuery({
    queryKey: queryKeys.callers.byList(selectedListId, queueTab, deferredSearch),
    queryFn: () => getCallersByList(selectedListId, queueTab, deferredSearch),
    enabled: Boolean(selectedListId),
  });

  useEffect(() => {
    if (!callersQuery.data?.length) {
      setSelectedCaller(null);
      return;
    }
    const stillExists = callersQuery.data.find((item) => item.id === selectedCaller?.id);
    setSelectedCaller(stillExists ?? callersQuery.data[0]);
  }, [callersQuery.data]);

  const notesQuery = useQuery({
    queryKey: queryKeys.notes(selectedCaller?.id),
    queryFn: () => getCallerNotes(selectedCaller?.id),
    enabled: Boolean(selectedCaller?.id),
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.callHistory(selectedCaller?.id),
    queryFn: () => getCallHistory(selectedCaller?.id),
    enabled: Boolean(selectedCaller?.id),
  });
  const followUpsQuery = useQuery({
    queryKey: queryKeys.followUps(selectedCaller?.id),
    queryFn: () => getFollowUps(selectedCaller?.id),
    enabled: Boolean(selectedCaller?.id),
  });
  const manualResultsQuery = useQuery({
    queryKey: queryKeys.callers.search(deferredManualSearch),
    queryFn: () => searchCallers(deferredManualSearch),
    enabled: mode === "manual" && deferredManualSearch.length > 1,
  });

  const callerMutation = useMutation({
    mutationFn: async (disposition: string) => {
      const activeTarget = mode === "preview" ? selectedCaller : linkedManualCaller;
      const phoneNumber = mode === "preview" ? selectedCaller?.phone : manualPhone;
      if (!profile || !phoneNumber) throw new Error("Choose or enter a phone number first.");

      const callerStatus = mapDispositionToCallerState(disposition);
      const nextFollowUpAt =
        disposition === "callback_requested" ? formatISO(addDays(new Date(), 1)) : null;

      await logCallOutcome({
        callerId: activeTarget?.id,
        listId: mode === "preview" ? selectedListId : activeTarget?.caller_list_id,
        agentId: profile.id,
        phoneNumber,
        dialMode: mode,
        startedAt: activeCallStartedAt ?? new Date().toISOString(),
        endedAt: new Date().toISOString(),
        notes: noteDraft,
        disposition,
        callerStatus,
        nextFollowUpAt,
      });

      if (disposition === "callback_requested" && activeTarget) {
        await saveFollowUp({
          callerId: activeTarget.id,
          agentId: profile.id,
          dueAt: nextFollowUpAt!,
          note: noteDraft,
          type: "callback",
        });
      }
    },
    onSuccess: async () => {
      setActiveCallStartedAt(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.callers.byList(selectedListId, queueTab, deferredSearch) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.callHistory(selectedCaller?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notes(selectedCaller?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.followUps(selectedCaller?.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists.all }),
      ]);
      toast.success("Call outcome saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !selectedCaller || !noteDraft.trim()) throw new Error("Select a caller and add a note.");
      await saveCallerNote(selectedCaller.id, profile.id, noteDraft.trim());
    },
    onSuccess: async () => {
      setNoteDraft("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes(selectedCaller?.id) });
      toast.success("Note saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const queueStatusMutation = useMutation({
    mutationFn: async (status: "in_progress") => {
      if (!selectedCaller) throw new Error("No active caller.");
      await updateCallerStatus({
        callerId: selectedCaller.id,
        listId: selectedListId,
        status,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.callers.byList(selectedListId, queueTab, deferredSearch) });
    },
  });

  function handleStartCall() {
    setActiveCallStartedAt(new Date().toISOString());
    if (mode === "preview") {
      queueStatusMutation.mutate("in_progress");
    }
    toast.success("Call started.");
  }

  function handleEndCall() {
    callerMutation.mutate("voicemail");
  }

  function handleNextCaller() {
    const items = callersQuery.data ?? [];
    const currentIndex = items.findIndex((item) => item.id === selectedCaller?.id);
    const next = items[currentIndex + 1] ?? items[0];
    if (next) setSelectedCaller(next);
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] gap-4">
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="min-w-[220px]">
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger>
                <SelectValue placeholder="Select caller list" />
              </SelectTrigger>
              <SelectContent>
                {(listsQuery.data ?? []).map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialerModeToggle mode={mode} onChange={setMode} />

          <div className="min-w-[180px]">
            <Select value={profile?.status ?? "offline"} onValueChange={(value) => void updateStatus(value as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="break">Break</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input className="max-w-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search queue" />
          {mode === "manual" ? (
            <Input className="max-w-xs" value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} placeholder="Phone input" />
          ) : null}

          <div className="ml-auto">
            <Select value={queueTab} onValueChange={(value) => setQueueTab(value as QueueFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="callback">Callbacks</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1.1fr)_360px]">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Caller queue</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-76px)]">
            <CallerQueuePanel
              activeCallerId={selectedCaller?.id}
              callers={callersQuery.data ?? []}
              onSelect={(caller) => {
                setSelectedCaller(caller);
                setNoteDraft(caller.notes ?? "");
              }}
            />
          </CardContent>
        </Card>

        <div className="min-h-0">
          {mode === "preview" ? (
            <ActiveCallerCard caller={selectedCaller} note={noteDraft} onNoteChange={setNoteDraft} />
          ) : (
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Manual dial workflow</CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-76px)]">
                <ManualDialPanel
                  linkedCaller={linkedManualCaller}
                  note={noteDraft}
                  onLinkCaller={setLinkedManualCaller}
                  onNoteChange={setNoteDraft}
                  onPhoneChange={setManualPhone}
                  onSearchChange={setManualSearch}
                  phone={manualPhone}
                  search={manualSearch}
                  searchResults={manualResultsQuery.data ?? []}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Context and history</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-76px)]">
            <CallerHistoryTabs
              callLogs={historyQuery.data ?? []}
              caller={selectedCaller}
              followUps={followUpsQuery.data ?? []}
              notes={notesQuery.data ?? []}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <CallControlBar
            disabled={callerMutation.isPending}
            onCall={handleStartCall}
            onDisposition={(value) => callerMutation.mutate(value)}
            onEnd={handleEndCall}
            onNextCaller={handleNextCaller}
            onSaveNote={() => saveNoteMutation.mutate()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
