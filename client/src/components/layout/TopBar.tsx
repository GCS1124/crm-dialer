import { LogOut, MoonStar, SunMedium } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAppState } from "../../hooks/useAppState";
import { getRoleLabel } from "../../lib/utils";
import { Button } from "../shared/Button";
import { getNavigationItemsForRole } from "./navigation";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/calls": "Calls",
  "/dialer": "Dialer",
  "/callbacks": "Follow-Ups",
  "/leads": "Contacts",
  "/reports": "Reports",
  "/users": "Users",
  "/settings": "Settings",
};

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    currentUser,
    logout,
    theme,
    setTheme,
    workspaceLoading,
    workspaceError,
    lastWorkspaceSyncAt,
  } = useAppState();
  const navItems = currentUser ? getNavigationItemsForRole(currentUser.role) : [];
  const syncLabel = workspaceLoading ? "Updating" : workspaceError ? "Attention" : "Ready";
  const syncClasses = workspaceLoading
    ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-sky-300"
    : workspaceError
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[18px] font-semibold text-slate-900 dark:text-white">
          {titles[location.pathname] ?? "Preview Dialer"}
        </p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          {workspaceLoading
            ? "Syncing workspace..."
            : workspaceError
              ? "Workspace sync needs attention"
              : currentUser?.team ?? "Workspace"}
          {!workspaceLoading && !workspaceError && lastWorkspaceSyncAt
            ? ` - synced ${new Date(lastWorkspaceSyncAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </p>
        {navItems.length ? (
          <select
            value={location.pathname}
            onChange={(event) => navigate(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 lg:hidden"
          >
            {navItems.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <div className={`hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-medium lg:flex ${syncClasses}`}>
          <span
            className={`h-2 w-2 rounded-full ${
              workspaceLoading
                ? "bg-sky-500"
                : workspaceError
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
          />
          {syncLabel}
        </div>
        {currentUser ? (
          <div className="hidden items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 lg:flex dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-700 text-sm font-semibold text-white">
              {currentUser.avatar}
            </div>
            <div className="text-left">
              <p className="text-[12px] font-semibold text-slate-900 dark:text-white">{currentUser.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{getRoleLabel(currentUser.role)}</p>
            </div>
          </div>
        ) : null}
        <Button variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <SunMedium size={16} /> : <MoonStar size={16} />}
        </Button>
        <Button variant="ghost" onClick={logout}>
          <LogOut size={16} />
          Sign out
        </Button>
      </div>
    </div>
  );
}
