import { Bell, Clock3, ChevronDown, LogOut, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppState } from "../../hooks/useAppState";
import { formatDuration } from "../../lib/utils";
import { getDisplayedSeconds } from "../../lib/timeTracking.ts";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { cn } from "../../lib/utils";
import { AlertsPopover } from "./AlertsPopover";
import { BreakMenu } from "./BreakMenu";

function formatNavbarClock(now: number) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(now));
}

export function GlobalNavbar() {
  const {
    currentUser,
    theme,
    setTheme,
    logout,
    workspaceLoading,
    workspaceError,
    timeTracking,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    incomingAlerts,
    unseenIncomingAlertCount,
    markIncomingAlertsSeen,
    activeCall,
    wrapUpLeadId,
  } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (alertsOpen) {
      markIncomingAlertsSeen();
    }
  }, [alertsOpen, markIncomingAlertsSeen]);

  if (!currentUser) {
    return null;
  }

  const sessionSeconds = getDisplayedSeconds(timeTracking, new Date(now).toISOString());
  const busy = Boolean(activeCall || wrapUpLeadId);
  const statusLabel = workspaceLoading ? "Syncing" : workspaceError ? "Attention" : "Ready";
  const statusClasses = workspaceLoading
    ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-sky-300"
    : workspaceError
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";

  return (
    <div className="border-b border-slate-200/80 bg-white/92 px-3 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/92 lg:px-6">
      <div className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <Clock3 size={14} className="text-sky-500" />
            {formatNavbarClock(now)}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunMedium size={14} /> : <MoonStar size={14} />}
            {theme === "dark" ? "Light" : "Dark"}
          </Button>

          <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium", statusClasses)}>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                workspaceLoading ? "bg-sky-500" : workspaceError ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            {statusLabel}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant={timeTracking.status === "checked_out" ? "primary" : "danger"}
            onClick={() => {
              if (timeTracking.status === "checked_out") {
                checkIn();
              } else {
                checkOut();
              }
              setBreakOpen(false);
            }}
            disabled={busy}
          >
            {timeTracking.status === "checked_out" ? "Check in" : "Check out"}
          </Button>

          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <Clock3 size={14} className="text-sky-500" />
            <span>Session</span>
            <span className="font-semibold">{formatDuration(sessionSeconds)}</span>
          </div>

          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (timeTracking.status === "checked_out" || busy) {
                  return;
                }
                setBreakOpen((current) => !current);
                setAlertsOpen(false);
              }}
              disabled={busy || timeTracking.status === "checked_out"}
            >
              Break
              <ChevronDown size={14} />
            </Button>
            <BreakMenu
              open={breakOpen}
              status={timeTracking.status}
              breakType={timeTracking.breakType}
              onStartBreak={(breakType) => {
                startBreak(breakType);
                setBreakOpen(false);
              }}
              onEndBreak={() => {
                endBreak();
                setBreakOpen(false);
              }}
              onClose={() => setBreakOpen(false)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAlertsOpen((current) => !current);
                setBreakOpen(false);
              }}
            >
              <Bell size={14} />
              Alerts
              {unseenIncomingAlertCount ? (
                <Badge className="ml-1 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                  {unseenIncomingAlertCount}
                </Badge>
              ) : null}
            </Button>
            <AlertsPopover
              open={alertsOpen}
              items={incomingAlerts}
              onClose={() => setAlertsOpen(false)}
            />
          </div>

          <Button variant="primary" size="sm" onClick={logout}>
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
