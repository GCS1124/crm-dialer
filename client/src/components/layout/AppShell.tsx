import { Outlet, useLocation } from "react-router-dom";

import { useAppState } from "../../hooks/useAppState";
import { AlertBanner } from "../shared/AlertBanner";
import { Button } from "../shared/Button";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  const location = useLocation();
  const isDialerView = location.pathname === "/dialer";
  const { workspaceError, workspaceLoading, refreshWorkspace } = useAppState();

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[1460px] overflow-hidden rounded-[8px] border border-slate-300 bg-[#edf2f7] shadow-[0_20px_60px_rgba(71,85,105,0.16)] dark:border-slate-800 dark:bg-slate-950">
        <div className="hidden w-[74px] shrink-0 lg:block">
          <Sidebar />
        </div>
        <main className="min-w-0 flex-1 bg-[#edf2f7] dark:bg-slate-950">
          <div className="space-y-0">
            {isDialerView ? null : <TopBar />}
            <div className={isDialerView ? "" : "p-4"}>
              {!isDialerView && workspaceError ? (
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
