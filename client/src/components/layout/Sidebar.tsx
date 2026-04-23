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
    <aside className="flex h-full flex-col bg-[linear-gradient(180deg,#0c5e8b_0%,#0a4f76_42%,#093f60_100%)] text-white dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3 border-b border-white/10 px-3 py-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-white text-sm font-bold text-[#0a4f76] shadow-[0_10px_30px_rgba(255,255,255,0.12)]">
          CRM
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
            Workspace
          </p>
        </div>
      </div>

      <nav className="mt-3 space-y-1.5 px-2">
        {items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1.5 rounded-[16px] px-2 py-3 text-[9px] font-medium transition",
                isActive
                  ? "bg-white text-[#0a4f76] shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
                  : "text-white/78 hover:bg-white/10 hover:text-white",
              )
            }
          >
            <item.icon size={17} />
            <span className="leading-none">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3 border-t border-white/10 px-2 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#0a4f76]">
          {currentUser.avatar}
        </div>
        <p className="text-center text-[10px] text-white/85">{currentUser.name.split(" ")[0]}</p>
        <div className="flex flex-col items-center gap-1 text-[9px] text-white/65">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/5">
            ?
          </div>
          <span>Help</span>
        </div>
      </div>
    </aside>
  );
}
