import { Outlet, useLocation } from "react-router-dom";

import { useAppState } from "../../hooks/useAppState";
import { AlertBanner } from "../shared/AlertBanner";
import { Button } from "../shared/Button";
import { SipProfileSelectorDialog } from "../softphone/SipProfileSelectorDialog";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  const location = useLocation();
  const isDialerView = location.pathname === "/dialer";
  const {
    sipProfileSelectionRequired,
    workspaceError,
    workspaceLoading,
    refreshWorkspace,
  } = useAppState();

  return (
    <div className="min-h-screen px-3 py-3 lg:px-5 lg:py-5">
      <div className="crm-shell mx-auto flex min-h-[calc(100vh-24px)] max-w-[1560px] overflow-hidden rounded-[24px]">
        <div className="hidden w-[92px] shrink-0 lg:block">
          <Sidebar />
        </div>
        <main className="min-w-0 flex-1 bg-[#f4f8fc] dark:bg-slate-950">
          <div className="space-y-0">
            {isDialerView ? null : <TopBar />}
            <div className={isDialerView ? "" : "p-4 lg:p-6"}>
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
      {sipProfileSelectionRequired ? <SipProfileSelectorDialog /> : null}
    </div>
  );
}
