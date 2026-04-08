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
    <aside className="flex h-full flex-col bg-[#005f8f] text-white dark:bg-slate-900">
      <div className="flex flex-col items-center gap-2 border-b border-white/10 px-2 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-white text-sm font-bold text-surface-700">
          PD
        </div>
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
          {currentUser.team}
        </p>
      </div>

      <nav className="mt-2 space-y-1 px-1.5">
        {items
          .filter((item) => item.roles.includes(currentUser.role))
          .map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-md px-1 py-3 text-[9px] font-medium transition",
                  isActive
                    ? "bg-white/16 text-white"
                    : "text-white/78 hover:bg-white/10 hover:text-white",
                )
              }
            >
              <item.icon size={17} />
              <span className="leading-none">{item.label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 border-t border-white/10 px-2 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-surface-700">
          {currentUser.avatar}
        </div>
        <p className="text-center text-[10px] text-white/85">{currentUser.name.split(" ")[0]}</p>
      </div>
    </aside>
  );
}
