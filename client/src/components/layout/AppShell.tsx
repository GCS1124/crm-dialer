import { Outlet } from "react-router-dom";

import { useAppState } from "../../hooks/useAppState";
import { AlertBanner } from "../shared/AlertBanner";
import { Button } from "../shared/Button";
import { Sidebar } from "./Sidebar";
import { GlobalNavbar } from "./GlobalNavbar";

export function AppShell() {
  const {
    timeTracking,
    endBreak,
    workspaceError,
    workspaceLoading,
    refreshWorkspace,
  } = useAppState();

  const showBreakBanner = timeTracking.status === "on_break";

  return (
    <div className="min-h-screen px-3 py-3 lg:px-5 lg:py-5">
      <div className="crm-shell mx-auto flex min-h-[calc(100vh-24px)] max-w-[1560px] overflow-hidden rounded-[24px]">
        <div className="hidden w-[92px] shrink-0 lg:block">
          <Sidebar />
        </div>
        <main className="min-w-0 flex-1 bg-[#f4f8fc] dark:bg-slate-950">
          <div className="space-y-0">
            <GlobalNavbar />
            <div className="p-4 lg:p-6">
              {showBreakBanner ? (
                <div className="fixed left-1/2 top-28 z-50 w-[min(760px,calc(100vw-24px))] -translate-x-1/2 lg:top-24">
                  <AlertBanner
                    title="You are on break"
                    description="Your session is paused. Click continue working to resume."
                    tone="warning"
                    className="shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                    action={
                      <Button size="sm" variant="primary" onClick={() => endBreak()}>
                        Continue working
                      </Button>
                    }
                  />
                </div>
              ) : null}
              {workspaceError ? (
                <AlertBanner
                  title="Workspace sync issue"
                  description={workspaceError}
                  tone="warning"
                  className="mb-4"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void refreshWorkspace()}
                      disabled={workspaceLoading}
                    >
                      {workspaceLoading ? "Retrying..." : "Retry sync"}
                    </Button>
                  }
                />
              ) : null}
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
