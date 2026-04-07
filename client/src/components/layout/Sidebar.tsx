import { NavLink } from "react-router-dom";

import { useAppState } from "../../hooks/useAppState";
import { cn } from "../../lib/utils";
import { getNavigationItemsForRole } from "./navigation";

export function Sidebar() {
  const { currentUser } = useAppState();
  if (!currentUser) {
    return null;
  }

  const items = getNavigationItemsForRole(currentUser.role);

  return (
    <aside className="flex h-full flex-col rounded-[34px] border border-white/10 bg-gradient-to-b from-surface-700 via-surface-700 to-surface-800 p-3 text-white shadow-panel dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <div className="flex flex-col items-center gap-3 border-b border-white/10 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white text-sm font-bold text-surface-700 shadow-soft">
          PD
        </div>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
            Workspace
          </p>
          <p className="mt-1 text-xs font-semibold text-white/95">{currentUser.team}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/50">
            Sales Ops Suite
          </p>
        </div>
      </div>

      <nav className="mt-4 space-y-2 rounded-[26px] bg-white/6 p-1.5">
        {items
          .filter((item) => item.roles.includes(currentUser.role))
          .map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1.5 rounded-[20px] px-2 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                  isActive
                    ? "bg-white text-surface-700 shadow-soft"
                    : "text-white/72 hover:bg-white/10 hover:text-white",
                )
              }
            >
              <item.icon size={17} />
              <span className="leading-none">{item.label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 rounded-[26px] border border-white/10 bg-white/10 px-2 py-3.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-surface-700 shadow-soft">
          {currentUser.avatar}
        </div>
        <p className="text-center text-[11px] font-medium text-white/85">{currentUser.name}</p>
      </div>
    </aside>
  );
}
