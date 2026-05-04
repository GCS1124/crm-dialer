export const queryKeys = {
  auth: ["auth"] as const,
  dashboard: {
    summary: ["dashboard", "summary"] as const,
  },
  imports: {
    all: ["imports"] as const,
    detail: (id: string) => ["imports", id] as const,
  },
  lists: {
    all: ["caller-lists"] as const,
    detail: (id: string) => ["caller-lists", id] as const,
  },
  callers: {
    byList: (listId?: string, tab?: string, search?: string) =>
      ["callers", listId ?? "all", tab ?? "all", search ?? ""] as const,
    detail: (id?: string) => ["caller", id ?? "none"] as const,
    search: (term: string) => ["caller-search", term] as const,
  },
  callHistory: (callerId?: string) => ["call-history", callerId ?? "none"] as const,
  notes: (callerId?: string) => ["caller-notes", callerId ?? "none"] as const,
  followUps: (callerId?: string) => ["follow-ups", callerId ?? "none"] as const,
  reports: {
    summary: ["reports", "summary"] as const,
  },
  profiles: {
    agents: ["profiles", "agents"] as const,
  },
};
