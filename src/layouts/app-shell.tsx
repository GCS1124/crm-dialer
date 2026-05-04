import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layouts/sidebar";
import { Topbar } from "@/components/layouts/topbar";
import { hasSupabaseEnv } from "@/lib/supabase";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {!hasSupabaseEnv ? (
          <div className="border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm text-amber-800">
            Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
            to enable live auth and persistence.
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-hidden p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
