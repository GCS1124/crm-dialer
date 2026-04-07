import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="min-h-screen px-3 py-3 lg:px-4 lg:py-4">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1680px] gap-3">
        <div className="hidden w-[108px] shrink-0 lg:block">
          <Sidebar />
        </div>
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-3 shadow-panel backdrop-blur-sm dark:border-slate-800/90 dark:bg-slate-950/92 lg:p-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-50/80 to-transparent dark:from-cyan-950/20" />
          <div className="relative space-y-4">
            <TopBar />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
